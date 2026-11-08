import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDisplayName } from "./display-name";

// Accepted residual risk of the T11 sign-off (T11b R1-001, L75): format characters outside the
// bidirectional controls of S48 still pass, so a name can show differently from its content. The
// impact is visual only. These tests pin today's decision; a later rule that refuses these
// characters changes them on purpose.

const ACCEPTED_INVISIBLE = [
  ["U+200B zero-width space", "\u200B"],
  ["U+2060 word joiner", "\u2060"],
  ["U+FEFF byte order mark", "\uFEFF"],
  ["U+2028 line separator", "\u2028"],
  ["U+2029 paragraph separator", "\u2029"],
  ["U+00AD soft hyphen", "\u00AD"],
  ["U+034F combining grapheme joiner", "\u034F"],
  ["U+115F Hangul choseong filler", "\u115F"],
  ["U+3164 Hangul filler", "\u3164"],
] as const;

describe("parseDisplayName: invisible characters still accepted (T11b R1-001)", () => {
  for (const [label, character] of ACCEPTED_INVISIBLE) {
    it(`accepts ${label} inside a name`, () => {
      assert.equal(character.length, 1);
      assert.equal(parseDisplayName(`Ana${character}Perez`), `Ana${character}Perez`);
    });
  }

  it("accepts a name made only of zero-width spaces, which renders empty", () => {
    const name = "\u200B\u200B\u200B";

    assert.equal(parseDisplayName(name), name);
  });

  it("trims U+FEFF, U+2028, and U+2029 at the edges, as String.prototype.trim does", () => {
    for (const character of ["\uFEFF", "\u2028", "\u2029"]) {
      assert.equal(parseDisplayName(`${character}Ana${character}`), "Ana");
      assert.equal(parseDisplayName(character), null);
    }
  });
});
