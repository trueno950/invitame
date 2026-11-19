import type { PlaceSearchEnvironment } from "../../config/environment";
import { PLACE_SEARCH_PROVIDER } from "../../config/environment";
import { NO_PLACE_SEARCH, type PlaceSearch } from "../application/place-search";
import { PhotonPlaceSearch } from "./photon-place-search";

/**
 * Selects the place-search adapter for the validated provider setting (S2, S3). `off` binds the never-answering
 * implementation, so the test environment and a deployment that opts out make no request at all; `photon` binds the
 * adapter to the configured instance, which is the public one unless `PLACE_SEARCH_PHOTON_URL` names another.
 */
export function createPlaceSearch(settings: PlaceSearchEnvironment): PlaceSearch {
  switch (settings.provider) {
    case PLACE_SEARCH_PROVIDER.PHOTON:
      return new PhotonPlaceSearch({ baseUrl: settings.photonUrl });
    case PLACE_SEARCH_PROVIDER.OFF:
      return NO_PLACE_SEARCH;
  }
}
