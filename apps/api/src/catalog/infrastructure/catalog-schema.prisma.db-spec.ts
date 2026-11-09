import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";
import { requireLocalDatabaseUrl } from "../../../test/database";

// The catalog schema of the initial migration (M3 T1; S2, S8) on real PostgreSQL: unique keys,
// `Restrict` foreign keys, and the `TemplateVersion` snapshot trigger. Characterization tests: they
// describe the schema as migrated. Runs only through `pnpm --filter @invitame/api test:db` with an
// explicit DATABASE_URL.

const SNAPSHOT_IMMUTABLE = /TemplateVersion snapshot fields are immutable/;

/** Asserts a known Prisma request error with this code (P2002 unique, P2003 foreign key). */
function prismaCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

describe("catalog schema (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const runId = randomUUID();
  const created = {
    categories: [] as string[],
    features: [] as string[],
    packages: [] as string[],
    templates: [] as string[],
  };
  let sequence = 0;

  /** A key unique to this run, so parallel suites never collide on the shared database. */
  function key(label: string): string {
    sequence += 1;
    return `t1-${label}-${sequence}-${runId}`;
  }

  async function category(): Promise<{ id: string; key: string }> {
    const row = await prisma.category.create({ data: { key: key("category"), name: "Category" } });
    created.categories.push(row.id);
    return row;
  }

  async function feature(): Promise<{ id: string; key: string }> {
    const row = await prisma.feature.create({ data: { key: key("feature"), name: "Feature" } });
    created.features.push(row.id);
    return row;
  }

  async function catalogPackage(): Promise<{ id: string; key: string }> {
    const row = await prisma.package.create({ data: { key: key("package"), name: "Package" } });
    created.packages.push(row.id);
    return row;
  }

  async function template(categoryId: string): Promise<{ id: string; key: string }> {
    const row = await prisma.template.create({
      data: { categoryId, key: key("template"), name: "Template" },
    });
    created.templates.push(row.id);
    return row;
  }

  function versionData(templateId: string, version = 1) {
    return {
      templateId,
      version,
      componentKey: "snapshot-component",
      schema: { fields: ["title"] },
      configuration: { theme: "light" },
    };
  }

  after(async () => {
    try {
      const templates = { in: created.templates };
      await prisma.templateVersion.deleteMany({ where: { templateId: templates } });
      await prisma.template.deleteMany({ where: { id: templates } });
      await prisma.packageFeature.deleteMany({
        where: {
          OR: [{ packageId: { in: created.packages } }, { featureId: { in: created.features } }],
        },
      });
      await prisma.package.deleteMany({ where: { id: { in: created.packages } } });
      await prisma.feature.deleteMany({ where: { id: { in: created.features } } });
      await prisma.category.deleteMany({ where: { id: { in: created.categories } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  describe("unique keys", () => {
    it("refuses a second Category with the same key", async () => {
      const existing = await category();
      await assert.rejects(
        prisma.category.create({ data: { key: existing.key, name: "Duplicate" } }),
        prismaCode("P2002"),
      );
      assert.equal(await prisma.category.count({ where: { key: existing.key } }), 1);
    });

    it("refuses a second Feature with the same key", async () => {
      const existing = await feature();
      await assert.rejects(
        prisma.feature.create({ data: { key: existing.key, name: "Duplicate" } }),
        prismaCode("P2002"),
      );
      assert.equal(await prisma.feature.count({ where: { key: existing.key } }), 1);
    });

    it("refuses a second Package with the same key", async () => {
      const existing = await catalogPackage();
      await assert.rejects(
        prisma.package.create({ data: { key: existing.key, name: "Duplicate" } }),
        prismaCode("P2002"),
      );
      assert.equal(await prisma.package.count({ where: { key: existing.key } }), 1);
    });

    it("refuses a second Template with the same key, even in another category", async () => {
      const existing = await template((await category()).id);
      const other = await category();
      await assert.rejects(
        prisma.template.create({
          data: { categoryId: other.id, key: existing.key, name: "Duplicate" },
        }),
        prismaCode("P2002"),
      );
      assert.equal(await prisma.template.count({ where: { key: existing.key } }), 1);
    });

    it("refuses a second TemplateVersion with the same (templateId, version)", async () => {
      const owner = await template((await category()).id);
      await prisma.templateVersion.create({ data: versionData(owner.id, 1) });

      await assert.rejects(
        prisma.templateVersion.create({
          data: { ...versionData(owner.id, 1), componentKey: "other-component" },
        }),
        prismaCode("P2002"),
      );
      const rows = await prisma.templateVersion.findMany({ where: { templateId: owner.id } });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.componentKey, "snapshot-component");
    });

    it("allows the same version number on different templates and distinct numbers on one", async () => {
      const categoryRow = await category();
      const first = await template(categoryRow.id);
      const second = await template(categoryRow.id);

      await prisma.templateVersion.create({ data: versionData(first.id, 1) });
      await prisma.templateVersion.create({ data: versionData(first.id, 2) });
      await prisma.templateVersion.create({ data: versionData(second.id, 1) });

      assert.equal(await prisma.templateVersion.count({ where: { templateId: first.id } }), 2);
      assert.equal(await prisma.templateVersion.count({ where: { templateId: second.id } }), 1);
    });
  });

  describe("Restrict foreign keys", () => {
    it("refuses deleting a Category that has a Template", async () => {
      const owner = await category();
      await template(owner.id);

      await assert.rejects(
        prisma.category.delete({ where: { id: owner.id } }),
        prismaCode("P2003"),
      );
      assert.equal(await prisma.category.count({ where: { id: owner.id } }), 1);
    });

    it("refuses deleting a Feature that a PackageFeature references", async () => {
      const included = await feature();
      const owner = await catalogPackage();
      await prisma.packageFeature.create({
        data: { packageId: owner.id, featureId: included.id },
      });

      await assert.rejects(
        prisma.feature.delete({ where: { id: included.id } }),
        prismaCode("P2003"),
      );
      assert.equal(await prisma.feature.count({ where: { id: included.id } }), 1);
      assert.equal(await prisma.packageFeature.count({ where: { packageId: owner.id } }), 1);
    });

    it("refuses deleting a Package that a PackageFeature references", async () => {
      const included = await feature();
      const owner = await catalogPackage();
      await prisma.packageFeature.create({
        data: { packageId: owner.id, featureId: included.id },
      });

      await assert.rejects(prisma.package.delete({ where: { id: owner.id } }), prismaCode("P2003"));
      assert.equal(await prisma.package.count({ where: { id: owner.id } }), 1);
      assert.equal(await prisma.packageFeature.count({ where: { packageId: owner.id } }), 1);
    });

    it("refuses deleting a Template that has a TemplateVersion", async () => {
      const owner = await template((await category()).id);
      await prisma.templateVersion.create({ data: versionData(owner.id) });

      await assert.rejects(
        prisma.template.delete({ where: { id: owner.id } }),
        prismaCode("P2003"),
      );
      assert.equal(await prisma.template.count({ where: { id: owner.id } }), 1);
      assert.equal(await prisma.templateVersion.count({ where: { templateId: owner.id } }), 1);
    });

    it("refuses a Template that points at a missing Category", async () => {
      await assert.rejects(
        prisma.template.create({
          data: { categoryId: randomUUID(), key: key("orphan"), name: "Orphan" },
        }),
        prismaCode("P2003"),
      );
    });
  });

  describe("TemplateVersion snapshot trigger", () => {
    async function snapshot(): Promise<{ id: string; templateId: string }> {
      const owner = await template((await category()).id);
      return prisma.templateVersion.create({ data: versionData(owner.id) });
    }

    /** A second template, a valid target for the `templateId` update. */
    async function otherTemplateId(): Promise<string> {
      return (await template((await category()).id)).id;
    }

    async function assertRefused(id: string, data: Prisma.TemplateVersionUncheckedUpdateInput) {
      const before = await prisma.templateVersion.findUniqueOrThrow({ where: { id } });
      await assert.rejects(
        prisma.templateVersion.update({ where: { id }, data }),
        SNAPSHOT_IMMUTABLE,
      );
      assert.deepEqual(await prisma.templateVersion.findUniqueOrThrow({ where: { id } }), before);
    }

    it("refuses changing templateId", async () => {
      const row = await snapshot();
      await assertRefused(row.id, { templateId: await otherTemplateId() });
    });

    it("refuses changing version", async () => {
      const row = await snapshot();
      await assertRefused(row.id, { version: 2 });
    });

    it("refuses changing componentKey", async () => {
      const row = await snapshot();
      await assertRefused(row.id, { componentKey: "another-component" });
    });

    it("refuses changing schema", async () => {
      const row = await snapshot();
      await assertRefused(row.id, { schema: { fields: ["title", "date"] } });
    });

    it("refuses changing configuration", async () => {
      const row = await snapshot();
      await assertRefused(row.id, { configuration: { theme: "dark" } });
    });

    it("refuses changing createdAt", async () => {
      const row = await snapshot();
      await assertRefused(row.id, { createdAt: new Date("2020-01-01T00:00:00.000Z") });
    });

    it("allows changing status and leaves the snapshot fields as they were", async () => {
      const row = await snapshot();
      const before = await prisma.templateVersion.findUniqueOrThrow({ where: { id: row.id } });

      const updated = await prisma.templateVersion.update({
        where: { id: row.id },
        data: { status: "PUBLISHED" },
      });

      assert.equal(updated.status, "PUBLISHED");
      assert.deepEqual({ ...updated, status: before.status }, before);
    });
  });
});
