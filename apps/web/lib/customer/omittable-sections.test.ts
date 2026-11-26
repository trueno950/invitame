import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EDITOR_COPY } from "./copy.ts";
import { contentFields } from "./invitations.ts";
import {
  MAX_OMITTED_SECTIONS,
  NO_OMITTABLE_SECTIONS,
  omittableSectionsOf,
  omittedSectionKeys,
  parseOmittedSections,
  requireOneNote,
  requireOneRefusal,
  sectionLabelOf,
  sectionsOfFields,
  shownFieldsOf,
  withSectionShown,
} from "./omittable-sections.ts";

// The omittable sections of the pinned version (S8.1-S8.4), read from the same schema data the API validates: which
// groups a customer may switch off, which of them must keep at least one shown, the fields they cover inside the
// content, and the Spanish words the editor puts on them. Everything here is pure, so `node --test` proves it.

type Schema = Readonly<Record<string, unknown>>;

/** The schema of a version that declares the extension, written as the catalog writes it. */
const BAPTISM: Schema = {
  type: "object",
  properties: {
    celebrantName: { type: "string" },
    date: { type: "string", format: "date" },
    parents: { type: "string" },
    godparents: { type: "string" },
    ceremonyPlace: { type: "string" },
    ceremonyAddress: { type: "string" },
    ceremonyTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    receptionPlace: { type: "string" },
    message: { type: "string" },
    omittedSections: {
      type: "array",
      items: {
        type: "string",
        enum: ["parents", "godparents", "ceremony", "reception", "message"],
      },
      uniqueItems: true,
    },
  },
  required: ["celebrantName", "date"],
  "x-omittable": [
    { key: "parents", fields: ["parents"] },
    { key: "godparents", fields: ["godparents"] },
    {
      key: "ceremony",
      fields: ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"],
    },
    { key: "reception", fields: ["receptionPlace"] },
    { key: "message", fields: ["message"] },
  ],
  "x-require-one": [["ceremony", "reception"]],
};

describe("omittableSectionsOf", () => {
  it("reads the groups and the sets of the pinned schema, in the order it declares them", () => {
    const sections = omittableSectionsOf(BAPTISM);

    assert.deepEqual(
      sections.groups.map((group) => group.key),
      ["parents", "godparents", "ceremony", "reception", "message"],
    );
    assert.deepEqual(sections.groups[2]?.fields, [
      "ceremonyPlace",
      "ceremonyAddress",
      "ceremonyTime",
    ]);
    assert.deepEqual(sections.requireOne, [["ceremony", "reception"]]);
  });

  it("answers nothing for a version that declares no extension, so it behaves exactly as before", () => {
    assert.deepEqual(
      omittableSectionsOf({ type: "object", properties: {} }),
      NO_OMITTABLE_SECTIONS,
    );
    assert.deepEqual(omittableSectionsOf(undefined), NO_OMITTABLE_SECTIONS);
    assert.deepEqual(omittableSectionsOf("un schema"), NO_OMITTABLE_SECTIONS);
  });

  it("ignores an entry it cannot read instead of guessing a group from it", () => {
    const broken = {
      "x-omittable": [
        { key: "parents", fields: ["parents"] },
        { key: 7, fields: ["godparents"] },
        { key: "ceremony" },
        { key: "message", fields: "message" },
        { key: "reception", fields: ["receptionPlace", 4] },
        null,
        ["ceremony"],
      ],
      "x-require-one": [["ceremony", "reception"], "ceremony", [7]],
    };

    assert.deepEqual(
      omittableSectionsOf(broken).groups.map((group) => group.key),
      ["parents", "reception"],
    );
    assert.deepEqual(omittableSectionsOf(broken).groups[1]?.fields, ["receptionPlace"]);
    // A set names group keys; one that is not a list of them is not a set this page can honor.
    assert.deepEqual(omittableSectionsOf(broken).requireOne, [["ceremony", "reception"]]);
  });
});

describe("omittedSectionKeys", () => {
  it("reads the stored list of a content, and answers nothing while it declares none", () => {
    assert.deepEqual(omittedSectionKeys({ omittedSections: ["ceremony", "message"] }), [
      "ceremony",
      "message",
    ]);
    assert.deepEqual(omittedSectionKeys({ celebrantName: "Ana" }), []);
    assert.deepEqual(omittedSectionKeys(undefined), []);
    assert.deepEqual(omittedSectionKeys("ceremony"), []);
  });

  it("keeps one entry per key and drops the values no list can hold", () => {
    assert.deepEqual(omittedSectionKeys({ omittedSections: ["ceremony", 3, "", "message"] }), [
      "ceremony",
      "message",
    ]);
  });
});

describe("parseOmittedSections", () => {
  it("accepts the stored list of a pinned version: unique group keys, bounded", () => {
    assert.deepEqual(parseOmittedSections([]), []);
    assert.deepEqual(parseOmittedSections(["ceremony", "reception"]), ["ceremony", "reception"]);
    assert.deepEqual(parseOmittedSections(["honorSponsors", "rsvpContact"]), [
      "honorSponsors",
      "rsvpContact",
    ]);
    assert.equal(
      parseOmittedSections(Array.from({ length: MAX_OMITTED_SECTIONS }, (_, i) => `key${i}`))
        ?.length,
      MAX_OMITTED_SECTIONS,
    );
  });

  it("refuses what the stored list can never be: a text, a repeat, a blank, or a long list", () => {
    for (const refused of [
      "ceremony",
      ["ceremony", "ceremony"],
      [""],
      ["Ceremony"],
      ["ceremony-1"],
      [1],
      [null],
      { key: "ceremony" },
      null,
      Array.from({ length: MAX_OMITTED_SECTIONS + 1 }, (_, index) => `key${index}`),
      ["a".repeat(41)],
    ]) {
      assert.equal(parseOmittedSections(refused), undefined, JSON.stringify(refused));
    }
  });
});

describe("sectionsOfFields", () => {
  it("finds the groups a card of the editor holds, by their own fields", () => {
    const sections = omittableSectionsOf(BAPTISM);
    const ceremony = sectionsOfFields(
      sections,
      contentFields(BAPTISM).filter((field) =>
        ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"].includes(field.name),
      ),
    );
    const celebrant = sectionsOfFields(
      sections,
      contentFields(BAPTISM).filter((field) => ["celebrantName", "parents"].includes(field.name)),
    );

    assert.deepEqual(
      ceremony.map((group) => group.key),
      ["ceremony"],
    );
    assert.deepEqual(
      celebrant.map((group) => group.key),
      ["parents"],
    );
    assert.deepEqual(sectionsOfFields(sections, []), []);
    assert.deepEqual(
      sectionsOfFields(NO_OMITTABLE_SECTIONS, contentFields(BAPTISM)).map((group) => group.key),
      [],
    );
  });

  it("maps each group of a line to the Spanish words of its card and of the sentence", () => {
    const sections = omittableSectionsOf(BAPTISM);
    const labels = sections.groups.map((group) => sectionLabelOf(group));

    assert.deepEqual(labels, ["Padres", "Padrinos", "Ceremonia", "Recepción", "Mensaje"]);
    // A key this deployment does not name falls back to the first field it covers, never to the English key.
    assert.equal(
      sectionLabelOf({ key: "unknownKey", fields: ["ceremonyPlace"] }),
      "Lugar de la ceremonia",
    );
    assert.equal(sectionLabelOf({ key: "unknownKey", fields: [] }), "unknownKey");
  });
});

describe("shownFieldsOf", () => {
  it("drops the fields of the omitted sections and keeps every other field in its order", () => {
    const fields = contentFields(BAPTISM);
    const sections = omittableSectionsOf(BAPTISM);

    assert.deepEqual(
      shownFieldsOf(fields, sections, ["ceremony"]).map((field) => field.name),
      ["celebrantName", "date", "parents", "godparents", "receptionPlace", "message"],
    );
    // A key this version does not declare, and no key at all, hide nothing.
    assert.deepEqual(
      shownFieldsOf(fields, sections, ["invented"]).map((field) => field.name),
      fields.map((field) => field.name),
    );
    assert.deepEqual(
      shownFieldsOf(fields, sections, []).map((field) => field.name),
      fields.map((field) => field.name),
    );
  });
});

describe("withSectionShown", () => {
  it("adds the key when the section is hidden and removes it when it is shown again", () => {
    assert.deepEqual(withSectionShown([], "ceremony", false), ["ceremony"]);
    assert.deepEqual(withSectionShown(["ceremony"], "message", false), ["ceremony", "message"]);
    assert.deepEqual(withSectionShown(["ceremony", "message"], "ceremony", true), ["message"]);
    // Turning a section on that is already on, and off that is already off, answer the same list.
    assert.deepEqual(withSectionShown(["ceremony"], "ceremony", true), []);
    assert.deepEqual(withSectionShown(["ceremony"], "ceremony", false), ["ceremony"]);
  });
});

describe("requireOneRefusal", () => {
  it("refuses the key that would leave a set with no shown section, and names the set", () => {
    const sections = omittableSectionsOf(BAPTISM);

    // Either place still carries the invitation while the other one is shown.
    assert.equal(requireOneRefusal(sections, [], "ceremony"), undefined);
    assert.equal(requireOneRefusal(sections, [], "reception"), undefined);
    // The last shown place of the set cannot be switched off.
    assert.deepEqual(requireOneRefusal(sections, ["reception"], "ceremony"), [
      "ceremony",
      "reception",
    ]);
    assert.deepEqual(requireOneRefusal(sections, ["ceremony"], "reception"), [
      "ceremony",
      "reception",
    ]);
    // A group outside a set is always free to go.
    assert.equal(requireOneRefusal(sections, ["ceremony", "reception"], "message"), undefined);
    // A version without the extension refuses nothing.
    assert.equal(requireOneRefusal(NO_OMITTABLE_SECTIONS, [], "ceremony"), undefined);
  });

  it("says why in one Spanish sentence, naming the sections of the set", () => {
    const sections = omittableSectionsOf(BAPTISM);

    assert.equal(
      requireOneNote(sections, ["ceremony", "reception"]),
      EDITOR_COPY.cards.needsOne("Ceremonia o Recepción"),
    );
    assert.equal(
      requireOneNote(sections, ["ceremony", "reception"]),
      "Tu invitación necesita al menos una de estas secciones: Ceremonia o Recepción.",
    );
  });
});
