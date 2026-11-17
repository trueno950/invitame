import { createHash } from "node:crypto";

// The rate limit of the public RSVP form (M6 G1; S1, S4). It uses the `RateLimit` table the authentication flow
// already uses — Better Auth's own persistent store — so the deployment keeps one abuse-limit table and one pruning
// rule instead of a second store. The numbers below are chosen so a family sharing one address and one invitation
// can still answer for every member, while a script cannot fill the creator's list:
//
// - 10 submissions per hour per client address per invitation;
// - the window is fixed and starts at the first counted submission: counting never moves the start, so the cap
//   cannot be extended indefinitely by waiting slightly less than an hour between attempts.
//
// The key holds no personal data: the client address is SHA-256 hashed, exactly as the email-code quota hashes an
// address, and the invitation id names no person. The key prefix `rsvp|` cannot collide with Better Auth's
// `<ip>|<path>` keys, because a path always starts with `/`.

/** At most 10 RSVP submissions per hour per client address per invitation (M6 S4). */
export const RSVP_RATE_LIMIT = { window: 3600, max: 10 } as const;

/** The prefix of every RSVP count key; exported so a test can tell these rows apart. */
export const RSVP_RATE_LIMIT_KEY_PREFIX = "rsvp|";

/** The key of the client address when the request carries none; every such request shares one bucket. */
export const UNKNOWN_CLIENT_ADDRESS = "unknown";

/**
 * The `RateLimit` key that counts one client address's submissions to one invitation: the prefix, the invitation
 * id, and a SHA-256 of the trimmed, lower-cased address, so the plain address is never stored.
 */
export function rsvpRateLimitKey(invitationId: string, clientAddress: string): string {
  const digest = createHash("sha256").update(clientAddress.trim().toLowerCase()).digest("hex");
  return `${RSVP_RATE_LIMIT_KEY_PREFIX}${invitationId}|${digest}`;
}

/**
 * Counts submissions (M6 G1; S4). `consume` returns false when this submission is over the cap and must be
 * refused; a store failure is an error, never an allow.
 */
export interface RsvpRateLimiter {
  consume(invitationId: string, clientAddress: string): Promise<boolean>;
}

export const RSVP_RATE_LIMITER = Symbol("RsvpRateLimiter");
