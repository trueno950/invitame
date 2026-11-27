import { createHash } from "node:crypto";

// The rate limit of the public guestbook form (F7; S2.7, L10.3). It mirrors the open RSVP form exactly: the same shared
// `RateLimit` table Better Auth already uses and prunes, the same fixed window that starts at the first counted
// submission, the same hashed client address, and a key prefix of its own so the two forms never share a budget.
//
// - 10 signatures per hour per client address per invitation: enough for a family that signs together from one phone,
//   and far too few for a script;
// - the window is fixed and starts at the first counted submission: waiting slightly less than an hour never extends it.
//
// The key holds no personal data: the client address is SHA-256 hashed, and the invitation id names no person. The key
// prefix `guestbook|` cannot collide with Better Auth's `<ip>|<path>` keys, because a path always starts with `/`, nor
// with the RSVP form's `rsvp|` keys.

/** At most 10 signatures per hour per client address per invitation (F7; L10.3). */
export const GUESTBOOK_RATE_LIMIT = { window: 3600, max: 10 } as const;

/** The prefix of every guestbook count key; exported so a test can tell these rows apart from another limiter's. */
export const GUESTBOOK_RATE_LIMIT_KEY_PREFIX = "guestbook|";

/** The key of the client address when the request carries none; every such request shares one bucket. */
export const UNKNOWN_CLIENT_ADDRESS = "unknown";

/**
 * The `RateLimit` key that counts one client address's signatures on one invitation: the prefix, the invitation id, and
 * a SHA-256 of the trimmed, lower-cased address, so the plain address is never stored.
 */
export function guestbookRateLimitKey(invitationId: string, clientAddress: string): string {
  const digest = createHash("sha256").update(clientAddress.trim().toLowerCase()).digest("hex");

  return `${GUESTBOOK_RATE_LIMIT_KEY_PREFIX}${invitationId}|${digest}`;
}

/**
 * Counts signatures (F7; L10.3). `consume` returns false when this signature is over the cap and must be refused; a
 * store failure is an error, never an allow.
 */
export interface GuestbookRateLimiter {
  consume(invitationId: string, clientAddress: string): Promise<boolean>;
}

export const GUESTBOOK_RATE_LIMITER = Symbol("GuestbookRateLimiter");
