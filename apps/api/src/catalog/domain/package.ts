import { isCatalogEntryId } from "./catalog-entry";

/** Lifecycle of a package in the catalog; any change between them is allowed. */
export const PACKAGE_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

/** The most features one package can list; the list replaces the stored links in one transaction. */
export const MAX_PACKAGE_FEATURES = 100;

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
