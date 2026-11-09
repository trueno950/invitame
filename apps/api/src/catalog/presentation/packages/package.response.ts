import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

import {
  CatalogConcurrentUpdateError,
  CatalogFeatureNotFoundError,
} from "../../domain/catalog-errors";
import type { CatalogPackage, PackagePriceRecord } from "../../domain/package";
import {
  InvalidPackagePriceAmountError,
  InvalidPackagePriceCurrencyError,
} from "../../domain/package-price";
import { mapCatalogError } from "../taxonomy/catalog-entry.response";

/** The stable REST shape of a package with its features and current prices. */
export interface PackageResponse {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  features: Array<{ id: string; key: string; name: string; included: boolean }>;
  currentPrices: Array<{ currency: string; amountMinor: number; createdAt: string }>;
}

/** The stable REST shape of one row of the price history. */
export interface PackagePriceResponse {
  currency: string;
  amountMinor: number;
  createdAt: string;
  retiredAt: string | null;
}

export function toPackageResponse(stored: CatalogPackage): PackageResponse {
  return {
    id: stored.id,
    key: stored.key,
    name: stored.name,
    description: stored.description,
    status: stored.status,
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
    features: stored.features.map(({ id, key, name, included }) => ({ id, key, name, included })),
    currentPrices: stored.currentPrices.map((price) => ({
      currency: price.currency,
      amountMinor: price.amountMinor,
      createdAt: price.createdAt.toISOString(),
    })),
  };
}

export function toPackagePriceResponse(stored: PackagePriceRecord): PackagePriceResponse {
  return {
    currency: stored.currency,
    amountMinor: stored.amountMinor,
    createdAt: stored.createdAt.toISOString(),
    retiredAt: stored.retiredAt?.toISOString() ?? null,
  };
}

/** No package has the id of the path, or the id is not a UUID. */
export function orPackageNotFound(stored: CatalogPackage | null): PackageResponse {
  if (!stored) {
    throw new NotFoundException();
  }
  return toPackageResponse(stored);
}

/** Maps a package error to its HTTP outcome; the shared catalog errors go through `mapCatalogError`. */
export function mapPackageError(error: unknown): never {
  if (error instanceof CatalogFeatureNotFoundError) {
    throw new BadRequestException({ code: "CATALOG_FEATURE_NOT_FOUND" });
  }
  if (error instanceof CatalogConcurrentUpdateError) {
    throw new ConflictException({ code: "CATALOG_CONCURRENT_UPDATE" });
  }
  if (
    error instanceof InvalidPackagePriceCurrencyError ||
    error instanceof InvalidPackagePriceAmountError
  ) {
    throw new BadRequestException(error.message);
  }
  return mapCatalogError(error);
}
