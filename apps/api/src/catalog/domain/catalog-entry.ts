/**
 * Categories and features share one shape: a stable `key` chosen at creation, a display name and
 * description, and an `isActive` flag. Keys are data (S2, S8): they identify a record and are never
 * compared to select behavior.
 */
export interface CatalogEntry {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** `key` is `VarChar(100)` and `name` is `VarChar(120)`; PostgreSQL counts code points. */
export const CATALOG_KEY_MAX_LENGTH = 100;
export const CATALOG_NAME_MAX_LENGTH = 120;
export const CATALOG_DESCRIPTION_MAX_LENGTH = 1000;

/** Lowercase kebab-case: `birthday`, `baby-shower`. */
const CATEGORY_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** UPPER_SNAKE starting with a letter: `RSVP`, `GUEST_LIST`. */
const FEATURE_KEY = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

// Control characters, unpaired surrogates (PostgreSQL cannot store them as UTF-8), and the
// bidirectional controls that make a name display differently from its content.
const FORBIDDEN_NAME_CHARACTER = /[\p{Cc}\p{Cs}\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/u;
// A description may span lines; only what PostgreSQL cannot store is refused.
const UNPAIRED_SURROGATE = /\p{Cs}/u;

const ENTRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseKey(value: unknown, pattern: RegExp): string | null {
  return typeof value === "string" && value.length <= CATALOG_KEY_MAX_LENGTH && pattern.test(value)
    ? value
    : null;
}

/** The key when it is lowercase kebab-case of at most 100 characters, otherwise null. */
export function parseCategoryKey(value: unknown): string | null {
  return parseKey(value, CATEGORY_KEY);
}

/** The key when it is UPPER_SNAKE of at most 100 characters, otherwise null. */
export function parseFeatureKey(value: unknown): string | null {
  return parseKey(value, FEATURE_KEY);
}

/** The trimmed name when it has 1 to 120 code points and no forbidden character, otherwise null. */
export function parseEntryName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const length = [...trimmed].length;
  return length >= 1 && length <= CATALOG_NAME_MAX_LENGTH && !FORBIDDEN_NAME_CHARACTER.test(trimmed)
    ? trimmed
    : null;
}

/**
 * The stored description, wrapped so that a valid null is told apart from an invalid value: null or
 * a text of at most 1000 code points after trimming; a blank text reads as null. Null when invalid.
 */
export function parseEntryDescription(value: unknown): { value: string | null } | null {
  if (value === null) {
    return { value: null };
  }
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (
    [...trimmed].length > CATALOG_DESCRIPTION_MAX_LENGTH ||
    trimmed.includes("\u0000") ||
    UNPAIRED_SURROGATE.test(trimmed)
  ) {
    return null;
  }
  return { value: trimmed === "" ? null : trimmed };
}

/** Whether the value is a canonical UUID; any other id cannot name a stored entry. */
export function isCatalogEntryId(value: string): boolean {
  return ENTRY_ID.test(value);
}
