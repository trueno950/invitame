import {
  LODGING_HOTEL_ADDRESS_MAX_LENGTH,
  LODGING_HOTEL_BOOKING_URL_MAX_LENGTH,
  LODGING_HOTEL_DISTANCE_MAX_LENGTH,
  LODGING_HOTEL_GROUP_CODE_MAX_LENGTH,
  LODGING_HOTEL_NAME_MAX_LENGTH,
  LODGING_HOTEL_PRICE_MAX_LENGTH,
  LODGING_MAX_HOTELS,
  LODGING_TRANSPORT_MAX_LENGTH,
  LODGING_VERSION,
  type LodgingHotel,
  type LodgingPayload,
  isLodgingBookingUrl,
} from "../invitation-features/lodging.ts";

// The «Hospedaje y transporte» block of the editor's «Funciones» tab (F4; L7.4). The owner adds, edits, removes, and
// reorders the hotels, and writes one transport note; these helpers hold the drafts the browser is writing and turn
// them into the value the feature autosave sends. Everything is pure and immutable: a helper that changes nothing
// answers the value it was given, so a boundary (moving the first hotel up, adding a seventh) never looks like a save.
//
// A draft is all texts, because a form control always holds a string. The payload is the strict shape the API stores:
// the texts trimmed, a blank optional one absent, and a hotel that is still being written never sent — the save waits
// for its name while the stored hotel keeps its last complete version, exactly like the itinerary's own rows (F1).

// The editor and the pages that hold its drafts share one payload shape, so a caller imports it from here.
export type { LodgingPayload };

/** One hotel as the form holds it: six texts, the five optional ones empty when the owner wrote nothing. */
export interface LodgingDraftHotel {
  readonly name: string;
  readonly distance: string;
  readonly price: string;
  readonly groupCode: string;
  readonly bookingUrl: string;
  readonly address: string;
}

/** The whole block as the browser holds it: the hotels in the owner's order and the transport note. */
export interface LodgingDraft {
  readonly hotels: readonly LodgingDraftHotel[];
  readonly transport: string;
}

/** The message the editor shows while the list is at its bound (L7.1). */
export const LODGING_DRAFT_LIMIT_MESSAGE = "Puedes agregar hasta 6 hoteles.";

/** The hotel a new row starts as: everything empty, so the first control is its name. */
export const EMPTY_LODGING_HOTEL: LodgingDraftHotel = {
  name: "",
  distance: "",
  price: "",
  groupCode: "",
  bookingUrl: "",
  address: "",
};

/** The block a lodging without one starts as. */
export const EMPTY_LODGING: LodgingDraft = { hotels: [], transport: "" };

/** The drafts of one stored payload, or an empty form when the invitation has no lodging. */
export function lodgingDraftOf(payload: LodgingPayload | null | undefined): LodgingDraft {
  return {
    hotels: (payload?.hotels ?? []).map((hotel) => ({
      name: hotel.name,
      distance: hotel.distance ?? "",
      price: hotel.price ?? "",
      groupCode: hotel.groupCode ?? "",
      bookingUrl: hotel.bookingUrl ?? "",
      address: hotel.address ?? "",
    })),
    transport: payload?.transport ?? "",
  };
}

/** The drafts with one empty hotel at the end, or the same drafts while the bound is reached (L7.1). */
export function addLodgingHotel(drafts: LodgingDraft): LodgingDraft {
  return drafts.hotels.length >= LODGING_MAX_HOTELS
    ? drafts
    : { ...drafts, hotels: [...drafts.hotels, EMPTY_LODGING_HOTEL] };
}

/** Whether another hotel may be added. */
export function canAddLodgingHotel(drafts: LodgingDraft): boolean {
  return drafts.hotels.length < LODGING_MAX_HOTELS;
}

/** The drafts with one control of one hotel changed, or the same drafts when that hotel does not exist. */
export function updateLodgingHotel(
  drafts: LodgingDraft,
  index: number,
  patch: Partial<LodgingDraftHotel>,
): LodgingDraft {
  if (!Number.isInteger(index) || index < 0 || drafts.hotels[index] === undefined) {
    return drafts;
  }

  return {
    ...drafts,
    hotels: drafts.hotels.map((hotel, position) =>
      position === index ? { ...hotel, ...patch } : hotel,
    ),
  };
}

/** The drafts without one hotel, or the same drafts when that hotel does not exist. */
export function removeLodgingHotel(drafts: LodgingDraft, index: number): LodgingDraft {
  if (!Number.isInteger(index) || index < 0 || drafts.hotels[index] === undefined) {
    return drafts;
  }

  return { ...drafts, hotels: drafts.hotels.filter((_hotel, position) => position !== index) };
}

/** The drafts with one hotel swapped with its neighbour, or the same drafts at either end of the list. */
export function moveLodgingHotel(
  drafts: LodgingDraft,
  index: number,
  direction: "up" | "down",
): LodgingDraft {
  const target = direction === "up" ? index - 1 : index + 1;

  if (!Number.isInteger(index) || drafts.hotels[index] === undefined) {
    return drafts;
  }
  if (drafts.hotels[target] === undefined) {
    return drafts;
  }

  const hotels = [...drafts.hotels];
  const moved = hotels[index] as LodgingDraftHotel;
  hotels[index] = hotels[target] as LodgingDraftHotel;
  hotels[target] = moved;
  return { ...drafts, hotels };
}

/** The drafts with the transport note as the owner typed it; the payload trims it. */
export function setLodgingTransport(drafts: LodgingDraft, transport: string): LodgingDraft {
  return { ...drafts, transport };
}

/** One text trimmed. */
function textOf(value: string): string {
  return value.trim();
}

/**
 * Whether one hotel row is still being written, because it has no name yet. A row like that is not a hotel the
 * contract can keep; it stays in the editor with a hint of its own instead of refusing a save the owner did not ask
 * for (L7.4).
 */
export function isLodgingHotelIncomplete(hotel: LodgingDraftHotel): boolean {
  return textOf(hotel.name) === "";
}

/** One complete row as a hotel, trimmed and with a blank optional text absent, or nothing while it is being written. */
function shapedHotelOf(hotel: LodgingDraftHotel): LodgingHotel | undefined {
  if (isLodgingHotelIncomplete(hotel)) {
    return undefined;
  }

  const distance = textOf(hotel.distance);
  const price = textOf(hotel.price);
  const groupCode = textOf(hotel.groupCode);
  const bookingUrl = textOf(hotel.bookingUrl);
  const address = textOf(hotel.address);

  return {
    name: textOf(hotel.name),
    ...(distance === "" ? {} : { distance }),
    ...(price === "" ? {} : { price }),
    ...(groupCode === "" ? {} : { groupCode }),
    ...(bookingUrl === "" ? {} : { bookingUrl }),
    ...(address === "" ? {} : { address }),
  };
}

/** Whether two hotels carry the same six texts, comparing the optional ones as the empty text. */
function sameHotel(left: LodgingHotel, right: LodgingHotel): boolean {
  return (
    left.name === right.name &&
    (left.distance ?? "") === (right.distance ?? "") &&
    (left.price ?? "") === (right.price ?? "") &&
    (left.groupCode ?? "") === (right.groupCode ?? "") &&
    (left.bookingUrl ?? "") === (right.bookingUrl ?? "") &&
    (left.address ?? "") === (right.address ?? "")
  );
}

/**
 * The stored hotel a row being written still stands for: the one whose texts agree with everything the row still says.
 * A row whose name was cleared but whose address is still there is the stored hotel of that address, and the other
 * filled-in texts narrow the match. A row with nothing left to say matches nothing — it is a row the owner just
 * started — and a stored hotel this list already kept is never claimed twice.
 */
function storedHotelOf(
  draft: LodgingDraftHotel,
  stored: readonly LodgingHotel[],
  claimed: ReadonlySet<number>,
): { readonly hotel: LodgingHotel; readonly position: number } | undefined {
  const name = textOf(draft.name);
  const distance = textOf(draft.distance);
  const price = textOf(draft.price);
  const groupCode = textOf(draft.groupCode);
  const bookingUrl = textOf(draft.bookingUrl);
  const address = textOf(draft.address);

  if (
    name === "" &&
    distance === "" &&
    price === "" &&
    groupCode === "" &&
    bookingUrl === "" &&
    address === ""
  ) {
    return undefined;
  }

  for (const [position, hotel] of stored.entries()) {
    if (claimed.has(position)) {
      continue;
    }
    if (name !== "" && hotel.name !== name) {
      continue;
    }
    if (distance !== "" && (hotel.distance ?? "") !== distance) {
      continue;
    }
    if (price !== "" && (hotel.price ?? "") !== price) {
      continue;
    }
    if (groupCode !== "" && (hotel.groupCode ?? "") !== groupCode) {
      continue;
    }
    if (bookingUrl !== "" && (hotel.bookingUrl ?? "") !== bookingUrl) {
      continue;
    }
    if (address !== "" && (hotel.address ?? "") !== address) {
      continue;
    }
    return { hotel, position };
  }

  return undefined;
}

/**
 * The value one feature save sends (F4; L7.1, L7.4): the payload of the complete hotels, with every text trimmed and
 * the optional ones absent when they say nothing; `null` when the block holds no hotel and no transport line (the
 * invitation has no lodging); or `undefined` when a complete hotel or the transport note is outside its bounds, which
 * is the one case the API refuses and the owner has to fix.
 *
 * A hotel still being written is never refused: adding an empty row or typing into it must not fail a save. A row the
 * owner is retyping keeps the last complete version the lodging already stored (`stored`), so clearing a link does not
 * take the hotel away from the guests while it is being written; removing the row with «Quitar» is what drops it, and a
 * row that was never complete carries nothing.
 */
export function lodgingPayloadOf(
  drafts: LodgingDraft,
  stored: LodgingPayload | null | undefined = null,
): LodgingPayload | null | undefined {
  if (drafts.hotels.length > LODGING_MAX_HOTELS) {
    return undefined;
  }

  const storedHotels = stored?.hotels ?? [];
  const shaped = drafts.hotels.map(shapedHotelOf);
  // A stored hotel a complete row already reproduces is not available to a row being written: the payload would carry
  // it twice the moment a new row started with the same name.
  const claimed = new Set<number>();
  for (const hotel of shaped) {
    if (hotel === undefined) {
      continue;
    }

    const position = storedHotels.findIndex(
      (storedHotel, index) => !claimed.has(index) && sameHotel(hotel, storedHotel),
    );

    if (position !== -1) {
      claimed.add(position);
    }
  }

  const hotels: LodgingHotel[] = [];

  for (const [index, draft] of drafts.hotels.entries()) {
    const hotel = shaped[index];

    if (hotel === undefined) {
      const kept = storedHotelOf(draft, storedHotels, claimed);

      if (kept !== undefined) {
        claimed.add(kept.position);
        hotels.push(kept.hotel);
      }
      continue;
    }

    if (
      [...hotel.name].length > LODGING_HOTEL_NAME_MAX_LENGTH ||
      [...(hotel.distance ?? "")].length > LODGING_HOTEL_DISTANCE_MAX_LENGTH ||
      [...(hotel.price ?? "")].length > LODGING_HOTEL_PRICE_MAX_LENGTH ||
      [...(hotel.groupCode ?? "")].length > LODGING_HOTEL_GROUP_CODE_MAX_LENGTH ||
      [...(hotel.address ?? "")].length > LODGING_HOTEL_ADDRESS_MAX_LENGTH
    ) {
      return undefined;
    }
    if (hotel.bookingUrl !== undefined && !isLodgingBookingUrl(hotel.bookingUrl)) {
      return undefined;
    }
    if ([...(hotel.bookingUrl ?? "")].length > LODGING_HOTEL_BOOKING_URL_MAX_LENGTH) {
      return undefined;
    }

    hotels.push(hotel);
  }

  const transport = textOf(drafts.transport);

  if ([...transport].length > LODGING_TRANSPORT_MAX_LENGTH) {
    return undefined;
  }
  if (hotels.length === 0 && transport === "") {
    return null;
  }

  return {
    version: LODGING_VERSION,
    hotels,
    ...(transport === "" ? {} : { transport }),
  };
}

/**
 * Whether the drafts the editor now holds ask for a save (F4; L7.4): true only when the lodging changed. Adding an
 * empty row, typing into one that is still incomplete, retyping a stored hotel, or removing a row that was never
 * complete leaves the stored lodging exactly as it was, so the editor keeps the drafts and sends nothing. `stored` is
 * the lodging the invitation holds: with it, a row being retyped still stands for its stored hotel, and removing that
 * row is a change.
 *
 * A complete hotel or transport note the contract refuses also asks for a save, so the API's own sentence reaches the
 * status line instead of the editor staying silent about a value the owner has to fix.
 */
export function lodgingNeedsSave(
  current: LodgingDraft,
  next: LodgingDraft,
  stored: LodgingPayload | null | undefined = null,
): boolean {
  const before = lodgingPayloadOf(current, stored);
  const after = lodgingPayloadOf(next, stored);

  if (before === undefined || after === undefined) {
    return true;
  }
  if (before === null || after === null) {
    return before !== after;
  }

  return !(
    before.hotels.length === after.hotels.length &&
    before.hotels.every((hotel, index) => {
      const other = after.hotels[index];

      return other !== undefined && sameHotel(hotel, other);
    }) &&
    (before.transport ?? "") === (after.transport ?? "")
  );
}
