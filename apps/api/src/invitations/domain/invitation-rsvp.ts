// The RSVP rules of an invitation (M6 G1; S1, S3, S4). Four pure decisions live here, and none of them reads a
// table, a clock, a request, or a provider:
//
// - the name the creator reads: trimmed and with its internal whitespace collapsed, 1 to 80 characters;
// - the dedupe key retries collapse on: the name with accents stripped and case folded, plus the normalized
//   phone, so the database can hold at most one response per guest per invitation;
// - the settings a creator saves: an optional ISO deadline and a party limit of 1 to 10;
// - the response a guest submits: attending or not, a party size inside the invitation's limit, an optional
//   E.164 phone, and an optional message of at most 280 characters.
//
// The phone is normalized by the same rule the WhatsApp contact uses (`domain/invitation-features.ts`), so a
// stored RSVP phone always satisfies the column's E.164 check. The feature gate (open RSVP versus the guest list
// G2 implements) is decided in `invitation-features.ts` from catalog keys alone; this module re-exports it so a
// caller of the RSVP use cases needs one import.

import {
  normalizeWhatsAppPhone,
  rsvpModeOf,
  WHATSAPP_PHONE_TYPE_ISSUE,
} from "./invitation-features";

export type { RsvpMode } from "./invitation-features";
export { rsvpModeOf };

/** The widest name a response may carry, counted in characters: the width of `RsvpResponse.name`. */
export const RSVP_NAME_MAX_LENGTH = 80;

/** The widest message a response may carry, counted in characters: the width of `RsvpResponse.message`. */
export const RSVP_MESSAGE_MAX_LENGTH = 280;

/** The widest party any invitation allows, whatever its own limit says: `RsvpResponse.partySize`. */
export const RSVP_PARTY_SIZE_MAX = 10;

/** The party limit bounds a creator may set (S4). The maximum is the widest the column accepts, never a policy. */
export const RSVP_PARTY_LIMIT_MIN = 1;
export const RSVP_PARTY_LIMIT_MAX = 10;

/**
 * The party limit a new invitation reads while no administrator has changed the panel: the value the migration seeds
 * (M9 T13; S5, S8). The live value is the settings row's `rsvpDefaultPartyLimit`, read through
 * `OPERATIONAL_SETTINGS_READER` when a draft is created.
 */
export const DEFAULT_RSVP_PARTY_LIMIT = 4;

/** The issue a name that is not a string is refused with. */
export const RSVP_NAME_TYPE_ISSUE = "name must be a string";

/** The issue a blank or too wide name is refused with. */
export const RSVP_NAME_LENGTH_ISSUE = "name must be between 1 and 80 characters";

/** The issue an `attending` value that is not a boolean is refused with. */
export const RSVP_ATTENDING_TYPE_ISSUE = "attending must be a boolean";

/** The issue a party size outside 0 to 10, or not an integer, is refused with. */
export const RSVP_PARTY_SIZE_TYPE_ISSUE = "partySize must be an integer between 0 and 10";

/** The issue a declined response that still names people is refused with. */
export const RSVP_PARTY_SIZE_NOT_ATTENDING_ISSUE = "partySize must be 0 when not attending";

/** The issue an attending response outside the invitation's party limit is refused with. */
export function attendingPartySizeIssue(partyLimit: number): string {
  return `partySize must be between 1 and ${partyLimit} when attending`;
}

/** The issue a phone that is not a string is refused with. */
export const RSVP_PHONE_TYPE_ISSUE = "phone must be a string or null";

/** The issue a phone of an unrecognized shape is refused with; the WhatsApp rules decide the shape. */
export const RSVP_PHONE_SHAPE_ISSUE =
  "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +";

/** The issue a message that is not a string is refused with. */
export const RSVP_MESSAGE_TYPE_ISSUE = "message must be a string or null";

/** The issue a message wider than `RSVP_MESSAGE_MAX_LENGTH` is refused with. */
export const RSVP_MESSAGE_LENGTH_ISSUE = "message must be at most 280 characters";

/** The issue a deadline that is not an ISO instant with an offset is refused with. */
export const RSVP_DEADLINE_ISSUE = "deadline must be an ISO 8601 instant with an offset, or null";

/** The issue a party limit that is not an integer is refused with. */
export const RSVP_PARTY_LIMIT_TYPE_ISSUE = "partyLimit must be an integer";

/** The issue a party limit outside 1 to 10 is refused with. */
export const RSVP_PARTY_LIMIT_RANGE_ISSUE = rsvpPartyLimitRangeIssue(RSVP_PARTY_LIMIT_MAX);

/**
 * The issue a party limit above the platform's current maximum is refused with (M9 T13; S5, S8). The bounds sentence
 * names the maximum the settings row states right now, so an owner who is told «between 1 and 6» reads the limit the
 * API actually applies.
 */
export function rsvpPartyLimitRangeIssue(maxPartyLimit: number): string {
  return `partyLimit must be between ${RSVP_PARTY_LIMIT_MIN} and ${maxPartyLimit}`;
}

/**
 * An ISO 8601 instant with an explicit offset: a date, `T`, a time, and `Z` or `±hh:mm`. A date alone or a
 * local time without an offset names no instant, so it is refused instead of being read as UTC by accident.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** One run of whitespace, including the no-break space `String.prototype.trim` also removes. */
const WHITESPACE_RUNS = /\s+/gu;

/** The combining marks `NFKD` leaves behind once a precomposed letter is decomposed. */
const COMBINING_MARKS = /\p{M}+/gu;

/** A normalized name: the stored spelling, or the issue that refuses it. */
export type RsvpNameNormalization =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly issue: string };

/** Trims and collapses every whitespace run to one space; the case and the accents are kept. */
function collapseWhitespace(value: string): string {
  return value.trim().replaceAll(WHITESPACE_RUNS, " ");
}

/**
 * Normalizes the name a guest typed into the name the creator reads: surrounding whitespace trimmed, every
 * internal whitespace run collapsed to one space, and nothing else changed, so the creator sees the spelling the
 * guest chose. The length is counted in characters, like every other bounded field of the invitation, so an
 * emoji or an accented letter counts once. Empty and blank names are refused.
 */
export function normalizeRsvpName(value: unknown): RsvpNameNormalization {
  if (typeof value !== "string") {
    return { ok: false, issue: RSVP_NAME_TYPE_ISSUE };
  }
  const collapsed = collapseWhitespace(value);
  if (collapsed === "" || [...collapsed].length > RSVP_NAME_MAX_LENGTH) {
    return { ok: false, issue: RSVP_NAME_LENGTH_ISSUE };
  }
  return { ok: true, value: collapsed };
}

/**
 * The name as the dedupe key spells it: whitespace collapsed, accents stripped (NFKD plus the combining marks),
 * and case folded. Two guests who typed the same name differently therefore share one key, which is what makes a
 * retry an update instead of a duplicate response (S4).
 */
function dedupeName(value: string): string {
  return collapseWhitespace(value).normalize("NFKD").replaceAll(COMBINING_MARKS, "").toLowerCase();
}

/**
 * The unique key of one response inside one invitation (S4): the dedupe-normalized name and the normalized
 * phone, or nothing after the separator when no phone was given. A phone is E.164 (`+` and digits) and can never
 * contain the separator, so the two parts can never be confused. The widest possible key is 97 characters
 * (an 80-character name, the separator, and a 16-character phone), well inside the column's 200.
 */
export function rsvpDedupeKey(name: string, phone: string | null): string {
  return `${dedupeName(name)}|${phone ?? ""}`;
}

/** The RSVP settings a creator saves: the optional deadline and the party limit. */
export interface RsvpSettings {
  readonly deadline: Date | null;
  readonly partyLimit: number;
}

/** The settings a request asked for, validated, or every issue that refuses them. */
export type RsvpSettingsValidation =
  | { readonly ok: true; readonly value: RsvpSettings }
  | { readonly ok: false; readonly issues: string[] };

/** The limits a settings save is judged against: the platform-wide maximum party size (M9 T13; S5, S8). */
export interface RsvpSettingsLimits {
  /** The widest party an owner may set; the settings row's `rsvpMaxPartyLimit`, never wider than the column. */
  readonly maxPartyLimit?: number;
}

/**
 * Validates a settings request (S4): `deadline` is null or an ISO 8601 instant with an offset, and `partyLimit`
 * is an integer from 1 to the platform's current maximum (the settings row's `rsvpMaxPartyLimit`, or the column's own
 * 10 when no settings module is composed). Every issue is reported, the deadline first, and nothing is transformed
 * except the deadline's instant. A past deadline is accepted: it simply closes RSVP, which is the owner's decision.
 *
 * A lowered maximum does not touch a stored limit: an invitation whose `rsvpPartyLimit` already exceeds it keeps the
 * number it has, and only the next save above the maximum is refused (S8 «Conservan lo que tienen»).
 */
export function validateRsvpSettings(
  input: {
    readonly deadline: unknown;
    readonly partyLimit: unknown;
  },
  limits: RsvpSettingsLimits = {},
): RsvpSettingsValidation {
  const issues: string[] = [];
  let deadline: Date | null = null;

  if (input.deadline !== null && input.deadline !== undefined) {
    if (typeof input.deadline !== "string") {
      issues.push(RSVP_DEADLINE_ISSUE);
    } else {
      const trimmed = input.deadline.trim();
      const parsed = ISO_INSTANT.test(trimmed) ? new Date(trimmed) : null;
      if (parsed === null || Number.isNaN(parsed.getTime())) {
        issues.push(RSVP_DEADLINE_ISSUE);
      } else {
        deadline = parsed;
      }
    }
  }

  const partyLimit = input.partyLimit;
  // The platform maximum is the settings row's, clamped to the column's own widest value so a corrupted setting can
  // never admit a party size the `Invitation_rsvpPartyLimit_range` check refuses.
  const maxPartyLimit = Math.min(
    limits.maxPartyLimit ?? RSVP_PARTY_LIMIT_MAX,
    RSVP_PARTY_LIMIT_MAX,
  );
  if (typeof partyLimit !== "number" || !Number.isInteger(partyLimit)) {
    issues.push(RSVP_PARTY_LIMIT_TYPE_ISSUE);
  } else if (partyLimit < RSVP_PARTY_LIMIT_MIN || partyLimit > maxPartyLimit) {
    issues.push(rsvpPartyLimitRangeIssue(maxPartyLimit));
  }

  if (issues.length > 0 || typeof partyLimit !== "number") {
    return { ok: false, issues };
  }
  return { ok: true, value: { deadline, partyLimit } };
}

/** A response a guest submitted, as the request carries it: every value is untrusted. */
export interface RsvpResponseInput {
  readonly name: unknown;
  readonly attending: unknown;
  /** Omitted means "no people named": it is valid for a declined response and refused for an attending one. */
  readonly partySize?: unknown;
  readonly phone: unknown;
  readonly message: unknown;
}

/** A validated response: the stored fields plus the dedupe key the write uses. */
export interface RsvpResponseValue {
  readonly name: string;
  readonly attending: boolean;
  readonly partySize: number;
  readonly phone: string | null;
  readonly message: string | null;
  readonly dedupeKey: string;
}

/** The response a request asked for, validated, or every issue that refuses it. */
export type RsvpResponseValidation =
  | { readonly ok: true; readonly value: RsvpResponseValue }
  | { readonly ok: false; readonly issues: string[] };

/**
 * Normalizes the optional phone with the WhatsApp rules and renames the issue to this field. Reusing the
 * normalization keeps one definition of an acceptable phone; renaming the issue keeps the client's message about
 * `phone` from mentioning the WhatsApp contact field.
 */
function normalizeRsvpPhone(
  value: unknown,
):
  | { readonly ok: true; readonly phone: string | null }
  | { readonly ok: false; readonly issue: string } {
  const normalized = normalizeWhatsAppPhone(value);
  if (normalized.ok) {
    return normalized;
  }
  return {
    ok: false,
    issue:
      normalized.issue === WHATSAPP_PHONE_TYPE_ISSUE
        ? RSVP_PHONE_TYPE_ISSUE
        : RSVP_PHONE_SHAPE_ISSUE,
  };
}

/** Normalizes the optional message: blank stores null, and the length is counted in characters. */
function normalizeRsvpMessage(
  value: unknown,
):
  | { readonly ok: true; readonly message: string | null }
  | { readonly ok: false; readonly issue: string } {
  if (value === null || value === undefined) {
    return { ok: true, message: null };
  }
  if (typeof value !== "string") {
    return { ok: false, issue: RSVP_MESSAGE_TYPE_ISSUE };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, message: null };
  }
  if ([...trimmed].length > RSVP_MESSAGE_MAX_LENGTH) {
    return { ok: false, issue: RSVP_MESSAGE_LENGTH_ISSUE };
  }
  return { ok: true, message: trimmed };
}

/**
 * Validates one response against the invitation's party limit (S4). An attending response carries 1 to the
 * limit people; a declined one carries none, and an omitted party size means zero. The issues are reported in a
 * fixed order — name, attending, party size, phone, message — so the client can show them one after another.
 * A refused response stores nothing.
 */
export function validateRsvpResponse(
  input: RsvpResponseInput,
  settings: { readonly partyLimit: number },
): RsvpResponseValidation {
  const issues: string[] = [];

  const name = normalizeRsvpName(input.name);
  if (!name.ok) {
    issues.push(name.issue);
  }

  const attending = input.attending;
  if (typeof attending !== "boolean") {
    issues.push(RSVP_ATTENDING_TYPE_ISSUE);
  }

  const partySize = input.partySize === undefined ? 0 : input.partySize;
  if (
    typeof partySize !== "number" ||
    !Number.isInteger(partySize) ||
    partySize < 0 ||
    partySize > RSVP_PARTY_SIZE_MAX
  ) {
    issues.push(RSVP_PARTY_SIZE_TYPE_ISSUE);
  } else if (attending === true && (partySize < 1 || partySize > settings.partyLimit)) {
    issues.push(attendingPartySizeIssue(settings.partyLimit));
  } else if (attending === false && partySize !== 0) {
    issues.push(RSVP_PARTY_SIZE_NOT_ATTENDING_ISSUE);
  }

  const phone = normalizeRsvpPhone(input.phone);
  if (!phone.ok) {
    issues.push(phone.issue);
  }

  const message = normalizeRsvpMessage(input.message);
  if (!message.ok) {
    issues.push(message.issue);
  }

  if (
    issues.length > 0 ||
    !name.ok ||
    !phone.ok ||
    !message.ok ||
    typeof attending !== "boolean" ||
    typeof partySize !== "number"
  ) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      name: name.value,
      attending,
      partySize,
      phone: phone.phone,
      message: message.message,
      dedupeKey: rsvpDedupeKey(name.value, phone.phone),
    },
  };
}

/**
 * Whether RSVP still accepts a response (S4): always without a deadline, otherwise up to and including the
 * deadline's instant. The database write repeats this rule, so a response that races an unpublish or a deadline
 * that just passed is refused there too.
 */
export function isRsvpOpenOn(deadline: Date | null, now: Date): boolean {
  return deadline === null || now.getTime() <= deadline.getTime();
}
