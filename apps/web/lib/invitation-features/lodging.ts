/**
 * The lodging of a guest invitation (F4; S2.4, L7.1, L7.3, L7.5). The owner keeps the hotels of their room block and
 * one transport note as feature data of one invitation, and every layout draws the same cards from it. The API
 * validates the payload and answers `features.lodging` as the hotels and the transport line only while the pinned
 * package grants `LODGING` and there is something to show, so this module is the web's strict reader of that answer,
 * the copy of the cards, and the maps link of a hotel.
 *
 * Nothing here knows a package, a template, or a provider: a hotel is a name, the distance, the price, the group
 * code, a booking link, and an address, and the block draws them in the order the owner stored.
 */

/** The only payload version this deployment reads and writes; a later shape needs its own reader (L7.1). */
export const LODGING_VERSION = 1;

/** The most hotels one lodging holds, mirroring the API's bound and the editor's own list (L7.1). */
export const LODGING_MAX_HOTELS = 6;

/** The longest name of one hotel, mirroring the API's rule (L7.1). */
export const LODGING_HOTEL_NAME_MAX_LENGTH = 60;

/** The longest distance badge of one hotel, mirroring the API's rule (L7.1). */
export const LODGING_HOTEL_DISTANCE_MAX_LENGTH = 40;

/** The longest price line of one hotel, mirroring the API's rule (L7.1). */
export const LODGING_HOTEL_PRICE_MAX_LENGTH = 60;

/** The longest group code of one hotel, mirroring the API's rule (L7.1). */
export const LODGING_HOTEL_GROUP_CODE_MAX_LENGTH = 40;

/** The longest booking link of one hotel, mirroring the API's rule (L7.1). */
export const LODGING_HOTEL_BOOKING_URL_MAX_LENGTH = 500;

/** The longest address of one hotel, mirroring the API's rule (L7.1). */
export const LODGING_HOTEL_ADDRESS_MAX_LENGTH = 160;

/** The longest transport text, mirroring the API's rule (L7.1). */
export const LODGING_TRANSPORT_MAX_LENGTH = 400;

/** The section's kicker and heading, which the artboard draws above the cards (L7.5). */
export const LODGING_SECTION_KICKER = "Para quienes vienen de fuera";
export const LODGING_SECTION_TITLE = "Hospedaje";

/** The one sentence under the heading: why the hotels are there, in the page's own Spanish (L7.5). */
export const LODGING_SECTION_HINT = "Te dejamos opciones para hospedarte cerca del evento.";

/** The heading of the transport card (L7.5). */
export const LODGING_TRANSPORT_TITLE = "Transporte";

/** The label of the group-code row, and the action that opens the hotel's booking page (L7.5). */
export const LODGING_GROUP_CODE_LABEL = "Código de grupo";
export const LODGING_BOOK_LABEL = "Reservar";
/** The action that opens the hotel's address in Google Maps, like the itinerary's own link (L7.5). */
export const LODGING_DIRECTIONS_LABEL = "Cómo llegar";

/** One hotel of the room block, as the card draws it. The optional texts are absent when they say nothing. */
export interface LodgingHotel {
  readonly name: string;
  readonly distance?: string;
  readonly price?: string;
  readonly groupCode?: string;
  readonly bookingUrl?: string;
  readonly address?: string;
}

/** The lodging a guest page draws: the hotels in the API's order, and the transport line or null. */
export interface Lodging {
  readonly hotels: readonly LodgingHotel[];
  readonly transport: string | null;
}

/** The payload one invitation stores, as the owner read and the write carry it (F4; L7.1). */
export interface LodgingPayload {
  readonly version: typeof LODGING_VERSION;
  readonly hotels: readonly LodgingHotel[];
  readonly transport?: string;
}

/** The only keys one hotel carries; the card reads nothing else, so a body with another key is refused. */
const HOTEL_KEYS: ReadonlySet<string> = new Set([
  "name",
  "distance",
  "price",
  "groupCode",
  "bookingUrl",
  "address",
]);

/** The only keys the guest's lodging carries. */
const LODGING_KEYS: ReadonlySet<string> = new Set(["hotels", "transport"]);

/** The only keys the owner's payload carries. */
const PAYLOAD_KEYS: ReadonlySet<string> = new Set(["version", "hotels", "transport"]);

/** A whitespace or control character in a booking link: no URL the API stores carries one. */
const URL_UNSTORABLE_CHARACTERS = /[\p{Cc}\s]/u;

/** A JSON object as a response answers it; arrays, null, and primitives are not objects. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Whether a record carries a key outside the shape this contract documents. */
function hasOtherKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).some((key) => !allowed.has(key));
}

/** One optional text, trimmed, or undefined when it says nothing; null when it is no bounded text at all. */
function optionalText(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();

  if (text === "") {
    return undefined;
  }
  return [...text].length <= maxLength ? text : null;
}

/** One required bounded text, trimmed, or undefined when the value is not one this contract could have written. */
function requiredText(value: unknown, maxLength: number): string | undefined {
  const text = optionalText(value, maxLength);

  return text === undefined || text === null ? undefined : text;
}

/**
 * Whether an `https` link this deployment renders for a booking (L7.1): at most 500 characters, no whitespace or
 * control character, and a URL the parser reads whose scheme is `https`. Any host is allowed, because the owner's
 * hotel is not a host allow-list this web owns.
 */
export function isLodgingBookingUrl(value: string): boolean {
  if ([...value].length > LODGING_HOTEL_BOOKING_URL_MAX_LENGTH) {
    return false;
  }
  if (URL_UNSTORABLE_CHARACTERS.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);

    return parsed.protocol === "https:" && parsed.hostname !== "";
  } catch {
    return false;
  }
}

/** One hotel read from a response, or undefined when it is not a shape the API stores. */
function parseHotel(value: unknown): LodgingHotel | undefined {
  const hotel = record(value);

  if (hotel === undefined || hasOtherKeys(hotel, HOTEL_KEYS)) {
    return undefined;
  }

  const name = requiredText(hotel.name, LODGING_HOTEL_NAME_MAX_LENGTH);
  const distance = optionalText(hotel.distance, LODGING_HOTEL_DISTANCE_MAX_LENGTH);
  const price = optionalText(hotel.price, LODGING_HOTEL_PRICE_MAX_LENGTH);
  const groupCode = optionalText(hotel.groupCode, LODGING_HOTEL_GROUP_CODE_MAX_LENGTH);
  const bookingUrl = optionalText(hotel.bookingUrl, LODGING_HOTEL_BOOKING_URL_MAX_LENGTH);
  const address = optionalText(hotel.address, LODGING_HOTEL_ADDRESS_MAX_LENGTH);

  if (
    name === undefined ||
    distance === null ||
    price === null ||
    groupCode === null ||
    bookingUrl === null ||
    address === null
  ) {
    return undefined;
  }
  if (bookingUrl !== undefined && !isLodgingBookingUrl(bookingUrl)) {
    return undefined;
  }

  return {
    name,
    ...(distance === undefined ? {} : { distance }),
    ...(price === undefined ? {} : { price }),
    ...(groupCode === undefined ? {} : { groupCode }),
    ...(bookingUrl === undefined ? {} : { bookingUrl }),
    ...(address === undefined ? {} : { address }),
  };
}

/** The hotels of one answer, or undefined when the list or any hotel is not one this contract carries. */
function parseHotels(value: unknown): LodgingHotel[] | undefined {
  if (!Array.isArray(value) || value.length > LODGING_MAX_HOTELS) {
    return undefined;
  }

  const hotels: LodgingHotel[] = [];
  for (const item of value) {
    const hotel = parseHotel(item);

    if (hotel === undefined) {
      return undefined;
    }
    hotels.push(hotel);
  }
  return hotels;
}

/**
 * The lodging of one invitation as a guest page reads it (F4; L7.3): the hotels in the API's order and the transport
 * line or null; `null` when the read answered no lodging (or an older API did not answer the field at all); or
 * `undefined` when the body is not this contract — another key, a hotel without a name, a booking link that is not
 * `https`, a text outside its bound, or more than six hotels. A value written around the API never reaches a guest.
 */
export function parseLodging(value: unknown): Lodging | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  const lodging = record(value);

  if (lodging === undefined || hasOtherKeys(lodging, LODGING_KEYS)) {
    return undefined;
  }
  // The guaranteed keys are the whole shape: the API answers the transport as null when there is none, so a body
  // without it is not this contract.
  if (!Object.hasOwn(lodging, "transport")) {
    return undefined;
  }

  const hotels = parseHotels(lodging.hotels);
  const transport = optionalText(lodging.transport, LODGING_TRANSPORT_MAX_LENGTH);

  if (hotels === undefined || transport === null) {
    return undefined;
  }
  return { hotels, transport: transport ?? null };
}

/**
 * The lodging payload of the owner's read (F4; L7.1): `{ version: 1, hotels, transport? }` in the owner's order, `null`
 * when the invitation stores none (or a body written before the field existed), or `undefined` when the body is not
 * the payload this deployment writes. The version is part of the owner's shape because the editor sends the same
 * payload back; the guest read answers the hotels and the transport only.
 */
export function parseLodgingPayload(value: unknown): LodgingPayload | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  const payload = record(value);

  if (
    payload === undefined ||
    payload.version !== LODGING_VERSION ||
    hasOtherKeys(payload, PAYLOAD_KEYS)
  ) {
    return undefined;
  }

  const hotels = parseHotels(payload.hotels);
  const transport = optionalText(payload.transport, LODGING_TRANSPORT_MAX_LENGTH);

  if (hotels === undefined || transport === null) {
    return undefined;
  }
  // A payload with no hotel and no transport line is what the API normalizes to NULL before writing, so the owner read
  // never answers one; a body that still carries it reads as no lodging.
  if (hotels.length === 0 && transport === undefined) {
    return null;
  }

  return {
    version: LODGING_VERSION,
    hotels,
    ...(transport === undefined ? {} : { transport }),
  };
}

/**
 * Whether a lodging has something a guest would see (F4; L7.3): at least one hotel or a transport line. That is the
 * same rule the API uses to answer `null`, so the guest read, the cards, and the owner's summary all read one
 * definition of an empty lodging.
 */
export function lodgingHasContent(lodging: Lodging | LodgingPayload | null | undefined): boolean {
  return (
    lodging !== null &&
    lodging !== undefined &&
    (lodging.hotels.length > 0 || (lodging.transport !== undefined && lodging.transport !== null))
  );
}

/** The public view of one stored payload (F4; L7.3, L7.5): no version, and a null transport when there is none. */
export function lodgingOf(payload: LodgingPayload): Lodging {
  return {
    hotels: payload.hotels.map((hotel) => ({ ...hotel })),
    transport: payload.transport ?? null,
  };
}

/**
 * The Google Maps search of a hotel's address (F4; L7.5): the same public search URL the itinerary and the places
 * use, with the address encoded for the query. It carries no key and no coordinates, so it works on every device and
 * needs no provider setup.
 */
export function lodgingDirectionsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
