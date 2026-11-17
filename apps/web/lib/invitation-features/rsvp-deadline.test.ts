import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deadlineInputValue, deadlineInstant, formatRsvpDeadline } from "./rsvp-deadline.ts";

// The RSVP deadline of an invitation (M6 G3; S4). The creator writes a wall clock in the invitation's own zone
// and the API stores an instant; these three functions are the only place the web moves between the two, and
// they refuse anything they cannot read instead of guessing a zone.

/** 2026-12-05 17:30 in Mexico City, which is 23:30 UTC. */
const DEADLINE = "2026-12-05T23:30:00.000Z";

describe("formatRsvpDeadline", () => {
  it("reads the instant on the invitation's own clock, in neutral Spanish", () => {
    assert.equal(
      formatRsvpDeadline(DEADLINE, "America/Mexico_City"),
      "5 de diciembre de 2026 a las 17:30",
    );
    assert.equal(formatRsvpDeadline(DEADLINE, "UTC"), "5 de diciembre de 2026 a las 23:30");
  });

  it("never answers a deadline it cannot read", () => {
    for (const value of ["", "no-es-fecha", "2026-12-05"]) {
      assert.equal(formatRsvpDeadline(value, "America/Mexico_City"), undefined, value);
    }
    assert.equal(formatRsvpDeadline(DEADLINE, "Marte/Olimpo"), undefined);
  });
});

describe("deadlineInputValue", () => {
  it("writes the wall clock of the invitation's zone as a datetime-local value", () => {
    assert.equal(deadlineInputValue(DEADLINE, "America/Mexico_City"), "2026-12-05T17:30");
    assert.equal(deadlineInputValue(DEADLINE, "Asia/Tokyo"), "2026-12-06T08:30");
  });

  it("writes nothing for an instant or a zone it cannot read", () => {
    assert.equal(deadlineInputValue("no-es-fecha", "America/Mexico_City"), undefined);
    assert.equal(deadlineInputValue(DEADLINE, "Marte/Olimpo"), undefined);
  });
});

describe("deadlineInstant", () => {
  it("reads a datetime-local value as the instant of the invitation's zone", () => {
    assert.equal(
      deadlineInstant("2026-12-05T17:30", "America/Mexico_City"),
      "2026-12-05T23:30:00.000Z",
    );
    assert.equal(deadlineInstant("2026-12-05T17:30", "UTC"), "2026-12-05T17:30:00.000Z");
  });

  it("round-trips every value it writes", () => {
    for (const zone of ["America/Mexico_City", "America/Tijuana", "UTC"]) {
      const input = deadlineInputValue(DEADLINE, zone);

      assert.equal(deadlineInstant(input ?? "", zone), DEADLINE, zone);
    }
  });

  it("refuses a value that is not a real wall clock", () => {
    for (const value of [
      "",
      "2026-12-05",
      "2026-13-05T17:30",
      "2026-02-30T17:30",
      "2026-12-05T25:00",
      "2026-12-05T17:60",
      "5/12/2026 17:30",
      "2026-12-05 17:30",
    ]) {
      assert.equal(deadlineInstant(value, "America/Mexico_City"), undefined, value);
    }
  });

  it("refuses a zone this runtime does not know", () => {
    assert.equal(deadlineInstant("2026-12-05T17:30", "Marte/Olimpo"), undefined);
  });
});
