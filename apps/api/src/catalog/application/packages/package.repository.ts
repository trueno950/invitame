import type { CatalogPackage, PackagePriceRecord, PackageStatus } from "../../domain/package";
import type { PackagePriceInput } from "../../domain/package-price";

/** A validated new package: the domain already normalized `name` and `description`. */
export interface NewPackage {
  key: string;
  name: string;
  description: string | null;
  /** How many days a published invitation of this package stays live (S1, T1); always validated before the write. */
  durationDays: number;
}

/** Validated changes; an absent field is left as stored. `key` is immutable and not part of it. */
export interface PackageChanges {
  name?: string;
  description?: string | null;
  status?: PackageStatus;
  /** The new duration in days, already validated against the domain bounds (S1, T1). */
  durationDays?: number;
}

/**
 * Persistence port of the package catalog. Each operation that touches more than one row (feature
 * replacement, price change) is atomic: it stores everything or nothing. Ids that name no package answer
 * null; nothing is deleted.
 */
export interface PackageRepository {
  /** Every package ordered by key, with features ordered by feature key and current prices. */
  list(): Promise<CatalogPackage[]>;

  /** Stores a DRAFT package; throws `CatalogKeyTakenError`, storing nothing, when the key exists. */
  create(input: NewPackage): Promise<CatalogPackage>;

  /** Applies the changes; null, storing nothing, when no package has this id. */
  update(id: string, changes: PackageChanges): Promise<CatalogPackage | null>;

  /**
   * Makes the package link exactly these features: links not listed are deleted, missing ones are created
   * with `included = true`, existing ones keep their flag. Throws `CatalogFeatureNotFoundError`, changing
   * nothing, when a feature does not exist; null when no package has this id.
   */
  replaceFeatures(id: string, featureIds: readonly string[]): Promise<CatalogPackage | null>;

  /**
   * Sets the current price of one currency: nothing happens when the amount equals the current one;
   * otherwise the current row is retired and a new one inserted in one transaction. Throws
   * `CatalogConcurrentUpdateError` when a concurrent change won; null when no package has this id.
   */
  setPrice(id: string, price: PackagePriceInput): Promise<CatalogPackage | null>;

  /** The full price history, newest first; null when no package has this id. */
  listPrices(id: string): Promise<PackagePriceRecord[] | null>;
}

export const PACKAGE_REPOSITORY = Symbol("PackageRepository");
