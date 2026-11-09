import {
  type CatalogEntry,
  isCatalogEntryId,
  parseCategoryKey,
  parseEntryDescription,
  parseEntryName,
  parseFeatureKey,
} from "../../domain/catalog-entry";
import { InvalidCatalogEntryError } from "../../domain/catalog-errors";
import type { CatalogEntryChanges, CatalogEntryRepository } from "./catalog-entry.repository";

/** The values of a create request, as the transport delivered them. */
export interface CreateCatalogEntryInput {
  key: string;
  name: string;
  description?: string | null;
}

/** The fields of an update request; at least one must be present. */
export interface UpdateCatalogEntryInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

/** The domain rule that tells a valid key of one kind from an invalid one. */
interface KeyRule {
  parse: (value: unknown) => string | null;
  message: string;
}

const CATEGORY_KEY_RULE: KeyRule = {
  parse: parseCategoryKey,
  message: "key must be lowercase kebab-case of at most 100 characters, such as baby-shower.",
};
const FEATURE_KEY_RULE: KeyRule = {
  parse: parseFeatureKey,
  message: "key must be UPPER_SNAKE of at most 100 characters, such as GUEST_LIST.",
};

const INVALID_NAME = "name must be 1 to 120 characters after trimming, without control characters.";
const INVALID_DESCRIPTION = "description must be null or at most 1000 characters.";

/** Lists every entry, ordered by key. */
export class ListCatalogEntriesUseCase {
  constructor(protected readonly entries: CatalogEntryRepository) {}

  execute(): Promise<CatalogEntry[]> {
    return this.entries.list();
  }
}

/**
 * Creates an entry. The values are validated again here, so a caller other than the HTTP route cannot
 * store an unbounded or malformed value. Throws `InvalidCatalogEntryError` and `CatalogKeyTakenError`.
 */
export class CreateCatalogEntryUseCase {
  constructor(
    protected readonly entries: CatalogEntryRepository,
    private readonly keyRule: KeyRule,
  ) {}

  async execute(input: CreateCatalogEntryInput): Promise<CatalogEntry> {
    const key = this.keyRule.parse(input.key);
    if (key === null) {
      throw new InvalidCatalogEntryError(this.keyRule.message);
    }

    const name = parseEntryName(input.name);
    if (name === null) {
      throw new InvalidCatalogEntryError(INVALID_NAME);
    }

    const description = parseEntryDescription(input.description ?? null);
    if (description === null) {
      throw new InvalidCatalogEntryError(INVALID_DESCRIPTION);
    }

    return this.entries.create({ key, name, description: description.value });
  }
}

/**
 * Changes the name, description, or active flag of an entry; the key is immutable. Returns null when
 * no entry has this id. Throws `InvalidCatalogEntryError` for an empty or invalid change.
 */
export class UpdateCatalogEntryUseCase {
  constructor(protected readonly entries: CatalogEntryRepository) {}

  async execute(id: string, input: UpdateCatalogEntryInput): Promise<CatalogEntry | null> {
    const changes: CatalogEntryChanges = {};

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

    if (input.isActive !== undefined) {
      if (typeof input.isActive !== "boolean") {
        throw new InvalidCatalogEntryError("isActive must be a boolean.");
      }
      changes.isActive = input.isActive;
    }

    if (Object.keys(changes).length === 0) {
      throw new InvalidCatalogEntryError(
        "At least one of name, description, or isActive is required.",
      );
    }

    // An id that is not a UUID names no entry; the database would refuse it as a malformed value.
    if (!isCatalogEntryId(id)) {
      return null;
    }
    return this.entries.update(id, changes);
  }
}

// One class per kind and operation: Nest resolves a use case by its class, so the category and the
// feature variants need distinct tokens even though they share their behavior.
export class ListCategoriesUseCase extends ListCatalogEntriesUseCase {}
export class CreateCategoryUseCase extends CreateCatalogEntryUseCase {
  constructor(entries: CatalogEntryRepository) {
    super(entries, CATEGORY_KEY_RULE);
  }
}
export class UpdateCategoryUseCase extends UpdateCatalogEntryUseCase {}

export class ListFeaturesUseCase extends ListCatalogEntriesUseCase {}
export class CreateFeatureUseCase extends CreateCatalogEntryUseCase {
  constructor(entries: CatalogEntryRepository) {
    super(entries, FEATURE_KEY_RULE);
  }
}
export class UpdateFeatureUseCase extends UpdateCatalogEntryUseCase {}
