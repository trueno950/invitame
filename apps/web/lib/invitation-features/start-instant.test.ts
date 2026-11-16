import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSupportedTimeZone, startInstant, zonedDateKey } from "./start-instant.ts";

// The start of a celebration is a wall clock in the invitation's own IANA time zone (S3, S4). The conversion
// uses `Intl` only, so the web adds no time zone dependency, and it resolves a zone without daylight saving
// time, a zone with one, both sides of a transition, and the gap and the overlap a transition creates.

/** The wall clock of `instant` in `timeZone`, as the invitation reads it: `YYYY-MM-DD HH:MM`. */
function wallClock(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")}`;
}

describe("start instant of an invitation", () => {
  it("resolves a wall clock in a zone without daylight saving time", () => {
    // Mexico City has been fixed at UTC-6 since 2022 and Cancún at UTC-5, summer and winter alike.
    assert.equal(
      startInstant("2026-12-05", "16:30", "America/Mexico_City").toISOString(),
      "2026-12-05T22:30:00.000Z",
    );
    assert.equal(
      startInstant("2026-07-05", "16:30", "America/Mexico_City").toISOString(),
      "2026-07-05T22:30:00.000Z",
    );
    assert.equal(
      startInstant("2026-12-05", "16:30", "America/Cancun").toISOString(),
      "2026-12-05T21:30:00.000Z",
    );
  });

  it("resolves a wall clock on both sides of a daylight saving transition", () => {
    // Tijuana follows the United States: DST starts 2026-03-08 and ends 2026-11-01.
    assert.equal(
      startInstant("2026-03-07", "12:00", "America/Tijuana").toISOString(),
      "2026-03-07T20:00:00.000Z",
    );
    assert.equal(
      startInstant("2026-03-09", "12:00", "America/Tijuana").toISOString(),
      "2026-03-09T19:00:00.000Z",
    );
    assert.equal(
      startInstant("2026-10-31", "12:00", "America/Tijuana").toISOString(),
      "2026-10-31T19:00:00.000Z",
    );
    assert.equal(
      startInstant("2026-11-02", "12:00", "America/Tijuana").toISOString(),
      "2026-11-02T20:00:00.000Z",
    );
  });

  it("keeps the requested wall clock on every hour a DST day can represent", () => {
    for (const date of ["2026-03-08", "2026-11-01"]) {
      for (let hour = 0; hour < 24; hour += 1) {
        const time = `${String(hour).padStart(2, "0")}:00`;

        // 02:00 does not exist on 2026-03-08 (the clock jumps to 03:00) and 01:00 happens twice on
        // 2026-11-01, so only those two wall clocks cannot round-trip.
        if ((date === "2026-03-08" && hour === 2) || (date === "2026-11-01" && hour === 1)) {
          continue;
        }
        assert.equal(
          wallClock(startInstant(date, time, "America/Tijuana"), "America/Tijuana"),
          `${date} ${time}`,
          `${date} ${time} round-trips`,
        );
      }
    }
  });

  it("resolves the missing hour of a spring-forward day to the first valid instant", () => {
    // 2026-03-08 02:00 in Tijuana does not exist: the clock jumps from 02:00 PST to 03:00 PDT, so 02:30
    // resolves to 03:30 local (10:30Z), the first instant after the transition.
    const instant = startInstant("2026-03-08", "02:30", "America/Tijuana");

    assert.equal(instant.toISOString(), "2026-03-08T10:30:00.000Z");
    assert.equal(wallClock(instant, "America/Tijuana"), "2026-03-08 03:30");
  });

  it("resolves the repeated hour of a fall-back day to its first occurrence", () => {
    // 2026-11-01 01:30 in Tijuana happens twice; the invitation starts at the first one, still on PDT.
    const instant = startInstant("2026-11-01", "01:30", "America/Tijuana");

    assert.equal(instant.toISOString(), "2026-11-01T08:30:00.000Z");
    assert.equal(wallClock(instant, "America/Tijuana"), "2026-11-01 01:30");
  });

  it("refuses a time zone it cannot resolve instead of falling back to UTC", () => {
    assert.equal(isSupportedTimeZone("America/Mexico_City"), true);
    assert.equal(isSupportedTimeZone("America/Tijuana"), true);
    assert.equal(isSupportedTimeZone("Mars/Olympus"), false);
    assert.equal(isSupportedTimeZone(""), false);
    assert.equal(isSupportedTimeZone("UTC+6"), false);
    assert.equal(isSupportedTimeZone("America/Mexico_City "), false);

    assert.throws(() => startInstant("2026-12-05", "16:30", "Mars/Olympus"), RangeError);
    assert.throws(() => startInstant("2026-12-05", "16:30", ""), RangeError);
  });

  it("answers the calendar day of an instant in the invitation's zone", () => {
    const instant = new Date("2026-12-06T03:00:00Z");

    assert.equal(zonedDateKey(instant, "America/Mexico_City"), "2026-12-05");
    assert.equal(zonedDateKey(instant, "America/Tijuana"), "2026-12-05");
    assert.equal(zonedDateKey(new Date("2026-12-05T23:00:00Z"), "America/Cancun"), "2026-12-05");
    assert.throws(() => zonedDateKey(instant, "Mars/Olympus"), RangeError);
  });
});
