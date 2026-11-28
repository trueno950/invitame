import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LOCALES } from "./locale.ts";
import {
  RENDERER_ENGLISH_TEXTS,
  RENDERER_SPANISH_TEXTS,
  rendererAgeLabel,
  rendererAgeUnit,
  rendererClockTime,
  rendererLongDate,
  rendererText,
  rendererTextKeys,
  rendererTextsFor,
  rendererWallClock,
} from "./renderer-texts.ts";

/*
 * The renderer dictionary of F14 (S2.14, L19.2): Spanish is the source of truth, so every key the layouts read is
 * declared once in `RENDERER_SPANISH_TEXTS` and its English value is typed by those very keys. These tests hold the
 * promise the type system cannot: an English value is written, not copied, and a Spanish one still says exactly what
 * the layouts said before the setting existed.
 */

/**
 * The only words the two languages genuinely share. Everything else must be written again in English: a value copied
 * from the Spanish source would read as an untranslated line to the guest, and `tsc` cannot tell the difference.
 */
const SAME_IN_BOTH_LOCALES = [
  /** The product's own name for the celebration (L19.2; the owner's market writes it in English too). */
  "babyShower.kicker",
  /** A cardinal letter: north, south, and east are spelled the same in both languages. */
  "birthday.compassNorth",
  "birthday.compassSouth",
  "birthday.compassEast",
  /** The Mexican tradition's own name, which an English invitation keeps. */
  "label.chambelanes",
] as const;

/**
 * The letters a Spanish value carries and an English one must not. The eñe is left out on purpose: an English
 * invitation writes «quinceañera» with its tilde, because that is how the word is borrowed.
 */
const SPANISH_LETTERS = /[áéíóúüÁÉÍÓÚÜ¿¡]/;

/** A placeholder a renderer fills before the text reaches markup: `{age}`, `{name}`. */
const PLACEHOLDER = /\{[a-z]+\}/g;

/** The placeholders one value declares, sorted, so two languages can be compared. */
function placeholdersOf(value: string): string[] {
  return (value.match(PLACEHOLDER) ?? []).sort();
}

describe("the renderer dictionary", () => {
  it("declares the same keys in both languages", () => {
    const spanish = Object.keys(RENDERER_SPANISH_TEXTS).sort();
    const english = Object.keys(RENDERER_ENGLISH_TEXTS).sort();

    assert.deepEqual(english, spanish);
    assert.deepEqual([...rendererTextKeys()].sort(), spanish);
    assert.ok(spanish.length > 40, `unexpectedly small dictionary: ${spanish.length}`);
  });

  it("answers a non-empty text of the locale it renders, for every key", () => {
    for (const key of rendererTextKeys()) {
      for (const locale of LOCALES) {
        const value = rendererText(locale, key);

        assert.equal(typeof value, "string", `${locale} ${key}`);
        assert.notEqual(value.trim(), "", `${locale} ${key} is blank`);
        assert.equal(value.trim(), value, `${locale} ${key} has surrounding space`);
      }
    }
  });

  it("writes English for every Spanish key instead of copying it", () => {
    for (const key of rendererTextKeys()) {
      const english = RENDERER_ENGLISH_TEXTS[key];
      const spanish = RENDERER_SPANISH_TEXTS[key];
      const shared = (SAME_IN_BOTH_LOCALES as readonly string[]).includes(key);

      if (shared) {
        assert.equal(english, spanish, `${key} is declared as shared but differs`);
        continue;
      }
      assert.notEqual(english, spanish, `${key} was not translated`);
    }
  });

  it("does not let a Spanish word survive in an English value", () => {
    for (const key of rendererTextKeys()) {
      assert.doesNotMatch(RENDERER_ENGLISH_TEXTS[key], SPANISH_LETTERS, key);
    }
  });

  it("keeps the placeholders of a template in both languages", () => {
    let placeholders = 0;

    for (const key of rendererTextKeys()) {
      const spanish = placeholdersOf(RENDERER_SPANISH_TEXTS[key]);

      assert.deepEqual(placeholdersOf(RENDERER_ENGLISH_TEXTS[key]), spanish, `${key} placeholder`);
      placeholders += spanish.length;
    }
    assert.equal(placeholders, 2, "the age line and the polaroid caption declare a placeholder");
  });

  it("reads every key through a dictionary bound to one locale", () => {
    for (const locale of LOCALES) {
      const texts = rendererTextsFor(locale);

      for (const key of rendererTextKeys()) {
        assert.equal(texts[key], rendererText(locale, key), `${locale} ${key}`);
      }
    }
  });

  it("treats an absent locale as Spanish", () => {
    for (const key of rendererTextKeys()) {
      assert.equal(rendererText(undefined, key), RENDERER_SPANISH_TEXTS[key], key);
    }
    assert.equal(rendererLongDate(undefined, "2026-12-05"), "5 de diciembre de 2026");
    assert.equal(rendererClockTime(undefined, "16:30"), "16:30 h");
    assert.equal(rendererWallClock(undefined, "16:30"), "16:30");
    assert.equal(rendererAgeLabel(undefined, 7), "Cumple 7 años");
    assert.equal(rendererAgeUnit(undefined, 7), "años");
  });
});

describe("the renderer date and clock", () => {
  it("keeps the Spanish wording every layout wrote before the setting existed", () => {
    assert.equal(rendererLongDate("es", "2026-12-05"), "5 de diciembre de 2026");
    assert.equal(rendererLongDate("es", "2026-08-15"), "15 de agosto de 2026");
    assert.equal(rendererClockTime("es", "16:30"), "16:30 h");
    assert.equal(rendererClockTime("es", "00:05"), "00:05 h");
    assert.equal(rendererWallClock("es", "16:30"), "16:30");
  });

  it("writes the date and the clock of the English page", () => {
    assert.equal(rendererLongDate("en", "2026-12-05"), "December 5, 2026");
    assert.equal(rendererLongDate("en", "2027-04-11"), "April 11, 2027");
    assert.equal(rendererClockTime("en", "16:30"), "4:30 PM");
    assert.equal(rendererClockTime("en", "11:00"), "11:00 AM");
    assert.equal(rendererWallClock("en", "16:30"), "4:30 PM");
  });

  it("never answers an empty line for a value it cannot format", () => {
    for (const value of ["", "not-a-date", "2026-13-45"]) {
      assert.notEqual(rendererLongDate("en", value), "", value);
    }
    for (const value of ["99:99", "not-a-time"]) {
      assert.notEqual(rendererClockTime("en", value), "", value);
      // The bare clock has nothing to add to a value it cannot format, so it answers that value itself.
      assert.equal(rendererWallClock("en", value), value);
    }
  });
});

describe("the renderer age", () => {
  it("writes the age line of the locale, singular included", () => {
    assert.equal(rendererAgeLabel("es", 1), "Cumple 1 año");
    assert.equal(rendererAgeLabel("es", 7), "Cumple 7 años");
    assert.equal(rendererAgeLabel("en", 1), "Turning 1");
    assert.equal(rendererAgeLabel("en", 7), "Turning 7");
  });

  it("writes the unit a layout sets apart from the number", () => {
    assert.equal(rendererAgeUnit("es", 1), "año");
    assert.equal(rendererAgeUnit("es", 7), "años");
    assert.equal(rendererAgeUnit("en", 1), "year");
    assert.equal(rendererAgeUnit("en", 7), "years");
  });
});
