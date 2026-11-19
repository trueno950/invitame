/**
 * The stored point of one address field (S1, S2, S3). A guest's Google Maps and Waze links and the map of the
 * celebration need the coordinates the owner confirmed, never the text they typed, so both reads of the API carry
 * points, and this module is the one reading of that shape the web trusts.
 *
 * It mirrors `apps/api/src/invitations/domain/invitation-place.ts`: the label of a point is a text of 1 to 300
 * characters, a latitude lives in -90..90, a longitude in -180..180, a field is a declared property named `address`
 * or ending in `Address`, and at most five suggestions reach the owner. A body outside those bounds is refused
 * whole instead of being rendered, because a point the API could not have stored is not a place a guest may be sent
 * to.
 *
 * `confirmedPlaces` is the rule both reads share: a point belongs to the field it was stored for only while the
 * content still holds exactly the label it was stored with. The public read already applies it on the API side;
 * the owner read answers every stored point, so the owner's preview applies it here and shows the guest's map.
 */

/** The width of a stored label, as the column and the API state it. */
export const PLACE_LABEL_MAX_LENGTH = 300;

/** The width of the content field name a point belongs to. */
export const PLACE_FIELD_MAX_LENGTH = 64;

/** At most five suggestions reach the owner, which is what the listbox renders. */
export const PLACE_RESULT_LIMIT = 5;

/** The shortest text the geocoder is asked about: two characters match half a country. */
export const PLACE_QUERY_MIN_LENGTH = 3;

/** The longest text the geocoder is asked about: the width of an address anyone types. */
export const PLACE_QUERY_MAX_LENGTH = 120;

/** One point on the map: the label a geocoder answered and the two coordinates that make it precise. */
export interface PlacePoint {
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
}

/** The stored points of one invitation, keyed by the content field each one belongs to. */
export type StoredPlaces = Readonly<Record<string, PlacePoint>>;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Whether a value is a latitude the database also accepts. */
export function isLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

/** Whether a value is a longitude the database also accepts. */
export function isLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * Whether a name is an address field: a declared property ending in `Address`, or the bare `address` a birthday
 * layout uses. The rule reads the name only, so no template name, package name, or feature key selects it.
 */
export function isAddressFieldName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= PLACE_FIELD_MAX_LENGTH &&
    (value === "address" || value.endsWith("Address"))
  );
}

/** One point, or `undefined` when the value is not a place the API could have stored or answered. */
export function parsePlacePoint(value: unknown): PlacePoint | undefined {
  const point = record(value);

  if (point === undefined) {
    return undefined;
  }

  const { label, lat, lng } = point;

  if (
    typeof label !== "string" ||
    label.trim().length === 0 ||
    [...label].length > PLACE_LABEL_MAX_LENGTH ||
    !isLatitude(lat) ||
    !isLongitude(lng)
  ) {
    return undefined;
  }

  return { label, lat, lng };
}

/** The suggestions of one search: a bound list of points, refused whole when any entry is not one. */
export function parsePlacePoints(value: unknown): PlacePoint[] | undefined {
  if (!Array.isArray(value) || value.length > PLACE_RESULT_LIMIT) {
    return undefined;
  }

  const points: PlacePoint[] = [];
  for (const item of value) {
    const point = parsePlacePoint(item);
    if (point === undefined) {
      return undefined;
    }
    points.push(point);
  }
  return points;
}

/**
 * The stored points of one invitation, keyed by address field. A map with any other key, or with a point outside the
 * bounds of the columns, is not the contract this deployment reads, so the whole map is refused.
 */
export function parseStoredPlaces(value: unknown): StoredPlaces | undefined {
  const places = record(value);

  if (places === undefined) {
    return undefined;
  }

  const parsed: Record<string, PlacePoint> = {};
  for (const [field, item] of Object.entries(places)) {
    if (!isAddressFieldName(field)) {
      return undefined;
    }
    const point = parsePlacePoint(item);
    if (point === undefined) {
      return undefined;
    }
    parsed[field] = point;
  }
  return parsed;
}

/** The stored point of one content field, or `undefined` when that field has none. */
export function storedPlaceOf(
  places: StoredPlaces | undefined,
  field: string,
): PlacePoint | undefined {
  return places === undefined || !Object.hasOwn(places, field) ? undefined : places[field];
}

/** Whether a point is still the one of the text a field holds: the equal label is the whole rule. */
export function isPlaceConfirmed(point: PlacePoint | undefined, text: unknown): boolean {
  return point !== undefined && typeof text === "string" && point.label === text;
}

/**
 * The points a reader may use: only the ones whose field still holds the stored label. A rewritten address silently
 * loses its coordinates, so a guest is never sent to the place the owner no longer means.
 */
export function confirmedPlaces(places: StoredPlaces | undefined, content: unknown): StoredPlaces {
  const fields = record(content);

  if (places === undefined || fields === undefined) {
    return {};
  }

  const confirmed: Record<string, PlacePoint> = {};
  for (const [field, point] of Object.entries(places)) {
    if (isAddressFieldName(field) && isPlaceConfirmed(point, fields[field])) {
      confirmed[field] = point;
    }
  }
  return confirmed;
}
