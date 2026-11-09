import type { CatalogEntry } from "../../domain/catalog-entry";

/** A validated new entry: the domain already normalized `name` and `description`. */
export interface NewCatalogEntry {
  key: string;
  name: string;
  description: string | null;
}

/** Validated changes; an absent field is left as stored. `key` is immutable and not part of it. */
export interface CatalogEntryChanges {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

/**
 * Persistence port for one kind of catalog taxonomy entry. The same contract serves categories and
 * features; the module binds one adapter to each token. There is no delete: an entry is deactivated.
 */
export interface CatalogEntryRepository {
  /** Every entry, ordered by key. */
  list(): Promise<CatalogEntry[]>;
  /** Stores a new entry; throws `CatalogKeyTakenError`, storing nothing, when the key exists. */
  create(entry: NewCatalogEntry): Promise<CatalogEntry>;
  /** Applies the changes; returns null, storing nothing, when no entry has this id. */
  update(id: string, changes: CatalogEntryChanges): Promise<CatalogEntry | null>;
}

export const CATEGORY_REPOSITORY = Symbol("CategoryRepository");
export const FEATURE_REPOSITORY = Symbol("FeatureRepository");
