import {
  isCatalogEntryId,
  parseCategoryKey,
  parseEntryDescription,
  parseEntryName,
} from "../../domain/catalog-entry";
import { InvalidCatalogEntryError } from "../../domain/catalog-errors";
import {
  type CatalogPackage,
  DEFAULT_PACKAGE_DURATION_DAYS,
  type PackagePriceRecord,
  type PackageStatus,
  parsePackageDurationDays,
  parsePackageFeatureIds,
  parsePackageStatus,
} from "../../domain/package";
import { parsePackagePrice } from "../../domain/package-price";
import type { PackageChanges, PackageRepository } from "./package.repository";

/** The values of a create request, as the transport delivered them. */
export interface CreatePackageInput {
  key: string;
  name: string;
  description?: string | null;
  /** The package's duration in days (S1, T1); a request that names none gets the basic month. */
  durationDays?: unknown;
}

/** The fields of an update request; at least one must be present. */
export interface UpdatePackageInput {
  name?: string;
  description?: string | null;
  status?: PackageStatus;
  durationDays?: unknown;
}

const INVALID_KEY = "key must be lowercase kebab-case of at most 100 characters, such as basic.";
const INVALID_NAME = "name must be 1 to 120 characters after trimming, without control characters.";
const INVALID_DESCRIPTION = "description must be null or at most 1000 characters.";
const INVALID_STATUS = "status must be DRAFT, ACTIVE, or ARCHIVED.";
const INVALID_DURATION = "durationDays must be a whole number of days from 1 to 3650, such as 30.";
const INVALID_FEATURE_IDS = "featureIds must be a list of at most 100 unique feature UUIDs.";

/** Lists every package, ordered by key. */
export class ListPackagesUseCase {
  constructor(private readonly packages: PackageRepository) {}

  execute(): Promise<CatalogPackage[]> {
    return this.packages.list();
  }
}

/**
 * Creates a DRAFT package. The values are validated again here, so a caller other than the HTTP route
 * cannot store an unbounded or malformed value. A request that names no duration gets the basic month (S1, T1), the
 * same value the column defaults to. Throws `InvalidCatalogEntryError` and `CatalogKeyTakenError`.
 */
export class CreatePackageUseCase {
  constructor(private readonly packages: PackageRepository) {}

  async execute(input: CreatePackageInput): Promise<CatalogPackage> {
    const key = parseCategoryKey(input.key);
    if (key === null) {
      throw new InvalidCatalogEntryError(INVALID_KEY);
    }
    const name = parseEntryName(input.name);
    if (name === null) {
      throw new InvalidCatalogEntryError(INVALID_NAME);
    }
    const description = parseEntryDescription(input.description ?? null);
    if (description === null) {
      throw new InvalidCatalogEntryError(INVALID_DESCRIPTION);
    }
    const durationDays =
      input.durationDays === undefined
        ? DEFAULT_PACKAGE_DURATION_DAYS
        : parsePackageDurationDays(input.durationDays);
    if (durationDays === null) {
      throw new InvalidCatalogEntryError(INVALID_DURATION);
    }

    return this.packages.create({ key, name, description: description.value, durationDays });
  }
}

/**
 * Changes the name, description, status, or duration of a package; the key is immutable. Returns null when no
 * package has this id. Throws `InvalidCatalogEntryError` for an empty or invalid change.
 */
export class UpdatePackageUseCase {
  constructor(private readonly packages: PackageRepository) {}

  async execute(id: string, input: UpdatePackageInput): Promise<CatalogPackage | null> {
    const changes: PackageChanges = {};
    if (input.name !== undefined) {
      const name = parseEntryName(input.name);
      if (name === null) {
        throw new InvalidCatalogEntryError(INVALID_NAME);
      }
      changes.name = name;
    }
    if (input.description !== undefined) {
      const description = parseEntryDescription(input.description);
      if (description === null) {
        throw new InvalidCatalogEntryError(INVALID_DESCRIPTION);
      }
      changes.description = description.value;
    }
    if (input.status !== undefined) {
      const status = parsePackageStatus(input.status);
      if (status === null) {
        throw new InvalidCatalogEntryError(INVALID_STATUS);
      }
      changes.status = status;
    }
    if (input.durationDays !== undefined) {
      const durationDays = parsePackageDurationDays(input.durationDays);
      if (durationDays === null) {
        throw new InvalidCatalogEntryError(INVALID_DURATION);
      }
      changes.durationDays = durationDays;
    }
    if (Object.keys(changes).length === 0) {
      throw new InvalidCatalogEntryError(
        "At least one of name, description, status, or durationDays is required.",
      );
    }
    // An id that is not a UUID names no package; the database would refuse it as a malformed value.
    if (!isCatalogEntryId(id)) {
      return null;
    }

    return this.packages.update(id, changes);
  }
}

/**
 * Replaces the features linked to a package. Throws `InvalidCatalogEntryError` for an invalid list and
 * `CatalogFeatureNotFoundError` for an unknown feature; returns null when no package has this id.
 */
export class SetPackageFeaturesUseCase {
  constructor(private readonly packages: PackageRepository) {}

  async execute(id: string, featureIds: unknown): Promise<CatalogPackage | null> {
    const ids = parsePackageFeatureIds(featureIds);
    if (ids === null) {
      throw new InvalidCatalogEntryError(INVALID_FEATURE_IDS);
    }
    if (!isCatalogEntryId(id)) {
      return null;
    }

    return this.packages.replaceFeatures(id, ids);
  }
}

/**
 * Sets the current price of a package in one currency (S4, L4). The currency allow-list and the amount
 * rule belong to the domain: throws `InvalidPackagePriceCurrencyError` or `InvalidPackagePriceAmountError`.
 * Returns null when no package has this id.
 */
export class SetPackagePriceUseCase {
  constructor(private readonly packages: PackageRepository) {}

  async execute(
    id: string,
    input: { currency: unknown; amountMinor: unknown },
  ): Promise<CatalogPackage | null> {
    const price = parsePackagePrice(input);
    if (!isCatalogEntryId(id)) {
      return null;
    }

    return this.packages.setPrice(id, price);
  }
}

/** The full price history of a package, newest first; null when no package has this id. */
export class ListPackagePricesUseCase {
  constructor(private readonly packages: PackageRepository) {}

  async execute(id: string): Promise<PackagePriceRecord[] | null> {
    return isCatalogEntryId(id) ? this.packages.listPrices(id) : null;
  }
}
