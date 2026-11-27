import { createHash } from "node:crypto";

// The rate limit of the album's upload form (F8; S2.8, L11.3). It mirrors the guestbook form exactly: the same shared
// `RateLimit` table Better Auth already uses and prunes, the same fixed window that starts at the first counted
// submission, the same hashed client address, and a key prefix of its own so no two forms share a budget.
//
// - 30 photos per hour per client address per invitation: enough for a guest photographing a whole party from one
//   phone, and far too few for a script that fills the album;
// - the window is fixed and starts at the first counted submission: waiting slightly less than an hour never extends it.
//
// The key holds no personal data: the client address is SHA-256 hashed, and the invitation id names no person. The
// prefix `guest-album|` cannot collide with Better Auth's `<ip>|<path>` keys, because a path always starts with `/`, nor
// with the `rsvp|` and `guestbook|` keys of the other public forms.

/** At most 30 photos per hour per client address per invitation (F8; L11.3). */
export const GUEST_ALBUM_RATE_LIMIT = { window: 3600, max: 30 } as const;

/** The prefix of every album count key; exported so a test can tell these rows apart from another limiter's. */
export const GUEST_ALBUM_RATE_LIMIT_KEY_PREFIX = "guest-album|";

/** The key of the client address when the request carries none; every such request shares one bucket. */
export const UNKNOWN_GUEST_ALBUM_CLIENT_ADDRESS = "unknown";

/**
 * The `RateLimit` key that counts one client address's uploads to one invitation: the prefix, the invitation id, and a
 * SHA-256 of the trimmed, lower-cased address, so the plain address is never stored.
 */
export function guestAlbumRateLimitKey(invitationId: string, clientAddress: string): string {
  const digest = createHash("sha256").update(clientAddress.trim().toLowerCase()).digest("hex");

  return `${GUEST_ALBUM_RATE_LIMIT_KEY_PREFIX}${invitationId}|${digest}`;
}

/**
 * Counts uploads (F8; L11.3). `consume` returns false when this upload is over the cap and must be refused; a store
 * failure is an error, never an allow.
 */
export interface GuestAlbumRateLimiter {
  consume(invitationId: string, clientAddress: string): Promise<boolean>;
}

export const GUEST_ALBUM_RATE_LIMITER = Symbol("GuestAlbumRateLimiter");
