import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DICTIONARIES,
  dictionaryFor,
  ENGLISH_TEXTS,
  SPANISH_TEXTS,
  t,
  textKeys,
} from "./dictionary.ts";

// The one typed dictionary of every fixed guest-facing text (F14; S2.14, L19.2). It is declared once in Spanish, and
// the English dictionary is typed by the same keys, so a key added without its English value fails `tsc`; these tests
// prove the same rule at runtime, so a body that loses a key is refused before a guest reads a blank line.

describe("the guest text dictionary (F14; L19.2)", () => {
  it("declares every Spanish key once and answers an English value for each of them", () => {
    const keys = Object.keys(SPANISH_TEXTS);

    assert.notEqual(keys.length, 0);
    assert.deepEqual([...Object.keys(ENGLISH_TEXTS)].sort(), [...keys].sort());

    for (const key of keys) {
      const english = ENGLISH_TEXTS[key as keyof typeof ENGLISH_TEXTS];

      assert.equal(typeof english, "string", key);
      assert.notEqual(english.trim(), "", key);
    }
  });

  it("holds the same keys in both locales and nothing outside the Spanish declaration", () => {
    assert.deepEqual([...textKeys()].sort(), [...Object.keys(SPANISH_TEXTS)].sort());
    assert.deepEqual([...Object.keys(DICTIONARIES.es)].sort(), [...textKeys()].sort());
    assert.deepEqual([...Object.keys(DICTIONARIES.en)].sort(), [...textKeys()].sort());
  });

  it("answers the text of the locale it is asked for", () => {
    assert.equal(t("es", "language.group"), "Idioma");
    assert.equal(t("en", "language.group"), "Language");
    assert.equal(t("es", "language.optionEs"), "ES");
    assert.equal(t("es", "language.optionEn"), "EN");
    assert.equal(t("en", "language.optionEs"), "ES");
    assert.equal(t("en", "language.optionEn"), "EN");
  });

  it("hands the whole dictionary of one locale to a renderer, and never the other locale's", () => {
    assert.equal(dictionaryFor("es")["language.group"], "Idioma");
    assert.equal(dictionaryFor("en")["language.group"], "Language");
    // The Spanish dictionary is the source of truth itself, not a copy that could drift from it.
    assert.equal(dictionaryFor("es"), SPANISH_TEXTS);
  });
});
