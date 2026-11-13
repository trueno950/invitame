/**
 * The «Cómo llegar» links of the guest page (S4): Google Maps and Waze for one place, built from the
 * layout's own address fields, with no embedded map and no API key. The place is user content, so the search
 * text is encoded for the query and never concatenated raw.
 */

/** The part of a place these links need: the same fields every layout already carries. */
export interface MapPlace {
  readonly name: string;
  readonly address: string;
}

/** The text both services search for: the place name and its address. */
function searchText(place: MapPlace): string {
  return `${place.name}, ${place.address}`;
}

/** The Google Maps search that opens the place in the guest's own maps application. */
export function googleMapsUrl(place: MapPlace): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchText(place))}`;
}

/** The Waze navigation that starts a route to the place. */
export function wazeUrl(place: MapPlace): string {
  return `https://www.waze.com/ul?q=${encodeURIComponent(searchText(place))}&navigate=yes`;
}
