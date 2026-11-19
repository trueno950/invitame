import { isLatitude, isLongitude } from "./place-point.ts";

/**
 * The «Cómo llegar» links of the guest page (S4, S1, S2): Google Maps and Waze for one place, built from the
 * layout's own address fields, with no embedded map and no API key. The place is user content, so a text search is
 * encoded for the query and never concatenated raw.
 *
 * Once the owner confirms a suggestion the place carries its point, and both services are asked for the coordinates
 * instead of the words: a typed address with a typo used to land nowhere. A place without a complete, in-range point
 * keeps the text search it always had, so an invitation that never confirmed one behaves exactly as before.
 */

/** The part of a place these links need: the same fields every layout already carries, plus its point when known. */
export interface MapPlace {
  readonly name: string;
  readonly address: string;
  /** The confirmed latitude, or absent when the owner never chose a suggestion. */
  readonly lat?: number;
  /** The confirmed longitude, or absent when the owner never chose a suggestion. */
  readonly lng?: number;
}

/** The text both services search for: the place name and its address. */
function searchText(place: MapPlace): string {
  return `${place.name}, ${place.address}`;
}

/** A coordinate as both services read it: six decimals, which is a few centimetres of a point. */
function coordinate(value: number): string {
  return value.toFixed(6);
}

/** The `<lat>,<lng>` query of a place that has one, or undefined when its point is incomplete or out of range. */
function pointQuery(place: MapPlace): string | undefined {
  return isLatitude(place.lat) && isLongitude(place.lng)
    ? `${coordinate(place.lat)},${coordinate(place.lng)}`
    : undefined;
}

/** The Google Maps search that opens the place in the guest's own maps application. */
export function googleMapsUrl(place: MapPlace): string {
  const point = pointQuery(place);

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point ?? searchText(place))}`;
}

/** The Waze navigation that starts a route to the place: a point when it has one, the text otherwise. */
export function wazeUrl(place: MapPlace): string {
  const point = pointQuery(place);

  return point === undefined
    ? `https://www.waze.com/ul?q=${encodeURIComponent(searchText(place))}&navigate=yes`
    : `https://www.waze.com/ul?ll=${encodeURIComponent(point)}&navigate=yes`;
}
