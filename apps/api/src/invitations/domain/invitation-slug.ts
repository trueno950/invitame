// The generated public slug (M4 T2; S5, S10). Milestone 4 generates the slug and never lets the owner edit
// it: a fixed neutral prefix, six random lower-case alphanumerics, and nothing derived from the owner or
// from user data, because a slug must not contain secrets or encode authorization. Uniqueness is the
// database's unique index, not this module; a collision is retried by the create use case.
import {
  InvalidInvitationSlugRandomnessError,
  ReservedInvitationSlugError,
} from "./invitation.errors";

/** The fixed, neutral prefix; it never carries user data or the owner id (S10). */
export const INVITATION_SLUG_PREFIX = "invitacion";

/** How many random characters follow the prefix. */
export const INVITATION_SLUG_RANDOM_LENGTH = 6;

/** Lower-case alphanumerics, so every draw stays inside `Invitation_slug_format`. */
export const INVITATION_SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Lower-case alphanumerics joined by single hyphens: the `Invitation_slug_format` CHECK constraint. */
export const INVITATION_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** `Invitation_slug_length` and the `VARCHAR(60)` column: a generated slug is 17 characters. */
export const INVITATION_SLUG_MIN_LENGTH = 3;
export const INVITATION_SLUG_MAX_LENGTH = 60;

/**
 * Words a slug may never be: every top-level route segment of `apps/web/app` (`admin`, `api`, `cuenta`, `fonts`,
 * `health`, `i`, `ingresar`, and Next.js's own `_next`), every API path prefix (`invitations`, `public`, `catalog`,
 * `media`, `me`, `payments`, `auth`, `health`, `admin`), and the product and catalog names that already mean a page
 * (`invitame`, `invitacion`, `invitaciones`), plus the co-hosts' Spanish acceptance route (`colaboraciones`, F12;
 * L17.3). A full slug equal to one of them would shadow a real page, so the owner may never claim one (F11; S2.11,
 * L15.1). Stored slugs are always lower-case, and the comparison ignores case as a guard.
 */
export const RESERVED_INVITATION_SLUGS = [
  "admin",
  "api",
  "auth",
  "catalog",
  // The co-hosts' acceptance routes (F12; L17.3): `/colaboraciones/aceptar` in the web app and
  // `/collaborations/accept` on the API. Both are reserved, because a slug must never shadow either one.
  "colaboraciones",
  "collaborations",
  "cuenta",
  "fonts",
  "health",
  "i",
  "ingresar",
  "invitacion",
  "invitaciones",
  "invitame",
  "invitations",
  "me",
  "media",
  "payments",
  "public",
  "_next",
] as const;

/** The randomness source the generator draws from; injected so a test can be deterministic. */
export type InvitationSlugRandom = () => number;

/**
 * A new public slug: the fixed prefix and six characters drawn from `INVITATION_SLUG_ALPHABET`, one
 * `random()` call each. The result always satisfies the database format and length constraints.
 */
export function generateInvitationSlug(random: InvitationSlugRandom): string {
  const characters = Array.from({ length: INVITATION_SLUG_RANDOM_LENGTH }, () =>
    INVITATION_SLUG_ALPHABET.charAt(drawIndex(random)),
  );

  return `${INVITATION_SLUG_PREFIX}-${characters.join("")}`;
}

/** The drawn index in `[0, INVITATION_SLUG_ALPHABET.length)`; a source outside `[0, 1)` is refused. */
function drawIndex(random: InvitationSlugRandom): number {
  const value = random();

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1) {
    throw new InvalidInvitationSlugRandomnessError(value);
  }
  return Math.floor(value * INVITATION_SLUG_ALPHABET.length);
}

/** Whether a value is already a storable slug: the format and length the database enforces. */
export function isValidInvitationSlug(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length >= INVITATION_SLUG_MIN_LENGTH &&
    value.length <= INVITATION_SLUG_MAX_LENGTH &&
    INVITATION_SLUG_PATTERN.test(value)
  );
}

/** Whether the whole slug is one of `RESERVED_INVITATION_SLUGS`, whatever its case. */
export function isReservedSlug(slug: string): boolean {
  const normalized = slug.toLowerCase();
  return RESERVED_INVITATION_SLUGS.some((reserved) => reserved === normalized);
}

/** Refuses a reserved slug with a domain error that names it. */
export function assertNotReservedSlug(slug: string): void {
  if (isReservedSlug(slug)) {
    throw new ReservedInvitationSlugError(slug);
  }
}

// The address the owner types (F11; S2.11, L15.1, approval). A generated slug is neutral and random; this one is the
// owner's own words, so it is narrower than the column: 3 to 40 characters, lower-case letters, digits, and inner
// hyphens, never two hyphens in a row, and never a reserved word. The database column stays wider (3 to 60, the shape
// a generated slug has); this rule is the domain's, and the rename is the only write that applies it.

/** The address rule itself: one letter or digit, 1 to 38 inner characters, one letter or digit. */
export const OWNER_INVITATION_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const OWNER_INVITATION_SLUG_MIN_LENGTH = 3;
export const OWNER_INVITATION_SLUG_MAX_LENGTH = 40;

/** How many times one owner may rename the address of one invitation (L15.2, approval). */
export const MAX_INVITATION_SLUG_RENAMES = 5;

/**
 * How many renames an invitation that keeps `previous` previous addresses still has (F11; L15.2). Every owned answer
 * states this same number, so no route can report the whole allowance after a rename.
 */
export function remainingSlugRenames(previous: number): number {
  return Math.max(0, MAX_INVITATION_SLUG_RENAMES - previous);
}

/** What the owner's availability check may answer (F11; L15.3). */
export type OwnerSlugChoice = "valid" | "invalid" | "reserved";

/** The English issue an invalid address gets, for the API's `issues` list. */
export const INVALID_OWNER_SLUG_ISSUE =
  "The address must be 3 to 40 characters of lower-case letters, digits, and inner hyphens.";

/**
 * What the rule says about the text the owner typed: well formed and free of the reserved words, malformed, or a
 * reserved word. A reserved word is only reported as such when it is otherwise well formed, so a one-character word
 * such as `i` is `invalid` (it is too short) and still refused.
 */
export function ownerSlugChoice(value: unknown): OwnerSlugChoice {
  if (typeof value !== "string") {
    return "invalid";
  }
  const length = value.length;

  if (
    length < OWNER_INVITATION_SLUG_MIN_LENGTH ||
    length > OWNER_INVITATION_SLUG_MAX_LENGTH ||
    !OWNER_INVITATION_SLUG_PATTERN.test(value) ||
    value.includes("--")
  ) {
    return "invalid";
  }

  return isReservedSlug(value) ? "reserved" : "valid";
}

/** The one English sentence that explains a refused address, or null when the rule accepts it. */
export function ownerSlugIssue(value: unknown): string | null {
  switch (ownerSlugChoice(value)) {
    case "valid":
      return null;
    case "reserved":
      return `The address ${String(value)} is reserved.`;
    default:
      return INVALID_OWNER_SLUG_ISSUE;
  }
}
