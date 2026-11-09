import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  NewPackage,
  PackageChanges,
  PackageRepository,
} from "../application/packages/package.repository";
import {
  CatalogConcurrentUpdateError,
  CatalogFeatureNotFoundError,
  CatalogKeyTakenError,
} from "../domain/catalog-errors";
import type { CatalogPackage, PackagePriceRecord } from "../domain/package";
import type { PackagePriceInput } from "../domain/package-price";

const PACKAGE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  packageFeatures: {
    orderBy: { feature: { key: "asc" } },
    select: { included: true, feature: { select: { id: true, key: true, name: true } } },
  },
  prices: {
    where: { retiredAt: null },
    orderBy: { currency: "asc" },
    select: { currency: true, amountMinor: true, createdAt: true },
  },
} satisfies Prisma.PackageSelect;

type PackageRow = Prisma.PackageGetPayload<{ select: typeof PACKAGE_SELECT }>;

function toPackage(row: PackageRow): CatalogPackage {
  const { packageFeatures, prices, ...fields } = row;
  return {
    ...fields,
    features: packageFeatures.map(({ included, feature }) => ({ ...feature, included })),
    currentPrices: prices,
  };
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * The package port on PostgreSQL. Feature replacement and price changes run in one interactive
 * transaction each, so a failure leaves every row as it was. The partial unique index
 * "PackagePrice_current_key" is the last guard against two current prices: its violation (P2002) is
 * reported as `CatalogConcurrentUpdateError`.
 */
export class PrismaPackageRepository implements PackageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<CatalogPackage[]> {
    const rows = await this.prisma.package.findMany({
      select: PACKAGE_SELECT,
      orderBy: { key: "asc" },
    });
    return rows.map(toPackage);
  }

  async create(input: NewPackage): Promise<CatalogPackage> {
    try {
      return toPackage(await this.prisma.package.create({ select: PACKAGE_SELECT, data: input }));
    } catch (error) {
      // P2002: the unique index on `key`.
      if (isPrismaError(error, "P2002")) {
        throw new CatalogKeyTakenError(input.key);
      }
      throw error;
    }
  }

  async update(id: string, changes: PackageChanges): Promise<CatalogPackage | null> {
    try {
      return toPackage(
        await this.prisma.package.update({ select: PACKAGE_SELECT, where: { id }, data: changes }),
      );
    } catch (error) {
      // P2025: no row has this id.
      if (isPrismaError(error, "P2025")) {
        return null;
      }
      throw error;
    }
  }

  async replaceFeatures(id: string, featureIds: readonly string[]): Promise<CatalogPackage | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!(await tx.package.findUnique({ where: { id }, select: { id: true } }))) {
          return null;
        }

        const known = await tx.feature.count({ where: { id: { in: [...featureIds] } } });
        if (known !== featureIds.length) {
          throw new CatalogFeatureNotFoundError();
        }

        await tx.packageFeature.deleteMany({
          where: { packageId: id, featureId: { notIn: [...featureIds] } },
        });
        const linked = await tx.packageFeature.findMany({
          where: { packageId: id },
          select: { featureId: true },
        });
        const present = new Set(linked.map((link) => link.featureId));
        await tx.packageFeature.createMany({
          data: featureIds
            .filter((featureId) => !present.has(featureId))
            .map((featureId) => ({ packageId: id, featureId, included: true })),
        });

        return toPackage(
          await tx.package.findUniqueOrThrow({ where: { id }, select: PACKAGE_SELECT }),
        );
      });
    } catch (error) {
      // P2002: a concurrent replacement linked the same feature first. P2003: a feature vanished.
      if (isPrismaError(error, "P2002")) {
        throw new CatalogConcurrentUpdateError();
      }
      if (isPrismaError(error, "P2003")) {
        throw new CatalogFeatureNotFoundError();
      }
      throw error;
    }
  }

  async setPrice(id: string, price: PackagePriceInput): Promise<CatalogPackage | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (!(await tx.package.findUnique({ where: { id }, select: { id: true } }))) {
          return null;
        }

        const current = await tx.packagePrice.findFirst({
          where: { packageId: id, currency: price.currency, retiredAt: null },
          select: { id: true, amountMinor: true },
        });
        if (current?.amountMinor !== price.amountMinor) {
          // One instant for both rows: the old price ends exactly when the new one starts.
          const now = new Date();
          if (current) {
            const retired = await tx.packagePrice.updateMany({
              where: { id: current.id, retiredAt: null },
              data: { retiredAt: now },
            });
            if (retired.count !== 1) {
              // A concurrent request retired this price first.
              throw new CatalogConcurrentUpdateError();
            }
          }
          await tx.packagePrice.create({
            data: {
              packageId: id,
              currency: price.currency,
              amountMinor: price.amountMinor,
              createdAt: now,
            },
          });
        }

        return toPackage(
          await tx.package.findUniqueOrThrow({ where: { id }, select: PACKAGE_SELECT }),
        );
      });
    } catch (error) {
      // P2002: the partial unique index, a concurrent request inserted the current price first.
      if (isPrismaError(error, "P2002")) {
        throw new CatalogConcurrentUpdateError();
      }
      throw error;
    }
  }

  async listPrices(id: string): Promise<PackagePriceRecord[] | null> {
    const stored = await this.prisma.package.findUnique({
      where: { id },
      select: {
        prices: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { currency: true, amountMinor: true, createdAt: true, retiredAt: true },
        },
      },
    });
    return stored ? stored.prices : null;
  }
}
