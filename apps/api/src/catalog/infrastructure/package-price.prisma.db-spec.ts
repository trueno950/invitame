import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";
import { requireLocalDatabaseUrl } from "../../../test/database";

// The price rules of `PackagePrice` (M3 T4; S4, L4) on real PostgreSQL: currency shape, non-negative
// amount, one current price per package and currency, immutability except for retiring, and `Restrict`.
// Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL.

const IMMUTABLE = /PackagePrice rows are immutable except for retiring them/;
const CURRENCY_CHECK = /PackagePrice_currency_format/;
const AMOUNT_CHECK = /PackagePrice_amountMinor_non_negative/;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

describe("package prices (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const runId = randomUUID();
  const packageIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      await prisma.packagePrice.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newPackage(): Promise<string> {
    sequence += 1;
    const created = await prisma.package.create({
      data: { key: `t4-package-${sequence}-${runId}`, name: "Package" },
    });
    packageIds.push(created.id);
    return created.id;
  }

  function newPrice(packageId: string, amountMinor = 49_900, currency = "MXN") {
    return prisma.packagePrice.create({ data: { packageId, currency, amountMinor } });
  }

  async function assertUnchanged(row: Awaited<ReturnType<typeof newPrice>>) {
    assert.deepEqual(await prisma.packagePrice.findUniqueOrThrow({ where: { id: row.id } }), row);
  }

  describe("insert", () => {
    it("stores a valid price as a current row", async () => {
      const packageId = await newPackage();

      const row = await newPrice(packageId, 49_900);

      assert.equal(row.packageId, packageId);
      assert.equal(row.currency, "MXN");
      assert.equal(row.amountMinor, 49_900);
      assert.equal(row.retiredAt, null);
      assert.ok(row.createdAt instanceof Date);
      assert.deepEqual(await prisma.packagePrice.findUniqueOrThrow({ where: { id: row.id } }), row);
    });

    it("accepts the boundaries 0 and 2147483647", async () => {
      const free = await newPrice(await newPackage(), 0);
      const largest = await newPrice(await newPackage(), 2_147_483_647);

      assert.equal(free.amountMinor, 0);
      assert.equal(largest.amountMinor, 2_147_483_647);
    });

    for (const currency of ["mxn", "Mxn", "MX1", "M-N", "MXNN", "MX", "", "   "]) {
      it(`refuses the currency ${JSON.stringify(currency)} and stores nothing`, async () => {
        const packageId = await newPackage();

        await assert.rejects(newPrice(packageId, 100, currency));

        assert.equal(await prisma.packagePrice.count({ where: { packageId } }), 0);
      });
    }

    it("names the currency check when a lowercase code is refused", async () => {
      await assert.rejects(newPrice(await newPackage(), 100, "mxn"), CURRENCY_CHECK);
    });

    it("refuses a negative amount and stores nothing", async () => {
      const packageId = await newPackage();

      await assert.rejects(newPrice(packageId, -1), AMOUNT_CHECK);

      assert.equal(await prisma.packagePrice.count({ where: { packageId } }), 0);
    });

    it("allows another currency shape that passes the format check (the allow-list is the domain's)", async () => {
      const row = await newPrice(await newPackage(), 100, "USD");

      assert.equal(row.currency, "USD");
    });

    it("refuses a price for a package that does not exist", async () => {
      await assert.rejects(
        newPrice(randomUUID()),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
      );
    });
  });

  describe("one current price per package and currency", () => {
    it("refuses a second current price and leaves the first unchanged", async () => {
      const packageId = await newPackage();
      const first = await newPrice(packageId, 10_000);

      await assert.rejects(newPrice(packageId, 20_000), isUniqueViolation);

      assert.equal(await prisma.packagePrice.count({ where: { packageId } }), 1);
      await assertUnchanged(first);
    });

    it("allows current prices of different currencies or different packages", async () => {
      const packageId = await newPackage();
      const otherPackageId = await newPackage();

      await newPrice(packageId, 10_000, "MXN");
      await newPrice(packageId, 600, "USD");
      await newPrice(otherPackageId, 10_000, "MXN");

      assert.equal(await prisma.packagePrice.count({ where: { packageId } }), 2);
      assert.equal(await prisma.packagePrice.count({ where: { packageId: otherPackageId } }), 1);
    });

    it("retires the current price and inserts the new one in one transaction, keeping the history", async () => {
      const packageId = await newPackage();
      const first = await newPrice(packageId, 10_000);

      const [retired, second] = await prisma.$transaction([
        prisma.packagePrice.update({ where: { id: first.id }, data: { retiredAt: new Date() } }),
        prisma.packagePrice.create({ data: { packageId, currency: "MXN", amountMinor: 12_000 } }),
      ]);

      assert.notEqual(retired.retiredAt, null);
      assert.equal(second.retiredAt, null);
      const rows = await prisma.packagePrice.findMany({
        where: { packageId },
        orderBy: { createdAt: "asc" },
      });
      assert.deepEqual(
        rows.map((row) => [row.amountMinor, row.retiredAt === null]),
        [
          [10_000, false],
          [12_000, true],
        ],
      );
      assert.equal(rows[0]?.id, first.id);
      assert.equal(rows[0]?.amountMinor, 10_000);
    });

    it("allows many retired rows of the same package and currency", async () => {
      const packageId = await newPackage();
      let current = await newPrice(packageId, 1_000);

      for (const amountMinor of [2_000, 3_000, 4_000]) {
        const [, next] = await prisma.$transaction([
          prisma.packagePrice.update({
            where: { id: current.id },
            data: { retiredAt: new Date() },
          }),
          prisma.packagePrice.create({ data: { packageId, currency: "MXN", amountMinor } }),
        ]);
        current = next;
      }

      assert.equal(await prisma.packagePrice.count({ where: { packageId } }), 4);
      assert.equal(await prisma.packagePrice.count({ where: { packageId, retiredAt: null } }), 1);
    });

    it("rolls the retirement back when the new price is refused in the same transaction", async () => {
      const packageId = await newPackage();
      const first = await newPrice(packageId, 10_000);

      await assert.rejects(
        prisma.$transaction([
          prisma.packagePrice.update({ where: { id: first.id }, data: { retiredAt: new Date() } }),
          prisma.packagePrice.create({ data: { packageId, currency: "MXN", amountMinor: -5 } }),
        ]),
        AMOUNT_CHECK,
      );

      await assertUnchanged(first);
      assert.equal(await prisma.packagePrice.count({ where: { packageId } }), 1);
    });
  });

  describe("immutability", () => {
    const FIELDS: ReadonlyArray<readonly [string, () => Promise<Prisma.PackagePriceUpdateInput>]> =
      [
        ["currency", async () => ({ currency: "USD" })],
        ["amountMinor", async () => ({ amountMinor: 1 })],
        ["createdAt", async () => ({ createdAt: new Date(0) })],
      ];

    for (const [field, change] of FIELDS) {
      it(`refuses an update of ${field} and leaves the row unchanged`, async () => {
        const row = await newPrice(await newPackage(), 10_000);

        await assert.rejects(
          prisma.packagePrice.update({ where: { id: row.id }, data: await change() }),
          IMMUTABLE,
        );

        await assertUnchanged(row);
      });
    }

    it("refuses an update of packageId and leaves the row unchanged", async () => {
      const row = await newPrice(await newPackage(), 10_000);
      const otherPackageId = await newPackage();

      await assert.rejects(
        prisma.packagePrice.update({
          where: { id: row.id },
          data: { package: { connect: { id: otherPackageId } } },
        }),
        IMMUTABLE,
      );

      await assertUnchanged(row);
    });

    it("refuses an update that changes an immutable field together with retiring", async () => {
      const row = await newPrice(await newPackage(), 10_000);

      await assert.rejects(
        prisma.packagePrice.update({
          where: { id: row.id },
          data: { amountMinor: 1, retiredAt: new Date() },
        }),
        IMMUTABLE,
      );

      await assertUnchanged(row);
    });

    it("allows retiring a current price", async () => {
      const row = await newPrice(await newPackage(), 10_000);
      const retiredAt = new Date();

      const updated = await prisma.packagePrice.update({
        where: { id: row.id },
        data: { retiredAt },
      });

      assert.deepEqual(updated, { ...row, retiredAt });
    });

    it("refuses to un-retire a price and leaves the row unchanged", async () => {
      const row = await newPrice(await newPackage(), 10_000);
      const retired = await prisma.packagePrice.update({
        where: { id: row.id },
        data: { retiredAt: new Date() },
      });

      await assert.rejects(
        prisma.packagePrice.update({ where: { id: row.id }, data: { retiredAt: null } }),
        IMMUTABLE,
      );

      await assertUnchanged(retired);
    });

    it("refuses to change the retirement time of a retired price", async () => {
      const row = await newPrice(await newPackage(), 10_000);
      const retired = await prisma.packagePrice.update({
        where: { id: row.id },
        data: { retiredAt: new Date("2026-01-01T00:00:00.000Z") },
      });

      await assert.rejects(
        prisma.packagePrice.update({
          where: { id: row.id },
          data: { retiredAt: new Date("2026-06-01T00:00:00.000Z") },
        }),
        IMMUTABLE,
      );

      await assertUnchanged(retired);
    });

    it("allows an update that leaves every column as it was", async () => {
      const row = await newPrice(await newPackage(), 10_000);

      const updated = await prisma.packagePrice.update({
        where: { id: row.id },
        data: { amountMinor: row.amountMinor },
      });

      assert.deepEqual(updated, row);
    });

    it("does not let a retired price be revived by inserting a duplicate of its identity", async () => {
      const packageId = await newPackage();
      const row = await newPrice(packageId, 10_000);
      await prisma.packagePrice.update({ where: { id: row.id }, data: { retiredAt: new Date() } });

      const again = await newPrice(packageId, 10_000);

      assert.notEqual(again.id, row.id);
      assert.equal(await prisma.packagePrice.count({ where: { packageId, retiredAt: null } }), 1);
    });
  });

  describe("Restrict foreign key", () => {
    it("refuses to delete a package that has prices, retired or not, and keeps both rows", async () => {
      const packageId = await newPackage();
      const retired = await newPrice(packageId, 10_000);
      await prisma.packagePrice.update({
        where: { id: retired.id },
        data: { retiredAt: new Date() },
      });
      await newPrice(packageId, 12_000);

      await assert.rejects(
        prisma.package.delete({ where: { id: packageId } }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
      );

      assert.equal(await prisma.package.count({ where: { id: packageId } }), 1);
      assert.equal(await prisma.packagePrice.count({ where: { packageId } }), 2);
    });

    it("allows deleting a package without prices", async () => {
      const packageId = await newPackage();

      await prisma.package.delete({ where: { id: packageId } });

      assert.equal(await prisma.package.count({ where: { id: packageId } }), 0);
    });
  });
});
