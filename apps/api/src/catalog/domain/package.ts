import { isCatalogEntryId } from "./catalog-entry";

/** Lifecycle of a package in the catalog; any change between them is allowed. */
export const PACKAGE_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

/** The most features one package can list; the list replaces the stored links in one transaction. */
export const MAX_PACKAGE_FEATURES = 100;

/**
 * How long a published invitation of a package stays live, in whole days (S1, S4): one day at the shortest, ten years
 * at the longest. The `Package.durationDays` column is a NOT NULL INTEGER whose CHECK constraint repeats the lower
 * bound, and the seed gives each catalog package its own duration.
 */
export const MIN_PACKAGE_DURATION_DAYS = 1;
export const MAX_PACKAGE_DURATION_DAYS = 3650;

/**
 * The duration a package carries when nothing else is set: the basic month (S1). It is the column's default, so every
 * package stored before the column existed keeps a valid, documented lifetime instead of none.
 */
export const DEFAULT_PACKAGE_DURATION_DAYS = 30;

/** A feature linked to a package. `included` is false when the package shows the feature as excluded. */
export interface PackageFeatureEntry {
  id: string;
  key: string;
  name: string;
  included: boolean;
}

/** The price that is in force now for one currency. */
export interface CurrentPackagePrice {
  currency: string;
  amountMinor: number;
  createdAt: Date;
}

/** One row of a package's price history; `retiredAt` is null for the current price. */
export interface PackagePriceRecord {
  currency: string;
  amountMinor: number;
  createdAt: Date;
  retiredAt: Date | null;
}

/** A catalog package with its feature links (ordered by feature key) and current prices (by currency). */
export interface CatalogPackage {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: PackageStatus;
  /**
   * How many days a published invitation of this package stays live, counted from its publication instant (S1). Always
   * a whole number inside the bounds above: the column is NOT NULL and checked, and the use cases validate every write.
   */
  durationDays: number;
  createdAt: Date;
  updatedAt: Date;
  features: PackageFeatureEntry[];
  currentPrices: CurrentPackagePrice[];
}

/** The status when it is one of the allowed values, otherwise null. */
export function parsePackageStatus(value: unknown): PackageStatus | null {
  return PACKAGE_STATUSES.find((status) => status === value) ?? null;
}

/**
 * The duration when it is a whole number of days inside the bounds, otherwise null. A numeric string is refused on
 * purpose: the transport coerces a form field to a number before this rule sees it, so a string here means the value
 * did not come through the API boundary.
 */
export function parsePackageDurationDays(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  return value >= MIN_PACKAGE_DURATION_DAYS && value <= MAX_PACKAGE_DURATION_DAYS ? value : null;
}

/**
 * The feature ids of a replacement list, lowercased and in the given order: at most 100 canonical UUIDs
 * without duplicates (the case does not tell two ids apart). Null when the value is anything else.
 */
export function parsePackageFeatureIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_PACKAGE_FEATURES) {
    return null;
  }

  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isCatalogEntryId(item)) {
      return null;
    }
    ids.push(item.toLowerCase());
  }
  return new Set(ids).size === ids.length ? ids : null;
}
