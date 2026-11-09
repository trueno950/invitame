import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { CatalogKeyTakenError } from "../domain/catalog-errors";
import { PrismaCategoryRepository, PrismaFeatureRepository } from "./prisma-taxonomy.repository";

// The Prisma adapters of the category and feature ports against PostgreSQL (M3 T6a; S1, S9). Runs
// only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a
// disposable, already migrated local database; not part of `pnpm test`. The database is shared with
// parallel suites: every row here carries a key made from this run's id, and only those rows are
// read back or removed.

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

describe("Prisma category and feature repositories on PostgreSQL", () => {
  const url = requireLocalDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const kinds = [
    {
      label: "category",
      repository: new PrismaCategoryRepository(prisma),
      key: (suffix: string) => `t6a-${runId}-${suffix}`,
      stored: (key: string) => prisma.category.findUniqueOrThrow({ where: { key } }),
    },
    {
      label: "feature",
      repository: new PrismaFeatureRepository(prisma),
      key: (suffix: string) =>
        `T6A_${runId.toUpperCase()}_${suffix.toUpperCase().replaceAll("-", "_")}`,
      stored: (key: string) => prisma.feature.findUniqueOrThrow({ where: { key } }),
    },
  ] as const;

  after(async () => {
    try {
      await prisma.category.deleteMany({ where: { key: { startsWith: `t6a-${runId}` } } });
      await prisma.feature.deleteMany({
        where: {
          OR: [
            { key: { startsWith: `T6A_${runId.toUpperCase()}` } },
            { key: { startsWith: `t6a-${runId}` } },
          ],
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  for (const kind of kinds) {
    describe(kind.label, () => {
      const { repository } = kind;

      const { stored } = kind;

      it("creates an active entry with the given values and a UUID id", async () => {
        const key = kind.key("create");
        const created = await repository.create({ key, name: "Nombre", description: "Texto" });

        assert.match(created.id, /^[0-9a-f-]{36}$/);
        assert.equal(created.key, key);
        assert.equal(created.name, "Nombre");
        assert.equal(created.description, "Texto");
        assert.equal(created.isActive, true);
        assert.ok(created.createdAt instanceof Date);
        assert.deepEqual(created, { ...(await stored(key)) });

        const bare = await repository.create({
          key: kind.key("bare"),
          name: "Sin texto",
          description: null,
        });
        assert.equal(bare.description, null);
      });

      it("refuses a duplicate key with CatalogKeyTakenError and keeps the stored row", async () => {
        const key = kind.key("dup");
        await repository.create({ key, name: "Primero", description: null });
        const before = await stored(key);

        await assert.rejects(
          repository.create({ key, name: "Segundo", description: "Otro" }),
          (error: unknown) => error instanceof CatalogKeyTakenError && error.key === key,
        );

        assert.deepEqual(await stored(key), before);
      });

      it("lists the entries ordered by key", async () => {
        const keys = [kind.key("list-b"), kind.key("list-a"), kind.key("list-c")];
        for (const key of keys) {
          await repository.create({ key, name: "Lista", description: null });
        }

        const listed = (await repository.list())
          .map((entry) => entry.key)
          .filter((key) => keys.includes(key));

        assert.deepEqual(listed, [kind.key("list-a"), kind.key("list-b"), kind.key("list-c")]);
      });

      it("updates only the given fields, moves updatedAt, and never touches the key", async () => {
        const key = kind.key("update");
        const created = await repository.create({ key, name: "Antes", description: "Texto" });

        const renamed = await repository.update(created.id, { name: "Después" });
        assert.equal(renamed?.name, "Después");
        assert.equal(renamed?.description, "Texto");
        assert.equal(renamed?.isActive, true);
        assert.equal(renamed?.key, key);
        assert.ok(renamed && renamed.updatedAt >= created.updatedAt);
        assert.deepEqual(renamed?.createdAt, created.createdAt);

        const changed = await repository.update(created.id, { description: null, isActive: false });
        assert.equal(changed?.description, null);
        assert.equal(changed?.isActive, false);
        assert.equal(changed?.name, "Después");
        assert.deepEqual({ ...(await stored(key)) }, changed);
      });

      it("answers null and stores nothing for an id that no row has", async () => {
        const key = kind.key("untouched");
        await repository.create({ key, name: "Intacta", description: null });
        const before = await stored(key);

        assert.equal(await repository.update(UNKNOWN_ID, { name: "Otro", isActive: false }), null);

        assert.deepEqual(await stored(key), before);
      });
    });
  }

  it("keeps categories and features in separate tables: the same key can exist in both", async () => {
    const [category, feature] = kinds;
    const key = `t6a-${runId}-shared`;
    // A category key is valid in the database for a feature as well: the format is a domain rule.
    await category.repository.create({ key, name: "Categoría", description: null });
    await feature.repository.create({ key, name: "Función", description: null });

    assert.equal((await prisma.category.findUniqueOrThrow({ where: { key } })).name, "Categoría");
    assert.equal((await prisma.feature.findUniqueOrThrow({ where: { key } })).name, "Función");
  });
});
