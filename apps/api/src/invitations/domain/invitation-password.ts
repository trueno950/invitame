import type { JsonObject } from "./invitation-content";

// The shared access code of a password-protected invitation (F13; S2.13, L18.1). It is a code every guest of one
// invitation types to open it, never a user credential: it names no person, it is stored for one invitation only, and it
// grants nothing beyond that invitation's public page. The rules here are the pure ones — the width of the code, its
// normalization, and the one display name a locked page may carry — so the domain stays free of a runtime dependency
// while the API (`application/invitation-password.ts`) owns the hashing and the token.
//
// The plain value never leaves the request that set it or the request that unlocked with it: the API stores only the
// encoded `crypto.scrypt` hash, logs neither, and answers back only whether a code is set.

/** The shortest access code the owner may set: 4 characters, so a family can pick a word they will remember. */
export const INVITATION_PASSWORD_MIN_LENGTH = 4;

/** The longest access code the owner may set: 40 characters, far below any column or body bound. */
export const INVITATION_PASSWORD_MAX_LENGTH = 40;

/**
 * C0 and C1 control characters (`Cc`, which is how the guestbook states the same rule for a guest's words). A code
 * carrying one cannot be typed from a WhatsApp message and would make two values that look identical open different
 * invitations, so it is refused instead of stored.
 */
const CONTROL_CHARACTERS = /\p{Cc}/u;

/** The refusal issue of a value that is not a usable access code; the API answers it as 400 with this list. */
export const INVALID_INVITATION_PASSWORD_ISSUE = "password must be a string";

/** What one validated access code is: the value to hash, or the issues that refuse it. */
export interface InvitationPasswordValidation {
  /** The normalized value to hash, or null when the value is refused. */
  readonly password: string | null;
  readonly issues: readonly string[];
}

/**
 * Validates one access code (L18.1): a string of 4 to 40 characters once the surrounding whitespace is removed, with no
 * control character. The trimming is deliberate and symmetric — the API trims before hashing and before verifying — so a
 * code copied out of a message with a trailing space still opens the invitation, and no two visually identical codes
 * ever differ. Whitespace inside the code is kept as typed. A refused value never reaches the hash.
 */
export function validateInvitationPassword(value: unknown): InvitationPasswordValidation {
  if (typeof value !== "string") {
    return { password: null, issues: [INVALID_INVITATION_PASSWORD_ISSUE] };
  }
  const password = value.trim();
  const issues: string[] = [];

  if (password.length < INVITATION_PASSWORD_MIN_LENGTH) {
    issues.push(`password must be at least ${INVITATION_PASSWORD_MIN_LENGTH} characters long`);
  } else if (password.length > INVITATION_PASSWORD_MAX_LENGTH) {
    issues.push(`password must be at most ${INVITATION_PASSWORD_MAX_LENGTH} characters long`);
  }
  if (CONTROL_CHARACTERS.test(password)) {
    issues.push("password must not carry control characters");
  }

  return issues.length === 0 ? { password, issues } : { password: null, issues };
}

/**
 * The content fields the lock screen may name, in the order the celebration states them (L18.2): the person a baby
 * shower, a birthday, an XV, or a baptism celebrates, and then the two names a wedding announces. Nothing else — not the
 * date, the places, the message, a family list, or any id — reaches a locked page.
 */
export const LOCK_SCREEN_NAME_FIELDS = [
  "celebrantName",
  "babyName",
  "coupleNameOne",
  "coupleNameTwo",
] as const;

/** The longest display name a locked page carries, so the lock screen is one line. */
export const LOCK_SCREEN_NAME_MAX_LENGTH = 80;

/** The one line that joins the two names of a wedding on the lock screen. */
const COUPLE_JOINER = " y ";

/**
 * One stored content field as a display name: a string, trimmed, its whitespace runs collapsed into one space — a name
 * typed with a line break still reads as one line — and cut to the lock screen's width. Anything that is not a string,
 * and any value that collapses to nothing, answers null; a control character is dropped with the rest of the
 * whitespace it belongs to.
 */
function displayNameField(content: JsonObject, field: string): string | null {
  if (!Object.hasOwn(content, field)) {
    return null;
  }
  const value = content[field];

  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/gu, " ").trim();

  if (normalized === "" || CONTROL_CHARACTERS.test(normalized)) {
    return null;
  }

  return normalized.length > LOCK_SCREEN_NAME_MAX_LENGTH
    ? `${normalized.slice(0, LOCK_SCREEN_NAME_MAX_LENGTH - 1).trimEnd()}…`
    : normalized;
}

/**
 * The display name a locked invitation may carry (L18.2, L18.3): the celebrant's name, or the baby's when the
 * celebration names a baby instead, or the couple's two names joined with « y ». It is the only field of an invitation
 * a locked request learns, it is computed from the stored content alone, and it answers null when the content names
 * nobody — the lock screen then shows its generic line and the page still says nothing else.
 */
export function lockScreenDisplayName(content: JsonObject): string | null {
  const celebrant = displayNameField(content, "celebrantName");
  if (celebrant !== null) {
    return celebrant;
  }
  const baby = displayNameField(content, "babyName");
  if (baby !== null) {
    return baby;
  }
  const first = displayNameField(content, "coupleNameOne");
  const second = displayNameField(content, "coupleNameTwo");

  if (first === null || second === null) {
    return null;
  }
  const couple = `${first}${COUPLE_JOINER}${second}`;

  return couple.length > LOCK_SCREEN_NAME_MAX_LENGTH
    ? `${couple.slice(0, LOCK_SCREEN_NAME_MAX_LENGTH - 1).trimEnd()}…`
    : couple;
}
