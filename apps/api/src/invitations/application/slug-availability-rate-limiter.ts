// The address-check limit (F11; S2.11, L15.3). The owner types an address and the editor asks the API after each
// debounced pause, so one typing session is several checks. The limit is per owner and per window, it rests by itself,
// and it lives on the shared `RateLimit` table every other limiter of the deployment already counts on (L25), so a
// deployment keeps one abuse store and one pruning behavior.

/** The limit: 120 checks per ten minutes per owner — a typing session, with room for a few in a row. */
export const SLUG_AVAILABILITY_RATE_LIMIT = { window: 10 * 60, max: 120 } as const;

/** The key of one owner's checks; it names the owner id, never the text they typed or any other owner. */
export function slugAvailabilityRateLimitKey(ownerId: string): string {
  return `invitation-slug|${ownerId}`;
}

export interface SlugAvailabilityRateLimiter {
  /** Counts one check; false means the owner is over the limit and the check must be refused. */
  consume(ownerId: string): Promise<boolean>;
}

export const SLUG_AVAILABILITY_RATE_LIMITER = Symbol("SlugAvailabilityRateLimiter");
