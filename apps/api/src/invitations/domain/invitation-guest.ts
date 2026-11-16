// The guest-list rules of an invitation (M6 G2; S1, S4). Five pure decisions live here, and none of them reads a
// table, a clock, a request, or a provider:
//
// - the guest the creator adds or edits: a name of 1 to 80 characters, seats of 1 to 10, an optional E.164 phone,
//   and an optional note of at most 200 characters;
// - the shape of a personal guest token, so a value that cannot have been minted is refused before any query;
// - the totals of one guest list: guests, seats, confirmed people, declines, pending guests, and check-ins.
//
// The name and the phone are normalized by the same rules the RSVP form uses (`domain/invitation-rsvp.ts` and
// `domain/invitation-features.ts`), so a stored guest satisfies the column checks the migration adds and one
// definition of an acceptable name and phone serves both the open form and a personal link. The token itself is
// minted and hashed in `application/guest-token.ts`, because that needs the platform's crypto module and the
// domain imports no runtime dependency.

import { normalizeWhatsAppPhone, WHATSAPP_PHONE_TYPE_ISSUE } from "./invitation-features";
import { normalizeRsvpName } from "./invitation-rsvp";

/** The widest guest name, counted in characters: the width of `Guest.name`. */
export const GUEST_NAME_MAX_LENGTH = 80;

/** The widest guest note, counted in characters: the width of `Guest.note`. */
export const GUEST_NOTE_MAX_LENGTH = 200;

/** The seats a guest may be given (S4): the same 1 to 10 range an RSVP party uses. */
export const GUEST_SEATS_MIN = 1;
export const GUEST_SEATS_MAX = 10;

/** The issue a seat count that is not an integer is refused with. */
export const GUEST_SEATS_TYPE_ISSUE = "seats must be an integer";

/** The issue a seat count outside 1 to 10 is refused with. */
export const GUEST_SEATS_RANGE_ISSUE = "seats must be between 1 and 10";

/** The issue a note that is not a string is refused with. */
export const GUEST_NOTE_TYPE_ISSUE = "note must be a string or null";

/** The issue a note wider than `GUEST_NOTE_MAX_LENGTH` is refused with. */
export const GUEST_NOTE_LENGTH_ISSUE = "note must be at most 200 characters";

/** The issue a phone of an unrecognized shape is refused with; the WhatsApp rules decide the shape. */
export const GUEST_PHONE_SHAPE_ISSUE =
  "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +";

/** The issue a phone that is not a string is refused with. */
export const GUEST_PHONE_TYPE_ISSUE = "phone must be a string or null";

/**
 * The exact shape of a personal guest token: 128 bits encoded as 22 base64url characters, so no padding and no
 * `+` or `/`. A value outside this shape cannot have been minted by this API, so it is refused before a query.
 */
export const GUEST_TOKEN_LENGTH = 22;

/** The one shape a guest token has; anything else names no guest. */
const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** The issue a malformed guest token is refused with; the owner's check-in route answers 404 for it instead. */
export const GUEST_TOKEN_ISSUE = "token must be a guest token";

/** The one shape of a personal guest token (S4), compared whole and never trimmed. */
export function isGuestTokenFormat(value: unknown): value is string {
  return typeof value === "string" && GUEST_TOKEN_PATTERN.test(value);
}

/** A normalized guest: the stored fields the application validated. */
export interface GuestValue {
  readonly name: string;
  readonly seats: number;
  readonly phone: string | null;
  readonly note: string | null;
}

/** The guest a request asked for, validated, or every issue that refuses it. */
export type GuestValidation =
  | { readonly ok: true; readonly value: GuestValue }
  | { readonly ok: false; readonly issues: string[] };

/** Normalizes the optional phone with the WhatsApp rules and renames the issue to this field. */
function normalizeGuestPhone(
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
        ? GUEST_PHONE_TYPE_ISSUE
        : GUEST_PHONE_SHAPE_ISSUE,
  };
}

/** Normalizes the optional note: blank stores null, and the length is counted in characters. */
function normalizeGuestNote(
  value: unknown,
):
  | { readonly ok: true; readonly note: string | null }
  | { readonly ok: false; readonly issue: string } {
  if (value === null || value === undefined) {
    return { ok: true, note: null };
  }
  if (typeof value !== "string") {
    return { ok: false, issue: GUEST_NOTE_TYPE_ISSUE };
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, note: null };
  }
  if ([...trimmed].length > GUEST_NOTE_MAX_LENGTH) {
    return { ok: false, issue: GUEST_NOTE_LENGTH_ISSUE };
  }
  return { ok: true, note: trimmed };
}

/**
 * Validates the guest a creator adds or edits (S4): the name is normalized like a response's, the seats are an
 * integer from 1 to 10, the phone is E.164 like the WhatsApp contact's, and the note is at most 200 characters.
 * Every issue is reported in a fixed order — name, seats, phone, note — so the client can show them one after
 * another. A refused guest stores nothing.
 */
export function validateGuestInput(input: {
  readonly name: unknown;
  readonly seats: unknown;
  readonly phone: unknown;
  readonly note: unknown;
}): GuestValidation {
  const issues: string[] = [];

  const name = normalizeRsvpName(input.name);
  if (!name.ok) {
    issues.push(name.issue);
  }

  const seats = input.seats;
  if (typeof seats !== "number" || !Number.isInteger(seats)) {
    issues.push(GUEST_SEATS_TYPE_ISSUE);
  } else if (seats < GUEST_SEATS_MIN || seats > GUEST_SEATS_MAX) {
    issues.push(GUEST_SEATS_RANGE_ISSUE);
  }

  const phone = normalizeGuestPhone(input.phone);
  if (!phone.ok) {
    issues.push(phone.issue);
  }

  const note = normalizeGuestNote(input.note);
  if (!note.ok) {
    issues.push(note.issue);
  }

  if (
    issues.length > 0 ||
    !name.ok ||
    !phone.ok ||
    !note.ok ||
    typeof seats !== "number" ||
    !Number.isInteger(seats)
  ) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      name: name.value,
      seats: seats as number,
      phone: phone.phone,
      note: note.note,
    },
  };
}

/** What one guest contributes to the totals of a list: their seats, their answer, and their check-in. */
export interface GuestTotalsInput {
  readonly seats: number;
  readonly checkedInAt: Date | null;
  readonly response: { readonly attending: boolean; readonly partySize: number } | null;
}

/** The totals of one guest list (S1, S4), as the creator's page shows them. */
export interface GuestTotals {
  /** How many guests the invitation has. */
  guests: number;
  /** The sum of every guest's seats, answered or not. */
  seats: number;
  /** How many guests confirmed they are coming. */
  attendingGuests: number;
  /** The sum of the confirmed party sizes. */
  attendingPeople: number;
  /** How many guests declined. */
  declinedCount: number;
  /** How many guests have not answered yet. */
  pendingCount: number;
  /** How many guests are checked in. */
  checkedInCount: number;
}

/** Counts one guest list (S1, S4): guests, seats, confirmed people, declines, pending guests, and check-ins. */
export function guestTotalsOf(guests: readonly GuestTotalsInput[]): GuestTotals {
  let seats = 0;
  let attendingGuests = 0;
  let attendingPeople = 0;
  let declinedCount = 0;
  let pendingCount = 0;
  let checkedInCount = 0;

  for (const guest of guests) {
    seats += guest.seats;
    if (guest.checkedInAt !== null) {
      checkedInCount += 1;
    }
    if (guest.response === null) {
      pendingCount += 1;
    } else if (guest.response.attending) {
      attendingGuests += 1;
      attendingPeople += guest.response.partySize;
    } else {
      declinedCount += 1;
    }
  }

  return {
    guests: guests.length,
    seats,
    attendingGuests,
    attendingPeople,
    declinedCount,
    pendingCount,
    checkedInCount,
  };
}
