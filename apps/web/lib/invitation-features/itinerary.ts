/**
 * The itinerary of a guest invitation (F1; S2.1, L3.1, L3.3, L3.5). The owner keeps the plan of the day as feature
 * data of one invitation, and every layout draws the same timeline from it. The API validates the payload and answers
 * `features.itinerary` as `{ items }` only while the pinned package grants `ITINERARY` and the list is not empty, so
 * this module is the web's strict reader of that answer, the copy of the block, and the maps link of a moment.
 *
 * Nothing here knows a package, a template, or a provider: a moment is a wall clock, a title, and two optional texts,
 * and the block draws them in the order the owner stored.
 */

/** The only payload version this deployment reads and writes; a later shape needs its own reader (L3.1). */
export const ITINERARY_VERSION = 1;

/** The payload one invitation stores, as the owner read and the write carry it (F1; L3.1). */
export interface ItineraryPayload {
  readonly version: typeof ITINERARY_VERSION;
  readonly items: readonly ItineraryMoment[];
}

/** The most moments one itinerary holds, mirroring the API's bound and the column's payload (L3.1). */
export const ITINERARY_MAX_ITEMS = 15;

/** The longest title of one moment, mirroring the API's rule (L3.1). */
export const ITINERARY_TITLE_MAX_LENGTH = 60;

/** The longest place and address of one moment, mirroring the API's rule (L3.1). */
export const ITINERARY_TEXT_MAX_LENGTH = 160;

/** The section's title, which the artboard draws as the card's heading (L3.5). */
export const ITINERARY_SECTION_TITLE = "Itinerario";

/** The one sentence under the heading: what the card is, in the page's own Spanish. */
export const ITINERARY_SECTION_HINT = "El programa del día, momento por momento.";

/** The label of the maps link of a moment that carries an address (L3.5). */
export const ITINERARY_DIRECTIONS_LABEL = "Cómo llegar";

/** A wall clock as the API stores it: two digits of hour from 00 to 23, and two of minute from 00 to 59. */
const ITINERARY_TIME = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

/** The only keys one moment carries; the block reads nothing else, so a body with another key is refused. */
const MOMENT_KEYS: ReadonlySet<string> = new Set(["address", "place", "time", "title"]);

/** A JSON object as a response answers it; arrays, null, and primitives are not objects. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** One moment of the day, as the timeline draws it. The two optional texts are absent when they say nothing. */
export interface ItineraryMoment {
  readonly time: string;
  readonly title: string;
  readonly place?: string;
  readonly address?: string;
}

/** The moments of one invitation, in the owner's order; the API never answers an empty list as an itinerary. */
export interface Itinerary {
  readonly items: readonly ItineraryMoment[];
}

/** One bounded text of a moment, trimmed, or undefined when the value is not one this contract could have written. */
function optionalText(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();

  return text !== "" && [...text].length <= ITINERARY_TEXT_MAX_LENGTH ? text : null;
}

/** One moment read from a response, or undefined when it is not a shape the API stores. */
function parseMoment(value: unknown): ItineraryMoment | undefined {
  const moment = record(value);

  if (moment === undefined) {
    return undefined;
  }

  const time = moment.time;
  const title = typeof moment.title === "string" ? moment.title.trim() : "";
  const place = optionalText(moment.place);
  const address = optionalText(moment.address);

  // The documented keys are the whole shape: a response that grows another one is not this contract.
  if (Object.keys(moment).some((key) => !MOMENT_KEYS.has(key))) {
    return undefined;
  }
  if (
    typeof time !== "string" ||
    !ITINERARY_TIME.test(time) ||
    title === "" ||
    [...title].length > ITINERARY_TITLE_MAX_LENGTH ||
    place === null ||
    address === null
  ) {
    return undefined;
  }

  return {
    time,
    title,
    ...(place === undefined || place === "" ? {} : { place }),
    ...(address === undefined || address === "" ? {} : { address }),
  };
}

/**
 * The itinerary of one invitation as a guest page reads it (F1; L3.3): the moments in the API's order, `null` when
 * the read answered no itinerary, or `undefined` when the body is not this contract at all. A body of more than
 * fifteen moments, a moment without a title, a time no wall clock has, or a text longer than its bound is refused
 * whole, so a value written around the API never reaches a guest.
 */
export function parseItinerary(value: unknown): Itinerary | null | undefined {
  if (value === null) {
    return null;
  }

  const itinerary = record(value);
  const items = itinerary?.items;

  if (itinerary === undefined || !Array.isArray(items)) {
    return undefined;
  }
  // The itinerary the API answers carries the moments and nothing else: the payload's version stays in the API.
  if (Object.keys(itinerary).some((key) => key !== "items")) {
    return undefined;
  }
  if (items.length === 0 || items.length > ITINERARY_MAX_ITEMS) {
    return undefined;
  }

  const moments: ItineraryMoment[] = [];
  for (const item of items) {
    const moment = parseMoment(item);

    if (moment === undefined) {
      return undefined;
    }
    moments.push(moment);
  }

  return { items: moments };
}

/**
 * The itinerary payload of the owner's read (F1; L3.1): `{ version: 1, items }` in the owner's order, `null` when the
 * invitation stores none, or `undefined` when the body is not the payload this deployment writes. The version is part
 * of the owner's shape because the editor sends the same payload back; the guest read answers the moments only.
 */
export function parseItineraryPayload(value: unknown): ItineraryPayload | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  const payload = record(value);

  if (payload === undefined || payload.version !== ITINERARY_VERSION) {
    return undefined;
  }
  if (Object.keys(payload).some((key) => key !== "version" && key !== "items")) {
    return undefined;
  }

  const itinerary = parseItinerary({ items: payload.items });

  return itinerary === undefined || itinerary === null
    ? undefined
    : { version: ITINERARY_VERSION, items: itinerary.items };
}

/**
 * The Google Maps search of a moment's address (F1; L3.5): the same public search URL the layout's places use, with
 * the address encoded for the query. It carries no key and no coordinates, so it works on every device and needs no
 * provider setup.
 */
export function itineraryDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
