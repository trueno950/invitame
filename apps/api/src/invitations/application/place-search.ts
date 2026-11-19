import type { PlacePoint } from "../domain/invitation-place";

// The place-search port (S2, S3). The owner types an address; the editor asks this port for real suggestions, and
// nothing above it names Photon, OpenStreetMap, or an HTTP client (AGENTS.md). The adapter decides which instance it
// asks, how, and for how long; the use case decides when a request is worth making and how many suggestions reach
// the owner. `off` binds the never-answering implementation below, so a deployment that opts out — and every test —
// makes no request at all.

/**
 * What the API may ask a geocoder about the text an owner is typing (S2). An implementation answers at most a few
 * points, most relevant first, and answers an empty list when it has nothing usable: a provider that is slow, down,
 * or answering something else is never an error the editor has to handle.
 */
export interface PlaceSearch {
  search(query: string): Promise<readonly PlacePoint[]>;
}

export const PLACE_SEARCH = Symbol("PlaceSearch");

/**
 * The provider of a deployment that never asks anyone (S2): `PLACE_SEARCH_PROVIDER=off` and the test environment use
 * it, so a suite or a CI run never reaches a geocoder and typing an address simply offers no suggestion.
 */
export const NO_PLACE_SEARCH: PlaceSearch = { search: async () => [] };
