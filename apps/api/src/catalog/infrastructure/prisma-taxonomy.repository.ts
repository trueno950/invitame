import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  CatalogEntryChanges,
  CatalogEntryRepository,
  NewCatalogEntry,
} from "../application/taxonomy/catalog-entry.repository";
import type { CatalogEntry } from "../domain/catalog-entry";
import { CatalogKeyTakenError } from "../domain/catalog-errors";

/** Rows of `Category` and `Feature` have the same columns, so one mapping serves both. */
const ENTRY_FIELDS = {
  id: true,
  key: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

type EntryRow = Prisma.CategoryGetPayload<{ select: typeof ENTRY_FIELDS }>;

function toEntry(row: EntryRow): CatalogEntry {
  return { ...row };
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/** The statements one kind needs; the two Prisma delegates share these shapes. */
interface EntryDelegate {
  findMany(args: { select: typeof ENTRY_FIELDS; orderBy: { key: "asc" } }): Promise<EntryRow[]>;
  create(args: { select: typeof ENTRY_FIELDS; data: NewCatalogEntry }): Promise<EntryRow>;
  update(args: {
    select: typeof ENTRY_FIELDS;
    where: { id: string };
    data: CatalogEntryChanges;
  }): Promise<EntryRow>;
}

class PrismaEntryRepository implements CatalogEntryRepository {
  constructor(private readonly delegate: EntryDelegate) {}

  async list(): Promise<CatalogEntry[]> {
    const rows = await this.delegate.findMany({ select: ENTRY_FIELDS, orderBy: { key: "asc" } });
    return rows.map(toEntry);
  }

  async create(input: NewCatalogEntry): Promise<CatalogEntry> {
    try {
      return toEntry(await this.delegate.create({ select: ENTRY_FIELDS, data: input }));
    } catch (error) {
      // P2002: the unique index on `key`.
      if (isPrismaError(error, "P2002")) {
        throw new CatalogKeyTakenError(input.key);
      }
      throw error;
    }
  }

  async update(id: string, changes: CatalogEntryChanges): Promise<CatalogEntry | null> {
    try {
      return toEntry(
        await this.delegate.update({ select: ENTRY_FIELDS, where: { id }, data: changes }),
      );
    } catch (error) {
      // P2025: no row has this id.
      if (isPrismaError(error, "P2025")) {
        return null;
      }
      throw error;
    }
  }
}

export class PrismaCategoryRepository extends PrismaEntryRepository {
  constructor(prisma: PrismaClient) {
    super(prisma.category);
  }
}

export class PrismaFeatureRepository extends PrismaEntryRepository {
  constructor(prisma: PrismaClient) {
    super(prisma.feature);
  }
}
