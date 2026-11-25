import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONTENT_SECTION_FAMILIES,
  type ContentSectionFamily,
  contentSectionFamilyOf,
  extendSchemaWithOmittableSections,
  OMITTABLE_SECTIONS_BY_FAMILY,
  omittableSectionsExtension,
  omittedSectionsProperty,
} from "./omittable-section-groups";
import { OMITTED_SECTIONS_PROPERTY, parseOmittableSections } from "./omittable-sections";
import { listRendererKeys } from "./renderers/renderer-registry";

// The omittable-section data of the catalog (S8.4): which groups each published line may switch off, which
// sets must keep one group shown, and how a version schema gains them. Expected values are literals on
// purpose: they are the owner's decision, and a drift must fail here.

/** The groups and require-one sets of each line, exactly as S8.4 lists them. */
const EXPECTED: Readonly<
  Record<ContentSectionFamily, { groups: [string, string[]][]; requireOne: string[][] }>
> = {
  birthday: {
    groups: [
      ["age", ["age"]],
      ["mainPhoto", ["mainPhoto"]],
      ["message", ["message"]],
    ],
    requireOne: [],
  },
  babyShower: {
    groups: [
      ["message", ["message"]],
      ["rsvpContact", ["rsvpContact"]],
    ],
    requireOne: [],
  },
  baptism: {
    groups: [
      ["parents", ["parents"]],
      ["godparents", ["godparents"]],
      ["ceremony", ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"]],
      ["reception", ["receptionPlace", "receptionAddress", "receptionTime"]],
      ["message", ["message"]],
      ["rsvpContact", ["rsvpContact"]],
    ],
    requireOne: [["ceremony", "reception"]],
  },
  xv: {
    groups: [
      ["parents", ["parents"]],
      ["honorSponsors", ["honorSponsors"]],
      ["ceremony", ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"]],
      ["reception", ["receptionPlace", "receptionAddress", "receptionTime"]],
      ["dressCode", ["dressCode"]],
      ["message", ["message"]],
      ["rsvpContact", ["rsvpContact"]],
    ],
    requireOne: [["ceremony", "reception"]],
  },
  wedding: {
    groups: [
      ["ceremony", ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"]],
      ["reception", ["receptionPlace", "receptionAddress", "receptionTime"]],
      ["dressCode", ["dressCode"]],
      ["message", ["message"]],
      ["rsvpContact", ["rsvpContact"]],
    ],
    requireOne: [["ceremony", "reception"]],
  },
};

/** The fields that can never be switched off, per line (S3, S8.4). */
const ESSENTIALS: Readonly<Record<ContentSectionFamily, readonly string[]>> = {
  birthday: ["celebrantName", "date", "time", "location", "address"],
  babyShower: ["hosts", "date", "time", "location", "address"],
  baptism: ["celebrantName", "date"],
  xv: ["celebrantName", "date"],
  wedding: ["coupleNameOne", "coupleNameTwo", "date"],
};

/** A schema that declares the shape of the line but no extension, as every version had it before S8. */
function baseSchemaOf(family: ContentSectionFamily): Record<string, unknown> {
  const sections = EXPECTED[family];
  const fields = [
    ...ESSENTIALS[family],
    ...sections.groups.flatMap(([, groupFields]) => groupFields),
  ];

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: [...fields],
    properties: Object.fromEntries(
      fields.map((name) => [name, { type: "string", maxLength: 200 }]),
    ),
  };
}

describe("the groups of each published line (S8.4)", () => {
  it("declares exactly the agreed groups, fields, and require-one sets", () => {
    for (const family of CONTENT_SECTION_FAMILIES) {
      const sections = OMITTABLE_SECTIONS_BY_FAMILY[family];

      assert.deepEqual(
        sections.groups.map((group) => [group.key, [...group.fields]]),
        EXPECTED[family].groups,
        family,
      );
      assert.deepEqual(
        sections.requireOne.map((set) => [...set]),
        EXPECTED[family].requireOne,
        family,
      );
    }
  });

  it("never makes an essential omittable", () => {
    for (const family of CONTENT_SECTION_FAMILIES) {
      const covered = new Set(
        OMITTABLE_SECTIONS_BY_FAMILY[family].groups.flatMap((group) => group.fields),
      );

      for (const name of ESSENTIALS[family]) {
        assert.equal(covered.has(name), false, `${family}/${name}`);
      }
    }
  });

  it("keeps at least one place shown on every line that announces two places", () => {
    for (const family of ["baptism", "xv", "wedding"] as const) {
      const keys = new Set(OMITTABLE_SECTIONS_BY_FAMILY[family].groups.map((group) => group.key));

      assert.deepEqual(OMITTABLE_SECTIONS_BY_FAMILY[family].requireOne, [
        ["ceremony", "reception"],
      ]);
      for (const set of OMITTABLE_SECTIONS_BY_FAMILY[family].requireOne) {
        for (const key of set) {
          assert.equal(keys.has(key), true, `${family}/${key}`);
        }
      }
    }
  });
});

describe("contentSectionFamilyOf", () => {
  it("answers the section family of every registered renderer", () => {
    const expected: Readonly<Record<string, ContentSectionFamily>> = {
      "birthday-map-01": "birthday",
      "birthday-poster-01": "birthday",
      "birthday-story-01": "birthday",
      "baby-shower-classic-01": "babyShower",
      "baptism-classic-01": "baptism",
      "baptism-arch-01": "baptism",
      "baptism-ornamental-01": "baptism",
      "xv-arch-01": "xv",
      "xv-ornamental-01": "xv",
      "wedding-arch-01": "wedding",
      "wedding-ornamental-01": "wedding",
    };

    assert.deepEqual([...listRendererKeys()].sort(), Object.keys(expected).sort());
    for (const [componentKey, family] of Object.entries(expected)) {
      assert.equal(contentSectionFamilyOf(componentKey), family, componentKey);
    }
  });

  it("answers null for a key that is not a catalog renderer", () => {
    for (const componentKey of ["", "unknown-01", "__proto__", "constructor", "toString"]) {
      assert.equal(contentSectionFamilyOf(componentKey), null, componentKey);
    }
  });
});

describe("omittableSectionsExtension", () => {
  it("declares the extension as plain JSON data", () => {
    assert.deepEqual(omittableSectionsExtension("babyShower"), {
      "x-omittable": [
        { key: "message", fields: ["message"] },
        { key: "rsvpContact", fields: ["rsvpContact"] },
      ],
      "x-require-one": [],
    });
  });

  it("declares the content property with the group keys in their declared order", () => {
    assert.deepEqual(omittedSectionsProperty("baptism"), {
      type: "array",
      items: {
        type: "string",
        enum: ["parents", "godparents", "ceremony", "reception", "message", "rsvpContact"],
      },
      uniqueItems: true,
    });
  });
});

describe("extendSchemaWithOmittableSections", () => {
  it("adds the extension to the schema it is given and keeps every existing declaration", () => {
    for (const family of CONTENT_SECTION_FAMILIES) {
      const base = baseSchemaOf(family);

      assert.deepEqual(extendSchemaWithOmittableSections(base, family), {
        ok: true,
        value: {
          ...base,
          ...omittableSectionsExtension(family),
          properties: {
            ...(base.properties as Record<string, unknown>),
            [OMITTED_SECTIONS_PROPERTY]: omittedSectionsProperty(family),
          },
        },
      });
    }
  });

  it("produces a schema the contract accepts, with the family's own groups", () => {
    for (const family of CONTENT_SECTION_FAMILIES) {
      const extended = extendSchemaWithOmittableSections(baseSchemaOf(family), family);

      assert.equal(extended.ok, true, family);
      if (!extended.ok) {
        continue;
      }
      assert.deepEqual(parseOmittableSections(extended.value), {
        ok: true,
        value: OMITTABLE_SECTIONS_BY_FAMILY[family],
      });
    }
  });

  it("does not mutate the schema it is given", () => {
    const base = baseSchemaOf("birthday");
    const before = structuredClone(base);

    extendSchemaWithOmittableSections(base, "birthday");

    assert.deepEqual(base, before);
  });

  it("refuses a schema that is not a JSON object or declares no properties", () => {
    for (const schema of [null, "schema", 1, [], {}, { properties: [] }, { properties: "x" }]) {
      assert.deepEqual(
        extendSchemaWithOmittableSections(schema, "birthday"),
        { ok: false, issues: ["schema.properties must be an object"] },
        JSON.stringify(schema),
      );
    }
  });
});
