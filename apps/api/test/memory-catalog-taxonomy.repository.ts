import { randomUUID } from "node:crypto";

import type {
  CatalogEntryChanges,
  CatalogEntryRepository,
  NewCatalogEntry,
} from "../src/catalog/application/taxonomy/catalog-entry.repository";
import type { CatalogEntry } from "../src/catalog/domain/catalog-entry";
import { CatalogKeyTakenError } from "../src/catalog/domain/catalog-errors";

/**
 * The catalog entry port on an in-memory list, shared by the suites that run without a database.
 * `entries` is public so a test can compare the stored rows before and after a refused request.
 */
export class MemoryCatalogTaxonomyRepository implements CatalogEntryRepository {
  readonly entries: CatalogEntry[] = [];

  async list(): Promise<CatalogEntry[]> {
    return this.entries
      .map((entry) => ({ ...entry }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  async create(entry: NewCatalogEntry): Promise<CatalogEntry> {
    if (this.entries.some((stored) => stored.key === entry.key)) {
      throw new CatalogKeyTakenError(entry.key);
    }

    const now = new Date();
    const created: CatalogEntry = {
      id: randomUUID(),
      ...entry,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.push(created);
    return { ...created };
  }

  async update(id: string, changes: CatalogEntryChanges): Promise<CatalogEntry | null> {
    const stored = this.entries.find((entry) => entry.id === id);
    if (!stored) {
      return null;
    }

    Object.assign(stored, changes, { updatedAt: new Date() });
    return { ...stored };
  }
}
