import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDisplayName } from "./display-name";

// The display-name rule at its source (M2 T11b; S48, L71). The DTO and the use case both call
// `parseDisplayName`, so one table covers every entry path. Expected values are literals on purpose.

/** The twelve bidirectional controls S48 refuses, as code points. */
const BIDIRECTIONAL_CONTROLS = [
  0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
];

function label(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

describe("parseDisplayName: bidirectional controls (S48, L71)", () => {
  for (const codePoint of BIDIRECTIONAL_CONTROLS) {
    it(`refuses ${label(codePoint)} at the start, inside, at the end, alone, and inside padding`, () => {
      const character = String.fromCodePoint(codePoint);

      // `trim()` does not strip these characters, so none of these shapes can hide one.
      for (const value of [`${character}Ana`, `An${character}a`, `Ana${character}`, character]) {
        assert.equal(parseDisplayName(value), null, JSON.stringify(value));
      }
      assert.equal(parseDisplayName(`  ${character}  `), null, "only padding around a control");
    });
  }

  it("still accepts the joiners, the zero-width space, and the neighbours of the refused ranges", () => {
    // U+200D is the zero-width joiner of composed emoji and some scripts; U+200C, U+200B, U+2060 and
    // U+061B sit next to the refused characters and are not bidirectional controls.
    for (const codePoint of [0x200b, 0x200c, 0x200d, 0x2060, 0x061b]) {
      const value = `An${String.fromCodePoint(codePoint)}a`;
      assert.equal(parseDisplayName(value), value, label(codePoint));
    }
    assert.equal(parseDisplayName("👨\u200d👩\u200d👧"), "👨\u200d👩\u200d👧");
    assert.equal(parseDisplayName("  Ana María  "), "Ana María");
  });

  it("keeps refusing control characters and unpaired surrogates", () => {
    for (const value of ["Ana\u0000", "Ana\tMaría", "Ana\u007f", "Ana\u0085", "Ana\ud800"]) {
      assert.equal(parseDisplayName(value), null, JSON.stringify(value));
    }
  });
});
