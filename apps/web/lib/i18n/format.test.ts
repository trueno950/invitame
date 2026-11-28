import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatClockTime, formatLongDate } from "./format.ts";
import { intlLocale, isLocale, LOCALES } from "./locale.ts";

// The `Intl` helpers of a guest page (F14; L19.2): every wall clock is formatted for the rendered locale, never with
// one hard-coded locale, and a value this runtime cannot format answers nothing instead of throwing in the middle of
// a render.

const INSTANT = new Date("2026-11-21T23:00:00.000Z");
const ZONE = "America/Mexico_City";

describe("the locale of a guest page (F14; L19.2)", () => {
  it("has exactly the two locales the dictionary declares", () => {
    assert.deepEqual([...LOCALES], ["es", "en"]);
    assert.equal(isLocale("es"), true);
    assert.equal(isLocale("en"), true);
    assert.equal(isLocale("es-MX"), false);
    assert.equal(isLocale("ES"), false);
    assert.equal(isLocale(undefined), false);
  });

  it("formats with the region's own tag of each locale", () => {
    assert.equal(intlLocale("es"), "es-MX");
    assert.equal(intlLocale("en"), "en-US");
  });
});

describe("the date and time of a guest page (F14; L19.2)", () => {
  it("writes the long date of the invitation's own zone in each locale", () => {
    assert.equal(formatLongDate("es", INSTANT, ZONE), "21 de noviembre de 2026");
    assert.equal(formatLongDate("en", INSTANT, ZONE), "November 21, 2026");
  });

  it("writes the clock of the invitation's own zone in each locale", () => {
    assert.equal(formatClockTime("es", INSTANT, ZONE), "5:00 p.m.");
    assert.equal(formatClockTime("en", INSTANT, ZONE), "5:00 PM");
  });

  it("answers nothing for an instant or a zone this runtime cannot format", () => {
    assert.equal(formatLongDate("es", new Date(Number.NaN), ZONE), undefined);
    assert.equal(formatClockTime("es", INSTANT, "Mars/Olympus_Mons"), undefined);
  });

  it("reads the same instant in the zone it is given, never in the server's own zone", () => {
    assert.equal(formatLongDate("es", INSTANT, "UTC"), "21 de noviembre de 2026");
    assert.equal(formatLongDate("es", INSTANT, "Pacific/Auckland"), "22 de noviembre de 2026");
  });
});
