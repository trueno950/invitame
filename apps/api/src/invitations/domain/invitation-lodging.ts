/**
 * The lodging of one invitation (F4; S2.4, L7.1). The owner lists the hotels that hold a room block for their guests,
 * with the distance, the price, the group code, the booking link, and the address, plus one transport note; every
 * layout draws the same cards from it, so changing the template never loses it.
 *
 * The stored value is a small, versioned presentation payload and nothing else:
 *
 * ```json
 * {
 *   "version": 1,
 *   "hotels": [{ "name": "Hotel Misión", "distance": "A 5 min", "price": "Desde $1,450 por noche",
 *                "groupCode": "BODA-AYL", "bookingUrl": "https://…", "address": "Av. Juárez 120, Centro" }],
 *   "transport": "Habrá camión del hotel al salón a las 19:00."
 * }
 * ```
 *
 * The rules are the ones the column cannot state: the version is exactly 1, a payload carries 0 to 6 hotels, a hotel
 * needs a name of 1 to 60 trimmed characters, an optional distance of at most 40, price of at most 60, group code of
 * at most 40, booking link of at most 500 that is `https`, and address of at most 160; the transport text is at most
 * 400 trimmed characters. A blank optional value is absent instead of stored as an empty string. A payload with no
 * hotel and no transport means the invitation has no lodging, which is why `null` is a valid value of the whole
 * payload. Nothing here reads a template, a package, a provider, or a framework: the gate compares catalog keys and
 * this module decides what a hotel and a transport line are.
 */

/** The only payload version this API stores; a later shape needs a new version and its own reader (L7.1). */
export const LODGING_VERSION = 1;

/** The most hotels one lodging holds, and the width the editor's own list offers (L7.1). */
export const LODGING_MAX_HOTELS = 6;

/** The longest name of one hotel, counted in characters after trimming (L7.1). */
export const LODGING_HOTEL_NAME_MAX_LENGTH = 60;

/** The longest distance of one hotel, counted in characters after trimming (L7.1). */
export const LODGING_HOTEL_DISTANCE_MAX_LENGTH = 40;

/** The longest price line of one hotel, counted in characters after trimming (L7.1). */
export const LODGING_HOTEL_PRICE_MAX_LENGTH = 60;

/** The longest group code of one hotel, counted in characters after trimming (L7.1). */
export const LODGING_HOTEL_GROUP_CODE_MAX_LENGTH = 40;

/** The longest booking link of one hotel, counted in characters after trimming (L7.1). */
export const LODGING_HOTEL_BOOKING_URL_MAX_LENGTH = 500;

/** The longest address of one hotel, counted in characters after trimming (L7.1). */
export const LODGING_HOTEL_ADDRESS_MAX_LENGTH = 160;

/** The longest transport text, counted in characters after trimming (L7.1). */
export const LODGING_TRANSPORT_MAX_LENGTH = 400;

/** A whitespace or control character in a booking link: no URL this API stores carries one. */
const URL_UNSTORABLE_CHARACTERS = /[\p{Cc}\s]/u;

/** The message a payload that is not an object is refused with. */
export const LODGING_TYPE_ISSUE = "lodging must be an object or null";

/** The message a payload of another version is refused with. */
export const LODGING_VERSION_ISSUE = "lodging.version must be 1";

/** The message a payload whose hotels are not a list is refused with. */
export const LODGING_HOTELS_TYPE_ISSUE = "lodging.hotels must be a list";

/** The message a payload with more hotels than the bound is refused with. */
export const LODGING_HOTELS_LIMIT_ISSUE = "lodging.hotels must have at most 6 hotels";

/** The message a hotel that is not an object is refused with, naming its position. */
export function lodgingHotelIssue(index: number): string {
  return `lodging.hotels[${index}] must be an object`;
}

/** The message a hotel whose name is outside its bounds is refused with, naming its position. */
export function lodgingHotelNameIssue(index: number): string {
  return `lodging.hotels[${index}].name must be between 1 and 60 characters`;
}

/** The message a hotel whose distance is not a bounded text is refused with, naming its position. */
export function lodgingHotelDistanceIssue(index: number): string {
  return `lodging.hotels[${index}].distance must be a string of at most 40 characters`;
}

/** The message a hotel whose price is not a bounded text is refused with, naming its position. */
export function lodgingHotelPriceIssue(index: number): string {
  return `lodging.hotels[${index}].price must be a string of at most 60 characters`;
}

/** The message a hotel whose group code is not a bounded text is refused with, naming its position. */
export function lodgingHotelGroupCodeIssue(index: number): string {
  return `lodging.hotels[${index}].groupCode must be a string of at most 40 characters`;
}

/** The message a hotel whose booking link is not a bounded `https` URL is refused with, naming its position. */
export function lodgingHotelBookingUrlIssue(index: number): string {
  return `lodging.hotels[${index}].bookingUrl must be an https link of at most 500 characters`;
}

/** The message a hotel whose address is not a bounded text is refused with, naming its position. */
export function lodgingHotelAddressIssue(index: number): string {
  return `lodging.hotels[${index}].address must be a string of at most 160 characters`;
}

/** The message a transport text outside its bound is refused with. */
export const LODGING_TRANSPORT_ISSUE =
  "lodging.transport must be a string of at most 400 characters";

/**
 * One hotel of the room block, as the guest's card draws it: the name, the optional distance badge, price line, group
 * code, booking link, and address. Everything is trimmed, and an optional text with no visible content is absent
 * rather than empty.
 */
export interface LodgingHotel {
  readonly name: string;
  readonly distance?: string;
  readonly price?: string;
  readonly groupCode?: string;
  readonly bookingUrl?: string;
  readonly address?: string;
}

/** A validated lodging: the version the reader understands and the hotels in the owner's order. */
export interface InvitationLodging {
  readonly version: typeof LODGING_VERSION;
  readonly hotels: readonly LodgingHotel[];
  readonly transport?: string;
}

/**
 * The lodging as a guest page reads it (F4; L7.3): the version stays in the API, and the transport is answered as
 * `null` when there is none, so a card always reads the same keys. The hotels keep the owner's order.
 */
export interface PublicLodging {
  readonly hotels: readonly LodgingHotel[];
  readonly transport: string | null;
}

/** A validated payload, or every deterministic English issue that refuses it. */
export type LodgingValidation =
  | { readonly ok: true; readonly value: InvitationLodging | null }
  | { readonly ok: false; readonly issues: readonly string[] };

/** A JSON object as a request or a `Json` column answers it; arrays, null, and primitives are not objects. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A text trimmed to its visible content, an absent value, or the reason it is no optional text at all. */
type OptionalText =
  | { readonly kind: "absent" }
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "refused" };

/**
 * One optional text: `null`, `undefined`, and a blank string are absent (a cleared field is not an empty one), a
 * bounded text is trimmed and kept, and every other value — a number, a long text — is refused.
 */
function readOptionalText(value: unknown, maxLength: number): OptionalText {
  if (value === undefined || value === null) {
    return { kind: "absent" };
  }
  if (typeof value !== "string") {
    return { kind: "refused" };
  }

  const text = value.trim();

  if (text === "") {
    return { kind: "absent" };
  }
  return [...text].length > maxLength ? { kind: "refused" } : { kind: "text", text };
}

/**
 * Whether a value is an `https` link this API stores for a booking (L7.1): at most 500 characters, no whitespace or
 * control character, and a URL the parser reads whose scheme is `https`. Any host is allowed, because the owner's
 * hotel is not an allow-list this API owns.
 */
function isBookingUrl(value: string): boolean {
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

/** One hotel read from an untrusted value: the hotel, or the issues that refuse it. */
function readHotel(value: unknown, index: number): LodgingHotel | string[] {
  if (!isJsonObject(value)) {
    return [lodgingHotelIssue(index)];
  }

  const issues: string[] = [];
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const distance = readOptionalText(value.distance, LODGING_HOTEL_DISTANCE_MAX_LENGTH);
  const price = readOptionalText(value.price, LODGING_HOTEL_PRICE_MAX_LENGTH);
  const groupCode = readOptionalText(value.groupCode, LODGING_HOTEL_GROUP_CODE_MAX_LENGTH);
  const bookingUrl = readOptionalText(value.bookingUrl, LODGING_HOTEL_BOOKING_URL_MAX_LENGTH);
  const address = readOptionalText(value.address, LODGING_HOTEL_ADDRESS_MAX_LENGTH);

  if (name === "" || [...name].length > LODGING_HOTEL_NAME_MAX_LENGTH) {
    issues.push(lodgingHotelNameIssue(index));
  }
  if (distance.kind === "refused") {
    issues.push(lodgingHotelDistanceIssue(index));
  }
  if (price.kind === "refused") {
    issues.push(lodgingHotelPriceIssue(index));
  }
  if (groupCode.kind === "refused") {
    issues.push(lodgingHotelGroupCodeIssue(index));
  }
  if (
    bookingUrl.kind === "refused" ||
    (bookingUrl.kind === "text" && !isBookingUrl(bookingUrl.text))
  ) {
    issues.push(lodgingHotelBookingUrlIssue(index));
  }
  if (address.kind === "refused") {
    issues.push(lodgingHotelAddressIssue(index));
  }

  if (issues.length > 0) {
    return issues;
  }

  return {
    name,
    ...(distance.kind === "text" ? { distance: distance.text } : {}),
    ...(price.kind === "text" ? { price: price.text } : {}),
    ...(groupCode.kind === "text" ? { groupCode: groupCode.text } : {}),
    ...(bookingUrl.kind === "text" ? { bookingUrl: bookingUrl.text } : {}),
    ...(address.kind === "text" ? { address: address.text } : {}),
  };
}

/**
 * Validates the lodging of one feature-settings request (F4; L7.1). `null`, `undefined`, and a payload that would show
 * nothing — no hotel and no transport line — all mean "no lodging" and answer `null`, which is how the owner clears
 * it. Every other value must be the versioned payload this API stores; each hotel is bounded on its own, and every
 * issue is reported in a deterministic order — the payload's, then each hotel's in the owner's order, then the
 * transport text — so a client shows them without guessing. The stored value always satisfies the rules above, which
 * is the only shape the column trusts.
 */
export function validateLodging(value: unknown): LodgingValidation {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (!isJsonObject(value)) {
    return { ok: false, issues: [LODGING_TYPE_ISSUE] };
  }

  const issues: string[] = [];

  if (value.version !== LODGING_VERSION) {
    issues.push(LODGING_VERSION_ISSUE);
  }

  const items = value.hotels;
  if (!Array.isArray(items)) {
    return { ok: false, issues: [...issues, LODGING_HOTELS_TYPE_ISSUE] };
  }
  if (items.length > LODGING_MAX_HOTELS) {
    return { ok: false, issues: [...issues, LODGING_HOTELS_LIMIT_ISSUE] };
  }

  const hotels: LodgingHotel[] = [];
  for (const [index, item] of items.entries()) {
    const hotel = readHotel(item, index);

    if (Array.isArray(hotel)) {
      issues.push(...hotel);
      continue;
    }
    hotels.push(hotel);
  }

  const transport = readOptionalText(value.transport, LODGING_TRANSPORT_MAX_LENGTH);
  if (transport.kind === "refused") {
    issues.push(LODGING_TRANSPORT_ISSUE);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (hotels.length === 0 && transport.kind === "absent") {
    return { ok: true, value: null };
  }

  return {
    ok: true,
    value: {
      version: LODGING_VERSION,
      hotels,
      ...(transport.kind === "text" ? { transport: transport.text } : {}),
    },
  };
}

/**
 * Whether a validated lodging has something a guest would see (F4; L7.3): at least one hotel or a transport line. That
 * is the same rule the validator uses to answer `null`, so the API's gate and the editor's own summary all read one
 * definition of an empty lodging.
 */
export function lodgingHasContent(
  lodging: InvitationLodging | null | undefined,
): lodging is InvitationLodging {
  return (
    lodging !== null &&
    lodging !== undefined &&
    (lodging.hotels.length > 0 || lodging.transport !== undefined)
  );
}

/** The public projection of one validated lodging, as the guest read answers it (F4; L7.3). */
export function publicLodging(lodging: InvitationLodging): PublicLodging {
  return {
    hotels: lodging.hotels.map((hotel) => ({ ...hotel })),
    transport: lodging.transport ?? null,
  };
}

/**
 * The lodging a stored row carries, or null when the row cannot be one this deployment renders (F4; L7.1). A row
 * written around the API — another version, a hotel without a name, a booking link that is not `https`, an empty
 * payload — shows no lodging instead of reaching a guest as a value no rule validated.
 */
export function storedLodging(value: unknown): InvitationLodging | null {
  if (value === null || value === undefined) {
    return null;
  }

  const validated = validateLodging(value);

  return validated.ok ? validated.value : null;
}
