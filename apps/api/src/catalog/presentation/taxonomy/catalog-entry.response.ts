import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

import type { CatalogEntry } from "../../domain/catalog-entry";
import { CatalogKeyTakenError, InvalidCatalogEntryError } from "../../domain/catalog-errors";

/** The stable REST shape of a category or a feature. */
export interface CatalogEntryResponse {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toCatalogEntryResponse(stored: CatalogEntry): CatalogEntryResponse {
  return {
    id: stored.id,
    key: stored.key,
    name: stored.name,
    description: stored.description,
    isActive: stored.isActive,
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
  };
}

/** No entry has the id of the path, or the id is not a UUID. */
export function orNotFound(stored: CatalogEntry | null): CatalogEntryResponse {
  if (!stored) {
    throw new NotFoundException();
  }
  return toCatalogEntryResponse(stored);
}

/** Maps a domain error to its HTTP outcome; any other error is rethrown unchanged. */
export function mapCatalogError(error: unknown): never {
  if (error instanceof CatalogKeyTakenError) {
    throw new ConflictException({ code: "CATALOG_KEY_TAKEN" });
  }
  if (error instanceof InvalidCatalogEntryError) {
    throw new BadRequestException(error.message);
  }
  throw error;
}
