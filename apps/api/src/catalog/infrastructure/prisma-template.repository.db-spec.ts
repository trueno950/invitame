import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient, type Prisma, type TemplateVersionStatus } from "@prisma/client";

import { birthdayAdventureVersionInput } from "../../../test/memory-catalog-templates.repository";
import { requireLocalDatabaseUrl } from "../../../test/database";
import {
  CatalogCategoryNotFoundError,
  CatalogConcurrentUpdateError,
  CatalogKeyTakenError,
  CatalogRendererContractInvalidError,
  CatalogTemplateNotPublishableError,
} from "../domain/catalog-errors";
import { validateTemplateVersionContract } from "../domain/renderers/renderer-registry";
import { IllegalTemplateVersionTransitionError } from "../domain/template-version-lifecycle";
import { PrismaTemplateRepository } from "./prisma-template.repository";

// The Prisma adapter of the template port against PostgreSQL (M3 T6c; S1, S5, S6, S8, L4): version
// numbering, publish-retires-previous in one transaction, two concurrent publishes (exactly one wins and a
// template never has two PUBLISHED versions), contract re-validation at publish, and the rule that a
// template is PUBLISHED only while it has a PUBLISHED version. Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a disposable, already
// migrated local database; not part of `pnpm test`. The database is shared with parallel suites: every row
// here carries a key made from this run's id, and only those rows are read back or removed.

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const ALL_VALID = () => [] as string[];
const REGISTRY = (version: Parameters<typeof validateTemplateVersionContract>[0]) => {
  const result = validateTemplateVersionContract(version);
  return result.ok ? [] : result.issues;
};

describe("Prisma template repository on PostgreSQL", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const repository = new PrismaTemplateRepository(prisma);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newCategory() {
    sequence += 1;
    const created = await prisma.category.create({
      data: { key: `t6c-${runId}-c${sequence}`, name: `Categoría ${sequence}` },
    });
    categoryIds.push(created.id);
    return created;
  }

  async function newTemplate(name = "Plantilla") {
    sequence += 1;
    const { id: categoryId } = await newCategory();
    const created = await repository.create({
      key: `t6c-${runId}-${sequence}`,
      name,
      description: null,
      categoryId,
    });
    templateIds.push(created.id);
    return created;
  }

  /** A version inserted in a given status, as a migration or the seed would. */
  async function seedVersion(
    templateId: string,
    version: number,
    status: TemplateVersionStatus,
    componentKey = "birthday-adventure-01",
  ) {
    const input = birthdayAdventureVersionInput();
    return prisma.templateVersion.create({
      data: {
        templateId,
        version,
        status,
        componentKey,
        schema: input.schema as Prisma.InputJsonValue,
        configuration: input.configuration as Prisma.InputJsonValue,
      },
    });
  }

  const rows = (templateId: string) =>
    prisma.templateVersion.findMany({ where: { templateId }, orderBy: { version: "asc" } });
  const statuses = async (templateId: string) =>
    (await rows(templateId)).map((row) => [row.version, row.status]);

  describe("create, list, and update", () => {
    it("creates a DRAFT template with its category and no versions", async () => {
      const created = await newTemplate();

      assert.match(created.id, /^[0-9a-f-]{36}$/);
      assert.equal(created.status, "DRAFT");
      assert.equal(created.description, null);
      assert.equal(created.publishedVersion, null);
      assert.equal(created.versionCount, 0);
      assert.match(created.category.key, new RegExp(`^t6c-${runId}-c`));
      assert.ok(created.createdAt instanceof Date);
    });

    it("refuses a duplicate key with CatalogKeyTakenError and keeps the stored row", async () => {
      const first = await newTemplate("Primero");

      await assert.rejects(
        repository.create({
          key: first.key,
          name: "Segundo",
          description: null,
          categoryId: first.category.id,
        }),
        CatalogKeyTakenError,
      );
      const stored = await prisma.template.findMany({ where: { key: first.key } });
      assert.equal(stored.length, 1);
      assert.equal(stored[0]?.name, "Primero");
    });

    it("refuses an unknown category with CatalogCategoryNotFoundError and stores nothing", async () => {
      sequence += 1;
      const key = `t6c-${runId}-nocat${sequence}`;

      await assert.rejects(
        repository.create({ key, name: "N", description: null, categoryId: UNKNOWN_ID }),
        CatalogCategoryNotFoundError,
      );
      assert.equal(await prisma.template.count({ where: { key } }), 0);
    });

    it("lists templates ordered by key with the published version and the version count", async () => {
      const first = await newTemplate();
      const second = await newTemplate();
      await seedVersion(first.id, 1, "RETIRED");
      const published = await seedVersion(first.id, 2, "PUBLISHED");
      await seedVersion(first.id, 3, "DRAFT");

      const listed = (await repository.list()).filter((item) =>
        item.key.startsWith(`t6c-${runId}-`),
      );

      const keys = listed.map((item) => item.key);
      assert.deepEqual(keys, [...keys].sort());
      const listedFirst = listed.find((item) => item.id === first.id);
      const listedSecond = listed.find((item) => item.id === second.id);
      assert.deepEqual(listedFirst?.publishedVersion, { id: published.id, version: 2 });
      assert.equal(listedFirst?.versionCount, 3);
      assert.equal(listedSecond?.publishedVersion, null);
      assert.equal(listedSecond?.versionCount, 0);
    });

    it("updates name, description, category, and status, and answers null for an unknown id", async () => {
      const created = await newTemplate();
      const other = await newCategory();

      const updated = await repository.update(created.id, {
        name: "Nuevo",
        description: "Texto",
        categoryId: other.id,
        status: "ARCHIVED",
      });

      assert.equal(updated?.key, created.key);
      assert.equal(updated?.name, "Nuevo");
      assert.equal(updated?.description, "Texto");
      assert.equal(updated?.category.id, other.id);
      assert.equal(updated?.status, "ARCHIVED");
      assert.ok((updated?.updatedAt.getTime() ?? 0) >= created.updatedAt.getTime());
      assert.equal(await repository.update(UNKNOWN_ID, { name: "N" }), null);
      assert.equal(await repository.update(UNKNOWN_ID, { status: "PUBLISHED" }), null);
    });

    it("refuses an unknown category and leaves the row unchanged", async () => {
      const created = await newTemplate();

      await assert.rejects(
        repository.update(created.id, { name: "Otro", categoryId: UNKNOWN_ID }),
        CatalogCategoryNotFoundError,
      );
      const stored = await prisma.template.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(stored.name, created.name);
      assert.equal(stored.categoryId, created.category.id);
    });

    it("refuses PUBLISHED without a PUBLISHED version and leaves the row unchanged (L4)", async () => {
      const created = await newTemplate();
      await seedVersion(created.id, 1, "DRAFT");
      await seedVersion(created.id, 2, "RETIRED");

      await assert.rejects(
        repository.update(created.id, { name: "Otro", status: "PUBLISHED" }),
        CatalogTemplateNotPublishableError,
      );

      const stored = await prisma.template.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(stored.status, "DRAFT");
      assert.equal(stored.name, created.name);
    });

    it("accepts PUBLISHED while a PUBLISHED version exists", async () => {
      const created = await newTemplate();
      const published = await seedVersion(created.id, 1, "PUBLISHED");

      const updated = await repository.update(created.id, { status: "PUBLISHED" });

      assert.equal(updated?.status, "PUBLISHED");
      assert.deepEqual(updated?.publishedVersion, { id: published.id, version: 1 });
    });
  });

  describe("versions", () => {
    it("numbers versions one above the highest, starting at 1, and lists them newest first", async () => {
      const created = await newTemplate();
      const input = birthdayAdventureVersionInput();

      const first = await repository.createVersion(created.id, input);
      const second = await repository.createVersion(created.id, input);
      await seedVersion(created.id, 7, "RETIRED");
      const third = await repository.createVersion(created.id, input);

      assert.deepEqual([first?.version, second?.version, third?.version], [1, 2, 8]);
      assert.equal(first?.status, "DRAFT");
      assert.equal(first?.componentKey, "birthday-adventure-01");
      assert.deepEqual(first?.schema, input.schema);
      assert.deepEqual(first?.configuration, input.configuration);
      assert.deepEqual(
        (await repository.listVersions(created.id))?.map((row) => row.version),
        [8, 7, 2, 1],
      );
    });

    it("answers null for an unknown template", async () => {
      assert.equal(
        await repository.createVersion(UNKNOWN_ID, birthdayAdventureVersionInput()),
        null,
      );
      assert.equal(await repository.listVersions(UNKNOWN_ID), null);
    });

    it("keeps concurrent creates apart: each gets a distinct number or CatalogConcurrentUpdateError", async () => {
      const created = await newTemplate();
      const input = birthdayAdventureVersionInput();

      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => repository.createVersion(created.id, input)),
      );

      const won = results.flatMap((result) =>
        result.status === "fulfilled" && result.value ? [result.value.version] : [],
      );
      for (const result of results) {
        if (result.status === "rejected") {
          assert.ok(result.reason instanceof CatalogConcurrentUpdateError);
        }
      }
      assert.ok(won.length >= 1);
      assert.equal(new Set(won).size, won.length);
      assert.deepEqual(
        (await rows(created.id)).map((row) => row.version),
        [...won].sort((a, b) => a - b),
      );
    });
  });

  describe("publish", () => {
    it("publishes a DRAFT and retires the previously published version in one transaction", async () => {
      const created = await newTemplate();
      const first = await seedVersion(created.id, 1, "PUBLISHED");
      const second = await seedVersion(created.id, 2, "DRAFT");

      const published = await repository.publishVersion(created.id, second.id, REGISTRY);

      assert.equal(published?.id, second.id);
      assert.equal(published?.status, "PUBLISHED");
      assert.deepEqual(await statuses(created.id), [
        [1, "RETIRED"],
        [2, "PUBLISHED"],
      ]);
      // Snapshots are untouched by a publication (S8).
      const stored = await prisma.templateVersion.findUniqueOrThrow({ where: { id: first.id } });
      assert.deepEqual(stored.schema, first.schema);
      assert.deepEqual(stored.configuration, first.configuration);
      assert.equal(stored.componentKey, first.componentKey);
    });

    it("publishes the first version of a template that has none published", async () => {
      const created = await newTemplate();
      const draft = await seedVersion(created.id, 1, "DRAFT");

      const published = await repository.publishVersion(created.id, draft.id, REGISTRY);

      assert.equal(published?.status, "PUBLISHED");
      assert.deepEqual(await statuses(created.id), [[1, "PUBLISHED"]]);
    });

    it("refuses a version that is not DRAFT and changes nothing", async () => {
      const created = await newTemplate();
      const retired = await seedVersion(created.id, 1, "RETIRED");
      const published = await seedVersion(created.id, 2, "PUBLISHED");

      for (const version of [retired, published]) {
        await assert.rejects(
          repository.publishVersion(created.id, version.id, ALL_VALID),
          IllegalTemplateVersionTransitionError,
        );
      }
      assert.deepEqual(await statuses(created.id), [
        [1, "RETIRED"],
        [2, "PUBLISHED"],
      ]);
    });

    it("re-validates the stored version: an unregistered renderer is refused and nothing changes", async () => {
      const created = await newTemplate();
      await seedVersion(created.id, 1, "PUBLISHED");
      const stale = await seedVersion(created.id, 2, "DRAFT", "removed-renderer");

      await assert.rejects(
        repository.publishVersion(created.id, stale.id, REGISTRY),
        (error: unknown) => {
          assert.ok(error instanceof CatalogRendererContractInvalidError);
          assert.deepEqual(error.issues, [
            'componentKey "removed-renderer" is not a registered renderer',
          ]);
          return true;
        },
      );
      assert.deepEqual(await statuses(created.id), [
        [1, "PUBLISHED"],
        [2, "DRAFT"],
      ]);
    });

    it("answers null for an unknown template or version and for a version of another template", async () => {
      const created = await newTemplate();
      const other = await newTemplate();
      const foreign = await seedVersion(other.id, 1, "DRAFT");

      assert.equal(await repository.publishVersion(created.id, foreign.id, ALL_VALID), null);
      assert.equal(await repository.publishVersion(created.id, UNKNOWN_ID, ALL_VALID), null);
      assert.equal(await repository.publishVersion(UNKNOWN_ID, foreign.id, ALL_VALID), null);
      assert.deepEqual(await statuses(other.id), [[1, "DRAFT"]]);
    });

    it("lets exactly one of two concurrent publishes of two drafts win, never two PUBLISHED versions", async () => {
      for (const withPrevious of [false, true, false, true, true]) {
        const created = await newTemplate();
        if (withPrevious) {
          await seedVersion(created.id, 1, "PUBLISHED");
        }
        const base = withPrevious ? 1 : 0;
        const first = await seedVersion(created.id, base + 1, "DRAFT");
        const second = await seedVersion(created.id, base + 2, "DRAFT");

        // `verify` runs inside the transaction before any write: holding both there until both have
        // started makes the two transactions overlap instead of running one after the other.
        let arrived = 0;
        let release: () => void = () => {};
        const bothStarted = new Promise<void>((resolve) => {
          release = resolve;
        });
        const meet = async (version: Parameters<typeof REGISTRY>[0]) => {
          arrived += 1;
          if (arrived === 2) {
            release();
          }
          await bothStarted;
          return REGISTRY(version);
        };

        const results = await Promise.allSettled([
          repository.publishVersion(created.id, first.id, meet),
          repository.publishVersion(created.id, second.id, meet),
        ]);

        const won = results.filter((result) => result.status === "fulfilled");
        const lost = results.filter((result) => result.status === "rejected");
        assert.equal(won.length, 1, JSON.stringify(results));
        assert.equal(lost.length, 1);
        assert.ok(
          lost[0]?.status === "rejected" && lost[0].reason instanceof CatalogConcurrentUpdateError,
        );
        const published = (await rows(created.id)).filter((row) => row.status === "PUBLISHED");
        assert.equal(published.length, 1);
        const winner = won[0]?.status === "fulfilled" ? won[0].value : null;
        assert.equal(published[0]?.id, winner?.id);
        // The loser stays a DRAFT and can be published later, retiring the winner.
        const loserId = winner?.id === first.id ? second.id : first.id;
        assert.equal(
          (await prisma.templateVersion.findUniqueOrThrow({ where: { id: loserId } })).status,
          "DRAFT",
        );
      }
    });
  });

  describe("retire", () => {
    it("retires the published version of a template that is not PUBLISHED", async () => {
      const created = await newTemplate();
      const published = await seedVersion(created.id, 1, "PUBLISHED");

      const retired = await repository.retireVersion(created.id, published.id);

      assert.equal(retired?.id, published.id);
      assert.equal(retired?.status, "RETIRED");
      assert.deepEqual(await statuses(created.id), [[1, "RETIRED"]]);
    });

    it("refuses to retire the published version of a PUBLISHED template (L4), then allows it after archiving", async () => {
      const created = await newTemplate();
      const published = await seedVersion(created.id, 1, "PUBLISHED");
      await repository.update(created.id, { status: "PUBLISHED" });

      await assert.rejects(
        repository.retireVersion(created.id, published.id),
        CatalogTemplateNotPublishableError,
      );
      assert.deepEqual(await statuses(created.id), [[1, "PUBLISHED"]]);

      await repository.update(created.id, { status: "ARCHIVED" });
      assert.equal((await repository.retireVersion(created.id, published.id))?.status, "RETIRED");
    });

    it("refuses a DRAFT or RETIRED version with the transition error", async () => {
      const created = await newTemplate();
      const draft = await seedVersion(created.id, 1, "DRAFT");
      const retired = await seedVersion(created.id, 2, "RETIRED");

      for (const version of [draft, retired]) {
        await assert.rejects(
          repository.retireVersion(created.id, version.id),
          IllegalTemplateVersionTransitionError,
        );
      }
      assert.deepEqual(await statuses(created.id), [
        [1, "DRAFT"],
        [2, "RETIRED"],
      ]);
    });

    it("answers null for unknown ids and for a version of another template", async () => {
      const created = await newTemplate();
      const other = await newTemplate();
      const foreign = await seedVersion(other.id, 1, "PUBLISHED");

      assert.equal(await repository.retireVersion(created.id, foreign.id), null);
      assert.equal(await repository.retireVersion(created.id, UNKNOWN_ID), null);
      assert.equal(await repository.retireVersion(UNKNOWN_ID, foreign.id), null);
      assert.deepEqual(await statuses(other.id), [[1, "PUBLISHED"]]);
    });

    it("never leaves a PUBLISHED template without a PUBLISHED version when a retire races the status change", async () => {
      for (let round = 0; round < 8; round += 1) {
        const created = await newTemplate();
        const published = await seedVersion(created.id, 1, "PUBLISHED");

        const [update, retire] = await Promise.allSettled([
          repository.update(created.id, { status: "PUBLISHED" }),
          repository.retireVersion(created.id, published.id),
        ]);

        // Exactly one wins: the other sees the committed result and is refused.
        assert.notEqual(
          update.status === "fulfilled",
          retire.status === "fulfilled",
          `round ${round}`,
        );
        const loser = update.status === "rejected" ? update : retire;
        assert.ok(
          loser.status === "rejected" && loser.reason instanceof CatalogTemplateNotPublishableError,
        );
        const template = await prisma.template.findUniqueOrThrow({ where: { id: created.id } });
        const stored = await rows(created.id);
        assert.equal(
          template.status === "PUBLISHED",
          stored.some((row) => row.status === "PUBLISHED"),
          `round ${round}`,
        );
      }
    });
  });
});
