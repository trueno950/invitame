import type { JsonObject } from "./invitation-content";

// Precise locations (S1, S2; S3). The owner types an address, and a typo silently broke the Google Maps and Waze
// links. This module holds the pure rules the place search, the stored coordinates, and both reads share:
//
// - the query the owner is typing: trimmed, 3 to 120 characters, because a shorter text matches half a country and a
//   longer one is not an address anyone typed;
// - the address fields of the pinned template version: a declared property whose name ends with `Address` or is
//   exactly `address`, derived from the schema and never from a template name;
// - the stored point: a non-blank label of at most 300 characters, a latitude in -90..90, and a longitude in
//   -180..180, the same bounds the column CHECK constraints state; a stored value that fails them is no point at
//   all, so a malformed row degrades both reads instead of throwing or showing an empty marker;
// - the label a geocoder answered, composed from its own fields and bounded to the column's width;
// - whether a guest still sees a stored point: only while the package grants `MAP` and the address text in the
//   content still equals the label the point was stored with, so rewriting the address silently drops the old
//   coordinates instead of sending a guest to the place the owner no longer means.

/** The width of `InvitationPlace.field`, the name of the content field the point belongs to. */
export const PLACE_FIELD_MAX_LENGTH = 64;

/** The width of `InvitationPlace.label`, the text the geocoder answered when the point was chosen. */
export const PLACE_LABEL_MAX_LENGTH = 300;

/** The shortest query the geocoder is asked about: two characters match half a country (S2). */
export const PLACE_QUERY_MIN_LENGTH = 3;

/** The longest query the geocoder is asked about: the width of an address anyone types (S2). */
export const PLACE_QUERY_MAX_LENGTH = 120;

/**
 * At most five suggestions reach the owner while no administrator has changed the panel, which is what the listbox
 * renders (S2). The live value is the settings row's `placeSearchResultLimit`, read through
 * `OPERATIONAL_SETTINGS_READER` when a search runs (M9 T13; S5, S8).
 */
export const PLACE_RESULT_LIMIT = 5;

/** The message a query that is not a text is refused with. */
export const PLACE_QUERY_TYPE_ISSUE = "q must be a text";

/** The message a query outside 3 to 120 characters is refused with. */
export const PLACE_QUERY_LENGTH_ISSUE = `q must be ${PLACE_QUERY_MIN_LENGTH} to ${PLACE_QUERY_MAX_LENGTH} characters`;

/** The message a blank or oversized label is refused with. */
export const PLACE_LABEL_ISSUE = `label must be a text of 1 to ${PLACE_LABEL_MAX_LENGTH} characters`;

/** The message a latitude outside its range is refused with. */
export const PLACE_LAT_ISSUE = "lat must be a number between -90 and 90";

/** The message a longitude outside its range is refused with. */
export const PLACE_LNG_ISSUE = "lng must be a number between -180 and 180";

/** The message a field that does not name an address field of the pinned schema is refused with. */
export const PLACE_FIELD_ISSUE =
  "field must name an address field of the pinned template version schema";

/**
 * One point on the map (S2): the label a geocoder answered and the two coordinates that make it precise. It is the
 * shape a search suggestion, a stored place, and a guest's map marker all have.
 */
export interface PlacePoint {
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
}

/** The stored points of one invitation, keyed by the content field each one belongs to. */
export type StoredPlaces = Readonly<Record<string, PlacePoint>>;

/** A normalized query, or the issue that refuses it. */
export type PlaceQueryValidation =
  | { readonly ok: true; readonly query: string }
  | { readonly ok: false; readonly issue: string };

/**
 * Normalizes the text the owner is typing (S2): the surrounding spaces are trimmed and the length is counted in
 * characters, so a short text never reaches the geocoder and a hostile one cannot grow the request. Nothing else is
 * folded: the geocoder receives exactly what the owner typed, accents included.
 */
export function normalizePlaceQuery(value: unknown): PlaceQueryValidation {
  if (typeof value !== "string") {
    return { ok: false, issue: PLACE_QUERY_TYPE_ISSUE };
  }

  const query = value.trim();
  const length = [...query].length;

  if (length < PLACE_QUERY_MIN_LENGTH || length > PLACE_QUERY_MAX_LENGTH) {
    return { ok: false, issue: PLACE_QUERY_LENGTH_ISSUE };
  }

  return { ok: true, query };
}

/** Whether a value is a latitude the database also accepts (S2). */
export function isLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

/** Whether a value is a longitude the database also accepts (S2). */
export function isLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * Whether a name is an address field (S2): a declared property ending in `Address`, or the bare `address` a
 * birthday layout uses. The rule reads the name only, so no template name, package name, or feature key selects it.
 */
export function isAddressFieldName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= PLACE_FIELD_MAX_LENGTH &&
    (name === "address" || name.endsWith("Address"))
  );
}

/**
 * The address fields one pinned schema declares, in schema order (S2). A schema that declares no usable
 * `properties` answers none, so the write fails closed instead of accepting a field nobody validated.
 */
export function addressFieldNames(schema: unknown): string[] {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return [];
  }
  const properties = Object.hasOwn(schema, "properties")
    ? (schema as { properties?: unknown }).properties
    : undefined;

  if (typeof properties !== "object" || properties === null || Array.isArray(properties)) {
    return [];
  }

  return Object.keys(properties).filter(
    (name) =>
      isAddressFieldName(name) &&
      // A declared address needs a definition this API can read; a drifted snapshot declares none.
      typeof (properties as Record<string, unknown>)[name] === "object" &&
      (properties as Record<string, unknown>)[name] !== null &&
      !Array.isArray((properties as Record<string, unknown>)[name]),
  );
}

/**
 * A label the geocoder answered, trimmed and bounded to the column's width, or null when it says nothing. A longer
 * label is cut instead of refused: it is provider data the owner never typed, and the column is the second bound.
 */
export function normalizePlaceLabel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const characters = [...trimmed];

  return characters.length > PLACE_LABEL_MAX_LENGTH
    ? characters.slice(0, PLACE_LABEL_MAX_LENGTH).join("").trimEnd()
    : trimmed;
}

/**
 * A label composed of the parts a geocoder answered (S2): every non-empty part, trimmed, joined with a comma. Photon
 * names a place as a name, a street, a house number, a city, and a state; a place that names none of them has
 * nothing to write into an address field and answers null.
 */
export function composePlaceLabel(parts: readonly unknown[]): string | null {
  const named = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part !== "");

  return named.length === 0 ? null : normalizePlaceLabel(named.join(", "));
}

/** The stored place a write asked for, or every issue that refuses it. */
export type PlaceWriteValidation =
  | { readonly ok: true; readonly value: PlacePoint }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * Validates the body of a place write (S2, S3): a non-blank label of at most 300 characters, a latitude in
 * -90..90, and a longitude in -180..180. Every issue is reported, label first, then latitude, then longitude, and
 * nothing is transformed. The stored value therefore always satisfies the column CHECK constraints.
 */
export function validatePlaceWrite(input: {
  readonly label: unknown;
  readonly lat: unknown;
  readonly lng: unknown;
}): PlaceWriteValidation {
  const label = normalizePlaceLabel(input.label);
  const labelIsBounded =
    typeof input.label === "string" && [...input.label.trim()].length <= PLACE_LABEL_MAX_LENGTH;
  const issues: string[] = [];

  if (label === null || !labelIsBounded) {
    issues.push(PLACE_LABEL_ISSUE);
  }
  if (!isLatitude(input.lat)) {
    issues.push(PLACE_LAT_ISSUE);
  }
  if (!isLongitude(input.lng)) {
    issues.push(PLACE_LNG_ISSUE);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  // The three issues above prove the shapes; the assertions keep the value free of casts.
  return {
    ok: true,
    value: {
      label: label as string,
      lat: input.lat as number,
      lng: input.lng as number,
    },
  };
}

/**
 * Whether a stored value is still a point this API answers (S2, S3): an object whose label is exactly the text
 * `normalizePlaceLabel` writes and whose coordinates are inside the bounds the column states. A row written around
 * the API — a value that is not a point, a blank label, a label wider than the column, a coordinate outside the
 * range — is therefore no point at all, so a read degrades to "no stored point" instead of throwing or answering a
 * value no rule validated.
 */
export function isStoredPlacePoint(value: unknown): value is PlacePoint {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const fields = value as { label?: unknown; lat?: unknown; lng?: unknown };

  return (
    typeof fields.label === "string" &&
    normalizePlaceLabel(fields.label) === fields.label &&
    isLatitude(fields.lat) &&
    isLongitude(fields.lng)
  );
}

/**
 * The points a guest may see (S2): only while the package grants `MAP`, only for an address field, only for a
 * point the domain would still accept, and only while the stored label is exactly the text the content holds for
 * that field. Rewriting the address therefore drops the old coordinates instead of sending a guest to the place the
 * owner no longer means, and a row written around the API never reaches a guest with an unusable coordinate: a
 * malformed stored value is skipped, never a read that throws.
 */
export function confirmedPlaces(
  places: StoredPlaces,
  content: JsonObject,
  mapGranted: boolean,
): Record<string, PlacePoint> {
  if (!mapGranted) {
    return {};
  }

  const confirmed: Record<string, PlacePoint> = {};

  for (const [field, place] of Object.entries(places)) {
    // The values come from stored rows, so one of them may be anything at all; it is no point for a guest.
    if (!isAddressFieldName(field) || !isStoredPlacePoint(place)) {
      continue;
    }
    const text = Object.hasOwn(content, field) ? content[field] : undefined;
    if (typeof text !== "string" || text !== place.label) {
      continue;
    }
    Object.defineProperty(confirmed, field, {
      value: { label: place.label, lat: place.lat, lng: place.lng },
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return confirmed;
}
