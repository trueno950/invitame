import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatInstant } from "./format.ts";

// Instants are shown in Mexico City time whatever the server's zone, so the page reads the same on
// every host (M3 T8a).

describe("formatInstant", () => {
  it("formats an ISO instant in Mexican Spanish and Mexico City time", () => {
    const text = formatInstant("2026-11-09T18:30:00.000Z");
    assert.match(text, /9 nov 2026/);
    assert.match(text, /12:30/);
  });

  it("does not depend on the process time zone", () => {
    assert.equal(formatInstant("2026-01-01T05:59:00.000Z"), formatInstant("2026-01-01T05:59:00Z"));
    assert.match(formatInstant("2026-01-01T05:59:00.000Z"), /31 dic 2025/);
  });

  it("keeps an unreadable value out of the page", () => {
    assert.equal(formatInstant("not a date"), "");
  });
});
