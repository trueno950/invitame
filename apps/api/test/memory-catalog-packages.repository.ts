import { randomUUID } from "node:crypto";

import type {
  NewPackage,
  PackageChanges,
  PackageRepository,
} from "../src/catalog/application/packages/package.repository";
import {
  CatalogFeatureNotFoundError,
  CatalogKeyTakenError,
} from "../src/catalog/domain/catalog-errors";
import type { CatalogPackage, PackagePriceRecord } from "../src/catalog/domain/package";
import type { PackagePriceInput } from "../src/catalog/domain/package-price";

interface StoredPackage {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: CatalogPackage["status"];
  durationDays: number;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredFeature {
  id: string;
  key: string;
  name: string;
}

interface StoredLink {
  packageId: string;
  featureId: string;
  included: boolean;
}

interface StoredPrice extends PackagePriceRecord {
  packageId: string;
}

function byText<T>(read: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => (read(a) < read(b) ? -1 : read(a) > read(b) ? 1 : 0);
}

/**
 * The package port on in-memory lists, shared by the suites that run without a database. `packages`,
 * `links`, and `prices` are public so a test can compare the stored rows before and after a refused
 * request; `addFeature` registers a feature that a package may link.
 */
export class MemoryCatalogPackageRepository implements PackageRepository {
  readonly packages: StoredPackage[] = [];
  readonly features: StoredFeature[] = [];
  readonly links: StoredLink[] = [];
  readonly prices: StoredPrice[] = [];

  addFeature(key: string): StoredFeature {
    const feature = { id: randomUUID(), key, name: `Función ${key}` };
    this.features.push(feature);
    return feature;
  }

  async list(): Promise<CatalogPackage[]> {
    return [...this.packages].sort(byText((item) => item.key)).map((stored) => this.view(stored));
  }

  async create(input: NewPackage): Promise<CatalogPackage> {
    if (this.packages.some((stored) => stored.key === input.key)) {
      throw new CatalogKeyTakenError(input.key);
    }

    const now = new Date();
    const created: StoredPackage = {
      id: randomUUID(),
      ...input,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
    };
    this.packages.push(created);
    return this.view(created);
  }

  async update(id: string, changes: PackageChanges): Promise<CatalogPackage | null> {
    const stored = this.packages.find((item) => item.id === id);
    if (!stored) {
      return null;
    }

    Object.assign(stored, changes, { updatedAt: new Date() });
    return this.view(stored);
  }

  async replaceFeatures(id: string, featureIds: readonly string[]): Promise<CatalogPackage | null> {
    const stored = this.packages.find((item) => item.id === id);
    if (!stored) {
      return null;
    }
    // Validate before touching anything, so a refused list leaves the links as they were.
    if (
      featureIds.some((featureId) => !this.features.some((feature) => feature.id === featureId))
    ) {
      throw new CatalogFeatureNotFoundError();
    }

    const kept = this.links.filter(
      (link) => link.packageId !== id || featureIds.includes(link.featureId),
    );
    for (const featureId of featureIds) {
      if (!kept.some((link) => link.packageId === id && link.featureId === featureId)) {
        kept.push({ packageId: id, featureId, included: true });
      }
    }
    this.links.splice(0, this.links.length, ...kept);
    return this.view(stored);
  }

  async setPrice(id: string, price: PackagePriceInput): Promise<CatalogPackage | null> {
    const stored = this.packages.find((item) => item.id === id);
    if (!stored) {
      return null;
    }

    const current = this.prices.find(
      (row) => row.packageId === id && row.currency === price.currency && row.retiredAt === null,
    );
    if (current?.amountMinor !== price.amountMinor) {
      const now = new Date();
      if (current) {
        current.retiredAt = now;
      }
      this.prices.push({ packageId: id, ...price, createdAt: now, retiredAt: null });
    }
    return this.view(stored);
  }

  async listPrices(id: string): Promise<PackagePriceRecord[] | null> {
    if (!this.packages.some((item) => item.id === id)) {
      return null;
    }

    return this.prices
      .filter((row) => row.packageId === id)
      .map(({ currency, amountMinor, createdAt, retiredAt }) => ({
        currency,
        amountMinor,
        createdAt,
        retiredAt,
      }))
      .reverse();
  }

  private view(stored: StoredPackage): CatalogPackage {
    const features = this.links
      .filter((link) => link.packageId === stored.id)
      .flatMap((link) => {
        const feature = this.features.find((item) => item.id === link.featureId);
        return feature ? [{ ...feature, included: link.included }] : [];
      })
      .sort(byText((feature) => feature.key));
    const currentPrices = this.prices
      .filter((row) => row.packageId === stored.id && row.retiredAt === null)
      .map(({ currency, amountMinor, createdAt }) => ({ currency, amountMinor, createdAt }))
      .sort(byText((price) => price.currency));

    return { ...stored, features, currentPrices };
  }
}
