// The rate limit of the owner's place search (S2, S3). The geocoder behind it is a free public instance, so the API
// bounds how often one owner may ask it. It uses the `RateLimit` table the authentication flow already uses — the
// same table and the same pruning as the RSVP limit — so a deployment keeps one abuse-limit store:
//
// - 60 searches per ten minutes per owner;
// - the window is fixed and starts at the first counted search: counting never moves the start, so the cap cannot be
//   extended indefinitely by waiting slightly less than a window;
// - a cached answer costs nothing, so retyping or pausing on the same address never spends the limit.
//
// The key holds the owner's id, which is an internal UUID and names no person, and a prefix that cannot collide with
// Better Auth's `<ip>|<path>` keys (a path always starts with `/`) or with the RSVP keys.

/** At most 60 searches per ten minutes per owner (S2). */
export const PLACE_SEARCH_RATE_LIMIT = { window: 600, max: 60 } as const;

/** The prefix of every place-search count key; exported so a test can tell these rows apart. */
export const PLACE_SEARCH_RATE_LIMIT_KEY_PREFIX = "place-search|";

/** The `RateLimit` key that counts one owner's searches: the prefix and the owner id. */
export function placeSearchRateLimitKey(ownerId: string): string {
  return `${PLACE_SEARCH_RATE_LIMIT_KEY_PREFIX}${ownerId}`;
}

/**
 * Counts searches (S2). `consume` returns false when this search is over the cap and must be refused; a store
 * failure is an error, never an allow.
 */
export interface PlaceSearchRateLimiter {
  consume(ownerId: string): Promise<boolean>;
}

export const PLACE_SEARCH_RATE_LIMITER = Symbol("PlaceSearchRateLimiter");
