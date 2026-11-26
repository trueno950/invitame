import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addLodgingHotel,
  canAddLodgingHotel,
  EMPTY_LODGING,
  EMPTY_LODGING_HOTEL,
  isLodgingHotelIncomplete,
  type LodgingDraft,
  lodgingDraftOf,
  lodgingNeedsSave,
  lodgingPayloadOf,
  moveLodgingHotel,
  removeLodgingHotel,
  setLodgingTransport,
  updateLodgingHotel,
} from "./lodging.ts";

// The «Hospedaje y transporte» block of «Funciones» (F4; L7.4): the drafts the browser holds, the payload one save
// sends, and the rule that decides whether a change is a save at all.

const HOTEL = {
  name: "Hotel Misión",
  distance: "A 5 min",
  price: "Desde $1,450 por noche",
  groupCode: "BODA-AYL",
  bookingUrl: "https://hotelmision.example.com/reserva",
  address: "Av. Juárez 120, Centro",
};

const STORED = { version: 1 as const, hotels: [HOTEL], transport: "Camión a las 19:00." };

/** One draft with a single stored hotel, so a case changes only what it names. */
function draftsOf(hotel: Partial<typeof EMPTY_LODGING_HOTEL> = {}): LodgingDraft {
  return { hotels: [{ ...HOTEL, ...hotel }], transport: "Camión a las 19:00." };
}

describe("the lodging drafts (F4; L7.4)", () => {
  it("opens the stored cards, or an empty form when the invitation has none", () => {
    assert.deepEqual(lodgingDraftOf(STORED), draftsOf());
    assert.deepEqual(lodgingDraftOf(null), EMPTY_LODGING);
    assert.deepEqual(lodgingDraftOf({ version: 1, hotels: [] }), EMPTY_LODGING);
  });

  it("adds an empty row up to the bound, and never past it", () => {
    const six = Array.from({ length: 6 }, () => ({ ...EMPTY_LODGING_HOTEL }));

    assert.deepEqual(addLodgingHotel(EMPTY_LODGING).hotels, [EMPTY_LODGING_HOTEL]);
    assert.equal(canAddLodgingHotel({ hotels: six, transport: "" }), false);
    assert.deepEqual(addLodgingHotel({ hotels: six, transport: "" }).hotels.length, 6);
  });

  it("changes one row, removes it, and swaps it with its neighbour", () => {
    const two: LodgingDraft = {
      hotels: [{ ...HOTEL }, { ...EMPTY_LODGING_HOTEL, name: "City Express" }],
      transport: "",
    };

    assert.deepEqual(updateLodgingHotel(two, 1, { price: "Desde $980" }).hotels[1], {
      ...EMPTY_LODGING_HOTEL,
      name: "City Express",
      price: "Desde $980",
    });
    // A row that does not exist changes nothing, so a stale index is never a save.
    assert.equal(updateLodgingHotel(two, 5, { name: "x" }), two);
    assert.deepEqual(removeLodgingHotel(two, 0).hotels, [
      { ...EMPTY_LODGING_HOTEL, name: "City Express" },
    ]);
    assert.deepEqual(
      moveLodgingHotel(two, 1, "up").hotels.map((hotel) => hotel.name),
      ["City Express", "Hotel Misión"],
    );
    assert.equal(moveLodgingHotel(two, 0, "up"), two);
    assert.deepEqual(setLodgingTransport(two, "Camión"), { ...two, transport: "Camión" });
    assert.equal(isLodgingHotelIncomplete({ ...EMPTY_LODGING_HOTEL }), true);
  });
});

describe("the payload one lodging save sends (F4; L7.1, L7.4)", () => {
  it("trims every text and keeps only the complete hotels", () => {
    assert.deepEqual(
      lodgingPayloadOf({
        hotels: [
          { ...HOTEL, name: "  Hotel Misión  ", distance: "  ", address: "" },
          EMPTY_LODGING_HOTEL,
        ],
        transport: "  Camión a las 19:00.  ",
      }),
      {
        version: 1,
        hotels: [
          {
            name: "Hotel Misión",
            price: HOTEL.price,
            groupCode: HOTEL.groupCode,
            bookingUrl: HOTEL.bookingUrl,
          },
        ],
        transport: "Camión a las 19:00.",
      },
    );
  });

  it("answers null when the owner removed every hotel and the transport, and keeps a transport alone", () => {
    assert.equal(lodgingPayloadOf(EMPTY_LODGING), null);
    assert.deepEqual(lodgingPayloadOf({ hotels: [], transport: "Camión." }), {
      version: 1,
      hotels: [],
      transport: "Camión.",
    });
  });

  it("keeps the stored hotel while its name is being retyped", () => {
    assert.deepEqual(lodgingPayloadOf(draftsOf({ name: "" }), STORED), {
      version: 1,
      hotels: [HOTEL],
      transport: "Camión a las 19:00.",
    });
    // A row that was never complete carries nothing.
    assert.equal(lodgingPayloadOf({ hotels: [EMPTY_LODGING_HOTEL], transport: "" }), null);
  });

  it("refuses a complete hotel or transport note outside its bounds, and no save is sent for it", () => {
    assert.equal(
      lodgingPayloadOf(draftsOf({ bookingUrl: "http://hotel.test" }), STORED),
      undefined,
    );
    assert.equal(lodgingPayloadOf(draftsOf({ name: "n".repeat(61) }), STORED), undefined);
    assert.equal(lodgingPayloadOf({ hotels: [], transport: "t".repeat(401) }, STORED), undefined);
    assert.equal(
      lodgingPayloadOf(
        { hotels: Array.from({ length: 7 }, () => ({ ...HOTEL })), transport: "" },
        STORED,
      ),
      undefined,
    );
  });
});

describe("whether a lodging change is a save (F4; L7.4)", () => {
  it("says no for a row being added, written, or removed while it was never complete", () => {
    const current = draftsOf();

    assert.equal(
      lodgingNeedsSave(
        current,
        { ...current, hotels: [...current.hotels, EMPTY_LODGING_HOTEL] },
        STORED,
      ),
      false,
    );
    assert.equal(lodgingNeedsSave(current, draftsOf({ name: "" }), STORED), false);
    // The same note with a trailing space is the same note, so it is not a save either.
    assert.equal(
      lodgingNeedsSave(current, { ...current, transport: "Camión a las 19:00.  " }, STORED),
      false,
    );
  });

  it("says yes for a saved change, including a stored hotel the owner removed", () => {
    assert.equal(lodgingNeedsSave(draftsOf(), { ...draftsOf(), transport: "Otro" }, STORED), true);
    assert.equal(lodgingNeedsSave(draftsOf(), { hotels: [], transport: "" }, STORED), true);
    assert.equal(lodgingNeedsSave(draftsOf(), draftsOf({ price: "Desde $980" }), STORED), true);
  });
});
