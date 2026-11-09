import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import {
  CatalogConcurrentUpdateError,
  CatalogFeatureNotFoundError,
  CatalogKeyTakenError,
} from "../domain/catalog-errors";
import { PrismaPackageRepository } from "./prisma-package.repository";

// The Prisma adapter of the package port against PostgreSQL (M3 T6b; S1, S4, S9): feature replacement,
// price changes with history, the no-op, rollback on an unknown feature, and two concurrent price sets.
// Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a
// disposable, already migrated local database; not part of `pnpm test`. The database is shared with
// parallel suites: every row here carries a key made from this run's id, and only those rows are read
// back or removed.

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

describe("Prisma package repository on PostgreSQL", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const repository = new PrismaPackageRepository(prisma);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const packageIds: string[] = [];
  const featureIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      await prisma.packageFeature.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.packagePrice.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.feature.deleteMany({ where: { id: { in: featureIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newPackage(name = "Paquete") {
    sequence += 1;
    const created = await repository.create({
      key: `t6b-${runId}-${sequence}`,
      name,
      description: null,
    });
    packageIds.push(created.id);
    return created;
  }

  async function newFeature(suffix: string) {
    const created = await prisma.feature.create({
      data: { key: `T6B_${runId.toUpperCase()}_${suffix}`, name: `Función ${suffix}` },
    });
    featureIds.push(created.id);
    return created;
  }

  const links = (packageId: string) =>
    prisma.packageFeature.findMany({ where: { packageId }, orderBy: { featureId: "asc" } });
  const priceRows = (packageId: string) =>
    prisma.packagePrice.findMany({ where: { packageId }, orderBy: { createdAt: "asc" } });

  describe("create, list, and update", () => {
    it("creates a DRAFT package without features or prices and answers it with a UUID id", async () => {
      const created = await newPackage("  Nombre  ".trim());

      assert.match(created.id, /^[0-9a-f-]{36}$/);
      assert.equal(created.status, "DRAFT");
      assert.equal(created.description, null);
      assert.deepEqual(created.features, []);
      assert.deepEqual(created.currentPrices, []);
      assert.ok(created.createdAt instanceof Date);
    });

    it("refuses a duplicate key with CatalogKeyTakenError and keeps the stored row", async () => {
      const first = await newPackage("Primero");
      const before = await prisma.package.findUniqueOrThrow({ where: { id: first.id } });

      await assert.rejects(
        repository.create({ key: first.key, name: "Segundo", description: "Otro" }),
        (error: unknown) => error instanceof CatalogKeyTakenError && error.key === first.key,
      );

      assert.deepEqual(await prisma.package.findUniqueOrThrow({ where: { id: first.id } }), before);
    });

    it("lists the packages ordered by key with features by feature key and current prices only", async () => {
      const second = await newPackage();
      const first = await newPackage();
      const featureB = await newFeature("LIST_B");
      const featureA = await newFeature("LIST_A");
      await repository.replaceFeatures(first.id, [featureB.id, featureA.id]);
      await repository.setPrice(first.id, { currency: "MXN", amountMinor: 100 });
      await repository.setPrice(first.id, { currency: "MXN", amountMinor: 200 });

      const listed = (await repository.list()).filter((item) =>
        [first.id, second.id].includes(item.id),
      );

      const keys = listed.map((item) => item.key);
      assert.equal(keys.length, 2);
      assert.deepEqual(keys, [...keys].sort());
      const withData = listed.find((item) => item.id === first.id);
      assert.deepEqual(
        withData?.features.map((feature) => [feature.key, feature.included]),
        [
          [featureA.key, true],
          [featureB.key, true],
        ],
      );
      assert.deepEqual(
        withData?.currentPrices.map((price) => [price.currency, price.amountMinor]),
        [["MXN", 200]],
      );
    });

    it("updates only the given fields, moves updatedAt, and never touches the key", async () => {
      const created = await newPackage("Antes");

      const renamed = await repository.update(created.id, { name: "Después" });
      assert.equal(renamed?.name, "Después");
      assert.equal(renamed?.status, "DRAFT");
      assert.equal(renamed?.key, created.key);
      assert.ok(renamed && renamed.updatedAt >= created.updatedAt);

      const changed = await repository.update(created.id, {
        status: "ACTIVE",
        description: "Texto",
      });
      assert.equal(changed?.status, "ACTIVE");
      assert.equal(changed?.description, "Texto");
      assert.equal(changed?.name, "Después");
    });

    it("answers null and stores nothing for an id that no row has", async () => {
      const created = await newPackage("Intacto");
      const before = await prisma.package.findUniqueOrThrow({ where: { id: created.id } });

      assert.equal(await repository.update(UNKNOWN_ID, { name: "Otro" }), null);

      assert.deepEqual(
        await prisma.package.findUniqueOrThrow({ where: { id: created.id } }),
        before,
      );
    });
  });

  describe("replaceFeatures", () => {
    it("deletes the links not listed, creates the missing with included = true, and keeps the rest", async () => {
      const created = await newPackage();
      const one = await newFeature("REPL_1");
      const two = await newFeature("REPL_2");
      const three = await newFeature("REPL_3");
      await repository.replaceFeatures(created.id, [one.id, two.id]);
      // An administrator-set exclusion on a kept link survives a replacement that lists it again.
      await prisma.packageFeature.update({
        where: { packageId_featureId: { packageId: created.id, featureId: two.id } },
        data: { included: false },
      });

      const result = await repository.replaceFeatures(created.id, [three.id, two.id]);

      assert.deepEqual(
        result?.features.map((feature) => [feature.id, feature.included]),
        [
          [two.id, false],
          [three.id, true],
        ],
      );
      assert.deepEqual(
        (await links(created.id)).map((link) => link.featureId).sort(),
        [two.id, three.id].sort(),
      );
    });

    it("removes every link for an empty list", async () => {
      const created = await newPackage();
      const feature = await newFeature("EMPTY_1");
      await repository.replaceFeatures(created.id, [feature.id]);

      const result = await repository.replaceFeatures(created.id, []);

      assert.deepEqual(result?.features, []);
      assert.deepEqual(await links(created.id), []);
    });

    it("leaves other packages' links alone", async () => {
      const mine = await newPackage();
      const other = await newPackage();
      const feature = await newFeature("OTHER_1");
      await repository.replaceFeatures(other.id, [feature.id]);

      await repository.replaceFeatures(mine.id, []);

      assert.equal((await links(other.id)).length, 1);
    });

    it("rolls back when a listed feature does not exist: nothing is deleted or created", async () => {
      const created = await newPackage();
      const kept = await newFeature("ROLLBACK_KEPT");
      const added = await newFeature("ROLLBACK_ADDED");
      await repository.replaceFeatures(created.id, [kept.id]);
      const before = await links(created.id);

      await assert.rejects(
        repository.replaceFeatures(created.id, [added.id, UNKNOWN_ID]),
        CatalogFeatureNotFoundError,
      );
      await assert.rejects(
        repository.replaceFeatures(created.id, [UNKNOWN_ID]),
        CatalogFeatureNotFoundError,
      );

      assert.deepEqual(await links(created.id), before);
    });

    it("answers null for a package that no row has and creates no link", async () => {
      const feature = await newFeature("NOPKG_1");

      assert.equal(await repository.replaceFeatures(UNKNOWN_ID, [feature.id]), null);

      assert.equal(await prisma.packageFeature.count({ where: { featureId: feature.id } }), 0);
    });
  });

  describe("setPrice and listPrices", () => {
    it("inserts the first price as the current one", async () => {
      const created = await newPackage();

      const result = await repository.setPrice(created.id, {
        currency: "MXN",
        amountMinor: 49_900,
      });

      assert.deepEqual(
        result?.currentPrices.map((price) => [price.currency, price.amountMinor]),
        [["MXN", 49_900]],
      );
      const rows = await priceRows(created.id);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.retiredAt, null);
    });

    it("retires the current price and inserts the new one, keeping the history", async () => {
      const created = await newPackage();
      await repository.setPrice(created.id, { currency: "MXN", amountMinor: 49_900 });
      const [first] = await priceRows(created.id);

      const result = await repository.setPrice(created.id, {
        currency: "MXN",
        amountMinor: 59_900,
      });

      assert.deepEqual(
        result?.currentPrices.map((price) => price.amountMinor),
        [59_900],
      );
      const rows = await priceRows(created.id);
      assert.equal(rows.length, 2);
      assert.equal(rows.filter((row) => row.retiredAt === null).length, 1);
      const retired = rows.find((row) => row.id === first?.id);
      const current = rows.find((row) => row.retiredAt === null);
      assert.equal(retired?.amountMinor, 49_900);
      assert.deepEqual(retired?.retiredAt, current?.createdAt);

      const history = await repository.listPrices(created.id);
      assert.deepEqual(
        history?.map((row) => [row.amountMinor, row.retiredAt === null]),
        [
          [59_900, true],
          [49_900, false],
        ],
      );
    });

    it("is a no-op when the amount equals the current price: no row is created or retired", async () => {
      const created = await newPackage();
      await repository.setPrice(created.id, { currency: "MXN", amountMinor: 100 });
      const before = await priceRows(created.id);

      const result = await repository.setPrice(created.id, { currency: "MXN", amountMinor: 100 });

      assert.equal(result?.currentPrices.length, 1);
      assert.deepEqual(await priceRows(created.id), before);
    });

    it("can return to an earlier amount: it is a new row, the old one stays retired", async () => {
      const created = await newPackage();
      for (const amountMinor of [100, 200, 100]) {
        await repository.setPrice(created.id, { currency: "MXN", amountMinor });
      }

      const rows = await priceRows(created.id);

      assert.deepEqual(
        rows.map((row) => row.amountMinor),
        [100, 200, 100],
      );
      assert.equal(rows.filter((row) => row.retiredAt === null).length, 1);
    });

    it("answers null for a package that no row has and stores nothing", async () => {
      assert.equal(
        await repository.setPrice(UNKNOWN_ID, { currency: "MXN", amountMinor: 1 }),
        null,
      );

      assert.equal(await prisma.packagePrice.count({ where: { packageId: UNKNOWN_ID } }), 0);
    });

    it("lists an empty history for a package without prices and null for an unknown package", async () => {
      const created = await newPackage();

      assert.deepEqual(await repository.listPrices(created.id), []);
      assert.equal(await repository.listPrices(UNKNOWN_ID), null);
    });

    it("never leaves two current prices when two price sets run at once", async () => {
      for (let round = 0; round < 8; round += 1) {
        const created = await newPackage();
        // Rounds alternate between a package that has a current price and one that has none.
        if (round % 2 === 0) {
          await repository.setPrice(created.id, { currency: "MXN", amountMinor: 1 });
        }

        const outcomes = await Promise.allSettled([
          repository.setPrice(created.id, { currency: "MXN", amountMinor: 1000 }),
          repository.setPrice(created.id, { currency: "MXN", amountMinor: 2000 }),
        ]);

        for (const outcome of outcomes) {
          if (outcome.status === "rejected") {
            assert.ok(
              outcome.reason instanceof CatalogConcurrentUpdateError,
              `unexpected error: ${String(outcome.reason)}`,
            );
          }
        }
        assert.ok(outcomes.some((outcome) => outcome.status === "fulfilled"));
        const rows = await priceRows(created.id);
        assert.equal(rows.filter((row) => row.retiredAt === null).length, 1, `round ${round}`);
        const settled = outcomes.filter((outcome) => outcome.status === "fulfilled").length;
        // Every fulfilled set left its own row; a rejected one left nothing behind.
        assert.equal(rows.length, (round % 2 === 0 ? 1 : 0) + settled);
      }
    });
  });
});
