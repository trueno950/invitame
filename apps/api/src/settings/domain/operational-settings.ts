// The operational settings (M9 T13; S5, S8, L15). This file is pure: no framework, no ORM, no clock, and no table, so
// every rule is stated once and can be exercised from a table. The migration keeps the same bounds in CHECK
// constraints, adds the two cross-field checks, and seeds the one row with `INITIAL_OPERATIONAL_SETTINGS`, which are
// exactly the limits the code used before this slice: nothing changes on deploy (L15 «Los actuales»).
//
// A limit is read at the moment a use case checks it, and a lowered limit only stops what is added afterwards: nothing
// stored is deleted, hidden, or rewritten (S8 «Conservan lo que tienen»). That is why the settings are values, not
// policy: an invitation whose party limit or gallery already exceeds a lowered cap keeps it, and the next addition is
// the first one refused.
//
// The bounds are the safe ranges the owner chose (S8 «límites seguros»). `rsvpDefaultPartyLimit` may not exceed
// `rsvpMaxPartyLimit`, because a new invitation would then be created above the maximum the same panel states, and
// `storedAssetLimit` stays at least one above `galleryPhotoLimit`, so the gallery can never fill the whole allowance
// and leave the main photo no slot.

import { ADMIN_ACTION_NOTE_MAX_LENGTH } from "../../admin/admin-action-recorder";

/** The seven settings, in the order they are stored, validated, reported, and written into an audit note. */
export const OPERATIONAL_SETTINGS_FIELDS = [
  "rsvpDefaultPartyLimit",
  "rsvpMaxPartyLimit",
  "galleryPhotoLimit",
  "storedAssetLimit",
  "maxUploadMegabytes",
  "placeSearchResultLimit",
  "analyticsDefaultWindowDays",
] as const;

export type OperationalSettingsField = (typeof OPERATIONAL_SETTINGS_FIELDS)[number];

/** One complete set of settings: every field is required, and every field is an integer. */
export interface OperationalSettings {
  /** The party limit a new invitation starts with (S5 «Acompañantes RSVP»). */
  readonly rsvpDefaultPartyLimit: number;
  /** The widest party an owner may set and a guest may submit against (S5 «Acompañantes RSVP»). */
  readonly rsvpMaxPartyLimit: number;
  /** How many gallery photos one invitation may hold (S5 «Fotos por invitación»). */
  readonly galleryPhotoLimit: number;
  /** How many stored assets one invitation may hold, both kinds together (S5 «Fotos por invitación»). */
  readonly storedAssetLimit: number;
  /** The largest upload the API accepts, in whole megabytes (S5 «Tamaño de foto»). */
  readonly maxUploadMegabytes: number;
  /** How many place suggestions the owner sees (S5 «Búsqueda y analítica»). */
  readonly placeSearchResultLimit: number;
  /** The analytics window a request that names neither bound reads (S5 «Búsqueda y analítica»). */
  readonly analyticsDefaultWindowDays: number;
}

/** The closed range one field accepts, as the REST answer publishes it and the row's CHECK constraint states it. */
export interface OperationalSettingsBounds {
  readonly min: number;
  readonly max: number;
}

/** The safe range of every field (S8 «límites seguros»); the migration's CHECK constraints restate this table. */
export const OPERATIONAL_SETTINGS_BOUNDS: Readonly<
  Record<OperationalSettingsField, OperationalSettingsBounds>
> = {
  rsvpDefaultPartyLimit: { min: 1, max: 10 },
  rsvpMaxPartyLimit: { min: 1, max: 10 },
  galleryPhotoLimit: { min: 1, max: 24 },
  storedAssetLimit: { min: 1, max: 80 },
  maxUploadMegabytes: { min: 1, max: 15 },
  placeSearchResultLimit: { min: 1, max: 10 },
  analyticsDefaultWindowDays: { min: 7, max: 90 },
};

/**
 * The values the migration seeds and, with them, the limits the product had before this slice (L15): the RSVP default
 * and maximum party size, the gallery and stored-asset caps, the 10 MB upload, five place suggestions, and the
 * thirty-day analytics window. Nothing changes on deploy because these are the constants they replace.
 */
export const INITIAL_OPERATIONAL_SETTINGS: OperationalSettings = {
  rsvpDefaultPartyLimit: 4,
  rsvpMaxPartyLimit: 10,
  galleryPhotoLimit: 12,
  storedAssetLimit: 40,
  maxUploadMegabytes: 10,
  placeSearchResultLimit: 5,
  analyticsDefaultWindowDays: 30,
};

/** The widest administrator note a settings save may carry (S5, S8 «Nota opcional»). */
export const OPERATIONAL_SETTINGS_NOTE_MAX_LENGTH = 200;

/**
 * The closed set of rules an issue can name. `MIN` and `MAX` are the field's own bounds, `INTEGER` says the value the
 * row cannot store, and the two cross-field rules name the settings they relate to, so a client reads the rule it
 * broke instead of guessing from a sentence.
 */
export const OPERATIONAL_SETTINGS_RULE = {
  MIN: "min",
  MAX: "max",
  INTEGER: "integer",
  // The two cross-field rules name the fields they relate. Every identifier stays at most 40 characters, which is the
  // bound the web client accepts before it shows a rule next to a field.
  RSVP_DEFAULT_AT_MOST_MAX: "rsvpDefaultPartyLimitAtMostMax",
  STORED_ASSET_ABOVE_GALLERY: "storedAssetLimitAboveGallery",
} as const;

export type OperationalSettingsRule =
  (typeof OPERATIONAL_SETTINGS_RULE)[keyof typeof OPERATIONAL_SETTINGS_RULE];

/** One refused value: the field it belongs to and the rule it broke, which is the whole REST `issues` entry. */
export interface OperationalSettingsIssue {
  readonly field: OperationalSettingsField;
  readonly rule: OperationalSettingsRule;
}

/** The outcome of validating one request: every stored value, or every issue that refuses it. */
export type OperationalSettingsValidation =
  | { readonly ok: true; readonly value: OperationalSettings }
  | { readonly ok: false; readonly issues: OperationalSettingsIssue[] };

/** One field a save changed: what it was, and what it becomes (the audit note's own material). */
export interface OperationalSettingsChange {
  readonly field: OperationalSettingsField;
  readonly from: number;
  readonly to: number;
}

/**
 * Validates one settings request (S5, S8). Every field must be present and an integer inside its own bounds; the bounds
 * are reported first because they make the two cross-field rules meaningless (a gallery of 99 is refused as a bound
 * violation, not as the stored-asset rule it would also break). Then `rsvpDefaultPartyLimit` may not exceed
 * `rsvpMaxPartyLimit`, and `storedAssetLimit` must stay at least one above `galleryPhotoLimit`. Issues are reported in
 * field order and the two cross-field issues last, so the same request always reports the same list. Nothing is
 * transformed and an unknown key is ignored: the request boundary refuses those.
 */
export function validateOperationalSettings(input: unknown): OperationalSettingsValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: OPERATIONAL_SETTINGS_FIELDS.map((field) => ({
        field,
        rule: OPERATIONAL_SETTINGS_RULE.INTEGER,
      })),
    };
  }

  const issues: OperationalSettingsIssue[] = [];
  const value: Record<OperationalSettingsField, number> = {
    ...INITIAL_OPERATIONAL_SETTINGS,
  };

  for (const field of OPERATIONAL_SETTINGS_FIELDS) {
    const candidate = input[field];
    if (typeof candidate !== "number" || !Number.isInteger(candidate)) {
      issues.push({ field, rule: OPERATIONAL_SETTINGS_RULE.INTEGER });
      continue;
    }

    const bounds = OPERATIONAL_SETTINGS_BOUNDS[field];
    if (candidate < bounds.min) {
      issues.push({ field, rule: OPERATIONAL_SETTINGS_RULE.MIN });
    } else if (candidate > bounds.max) {
      issues.push({ field, rule: OPERATIONAL_SETTINGS_RULE.MAX });
    }
    value[field] = candidate;
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  if (value.rsvpDefaultPartyLimit > value.rsvpMaxPartyLimit) {
    issues.push({
      field: "rsvpDefaultPartyLimit",
      rule: OPERATIONAL_SETTINGS_RULE.RSVP_DEFAULT_AT_MOST_MAX,
    });
  }
  if (value.storedAssetLimit < value.galleryPhotoLimit + 1) {
    issues.push({
      field: "storedAssetLimit",
      rule: OPERATIONAL_SETTINGS_RULE.STORED_ASSET_ABOVE_GALLERY,
    });
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}

/** Every field a save changed, in field order; an empty list means the save changes nothing and writes nothing. */
export function changedSettings(
  current: OperationalSettings,
  next: OperationalSettings,
): OperationalSettingsChange[] {
  return OPERATIONAL_SETTINGS_FIELDS.filter((field) => current[field] !== next[field]).map(
    (field) => ({ field, from: current[field], to: next[field] }),
  );
}

/**
 * The audit note one settings save stores (S5, S8): the changes as `field: old → new` joined by `; `, followed by the
 * administrator's optional note after an em dash. S8 decided the before and after are always recorded and the note is
 * optional, so the generated part never depends on the note being there. The non-breaking space around the arrow keeps
 * a value and its arrow together when the audit is read in a narrow column. The whole note stays inside the audit
 * column: the generated part is at most seven short changes (well under 300 characters) and the note at most 200, so
 * the bound truncates the note rather than the record of what changed.
 */
export function settingsAuditNote(
  changes: readonly OperationalSettingsChange[],
  note: string | null,
): string {
  const generated = changes
    .map((change) => `${change.field}: ${change.from} → ${change.to}`)
    .join("; ");
  const trimmed = note?.trim() ?? "";
  const combined =
    trimmed === "" ? generated : generated === "" ? trimmed : `${generated} — ${trimmed}`;

  return [...combined].slice(0, ADMIN_ACTION_NOTE_MAX_LENGTH).join("");
}

/** The upload bound in the bytes the upload check reads: the settings store whole megabytes. */
export function megabytesInBytes(megabytes: number): number {
  return megabytes * 1024 * 1024;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
