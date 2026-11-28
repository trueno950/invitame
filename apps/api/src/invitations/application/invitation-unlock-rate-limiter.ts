import { createHash } from "node:crypto";

// The rate limit of the unlock route (F13; S2.13, L18.3). It uses the `RateLimit` table Better Auth, the RSVP form, the
// guestbook, and the guest album already share, with a key prefix of its own, so one abuse-limit store and one pruning
// rule serve the whole API.
//
// - 10 attempts per 15 minutes per client address per invitation: enough for a family that copies the code by hand and
//   mistypes it twice, far too few to search a 40-character space;
// - the window is fixed and starts at the first counted attempt, so waiting slightly less than the window never extends
//   the cap.
//
// The key holds no personal data: the client address is SHA-256 hashed and the scope is the invitation id. A slug no
// invitation holds has no id, so the scope is a SHA-256 of the requested address instead, and an unknown address is
// limited exactly like a known one — the budget never says whether an invitation exists.
//
// The prefix `unlock|` cannot collide with Better Auth's `<ip>|<path>` keys (a path always starts with `/`) nor with the
// other limiters' prefixes.

/** At most 10 unlock attempts per 15 minutes per client address per invitation (L18.3). */
export const INVITATION_UNLOCK_RATE_LIMIT = { window: 900, max: 10 } as const;

/** The prefix of every unlock count key; exported so a test can tell these rows apart from another limiter's. */
export const INVITATION_UNLOCK_RATE_LIMIT_KEY_PREFIX = "unlock|";

/** The key of the client address when the request carries none; every such request shares one bucket. */
export const UNKNOWN_CLIENT_ADDRESS = "unknown";

/** The scope of an attempt on an invitation the read found: its stored id, which names no person. */
export function invitationUnlockScope(invitationId: string): string {
  return `invitation:${invitationId}`;
}

/** The scope of an attempt on an address no published invitation holds: a digest of it, never the address itself. */
export function unknownInvitationUnlockScope(slug: string): string {
  const digest = createHash("sha256").update(slug, "utf8").digest("hex");

  return `address:${digest}`;
}

/**
 * The `RateLimit` key that counts one client address's attempts on one invitation: the prefix, the scope, and a SHA-256
 * of the trimmed, lower-cased address, so the plain address is never stored.
 */
export function invitationUnlockRateLimitKey(scope: string, clientAddress: string): string {
  const digest = createHash("sha256").update(clientAddress.trim().toLowerCase()).digest("hex");

  return `${INVITATION_UNLOCK_RATE_LIMIT_KEY_PREFIX}${scope}|${digest}`;
}

/**
 * Counts unlock attempts (L18.3). `consume` returns false when this attempt is over the cap and must be refused; a store
 * failure is an error, never an allow.
 */
export interface InvitationUnlockRateLimiter {
  consume(scope: string, clientAddress: string): Promise<boolean>;
}

export const INVITATION_UNLOCK_RATE_LIMITER = Symbol("InvitationUnlockRateLimiter");
