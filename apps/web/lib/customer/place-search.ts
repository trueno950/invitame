import type { PlacePoint, StoredPlaces } from "../invitation-features/place-point.ts";

/**
 * What the place actions of the editor answer (S1, S2). The types live here, free of `server-only`, so the client
 * combobox and the server actions that call the API share one contract instead of two copies of it.
 */

/** Why a search answered nothing: the combobox maps each one to its own quiet note. */
export type PlaceSearchFailure = "invalid-query" | "rate-limited" | "not-found" | "unavailable";

/** The suggestions of one search, or why there are none. */
export type PlaceSearchResult =
  | { readonly ok: true; readonly suggestions: readonly PlacePoint[] }
  | { readonly ok: false; readonly failure: PlaceSearchFailure };

/** What storing or clearing a point answers: the invitation's stored points, or a message for the field. */
export type PlaceWriteResult =
  | { readonly ok: true; readonly places: StoredPlaces }
  | { readonly ok: false; readonly message: string };
