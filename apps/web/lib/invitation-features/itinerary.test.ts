import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ITINERARY_MAX_ITEMS,
  ITINERARY_SECTION_HINT,
  ITINERARY_SECTION_TITLE,
  itineraryDirectionsUrl,
  parseItinerary,
  parseItineraryPayload,
} from "./itinerary.ts";

// The itinerary of one invitation, as a guest page reads it (F1; S2.1, L3.1, L3.3, L3.5). The API validates the
// payload and answers `{ items }` only while the package grants the key and the list is not empty; this module holds
// the reader that refuses any other shape, the copy of the block, and the maps search of a moment with an address.

const MOMENT = { time: "17:00", title: "Misa", place: "Parroquia de San Juan" };

describe("the itinerary of a guest page (F1; L3.1)", () => {
  it("reads the moments in the API's order", () => {
    assert.deepEqual(
      parseItinerary({
        items: [
          {
            time: "17:00",
            title: "Misa",
            place: "Parroquia de San Juan",
            address: "Av. Juárez 45",
          },
          { time: "19:30", title: "Recepción y cóctel" },
        ],
      }),
      {
        items: [
          {
            time: "17:00",
            title: "Misa",
            place: "Parroquia de San Juan",
            address: "Av. Juárez 45",
          },
          { time: "19:30", title: "Recepción y cóctel" },
        ],
      },
    );
  });

  it("reads null as no itinerary", () => {
    assert.equal(parseItinerary(null), null);
  });

  it("refuses a list the API could not have written", () => {
    for (const value of [
      undefined,
      {},
      { items: [] },
      { items: "Misa" },
      { version: 1, items: [MOMENT] },
      { items: Array.from({ length: ITINERARY_MAX_ITEMS + 1 }, () => MOMENT) },
      { items: [{ time: "24:00", title: "Misa" }] },
      { items: [{ time: "17:00", title: "" }] },
      { items: [{ time: "17:00", title: "a".repeat(61) }] },
      { items: [{ time: "17:00", title: "Misa", place: "a".repeat(161) }] },
      { items: [{ time: "17:00", title: "Misa", address: "a".repeat(161) }] },
      { items: [{ time: "17:00", title: "Misa", place: 42 }] },
      { items: [{ time: "17:00", title: "Misa", address: null }] },
      { items: [{ time: "17:00", title: "Misa", address: "" }] },
    ]) {
      assert.equal(parseItinerary(value), undefined, JSON.stringify(value));
    }
  });

  it("bounds the list at the same fifteen moments the API stores", () => {
    assert.equal(ITINERARY_MAX_ITEMS, 15);
    assert.deepEqual(
      parseItinerary({ items: Array.from({ length: ITINERARY_MAX_ITEMS }, () => MOMENT) })?.items
        .length,
      ITINERARY_MAX_ITEMS,
    );
  });

  it("names the section of the block", () => {
    assert.equal(ITINERARY_SECTION_TITLE, "Itinerario");
    assert.equal(ITINERARY_SECTION_HINT.length > 0, true);
  });
});

describe("the itinerary payload of the owner read (F1; L3.1)", () => {
  it("reads the versioned payload the editor sends back", () => {
    assert.deepEqual(parseItineraryPayload({ version: 1, items: [MOMENT] }), {
      version: 1,
      items: [MOMENT],
    });
  });

  it("reads null and an absent value as no itinerary", () => {
    assert.equal(parseItineraryPayload(null), null);
    assert.equal(parseItineraryPayload(undefined), null);
  });

  it("refuses a version this deployment does not write and a payload of another shape", () => {
    for (const value of [
      { version: 2, items: [MOMENT] },
      { version: "1", items: [MOMENT] },
      { items: [MOMENT] },
      { version: 1, items: [] },
      { version: 1, items: "Misa" },
      { version: 1, items: [{ time: "17:00", title: "" }] },
      { version: 1, items: [MOMENT], extra: true },
    ]) {
      assert.equal(parseItineraryPayload(value), undefined, JSON.stringify(value));
    }
  });
});

describe("«Cómo llegar» of one itinerary moment (F1; L3.5)", () => {
  it("opens a Google Maps search for the address, encoded for the query", () => {
    assert.equal(
      itineraryDirectionsUrl("Salón Jardín Las Rosas, Av. Juárez 45, Centro"),
      "https://www.google.com/maps/search/?api=1&query=Sal%C3%B3n%20Jard%C3%ADn%20Las%20Rosas%2C%20Av.%20Ju%C3%A1rez%2045%2C%20Centro",
    );
  });

  it("encodes every character a query cannot carry raw", () => {
    assert.equal(
      itineraryDirectionsUrl("Calle 5 & 6 #12"),
      "https://www.google.com/maps/search/?api=1&query=Calle%205%20%26%206%20%2312",
    );
  });
});
