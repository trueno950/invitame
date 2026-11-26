import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type InvitationLodging,
  LODGING_HOTEL_ADDRESS_MAX_LENGTH,
  LODGING_HOTEL_BOOKING_URL_MAX_LENGTH,
  LODGING_HOTEL_DISTANCE_MAX_LENGTH,
  LODGING_HOTEL_GROUP_CODE_MAX_LENGTH,
  LODGING_HOTEL_NAME_MAX_LENGTH,
  LODGING_HOTEL_PRICE_MAX_LENGTH,
  LODGING_MAX_HOTELS,
  LODGING_TRANSPORT_MAX_LENGTH,
  lodgingHasContent,
  publicLodging,
  storedLodging,
  validateLodging,
} from "./invitation-lodging";

// The lodging payload rules (F4; S2.4, L7.1): the version, the six-hotel bound, the six fields of a hotel, the
// transport text, and the empty-payload rule. Every case goes through the validator the API and the column trust.

const HOTEL = {
  name: "Hotel Misión",
  distance: "A 5 min",
  price: "Desde $1,450 por noche",
  groupCode: "BODA-AYL",
  bookingUrl: "https://hotelmision.example.com/reserva",
  address: "Av. Juárez 120, Centro",
} as const;

const LODGING = { version: 1, hotels: [HOTEL], transport: "Camión a las 19:00." } as const;

/** The validated payload, or the issues that refuse it. */
function resultOf(payload: unknown): unknown {
  const validated = validateLodging(payload);

  return validated.ok ? validated.value : validated.issues;
}

/** The validated payload, asserting the value is one the rules accept. */
function payloadOf(payload: unknown): InvitationLodging | null {
  const validated = validateLodging(payload);

  assert.equal(validated.ok, true, JSON.stringify(validated.ok ? [] : validated.issues));

  return validated.ok ? validated.value : null;
}

describe("the lodging payload bounds (L7.1)", () => {
  it("accepts 0 and 6 hotels and refuses 7, in the owner's order", () => {
    assert.deepEqual(resultOf(LODGING), LODGING);
    assert.equal(
      payloadOf({ version: 1, hotels: Array.from({ length: LODGING_MAX_HOTELS }, () => HOTEL) })
        ?.hotels.length,
      LODGING_MAX_HOTELS,
    );
    assert.deepEqual(resultOf({ version: 1, hotels: Array.from({ length: 7 }, () => HOTEL) }), [
      "lodging.hotels must have at most 6 hotels",
    ]);
    // The order the owner saved is the order the guests read.
    const other = { name: "City Express" };

    assert.deepEqual(
      payloadOf({ version: 1, hotels: [other, HOTEL] })?.hotels.map((hotel) => hotel.name),
      ["City Express", "Hotel Misión"],
    );
  });

  it("treats null, an absent value, and an empty payload as no lodging, and refuses another version", () => {
    assert.equal(resultOf(null), null);
    assert.equal(resultOf(undefined), null);
    assert.equal(resultOf({ version: 1, hotels: [] }), null);
    assert.equal(resultOf({ version: 1, hotels: [], transport: "   " }), null);
    assert.deepEqual(resultOf({ version: 2, hotels: [HOTEL] }), ["lodging.version must be 1"]);
    assert.deepEqual(resultOf({ hotels: [HOTEL] }), ["lodging.version must be 1"]);
    assert.deepEqual(resultOf({ version: 1, hotels: "x" }), ["lodging.hotels must be a list"]);
    assert.deepEqual(resultOf(["x"]), ["lodging must be an object or null"]);
    assert.deepEqual(resultOf({ version: 1, hotels: ["x"] }), [
      "lodging.hotels[0] must be an object",
    ]);
  });

  it("bounds the name, the four optional texts, and the booking link, naming the hotel", () => {
    const issuesOf = (hotel: unknown) => resultOf({ version: 1, hotels: [hotel] });

    assert.deepEqual(issuesOf({ name: " ".repeat(3) }), [
      "lodging.hotels[0].name must be between 1 and 60 characters",
    ]);
    assert.deepEqual(issuesOf({ name: "a".repeat(LODGING_HOTEL_NAME_MAX_LENGTH + 1) }), [
      "lodging.hotels[0].name must be between 1 and 60 characters",
    ]);
    assert.deepEqual(issuesOf({ name: "H", distance: "d".repeat(41) }), [
      "lodging.hotels[0].distance must be a string of at most 40 characters",
    ]);
    assert.deepEqual(issuesOf({ name: "H", price: "p".repeat(61) }), [
      "lodging.hotels[0].price must be a string of at most 60 characters",
    ]);
    assert.deepEqual(issuesOf({ name: "H", groupCode: "g".repeat(41) }), [
      "lodging.hotels[0].groupCode must be a string of at most 40 characters",
    ]);
    assert.deepEqual(issuesOf({ name: "H", address: "a".repeat(161) }), [
      "lodging.hotels[0].address must be a string of at most 160 characters",
    ]);
    assert.deepEqual(issuesOf({ name: "H", distance: 5 }), [
      "lodging.hotels[0].distance must be a string of at most 40 characters",
    ]);
  });

  it("accepts only an https booking link, bounded at 500 characters with no whitespace", () => {
    const issuesOf = (bookingUrl: unknown) =>
      resultOf({ version: 1, hotels: [{ name: "H", bookingUrl }] });
    const issue = "lodging.hotels[0].bookingUrl must be an https link of at most 500 characters";

    assert.deepEqual(
      payloadOf({ version: 1, hotels: [{ name: "H", bookingUrl: "https://hotel.test/r" }] })
        ?.hotels,
      [{ name: "H", bookingUrl: "https://hotel.test/r" }],
    );
    for (const refused of [
      "http://hotel.test/r",
      "hotel.test/r",
      "https://",
      "https://hotel.test/r r",
      `https://hotel.test/${"a".repeat(LODGING_HOTEL_BOOKING_URL_MAX_LENGTH)}`,
      42,
    ]) {
      assert.deepEqual(issuesOf(refused), [issue], String(refused));
    }
  });

  it("bounds the transport text and keeps a blank one absent", () => {
    assert.deepEqual(resultOf({ version: 1, hotels: [], transport: "t".repeat(401) }), [
      "lodging.transport must be a string of at most 400 characters",
    ]);
    assert.deepEqual(resultOf({ version: 1, hotels: [], transport: "  Camión a las 19:00.  " }), {
      version: 1,
      hotels: [],
      transport: "Camión a las 19:00.",
    });
    assert.equal(
      payloadOf({ version: 1, hotels: [], transport: "t".repeat(LODGING_TRANSPORT_MAX_LENGTH) })
        ?.transport,
      "t".repeat(LODGING_TRANSPORT_MAX_LENGTH),
    );
  });

  it("trims every text and stores a blank optional value as absent", () => {
    assert.deepEqual(
      resultOf({
        version: 1,
        hotels: [
          {
            name: "  Hotel Misión  ",
            distance: "  ",
            price: "",
            groupCode: " BODA-AYL ",
            bookingUrl: "  https://hotel.test/r  ",
            address: null,
          },
        ],
      }),
      {
        version: 1,
        hotels: [
          { name: "Hotel Misión", groupCode: "BODA-AYL", bookingUrl: "https://hotel.test/r" },
        ],
      },
    );
  });

  it("reports every refused hotel in the owner's order, then the transport", () => {
    assert.deepEqual(
      resultOf({
        version: 1,
        hotels: [{ name: "" }, { name: "H", distance: "d".repeat(41) }],
        transport: "t".repeat(401),
      }),
      [
        "lodging.hotels[0].name must be between 1 and 60 characters",
        "lodging.hotels[1].distance must be a string of at most 40 characters",
        "lodging.transport must be a string of at most 400 characters",
      ],
    );
  });
});

describe("the stored and public lodging (F4; L7.1, L7.3)", () => {
  it("reads a row written around the API as no lodging", () => {
    assert.equal(storedLodging({ version: 9, hotels: [HOTEL] }), null);
    assert.equal(storedLodging({ version: 1, hotels: [{ name: "" }] }), null);
    assert.equal(storedLodging({ version: 1, hotels: [] }), null);
    assert.equal(storedLodging(null), null);
    assert.deepEqual(storedLodging(LODGING), LODGING);
  });

  it("has content only with a hotel or a transport line, which is the same rule the validator uses", () => {
    assert.equal(lodgingHasContent(LODGING), true);
    assert.equal(lodgingHasContent({ version: 1, hotels: [], transport: "Camión." }), true);
    assert.equal(lodgingHasContent({ version: 1, hotels: [] }), false);
    assert.equal(lodgingHasContent(null), false);
  });

  it("answers the public view without the version, with a null transport when there is none", () => {
    assert.deepEqual(publicLodging(LODGING), { hotels: [HOTEL], transport: "Camión a las 19:00." });
    assert.deepEqual(publicLodging({ version: 1, hotels: [HOTEL] }), {
      hotels: [HOTEL],
      transport: null,
    });
  });
});

describe("the bounds the payload mirrors (L7.1)", () => {
  it("states the numbers the column and the editor use", () => {
    assert.equal(LODGING_MAX_HOTELS, 6);
    assert.equal(LODGING_HOTEL_NAME_MAX_LENGTH, 60);
    assert.equal(LODGING_HOTEL_DISTANCE_MAX_LENGTH, 40);
    assert.equal(LODGING_HOTEL_PRICE_MAX_LENGTH, 60);
    assert.equal(LODGING_HOTEL_GROUP_CODE_MAX_LENGTH, 40);
    assert.equal(LODGING_HOTEL_ADDRESS_MAX_LENGTH, 160);
    assert.equal(LODGING_HOTEL_BOOKING_URL_MAX_LENGTH, 500);
    assert.equal(LODGING_TRANSPORT_MAX_LENGTH, 400);
  });
});
