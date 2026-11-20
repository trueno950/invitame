import { Logger } from "@nestjs/common";

import type { PlaceSearch } from "../application/place-search";
import {
  composePlaceLabel,
  isLatitude,
  isLongitude,
  type PlacePoint,
} from "../domain/invitation-place";

// The Photon adapter of the place search port (S2, S3). Photon is an OpenStreetMap search service with a public,
// keyless instance, so the owner's editor can offer real suggestions while typing an address. The adapter is
// deliberately strict, because it reads a third party's answer:
//
// - one request, three seconds, no retry: a suggestion is a courtesy of the editor, never a dependency;
// - no redirect is followed, so an answer from another host is an answer from nowhere;
// - the body is bounded before a byte is read and while it is read;
// - only a GeoJSON `FeatureCollection` of `Point`s is read, and a feature without a usable point is skipped instead
//   of refusing the whole answer;
// - every coordinate is range-checked, and the label is composed from the provider's own fields and bounded to the
//   width of the column that stores it;
// - the query is a bias toward Mexico (see `PHOTON_MEXICO_BIAS`), not a filter: a Mexican address must not lose to a
//   namesake elsewhere, while a place outside the country still answers;
// - no `lang` is asked for, because the public instance accepts only `default`, `de`, `en`, and `fr` and answers 400
//   to `es`. The default language is the one a Mexican address wants: the local name of the place, its street, and
//   its city, exactly as OpenStreetMap stores them;
// - every way a lookup can answer nothing is reported as one structured operational fact: a bounded category and,
//   for a refused answer, the status. The fact never carries the query text, because the request URL names the
//   address the owner is typing, so a provider that stops answering is visible without logging anyone's data.
//
// The public instance is best effort, and `PLACE_SEARCH_PHOTON_URL` is the seam that lets a self-hosted Photon
// replace it without a code change. Public Nominatim is never used for typeahead (S2).

/** A lookup that takes longer than this is abandoned; the owner simply gets no suggestion (S2). */
export const PHOTON_TIMEOUT_MS = 3_000;

/** The largest answer this adapter reads; a real Photon answer for five results is a few kilobytes (S2, S3). */
export const PHOTON_MAX_BODY_BYTES = 64 * 1024;

/** Identifies the API to the instance; the public one answers without it, but an anonymous client is a bad neighbor. */
export const PHOTON_USER_AGENT = "invitame-api/0.1.0";

/** Photon's own maximum is larger; the listbox shows five suggestions, so five are asked for (S2). */
export const PHOTON_RESULT_LIMIT = 5;

/**
 * The search bias toward Mexico: the geographic center of the country and a country-wide zoom. Photon ranks an answer
 * by its distance from this point, which is what keeps «Parroquia de San José» in Querétaro ahead of a namesake on
 * another continent. It is a bias, never a `bbox` filter, so an address outside Mexico still answers — an owner may
 * celebrate anywhere — and it is a constant, never request data, so no personal data reaches the instance.
 */
export const PHOTON_MEXICO_BIAS = { lat: 23.6345, lon: -102.5528, zoom: 4 } as const;

/** The public Photon instance, and the default of a deployment that configures none (S2). */
export const DEFAULT_PHOTON_URL = "https://photon.komoot.io/api/";

const HTTP_OK = 200;

/** The ways a lookup answers nothing (S2, S3): a bounded category each, and never the text that was typed. */
export const PLACE_SEARCH_FAILURE = {
  TIMEOUT: "timeout",
  NETWORK: "network",
  HTTP_STATUS: "http-status",
  BODY_REJECTED: "body-rejected",
  INVALID_JSON: "invalid-json",
} as const;

export type PlaceSearchFailureCategory =
  (typeof PLACE_SEARCH_FAILURE)[keyof typeof PLACE_SEARCH_FAILURE];

/**
 * One operational fact about a lookup that answered nothing (S2, S3): what went wrong and, for a refused answer, the
 * status. It carries no query text and no body, because the request URL names the address an owner is typing.
 */
export interface PlaceSearchFailure {
  readonly event: "place-search-failed";
  readonly category: PlaceSearchFailureCategory;
  readonly status?: number;
}

/** Where a failed lookup is reported; the default writes one structured warning through Nest's logger. */
export type PlaceSearchFailureReporter = (failure: PlaceSearchFailure) => void;

const logger = new Logger("PlaceSearch");

/** The default report, so a provider that stops answering leaves a trace instead of failing silently (S3). */
const logPlaceSearchFailure: PlaceSearchFailureReporter = (failure) => logger.warn(failure);

/** Whether the error is the abandoned request of the timeout, rather than a connection that never answered (S2). */
function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export interface PhotonPlaceSearchOptions {
  /** The instance to ask; `PLACE_SEARCH_PHOTON_URL`, or the public one (S2). */
  readonly baseUrl?: string;
  /** Injected only so a test never reaches the network; the platform `fetch` is the default. */
  readonly fetch?: typeof fetch;
  /** Overridable so a test observes the timeout without waiting for it. */
  readonly timeoutMs?: number;
  readonly maxBodyBytes?: number;
  /** Overridable so a test observes the report without Nest's logger; the default warns once per failure. */
  readonly reportFailure?: PlaceSearchFailureReporter;
}

/** Releases a response body the adapter does not read, or a reader it gave up on. */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is already settled; nothing to release.
  }
}

/**
 * Reads at most `maxBytes` of a response body: the declared length is refused before a byte is read, and a body that
 * grows past the bound is cancelled. `null` means "too large to be a Photon answer".
 */
async function readBoundedBody(response: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discardBody(response);
    return null;
  }

  const body = response.body;
  if (body === null) {
    return null;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

/** A point a feature names, or null when the geometry is not a point with two in-range coordinates. */
function pointOf(geometry: unknown): { lat: number; lng: number } | null {
  if (typeof geometry !== "object" || geometry === null || Array.isArray(geometry)) {
    return null;
  }
  const fields = geometry as { type?: unknown; coordinates?: unknown };

  if (fields.type !== "Point" || !Array.isArray(fields.coordinates)) {
    return null;
  }
  // GeoJSON orders a position as longitude, latitude, altitude.
  const [lng, lat] = fields.coordinates;

  return isLatitude(lat) && isLongitude(lng) ? { lat, lng } : null;
}

/** The label a feature's properties name, composed and bounded, or null when it names nothing. */
function labelOf(properties: unknown): string | null {
  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return null;
  }
  const fields = properties as Record<string, unknown>;
  const street = composePlaceLabel([fields.street, fields.housenumber]);

  return composePlaceLabel([fields.name, street, fields.city, fields.state]);
}

/**
 * The points a Photon answer names, in the answer's order, or none when the answer is not a GeoJSON
 * `FeatureCollection` (S2, S3). A feature whose geometry or label is unusable is skipped, so one drifted result never
 * costs the owner the whole list, and `photonPlaces` never throws: the adapter's failure mode is "no suggestion".
 */
export function photonPlaces(answer: unknown): PlacePoint[] {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) {
    return [];
  }
  const collection = answer as { type?: unknown; features?: unknown };

  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    return [];
  }

  const places: PlacePoint[] = [];

  for (const feature of collection.features) {
    if (typeof feature !== "object" || feature === null || Array.isArray(feature)) {
      continue;
    }
    const fields = feature as { geometry?: unknown; properties?: unknown };
    const point = pointOf(fields.geometry);
    const label = labelOf(fields.properties);

    if (point === null || label === null) {
      continue;
    }
    places.push({ label, lat: point.lat, lng: point.lng });
    if (places.length === PHOTON_RESULT_LIMIT) {
      break;
    }
  }

  return places;
}

/** The public Photon adapter (S2): one bounded, unredirected request per search, never a retry. */
export class PhotonPlaceSearch implements PlaceSearch {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #maxBodyBytes: number;
  readonly #reportFailure: PlaceSearchFailureReporter;

  constructor(options: PhotonPlaceSearchOptions = {}) {
    this.#baseUrl = options.baseUrl ?? DEFAULT_PHOTON_URL;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? PHOTON_TIMEOUT_MS;
    this.#maxBodyBytes = options.maxBodyBytes ?? PHOTON_MAX_BODY_BYTES;
    this.#reportFailure = options.reportFailure ?? logPlaceSearchFailure;
  }

  async search(query: string): Promise<readonly PlacePoint[]> {
    let text: string | null;

    try {
      const target = new URL(this.#baseUrl);
      target.searchParams.set("q", query);
      target.searchParams.set("limit", String(PHOTON_RESULT_LIMIT));
      target.searchParams.set("lat", String(PHOTON_MEXICO_BIAS.lat));
      target.searchParams.set("lon", String(PHOTON_MEXICO_BIAS.lon));
      target.searchParams.set("zoom", String(PHOTON_MEXICO_BIAS.zoom));

      const response = await this.#fetch(target.href, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": PHOTON_USER_AGENT },
        // A redirect would leave the configured instance, so an answer that is not its own 200 is nothing.
        redirect: "manual",
        signal: AbortSignal.timeout(this.#timeoutMs),
      });

      if (response.status !== HTTP_OK) {
        await discardBody(response);
        this.#reportFailure({
          event: "place-search-failed",
          category: PLACE_SEARCH_FAILURE.HTTP_STATUS,
          status: response.status,
        });
        return [];
      }

      text = await readBoundedBody(response, this.#maxBodyBytes);
    } catch (error) {
      // A timeout, a network failure, or an unreadable body: no suggestion, and one operational fact. Nothing
      // carries the query text, because the request URL names the address the owner is typing.
      this.#reportFailure({
        event: "place-search-failed",
        category: isTimeout(error) ? PLACE_SEARCH_FAILURE.TIMEOUT : PLACE_SEARCH_FAILURE.NETWORK,
      });
      return [];
    }

    if (text === null) {
      // No body at all, or one that grew past the bound: the instance is not answering what this API expects.
      this.#reportFailure({
        event: "place-search-failed",
        category: PLACE_SEARCH_FAILURE.BODY_REJECTED,
      });
      return [];
    }

    try {
      return photonPlaces(JSON.parse(text));
    } catch {
      // The instance answered something that is not JSON: nothing to suggest, and one operational fact.
      this.#reportFailure({
        event: "place-search-failed",
        category: PLACE_SEARCH_FAILURE.INVALID_JSON,
      });
      return [];
    }
  }
}
