import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LODGING_MAX_HOTELS,
  LODGING_TRANSPORT_MAX_LENGTH,
  type Lodging,
  lodgingDirectionsUrl,
  lodgingHasContent,
  lodgingOf,
  parseLodging,
  parseLodgingPayload,
} from "./lodging.ts";

// The lodging contract of the guest and owner reads (F4; S2.4, L7.1, L7.3, L7.5): the strict reader of
// `features.lodging`, the strict reader of the owner's payload, and the maps link of one hotel.

const HOTEL = {
  name: "Hotel Misión",
  distance: "A 5 min",
  price: "Desde $1,450 por noche",
  groupCode: "BODA-AYL",
  bookingUrl: "https://hotelmision.example.com/reserva",
  address: "Av. Juárez 120, Centro",
} as const;

const LODGING: Lodging = { hotels: [HOTEL], transport: "Camión a las 19:00." };

describe("the guest's lodging (F4; L7.3)", () => {
  it("reads the documented answer, the owner's order, and a null transport", () => {
    assert.deepEqual(parseLodging(LODGING), LODGING);
    assert.deepEqual(parseLodging({ hotels: [HOTEL, { name: "City Express" }], transport: null }), {
      hotels: [HOTEL, { name: "City Express" }],
      transport: null,
    });
  });

  it("reads an absent field as none, so an older API body still renders the page (L20)", () => {
    assert.equal(parseLodging(undefined), null);
    assert.equal(parseLodging(null), null);
  });

  it("refuses another key, a hotel without a name, and a link that is not https", () => {
    for (const broken of [
      "hoteles",
      [],
      { hotels: [HOTEL], transport: null, version: 1 },
      { hotels: [{ ...HOTEL, name: "" }], transport: null },
      { hotels: [{ ...HOTEL, name: "n".repeat(61) }], transport: null },
      { hotels: [{ ...HOTEL, bookingUrl: "http://hotel.test" }], transport: null },
      { hotels: [{ ...HOTEL, extra: "x" }], transport: null },
      { hotels: Array.from({ length: LODGING_MAX_HOTELS + 1 }, () => HOTEL), transport: null },
      { hotels: [], transport: "t".repeat(LODGING_TRANSPORT_MAX_LENGTH + 1) },
      { hotels: [] },
    ]) {
      assert.equal(parseLodging(broken), undefined, JSON.stringify(broken));
    }
  });

  it("trims a text the API answered with spaces and keeps the value it reads", () => {
    assert.deepEqual(parseLodging({ hotels: [{ name: "  Hotel  " }], transport: "  " }), {
      hotels: [{ name: "Hotel" }],
      transport: null,
    });
  });
});

describe("the owner's lodging payload (F4; L7.1)", () => {
  it("reads the versioned payload the editor sends back, and treats an absent value as none", () => {
    assert.deepEqual(parseLodgingPayload({ version: 1, ...LODGING }), { version: 1, ...LODGING });
    assert.equal(parseLodgingPayload({ version: 1, hotels: [], transport: "  " }), null);
    assert.equal(parseLodgingPayload(undefined), null);
    assert.equal(parseLodgingPayload(null), null);
  });

  it("refuses another version and a body that grows another key", () => {
    assert.equal(parseLodgingPayload({ version: 2, hotels: [] }), undefined);
    assert.equal(parseLodgingPayload({ version: 1, hotels: [], transport: null }), null);
    assert.equal(parseLodgingPayload({ version: 1, hotels: [], extra: true }), undefined);
  });
});

describe("the public view of one stored payload (F4; L7.5)", () => {
  it("drops the version and answers a null transport, so a card always reads the same keys", () => {
    assert.deepEqual(lodgingOf({ version: 1, hotels: [HOTEL] }), {
      hotels: [HOTEL],
      transport: null,
    });
  });
});

describe("whether a lodging shows anything (F4; L7.3)", () => {
  it("is false with no hotel and no transport line, on both shapes", () => {
    assert.equal(lodgingHasContent(LODGING), true);
    assert.equal(lodgingHasContent({ version: 1, hotels: [], transport: "Camión." }), true);
    assert.equal(lodgingHasContent({ version: 1, hotels: [] }), false);
    assert.equal(lodgingHasContent({ hotels: [], transport: null }), false);
    assert.equal(lodgingHasContent(null), false);
  });
});

describe("the maps link of a hotel (F4; L7.5)", () => {
  it("is a Google Maps search of the address, encoded for the query", () => {
    assert.equal(
      lodgingDirectionsUrl("Av. Juárez 120, Centro"),
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Av. Juárez 120, Centro")}`,
    );
  });
});
