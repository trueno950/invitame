import type { PlacePoint } from "../domain/invitation-place";

// The short-lived cache of place-search answers (S2). A person typing «Parroquia de San José, Querétaro» asks the
// geocoder once per debounced pause, and a pause is often a re-typed or corrected tail of the same text. This cache
// keeps one process's recent answers so those repetitions cost the public instance nothing:
//
// - the key is the query normalized to its meaningful text: trimmed, inner whitespace collapsed, and lower-cased, so
//   case and spacing never spend a second request;
// - an entry lives a few minutes, long enough for a typing session and short enough that a corrected map is picked up;
// - the map is bounded, and the least recently stored entry is dropped first, so an owner who types all evening
//   cannot grow this process's memory without limit.
//
// It is deliberately per process: a deployment with several API instances asks its geocoder a few more times, which
// is the right trade against a second store.

/** How long one answer is reused: three minutes, about one typing session (S2). */
export const PLACE_SEARCH_CACHE_TTL_MS = 3 * 60 * 1_000;

/** How many answers one process keeps; past this, the least recently stored entry is dropped (S2). */
export const PLACE_SEARCH_CACHE_MAX_ENTRIES = 200;

/** The cache key of one query: trimmed, whitespace collapsed, and lower-cased (S2). */
export function placeSearchCacheKey(query: string): string {
  return query.trim().replace(/\s+/gu, " ").toLowerCase();
}

export interface PlaceSearchCacheOptions {
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  /** Injected only so a test observes the expiry without waiting for it. */
  readonly now?: () => number;
}

interface CacheEntry {
  readonly places: readonly PlacePoint[];
  readonly expiresAt: number;
}

/** The bounded, expiring cache of one process (S2). */
export class InMemoryPlaceSearchCache {
  readonly #entries = new Map<string, CacheEntry>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(options: PlaceSearchCacheOptions = {}) {
    this.#ttlMs = options.ttlMs ?? PLACE_SEARCH_CACHE_TTL_MS;
    this.#maxEntries = options.maxEntries ?? PLACE_SEARCH_CACHE_MAX_ENTRIES;
    this.#now = options.now ?? Date.now;
  }

  /** How many answers are stored, expired ones included until they are read or evicted. */
  get size(): number {
    return this.#entries.size;
  }

  /** The answer stored for this key, or undefined when there is none or it expired. */
  get(key: string): readonly PlacePoint[] | undefined {
    const entry = this.#entries.get(key);

    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }

    return entry.places;
  }

  /** Stores one answer; a full cache drops the least recently stored entry first. */
  set(key: string, places: readonly PlacePoint[]): void {
    // Re-inserting refreshes the entry's place in the insertion order, which is what eviction follows.
    this.#entries.delete(key);

    if (this.#entries.size >= this.#maxEntries) {
      const oldest = this.#entries.keys().next();

      if (oldest.done !== true) {
        this.#entries.delete(oldest.value);
      }
    }

    this.#entries.set(key, { places, expiresAt: this.#now() + this.#ttlMs });
  }
}
