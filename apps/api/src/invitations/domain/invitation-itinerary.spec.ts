import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ITINERARY_MAX_ITEMS,
  ITINERARY_TEXT_MAX_LENGTH,
  ITINERARY_TITLE_MAX_LENGTH,
  storedItinerary,
  validateItinerary,
} from "./invitation-itinerary";

// The itinerary payload of one invitation (F1; S2.1, L3.1). It is pure data: a versioned list of 1 to 15 moments,
// each one a time, a title, and two optional texts, kept in the owner's order. The validator is the only authority on
// the shape; the column stores the JSONB as it comes and a read that the domain refuses shows no itinerary.

const MOMENT = {
  time: "17:00",
  title: "Misa",
  place: "Parroquia de San Juan",
  address: "Av. Juárez 45, Centro",
};

/** A payload with `count` moments, the first one the documented shape. */
function payloadOf(count: number): { version: 1; items: unknown[] } {
  return {
    version: 1,
    items: Array.from({ length: count }, (_, index) => ({
      ...MOMENT,
      title: `Momento ${index + 1}`,
    })),
  };
}

describe("the itinerary payload (F1; S2.1, L3.1)", () => {
  it("accepts the documented payload and keeps the owner's order", () => {
    assert.deepEqual(
      validateItinerary({
        version: 1,
        items: [
          MOMENT,
          { time: "19:30", title: "Recepción y cóctel" },
          { time: "22:00", title: "¡A bailar!" },
        ],
      }),
      {
        ok: true,
        value: {
          version: 1,
          items: [
            MOMENT,
            { time: "19:30", title: "Recepción y cóctel" },
            { time: "22:00", title: "¡A bailar!" },
          ],
        },
      },
    );
  });

  it("trims every text and reads a blank optional value as absent", () => {
    assert.deepEqual(
      validateItinerary({
        version: 1,
        items: [
          {
            time: " 17:00 ",
            title: "  Misa  ",
            place: "  Parroquia de San Juan  ",
            address: "   ",
          },
          { time: "18:30", title: "Sesión de fotos", place: "", address: "\t" },
        ],
      }),
      {
        ok: true,
        value: {
          version: 1,
          items: [
            { time: "17:00", title: "Misa", place: "Parroquia de San Juan" },
            { time: "18:30", title: "Sesión de fotos" },
          ],
        },
      },
    );
  });

  it("accepts one moment and the fifteen moments the bound allows", () => {
    assert.equal(validateItinerary(payloadOf(1)).ok, true);
    assert.equal(validateItinerary(payloadOf(ITINERARY_MAX_ITEMS)).ok, true);
    assert.equal(ITINERARY_MAX_ITEMS, 15);
  });

  it("refuses a sixteenth moment with one deterministic issue", () => {
    assert.deepEqual(validateItinerary(payloadOf(ITINERARY_MAX_ITEMS + 1)), {
      ok: false,
      issues: ["itinerary.items must have at most 15 items"],
    });
  });

  it("stores no itinerary for null, undefined, and an empty list", () => {
    for (const value of [null, undefined, { version: 1, items: [] }]) {
      assert.deepEqual(validateItinerary(value), { ok: true, value: null }, String(value));
    }
  });

  it("accepts every time from 00:00 to 23:59 and refuses anything else", () => {
    for (const time of ["00:00", "07:05", "12:30", "23:59"]) {
      assert.equal(
        validateItinerary({ version: 1, items: [{ time, title: "Momento" }] }).ok,
        true,
        time,
      );
    }
    for (const time of ["24:00", "23:60", "7:00", "07:5", "0700", "07:00:00", "", 700]) {
      assert.deepEqual(
        validateItinerary({ version: 1, items: [{ time, title: "Momento" }] }),
        {
          ok: false,
          issues: ["itinerary.items[0].time must be a time between 00:00 and 23:59"],
        },
        String(time),
      );
    }
  });

  it("bounds the title between one and sixty trimmed characters", () => {
    const titleOf = (title: unknown) =>
      validateItinerary({ version: 1, items: [{ time: "17:00", title }] });

    assert.equal(titleOf("a").ok, true);
    assert.equal(titleOf("a".repeat(ITINERARY_TITLE_MAX_LENGTH)).ok, true);
    assert.equal(ITINERARY_TITLE_MAX_LENGTH, 60);
    for (const title of ["", "   ", "a".repeat(ITINERARY_TITLE_MAX_LENGTH + 1), 42, null]) {
      assert.deepEqual(
        titleOf(title),
        {
          ok: false,
          issues: ["itinerary.items[0].title must be between 1 and 60 characters"],
        },
        String(title),
      );
    }
  });

  it("bounds the optional place and address at one hundred and sixty trimmed characters", () => {
    const text = "a".repeat(ITINERARY_TEXT_MAX_LENGTH);

    assert.equal(ITINERARY_TEXT_MAX_LENGTH, 160);
    assert.equal(
      validateItinerary({
        version: 1,
        items: [{ time: "17:00", title: "Misa", place: text, address: text }],
      }).ok,
      true,
    );
    assert.deepEqual(
      validateItinerary({
        version: 1,
        items: [{ time: "17:00", title: "Misa", place: `${text}a` }],
      }),
      {
        ok: false,
        issues: ["itinerary.items[0].place must be a string of at most 160 characters"],
      },
    );
    assert.deepEqual(
      validateItinerary({
        version: 1,
        items: [{ time: "17:00", title: "Misa", address: `${text}a` }],
      }),
      {
        ok: false,
        issues: ["itinerary.items[0].address must be a string of at most 160 characters"],
      },
    );
    // A value that is not a text at all is no optional text either, and it is never coerced into one.
    assert.deepEqual(
      validateItinerary({ version: 1, items: [{ time: "17:00", title: "Misa", place: 12 }] }),
      {
        ok: false,
        issues: ["itinerary.items[0].place must be a string of at most 160 characters"],
      },
    );
  });

  it("refuses a payload that is not an object, a version that is not 1, and items that are not a list", () => {
    for (const value of ["itinerary", 1, [], true]) {
      assert.deepEqual(
        validateItinerary(value),
        { ok: false, issues: ["itinerary must be an object or null"] },
        String(value),
      );
    }
    for (const version of [0, 2, "1", null]) {
      assert.deepEqual(
        validateItinerary({ version, items: [MOMENT] }),
        { ok: false, issues: ["itinerary.version must be 1"] },
        String(version),
      );
    }
    for (const items of ["Misa", 1, {}, null]) {
      assert.deepEqual(
        validateItinerary({ version: 1, items }),
        { ok: false, issues: ["itinerary.items must be a list"] },
        String(items),
      );
    }
  });

  it("refuses a moment that is not an object, naming its index", () => {
    assert.deepEqual(validateItinerary({ version: 1, items: [MOMENT, "Misa"] }), {
      ok: false,
      issues: ["itinerary.items[1] must be an object"],
    });
  });

  it("reports every issue, the payload, then each moment in the owner's order", () => {
    assert.deepEqual(
      validateItinerary({
        version: 2,
        items: [
          { time: "25:00", title: "  ", place: "a".repeat(161) },
          "Misa",
          { time: "18:30", title: "Sesión de fotos" },
        ],
      }),
      {
        ok: false,
        issues: [
          "itinerary.version must be 1",
          "itinerary.items[0].time must be a time between 00:00 and 23:59",
          "itinerary.items[0].title must be between 1 and 60 characters",
          "itinerary.items[0].place must be a string of at most 160 characters",
          "itinerary.items[1] must be an object",
        ],
      },
    );
  });
});

describe("a stored itinerary (F1; L3.1)", () => {
  it("answers the stored payload while the domain accepts it", () => {
    const stored = { version: 1, items: [MOMENT] };

    assert.deepEqual(storedItinerary(stored), stored);
  });

  it("shows no itinerary for NULL and for a row written around the API", () => {
    for (const value of [
      null,
      undefined,
      { version: 7, items: [MOMENT] },
      { version: 1, items: [{ time: "17:00" }] },
      { version: 1, items: [] },
      "Misa",
    ]) {
      assert.equal(storedItinerary(value), null, JSON.stringify(value));
    }
  });
});
