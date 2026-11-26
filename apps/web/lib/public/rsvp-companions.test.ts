import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  companionChildField,
  companionNameField,
  companionValues,
  dietaryNotesValue,
  RSVP_COMPANION_NAME_MAX_LENGTH,
  RSVP_DIETARY_NOTES_MAX_LENGTH,
} from "./rsvp-companions.ts";

// The companion rows and the dietary notes of the guest's RSVP form (F3; S2.3, L6.1, L6.3): the fields of one row are
// named by row, the party size decides how many of them an answer carries, and a page with no client script — which
// submits every rendered row — can never name more people than the party the guest chose.

/** One form with the rows a server-rendered page submits. */
function formOf(entries: readonly (readonly [string, string])[]): FormData {
  const form = new FormData();

  for (const [name, value] of entries) {
    form.append(name, value);
  }
  return form;
}

describe("the companion fields of one form (F3; L6.1)", () => {
  it("names each row's own fields, so two rows can never be paired by mistake", () => {
    assert.equal(companionNameField(1), "companionName-1");
    assert.equal(companionChildField(1), "companionChild-1");
    assert.equal(companionNameField(9), "companionName-9");
    assert.equal(RSVP_COMPANION_NAME_MAX_LENGTH, 60);
    assert.equal(RSVP_DIETARY_NOTES_MAX_LENGTH, 300);
  });

  it("keeps the first party size minus one rows, with their names and child marks", () => {
    const form = formOf([
      [companionNameField(1), "  Jorge Gómez "],
      [companionChildField(2), "on"],
      [companionNameField(2), "Sofía Gómez"],
      [companionNameField(3), "Ignorado"],
    ]);

    assert.deepEqual(companionValues(form, 3), [
      { name: "Jorge Gómez", child: false },
      { name: "Sofía Gómez", child: true },
    ]);
  });

  it("ignores the rows past the party the guest chose, which is what a page without script submits", () => {
    // Without client script every rendered row is enabled, so the answer keeps only the rows the party covers.
    const form = formOf([
      [companionNameField(1), "Jorge"],
      [companionNameField(2), "Sofía"],
      [companionNameField(3), "Nadie"],
      [companionChildField(3), "on"],
    ]);

    assert.deepEqual(companionValues(form, 2), [{ name: "Jorge", child: false }]);
    assert.deepEqual(companionValues(form, 1), []);
  });

  it("names nobody for a declining answer, whatever rows the page submitted", () => {
    const form = formOf([[companionNameField(1), "Jorge"]]);

    assert.deepEqual(companionValues(form, 0), []);
  });

  it("accepts an unnamed row, so a guest may confirm a count without every name", () => {
    const form = formOf([[companionNameField(1), "   "]]);

    assert.deepEqual(companionValues(form, 2), [{ name: "", child: false }]);
  });

  it("never returns more rows than the widest party allows", () => {
    const form = formOf([[companionNameField(9), "Nueve"]]);

    assert.equal(companionValues(form, 10).length, 9);
    assert.equal(companionValues(form, 40).length, 9);
  });
});

describe("the dietary notes of one form (F3; L6.1)", () => {
  it("keeps what the guest typed, trimmed, and answers null when the field is empty or absent", () => {
    assert.equal(
      dietaryNotesValue(formOf([["dietaryNotes", "  Sofía es alérgica a la nuez  "]])),
      "Sofía es alérgica a la nuez",
    );
    assert.equal(dietaryNotesValue(formOf([["dietaryNotes", "   "]])), null);
    assert.equal(dietaryNotesValue(formOf([])), null);
  });
});
