import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  legacyGiftRegistryHiddenFields,
  projectPublicContent,
  publicHiddenFields,
} from "./invitation-public";

// The public projection of a published invitation (A7; S8.2, S8.3). The projection copies only the keys the
// pinned schema declares, and since T3 it also withholds the values of the fields an omitted section covers:
// the guest page hides that block, so its text never has to travel to a browser. `hiddenFields` names those
// fields so the web layout knows which block not to draw, and a version without the extension hides nothing.

/** The four content properties of the fixture, and the extension that makes `message` omittable. */
const SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["celebrantName", "date"],
  "x-omittable": [
    { key: "reception", fields: ["receptionPlace", "receptionAddress"] },
    { key: "message", fields: ["message"] },
  ],
  "x-require-one": [["reception", "message"]],
  properties: {
    celebrantName: { type: "string", maxLength: 80 },
    date: { type: "string" },
    receptionPlace: { type: "string", maxLength: 120 },
    receptionAddress: { type: "string", maxLength: 200 },
    message: { type: "string", maxLength: 500 },
    omittedSections: {
      type: "array",
      items: { type: "string", enum: ["reception", "message"] },
      uniqueItems: true,
    },
  },
};

/** The same schema as every version published before T2 stores it: no extension at all. */
const SCHEMA_WITHOUT_SECTIONS = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["celebrantName", "date"],
  properties: {
    celebrantName: { type: "string", maxLength: 80 },
    date: { type: "string" },
  },
};

describe("publicHiddenFields", () => {
  it("names the fields of every omitted group, in the order the schema declares them", () => {
    assert.deepEqual(
      publicHiddenFields(SCHEMA, {
        celebrantName: "Ana",
        date: "2027-03-14",
        receptionPlace: "Jardín",
        receptionAddress: "Calle 1",
        message: "Te esperamos",
        omittedSections: ["reception"],
      }),
      ["receptionPlace", "receptionAddress"],
    );
    assert.deepEqual(publicHiddenFields(SCHEMA, { omittedSections: ["message", "reception"] }), [
      "receptionPlace",
      "receptionAddress",
      "message",
    ]);
  });

  it("answers no hidden field when nothing is omitted or the version declares no extension", () => {
    assert.deepEqual(publicHiddenFields(SCHEMA, { celebrantName: "Ana", date: "2027-03-14" }), []);
    assert.deepEqual(publicHiddenFields(SCHEMA, { omittedSections: [] }), []);
    assert.deepEqual(
      publicHiddenFields(SCHEMA_WITHOUT_SECTIONS, { omittedSections: ["message"] }),
      [],
    );
  });

  it("answers no hidden field for a key the extension does not declare", () => {
    assert.deepEqual(publicHiddenFields(SCHEMA, { omittedSections: ["godparents"] }), []);
  });
});

describe("projectPublicContent", () => {
  it("keeps every declared key and withholds the values of the hidden fields", () => {
    const content = {
      celebrantName: "Ana",
      date: "2027-03-14",
      receptionPlace: "Jardín",
      receptionAddress: "Calle 1",
      message: "Te esperamos",
      omittedSections: ["reception"],
    };

    assert.deepEqual(
      projectPublicContent(SCHEMA, content, ["receptionPlace", "receptionAddress"]),
      {
        celebrantName: "Ana",
        date: "2027-03-14",
        message: "Te esperamos",
        omittedSections: ["reception"],
      },
    );
  });

  it("copies every declared value when the version hides nothing", () => {
    assert.deepEqual(projectPublicContent(SCHEMA, { celebrantName: "Ana", date: "2027-03-14" }), {
      celebrantName: "Ana",
      date: "2027-03-14",
    });
  });

  it("still withholds every key the pinned schema does not declare", () => {
    assert.deepEqual(
      projectPublicContent(SCHEMA, { celebrantName: "Ana", guestSecret: "do not render" }, [
        "date",
      ]),
      { celebrantName: "Ana" },
    );
  });
});

describe("legacyGiftRegistryHiddenFields", () => {
  const REGISTRY = {
    stores: [{ name: "Liverpool", url: "https://x.mx/1" }],
    transfer: null,
    envelopes: false,
    note: null,
  };

  it("adds the legacy gift registry field while the structured registry shows (F2; L4.3)", () => {
    assert.deepEqual(legacyGiftRegistryHiddenFields([], REGISTRY), ["giftRegistry"]);
    assert.deepEqual(legacyGiftRegistryHiddenFields(["message"], REGISTRY), [
      "message",
      "giftRegistry",
    ]);
  });

  it("changes nothing for an empty registry or a field it already names", () => {
    assert.deepEqual(legacyGiftRegistryHiddenFields([], null), []);
    assert.deepEqual(legacyGiftRegistryHiddenFields(["giftRegistry"], REGISTRY), ["giftRegistry"]);
    assert.deepEqual(legacyGiftRegistryHiddenFields(["message"], null), ["message"]);
  });

  it("answers a copy, so the omitted sections of one read never leak into another", () => {
    const omitted = ["message"];
    const hidden = legacyGiftRegistryHiddenFields(omitted, REGISTRY);

    hidden.push("otra");
    assert.deepEqual(omitted, ["message"]);
  });
});
