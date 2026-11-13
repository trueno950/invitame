// Per-invitation feature data (F1; S3, S4). The package decides which catalog keys an invitation may show; this
// module decides what the API implements and what a guest sees. Three pure rules live here:
//
// - the time zone allow-list: an invitation stores one IANA zone from this list, and the Spanish labels belong
//   to the web, never to the domain;
// - WhatsApp phone normalization: a Mexican ten-digit number or an international `+` number, stored as E.164;
// - feature gating: the package's feature keys intersected with the implemented allow-list, plus the add-to-
//   calendar feature, which is not catalog data; WhatsApp also needs a stored phone.
//
// Package and feature names never select a code path (AGENTS.md): the gate compares keys and nothing else, so a
// new catalog key never makes a feature appear, and an unknown key is simply not implemented.

/**
 * The time zones an invitation may store (S4). The list is the eleven Mexico zones S4 names, narrowed to those
 * the installed tz data treats as distinct. Every one of them is a canonical zone id in
 * `Intl.supportedValuesOf("timeZone")` and none is a pure link (`US/Pacific`, `Mexico/General`, ...), so all
 * eleven stay; `invitation-features.spec.ts` proves that against the installed tz data.
 *
 * Several of them behave identically for a future event — `America/Mexico_City`, `America/Chihuahua`,
 * `America/Monterrey`, `America/Merida`, and `America/Bahia_Banderas` are `UTC-06:00` all year since Mexico
 * dropped daylight saving in 2022, `America/Hermosillo` matches `America/Mazatlan` at `UTC-07:00`, and
 * `America/Ojinaga` matches `America/Matamoros` on the United States daylight-saving rule — but they are
 * distinct places with distinct historical rules, so the owner still picks the one that names their location.
 */
export const INVITATION_TIME_ZONES = [
  "America/Mexico_City",
  "America/Cancun",
  "America/Mazatlan",
  "America/Hermosillo",
  "America/Chihuahua",
  "America/Tijuana",
  "America/Matamoros",
  "America/Monterrey",
  "America/Merida",
  "America/Ojinaga",
  "America/Bahia_Banderas",
] as const;

export type InvitationTimeZone = (typeof INVITATION_TIME_ZONES)[number];

/** The zone a new invitation stores and the one every row that existed before F1 reads (S4). */
export const DEFAULT_INVITATION_TIME_ZONE: InvitationTimeZone = "America/Mexico_City";

/** Whether a value is one exact member of the allow-list; nothing is trimmed or case-folded. */
export function isInvitationTimeZone(value: unknown): value is InvitationTimeZone {
  return typeof value === "string" && (INVITATION_TIME_ZONES as readonly string[]).includes(value);
}

/**
 * The catalog feature keys this batch implements (S4). A package feature outside this list is stored catalog
 * data that no current layout renders, so gating drops it instead of letting a key select a component.
 */
export const IMPLEMENTED_INVITATION_FEATURES = ["COUNTDOWN", "MAP", "WHATSAPP"] as const;

export type ImplementedInvitationFeature = (typeof IMPLEMENTED_INVITATION_FEATURES)[number];

/** Add-to-calendar is always available to a guest and is not a catalog feature (S4). */
export const CALENDAR_FEATURE_KEY = "CALENDAR";

/** The country code added to a Mexican ten-digit number (S4). */
export const MEXICAN_WHATSAPP_COUNTRY_CODE = "52";

/** `+` and fifteen digits: the longest E.164 number, and the width of `InvitationFeatureSettings.whatsappPhone`. */
export const WHATSAPP_PHONE_LENGTH = 16;

/** The country calling code and the national number E.164 accepts, without the leading `+`. */
const E164_DIGITS = /^[1-9][0-9]{7,14}$/;

/** A Mexican national number: exactly ten digits, stored with `+52` in front. */
const MEXICAN_NATIONAL_NUMBER = /^[0-9]{10}$/;

/** The separators S4 accepts inside a phone: spaces (including no-break spaces), dashes, and parentheses. */
const PHONE_SEPARATORS = /[\s()-]/gu;

/** The message a phone of an unrecognized shape is refused with. */
export const WHATSAPP_PHONE_SHAPE_ISSUE =
  "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +";

/** The message a phone that is not a string is refused with. */
export const WHATSAPP_PHONE_TYPE_ISSUE = "whatsappPhone must be a string or null";

/** The message a time zone outside the allow-list is refused with. */
export const INVITATION_TIME_ZONE_ISSUE = "timeZone must be one of the supported time zones";

/** A normalized phone: the E.164 value, or null when the invitation has none. */
export type WhatsAppPhoneNormalization =
  | { readonly ok: true; readonly phone: string | null }
  | { readonly ok: false; readonly issue: string };

/**
 * Normalizes a WhatsApp phone to E.164 (S4). Spaces, dashes, and parentheses may separate the digits. A number
 * without `+` is a Mexican national number and must be exactly ten digits, which stores as `+52` and those
 * digits; a number with `+` must carry eight to fifteen digits after it. `null`, `undefined`, and a blank string
 * mean "no phone" and store null, which is how the creator clears it. Nothing else is accepted, and the stored
 * value always satisfies the `InvitationFeatureSettings_whatsappPhone_format` check.
 */
export function normalizeWhatsAppPhone(value: unknown): WhatsAppPhoneNormalization {
  if (value === null || value === undefined) {
    return { ok: true, phone: null };
  }
  if (typeof value !== "string") {
    return { ok: false, issue: WHATSAPP_PHONE_TYPE_ISSUE };
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, phone: null };
  }

  const compact = trimmed.replaceAll(PHONE_SEPARATORS, "");

  if (compact.startsWith("+")) {
    const digits = compact.slice(1);
    return E164_DIGITS.test(digits) ? { ok: true, phone: `+${digits}` } : refuseShape();
  }
  if (MEXICAN_NATIONAL_NUMBER.test(compact)) {
    return { ok: true, phone: `+${MEXICAN_WHATSAPP_COUNTRY_CODE}${compact}` };
  }
  return refuseShape();
}

function refuseShape(): WhatsAppPhoneNormalization {
  return { ok: false, issue: WHATSAPP_PHONE_SHAPE_ISSUE };
}

/** The feature settings a creator saves: the time zone and the stored E.164 phone, or null. */
export interface InvitationFeatureSettingsValue {
  readonly timeZone: InvitationTimeZone;
  readonly whatsappPhone: string | null;
}

/** The feature settings a request asked for, validated, or every issue that refuses them. */
export type InvitationFeatureSettingsValidation =
  | { readonly ok: true; readonly value: InvitationFeatureSettingsValue }
  | { readonly ok: false; readonly issues: string[] };

/**
 * Validates a feature-settings request (S4): the zone must be an allow-list member and the phone must normalize.
 * Every issue is reported, the zone before the phone, and nothing is transformed except the phone. A refused
 * request stores nothing.
 */
export function validateInvitationFeatureSettings(input: {
  readonly timeZone: unknown;
  readonly whatsappPhone: unknown;
}): InvitationFeatureSettingsValidation {
  const issues: string[] = [];

  if (!isInvitationTimeZone(input.timeZone)) {
    issues.push(INVITATION_TIME_ZONE_ISSUE);
  }

  const phone = normalizeWhatsAppPhone(input.whatsappPhone);
  if (!phone.ok) {
    issues.push(phone.issue);
  }

  if (issues.length > 0 || !phone.ok || !isInvitationTimeZone(input.timeZone)) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: { timeZone: input.timeZone, whatsappPhone: phone.phone },
  };
}

/** What the gate reads: the pinned package's included catalog keys and the stored phone. */
export interface InvitationFeatureGate {
  readonly includedFeatureKeys: readonly string[];
  readonly whatsappPhone: string | null;
}

/**
 * The feature keys an invitation may show (S4): the package's keys intersected with
 * `IMPLEMENTED_INVITATION_FEATURES`, in that allow-list's order, with `CALENDAR` appended because it is always
 * available and is not catalog data. WhatsApp is dropped while no phone is stored. Duplicates and unknown keys
 * never appear, and the package name plays no part.
 */
export function availableFeatureKeys(gate: InvitationFeatureGate): string[] {
  const included = new Set(gate.includedFeatureKeys);
  const keys: string[] = [];

  for (const featureKey of IMPLEMENTED_INVITATION_FEATURES) {
    if (!included.has(featureKey)) {
      continue;
    }
    if (featureKey === "WHATSAPP" && gate.whatsappPhone === null) {
      continue;
    }
    keys.push(featureKey);
  }
  keys.push(CALENDAR_FEATURE_KEY);
  return keys;
}

/** What a guest's feature block renders; `calendar` is always true (S4). */
export interface PublicInvitationFeatures {
  readonly countdown: boolean;
  readonly map: boolean;
  readonly calendar: true;
  /** The E.164 phone the WhatsApp button dials, or null when the feature is not available. */
  readonly whatsapp: { readonly phone: string } | null;
}

/**
 * The guest's view of the gated features (S4): the same intersection `availableFeatureKeys` decides, shaped as
 * the booleans the public read returns. WhatsApp answers the stored phone only while the package includes
 * WHATSAPP; a phone stored against a package that does not include it stays private.
 */
export function publicInvitationFeatures(gate: InvitationFeatureGate): PublicInvitationFeatures {
  const keys = new Set(availableFeatureKeys(gate));

  return {
    countdown: keys.has("COUNTDOWN"),
    map: keys.has("MAP"),
    calendar: true,
    whatsapp:
      keys.has("WHATSAPP") && gate.whatsappPhone !== null ? { phone: gate.whatsappPhone } : null,
  };
}
