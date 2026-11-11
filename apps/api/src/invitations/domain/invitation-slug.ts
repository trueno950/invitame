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
 * Words a slug may never be: routes and product pages that already exist or will exist, so a full slug
 * equal to one of them would shadow a real page. Stored slugs are always lower-case, and the comparison
 * ignores case as a guard.
 */
export const RESERVED_INVITATION_SLUGS = [
  "admin",
  "api",
  "cuenta",
  "ingresar",
  "health",
  "_next",
  "invitaciones",
  "invitacion",
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
