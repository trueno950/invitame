import { createHash } from "node:crypto";

import { UNKNOWN_CLIENT_ADDRESS } from "./rsvp-rate-limiter";

// The rate limits of the unlock route (F13; S2.13, L18.3). They use the `RateLimit` table Better Auth, the RSVP form, the
// guestbook, and the guest album already share, with a key prefix of its own, so one abuse-limit store and one pruning
// rule serve the whole API.
//
// Two caps bound one guest's guessing, and both are spent before the lock is read and before any hashing work, so no
// request of the route is free:
//
// - 10 failed attempts per 15 minutes per client address and requested invitation address: enough for a family that
//   copies the code by hand and mistypes it twice, far too few to search a 40-character space;
// - 30 failed attempts per 15 minutes per client address across every address, so varying the slug cannot buy a fresh
//   budget, and an address no invitation holds spends it exactly like a known one.
//
// Only a *failed* attempt stays counted: the use case refunds the count of an unlock that succeeded, so a family sharing
// one venue address is never locked out by its own correct unlocks, and a budget that was already almost spent is not
// reset by one correct code either.
//
// The key holds no personal data. The client address is SHA-256 hashed, and the scope is a SHA-256 digest of the
// requested address — known or unknown, so the key never says whether an invitation exists — or the fixed `all` scope of
// the cap that spans every address. The prefix `unlock|` cannot collide with Better Auth's `<ip>|<path>` keys (a path
// always starts with `/`) nor with the other limiters' prefixes.

/** At most 10 failed unlock attempts per 15 minutes per client address and requested address (L18.3). */
export const INVITATION_UNLOCK_RATE_LIMIT = { window: 900, max: 10 } as const;

/**
 * At most 30 failed unlock attempts per 15 minutes per client address, whatever address it names: the cap that stops a
 * caller from buying a fresh per-address budget by varying the slug.
 */
export const INVITATION_UNLOCK_CLIENT_RATE_LIMIT = { window: 900, max: 30 } as const;

/** The prefix of every unlock count key; exported so a test can tell these rows apart from another limiter's. */
export const INVITATION_UNLOCK_RATE_LIMIT_KEY_PREFIX = "unlock|";

/** The scope of the cap that spans every requested address. */
export const INVITATION_UNLOCK_CLIENT_SCOPE = "all";

/** The key of the client address when the request carries none; the public forms share this exact value. */
export { UNKNOWN_CLIENT_ADDRESS };

/**
 * The `RateLimit` scope of the budget of one requested address: a SHA-256 digest of it, so the same rule serves an
 * address a published invitation holds and one it does not, and the stored key never says which was asked.
 */
export function invitationUnlockScope(slug: string): string {
  const digest = createHash("sha256").update(slug, "utf8").digest("hex");

  return `address:${digest}`;
}

/**
 * The counting rule one scope is spent against: the cap that spans every address, or the per-address one.
 */
export function invitationUnlockRateLimitRule(scope: string): {
  readonly window: number;
  readonly max: number;
} {
  return scope === INVITATION_UNLOCK_CLIENT_SCOPE
    ? INVITATION_UNLOCK_CLIENT_RATE_LIMIT
    : INVITATION_UNLOCK_RATE_LIMIT;
}

/**
 * The `RateLimit` key that counts one client address's failed attempts in one scope: the prefix, the scope, and a
 * SHA-256 of the trimmed, lower-cased address, so the plain address is never stored.
 */
export function invitationUnlockRateLimitKey(scope: string, clientAddress: string): string {
  const digest = createHash("sha256").update(clientAddress.trim().toLowerCase()).digest("hex");

  return `${INVITATION_UNLOCK_RATE_LIMIT_KEY_PREFIX}${scope}|${digest}`;
}

/**
 * Counts unlock attempts (L18.3). `consume` returns false when this attempt is over its cap and must be refused, and
 * `refund` gives the count of an attempt that turned out to be a correct code back, so only failures stay counted; a
 * store failure is an error, never an allow.
 */
export interface InvitationUnlockRateLimiter {
  consume(scope: string, clientAddress: string): Promise<boolean>;
  refund(scope: string, clientAddress: string): Promise<void>;
}

export const INVITATION_UNLOCK_RATE_LIMITER = Symbol("InvitationUnlockRateLimiter");
