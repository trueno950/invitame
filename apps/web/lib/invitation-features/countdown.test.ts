import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type CountdownParts,
  countdownGroups,
  countdownLabel,
  countdownParts,
} from "./countdown.ts";
import { startInstant } from "./start-instant.ts";

// The countdown of the guest page (S3, S4): days, hours, and minutes to the start in the invitation's zone.
// It says the celebration is today or has passed when it should, and the same parts render on the server and
// in the client island, so the block shows its value before any JavaScript runs.

const ZONE = "America/Mexico_City";

/** The parts of an invitation that starts at `date`/`time` in `zone`, seen from `now`. */
function partsFrom(date: string, time: string, now: string, zone: string = ZONE): CountdownParts {
  return countdownParts(startInstant(date, time, zone), new Date(now), zone);
}

describe("countdown parts", () => {
  it("counts days, hours, and minutes to a future celebration", () => {
    assert.deepEqual(partsFrom("2026-12-05", "16:30", "2026-12-01T18:00:00Z"), {
      status: "upcoming",
      days: 4,
      hours: 4,
      minutes: 30,
    });
  });

  it("counts across a daylight saving transition with real elapsed time", () => {
    // Tijuana 2026-03-07 12:00 PST (20:00Z) to 2026-03-09 12:00 PDT (19:00Z) is 47 hours, not 48.
    assert.deepEqual(partsFrom("2026-03-09", "12:00", "2026-03-07T20:00:00Z", "America/Tijuana"), {
      status: "upcoming",
      days: 1,
      hours: 23,
      minutes: 0,
    });
  });

  it("says the celebration is today when the start is still ahead on the same day in its zone", () => {
    // 2026-12-05T16:00Z is 10:00 in Mexico City, six and a half hours before the start, same calendar day.
    assert.deepEqual(partsFrom("2026-12-05", "16:30", "2026-12-05T16:00:00Z"), {
      status: "today",
      days: 0,
      hours: 6,
      minutes: 30,
    });
  });

  it("compares the day in the invitation's zone, not in UTC", () => {
    const now = "2026-12-06T05:00:00Z";

    // Mexico City is still on 2026-12-05 at that instant, so a start at 00:30 belongs to the next day.
    assert.deepEqual(partsFrom("2026-12-06", "00:30", now), {
      status: "upcoming",
      days: 0,
      hours: 1,
      minutes: 30,
    });
    // Cancún is already on 2026-12-06, so the same wall clock is today.
    assert.deepEqual(partsFrom("2026-12-06", "00:30", now, "America/Cancun"), {
      status: "today",
      days: 0,
      hours: 0,
      minutes: 30,
    });
  });

  it("says it is today while the celebration lasts, from its start to four hours later", () => {
    // 16:30 in Mexico City is 22:30Z; 23:00Z is half an hour into the celebration.
    assert.deepEqual(partsFrom("2026-12-05", "16:30", "2026-12-05T23:00:00Z"), {
      status: "live",
      days: 0,
      hours: 0,
      minutes: 0,
    });
    assert.equal(partsFrom("2026-12-05", "16:30", "2026-12-06T02:29:00Z").status, "live");
  });

  it("counts a start exactly at the current instant as live", () => {
    assert.equal(
      countdownParts(
        startInstant("2026-12-05", "16:30", ZONE),
        startInstant("2026-12-05", "16:30", ZONE),
        ZONE,
      ).status,
      "live",
    );
  });

  it("says the celebration has passed once its four hours are over", () => {
    assert.deepEqual(partsFrom("2026-12-05", "16:30", "2026-12-06T02:30:00Z"), {
      status: "passed",
      days: 0,
      hours: 0,
      minutes: 0,
    });
    assert.equal(partsFrom("2026-12-05", "16:30", "2027-01-01T00:00:00Z").status, "passed");
  });
});

describe("countdown groups", () => {
  it("shows days, hours, and minutes while the celebration is ahead", () => {
    assert.deepEqual(countdownGroups({ status: "upcoming", days: 4, hours: 4, minutes: 30 }), [
      { key: "days", value: 4, unit: "días" },
      { key: "hours", value: 4, unit: "horas" },
      { key: "minutes", value: 30, unit: "minutos" },
    ]);
  });

  it("drops the days of a celebration that is today", () => {
    assert.deepEqual(countdownGroups({ status: "today", days: 0, hours: 6, minutes: 30 }), [
      { key: "hours", value: 6, unit: "horas" },
      { key: "minutes", value: 30, unit: "minutos" },
    ]);
  });

  it("uses the singular unit for a value of one", () => {
    assert.deepEqual(countdownGroups({ status: "upcoming", days: 1, hours: 1, minutes: 1 }), [
      { key: "days", value: 1, unit: "día" },
      { key: "hours", value: 1, unit: "hora" },
      { key: "minutes", value: 1, unit: "minuto" },
    ]);
  });

  it("shows no number once the celebration has passed", () => {
    assert.deepEqual(countdownGroups({ status: "passed", days: 0, hours: 0, minutes: 0 }), []);
    assert.deepEqual(countdownGroups({ status: "live", days: 0, hours: 0, minutes: 0 }), []);
  });
});

describe("countdown label", () => {
  it("reads as a neutral Spanish sentence with tú", () => {
    assert.equal(
      countdownLabel({ status: "upcoming", days: 3, hours: 4, minutes: 12 }),
      "Faltan 3 días, 4 horas y 12 minutos",
    );
    assert.equal(
      countdownLabel({ status: "upcoming", days: 1, hours: 0, minutes: 0 }),
      "Falta 1 día",
    );
    assert.equal(
      countdownLabel({ status: "today", days: 0, hours: 6, minutes: 30 }),
      "Faltan 6 horas y 30 minutos",
    );
    assert.equal(
      countdownLabel({ status: "today", days: 0, hours: 0, minutes: 40 }),
      "Faltan 40 minutos",
    );
  });

  it("does not read «0 minutos» when less than a minute is left", () => {
    assert.equal(
      countdownLabel({ status: "today", days: 0, hours: 0, minutes: 0 }),
      "Falta menos de un minuto",
    );
  });

  it("says the celebration is today or has passed in words", () => {
    assert.equal(
      countdownLabel({ status: "passed", days: 0, hours: 0, minutes: 0 }),
      "La celebración ya pasó",
    );
    assert.equal(countdownLabel({ status: "live", days: 0, hours: 0, minutes: 0 }), "¡Es hoy!");
  });
});
