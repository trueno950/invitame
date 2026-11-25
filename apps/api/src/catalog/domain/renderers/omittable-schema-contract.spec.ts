import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { omittedSectionsDeclaration, parseOmittableSections } from "../omittable-sections";
import { validateTemplateVersionContract } from "./renderer-registry";

// The renderer contract with omittable sections (S8.1, S8.2): a version that declares `x-omittable` may store
// `omittedSections`, a list property no renderer reads, and its extension is validated at the same moment as the
// rest of the snapshot. A version that declares no extension keeps exactly the contract it had: an array
// property is still refused, because the primitive-type rule is unchanged. Expected messages are literals.

const KEY = "birthday-map-01";

const SECTIONS = {
  groups: [
    { key: "age", fields: ["age"] },
    { key: "mainPhoto", fields: ["mainPhoto"] },
    { key: "message", fields: ["message"] },
  ],
  requireOne: [],
};

type SchemaFixture = Record<string, unknown>;

/** The seeded birthday shape: eight required fields and nothing else. */
function schema(): SchemaFixture {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: [
      "celebrantName",
      "age",
      "date",
      "time",
      "location",
      "address",
      "mainPhoto",
      "message",
    ],
    properties: {
      celebrantName: { type: "string", minLength: 1, maxLength: 80 },
      age: { type: "integer", minimum: 1, maximum: 120 },
      date: { type: "string", format: "date" },
      time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
      location: { type: "string", minLength: 1, maxLength: 120 },
      address: { type: "string", minLength: 1, maxLength: 200 },
      mainPhoto: { type: "string", format: "uri" },
      message: { type: "string", minLength: 1, maxLength: 500 },
    },
  };
}

/** The same schema with the birthday extension, as every new version stores it. */
function extendedSchema(): SchemaFixture {
  const base = schema();

  return {
    ...base,
    "x-omittable": SECTIONS.groups.map((group) => ({ key: group.key, fields: [...group.fields] })),
    "x-require-one": [],
    properties: {
      ...(base.properties as Record<string, unknown>),
      omittedSections: omittedSectionsDeclaration(SECTIONS),
    },
  };
}

function validate(schemaOrKey: unknown, componentKey: string = KEY) {
  return validateTemplateVersionContract({
    componentKey,
    schema: schemaOrKey,
    configuration: { componentKey, theme: "dinosaurs" },
  });
}

function issuesOf(result: ReturnType<typeof validate>): readonly string[] {
  assert.equal(result.ok, false, "expected the contract to be refused");
  return result.ok ? [] : result.issues;
}

describe("a version with omittable sections", () => {
  it("is accepted with the extension and the omittedSections property", () => {
    assert.deepEqual(validate(extendedSchema()), { ok: true });
    assert.deepEqual(parseOmittableSections(extendedSchema()), { ok: true, value: SECTIONS });
  });

  it("keeps every renderer field required, so a shown section still needs its values", () => {
    const withoutRequired = extendedSchema();
    withoutRequired.required = (withoutRequired.required as string[]).filter(
      (name) => name !== "message",
    );

    assert.deepEqual(issuesOf(validate(withoutRequired)), [
      'schema.required must include "message"',
    ]);
  });

  it("refuses a group field the renderer does not read", () => {
    const withExtra = extendedSchema();
    (withExtra.properties as SchemaFixture).giftRegistry = { type: "string", maxLength: 200 };
    (withExtra["x-omittable"] as SchemaFixture[])[2] = {
      key: "message",
      fields: ["message", "giftRegistry"],
    };
    withExtra.properties = {
      ...(withExtra.properties as SchemaFixture),
      omittedSections: omittedSectionsDeclaration({
        groups: [
          { key: "age", fields: ["age"] },
          { key: "mainPhoto", fields: ["mainPhoto"] },
          { key: "message", fields: ["message", "giftRegistry"] },
        ],
        requireOne: [],
      }),
    };

    assert.deepEqual(issuesOf(validate(withExtra)), [
      'schema["x-omittable"] group "message" names "giftRegistry", which the renderer does not read',
    ]);
  });

  it("refuses an extension the contract cannot read", () => {
    const duplicated = extendedSchema();
    (duplicated["x-omittable"] as SchemaFixture[])[2] = { key: "message", fields: ["age"] };

    assert.deepEqual(issuesOf(validate(duplicated)), [
      'schema["x-omittable"] group "message" names "age", which already belongs to group "age"',
    ]);
  });

  it("refuses an omittedSections property the extension does not declare as the full key list", () => {
    const wrongEnum = extendedSchema();
    (wrongEnum.properties as SchemaFixture).omittedSections = {
      type: "array",
      items: { type: "string", enum: ["age"] },
      uniqueItems: true,
    };

    assert.deepEqual(issuesOf(validate(wrongEnum)), [
      'schema.properties.omittedSections.items.enum must be ["age","mainPhoto","message"]',
    ]);
  });
});

describe("a version without omittable sections", () => {
  it("keeps exactly the contract it had: the seeded schema is still accepted", () => {
    assert.deepEqual(validate(schema()), { ok: true });
    assert.deepEqual(parseOmittableSections(schema()), { ok: true, value: null });
  });

  it("still refuses an array property no renderer declares", () => {
    const withArray = schema();
    (withArray.properties as SchemaFixture).omittedSections = {
      type: "array",
      items: { type: "string", enum: ["age"] },
      uniqueItems: true,
    };

    assert.deepEqual(issuesOf(validate(withArray)), [
      "schema.properties.omittedSections.type must be one of: string, integer, number, boolean",
    ]);
  });
});
