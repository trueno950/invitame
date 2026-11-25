import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OMITTED_SECTIONS_PROPERTY,
  type OmittableSections,
  omittedSectionsDeclaration,
  parseOmittableSections,
} from "./omittable-sections";

// The omittable-section contract of a template version schema (S8.1, S8.2): `x-omittable` lists the groups a
// customer may switch off, `x-require-one` the group-key sets of which at least one must stay shown, and the
// content property `omittedSections` stores the omitted keys. Expected messages are literals on purpose.

/** The declarations of a version with two places, a message, and one require-one set. */
const DECLARATIONS: OmittableSections = {
  groups: [
    { key: "ceremony", fields: ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"] },
    { key: "reception", fields: ["receptionPlace", "receptionAddress", "receptionTime"] },
    { key: "message", fields: ["message"] },
  ],
  requireOne: [["ceremony", "reception"]],
};

type SchemaFixture = Record<string, unknown>;

/** Every field of the fixture, all of them required, so a group field names a real property. */
const FIELDS = [
  "celebrantName",
  "date",
  "ceremonyPlace",
  "ceremonyAddress",
  "ceremonyTime",
  "receptionPlace",
  "receptionAddress",
  "receptionTime",
  "message",
];

/** The schema of a version that declares no omittable section: exactly the shape every version had before. */
function baseSchema(): SchemaFixture {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: [...FIELDS],
    properties: Object.fromEntries(
      FIELDS.map((name) => [name, { type: "string", maxLength: 200 }]),
    ),
  };
}

/** The schema of a version that declares `DECLARATIONS`, which the parser must accept. */
function extendedSchema(): SchemaFixture {
  const schema = baseSchema();

  return {
    ...schema,
    "x-omittable": DECLARATIONS.groups.map((group) => ({
      key: group.key,
      fields: [...group.fields],
    })),
    "x-require-one": DECLARATIONS.requireOne.map((set) => [...set]),
    properties: {
      ...(schema.properties as Record<string, unknown>),
      [OMITTED_SECTIONS_PROPERTY]: omittedSectionsDeclaration(DECLARATIONS),
    },
  };
}

/** The issues of a schema, asserting the parser refused it. */
function issuesOf(schema: unknown): readonly string[] {
  const parsed = parseOmittableSections(schema);

  assert.equal(parsed.ok, false, "expected the contract to be refused");
  return parsed.ok ? [] : parsed.issues;
}

describe("parseOmittableSections", () => {
  it("accepts a schema that declares the groups, the require-one sets, and the content property", () => {
    assert.deepEqual(parseOmittableSections(extendedSchema()), {
      ok: true,
      value: DECLARATIONS,
    });
  });

  it("answers no require-one set when the version declares none", () => {
    const schema = extendedSchema();
    delete (schema as SchemaFixture)["x-require-one"];

    assert.deepEqual(parseOmittableSections(schema), {
      ok: true,
      value: { groups: DECLARATIONS.groups, requireOne: [] },
    });
  });

  it("answers no declarations for a version that declares no extension", () => {
    assert.deepEqual(parseOmittableSections(baseSchema()), { ok: true, value: null });
    assert.deepEqual(
      parseOmittableSections({ ...baseSchema(), "x-require-one": [] }),
      { ok: true, value: null },
      "an empty require-one list declares nothing",
    );
  });

  it("refuses a schema that is not a JSON object", () => {
    for (const schema of [null, undefined, [], "schema", 1, true]) {
      assert.deepEqual(issuesOf(schema), ["schema must be a JSON object"], JSON.stringify(schema));
    }
  });
});

describe("x-omittable", () => {
  it("refuses a list that is not an array of objects", () => {
    for (const declared of [null, "ceremony", 1, true, { key: "ceremony" }]) {
      const schema = { ...extendedSchema(), "x-omittable": declared };

      assert.deepEqual(issuesOf(schema), [
        'schema["x-omittable"] must be an array of { key, fields } objects',
      ]);
    }
  });

  it("refuses an entry that is not an object with exactly key and fields", () => {
    for (const entry of [null, "ceremony", 1, [], { key: "ceremony" }, { fields: ["message"] }]) {
      const schema = extendedSchema();
      (schema["x-omittable"] as unknown[])[0] = entry;

      assert.deepEqual(issuesOf(schema), [
        'schema["x-omittable"][0] must be an object with exactly key and fields',
      ]);
    }

    const extraKey = extendedSchema();
    (extraKey["x-omittable"] as unknown[])[0] = {
      key: "ceremony",
      fields: ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"],
      title: "Ceremonia",
    };

    assert.deepEqual(issuesOf(extraKey), [
      'schema["x-omittable"][0] must be an object with exactly key and fields',
    ]);
  });

  it("refuses a group key that is not a stable English identifier", () => {
    for (const key of [
      "",
      "Ceremony",
      "ceremony-time",
      "ceremony place",
      "ceremonyPlace_",
      1,
      null,
    ]) {
      const schema = extendedSchema();
      (schema["x-omittable"] as SchemaFixture[])[0] = {
        key,
        fields: ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"],
      };

      assert.deepEqual(
        issuesOf(schema),
        ['schema["x-omittable"][0].key must be a stable English identifier, such as ceremony'],
        String(key),
      );
    }
  });

  it("refuses fields that are not a non-empty list of property names", () => {
    for (const fields of [[], "message", [1], [null], [""], null, undefined]) {
      const schema = extendedSchema();
      (schema["x-omittable"] as SchemaFixture[])[0] = { key: "ceremony", fields };

      assert.deepEqual(
        issuesOf(schema),
        ['schema["x-omittable"][0].fields must be a non-empty array of content property names'],
        JSON.stringify(fields),
      );
    }
  });

  it("refuses a field repeated inside one group", () => {
    const schema = extendedSchema();
    (schema["x-omittable"] as SchemaFixture[])[2] = {
      key: "message",
      fields: ["message", "message"],
    };

    assert.deepEqual(issuesOf(schema), [
      'schema["x-omittable"][2].fields must not repeat "message"',
    ]);
  });

  it("refuses a repeated group key", () => {
    const schema = extendedSchema();
    (schema["x-omittable"] as unknown[])[1] = {
      key: "ceremony",
      fields: ["receptionPlace", "receptionAddress", "receptionTime"],
    };

    assert.deepEqual(issuesOf(schema), ['schema["x-omittable"][1].key repeats "ceremony"']);
  });

  it("refuses a group field the schema does not declare in properties", () => {
    const schema = extendedSchema();
    (schema["x-omittable"] as SchemaFixture[])[2] = { key: "message", fields: ["closingNote"] };

    assert.deepEqual(issuesOf(schema), [
      'schema["x-omittable"] group "message" names "closingNote", which the schema does not declare in properties',
    ]);
  });

  it("refuses a field that belongs to two groups", () => {
    const schema = extendedSchema();
    (schema["x-omittable"] as SchemaFixture[])[2] = {
      key: "message",
      fields: ["ceremonyPlace"],
    };

    assert.deepEqual(issuesOf(schema), [
      'schema["x-omittable"] group "message" names "ceremonyPlace", which already belongs to group "ceremony"',
    ]);
  });

  it("refuses a schema whose properties is not an object", () => {
    const schema = extendedSchema();
    schema.properties = [];

    assert.deepEqual(issuesOf(schema), ["schema.properties must be an object"]);
  });
});

describe("x-require-one", () => {
  it("refuses a list that is not an array of group-key lists", () => {
    for (const declared of [null, "ceremony", 1, ["ceremony"]]) {
      const schema = { ...extendedSchema(), "x-require-one": declared };

      assert.deepEqual(issuesOf(schema), [
        'schema["x-require-one"] must be an array of group-key lists',
      ]);
    }
  });

  it("refuses a set that names fewer than two group keys", () => {
    for (const set of [[], ["ceremony"], [1, 2], [null, "reception"]]) {
      const schema = { ...extendedSchema(), "x-require-one": [set] };

      assert.deepEqual(
        issuesOf(schema),
        ['schema["x-require-one"][0] must name at least two group keys'],
        JSON.stringify(set),
      );
    }
  });

  it("refuses a key repeated inside one set", () => {
    const schema = { ...extendedSchema(), "x-require-one": [["ceremony", "ceremony"]] };

    assert.deepEqual(issuesOf(schema), ['schema["x-require-one"][0] must not repeat "ceremony"']);
  });

  it("refuses a key that is not an x-omittable key", () => {
    const schema = { ...extendedSchema(), "x-require-one": [["ceremony", "address"]] };

    assert.deepEqual(issuesOf(schema), [
      'schema["x-require-one"][0] names "address", which is not an x-omittable key',
    ]);
  });

  it("refuses a repeated set", () => {
    const schema = {
      ...extendedSchema(),
      "x-require-one": [
        ["ceremony", "reception"],
        ["reception", "ceremony"],
      ],
    };

    assert.deepEqual(issuesOf(schema), [
      'schema["x-require-one"][1] repeats the set "reception,ceremony"',
    ]);
  });

  it("refuses a require-one set on a version that declares no x-omittable group", () => {
    const schema = { ...baseSchema(), "x-require-one": [["ceremony", "reception"]] };

    assert.deepEqual(issuesOf(schema), [
      'schema["x-require-one"] must be empty when the version declares no x-omittable group',
    ]);
  });
});

describe("omittedSections property", () => {
  it("declares the group keys in their declared order as a unique list", () => {
    assert.deepEqual(omittedSectionsDeclaration(DECLARATIONS), {
      type: "array",
      items: { type: "string", enum: ["ceremony", "reception", "message"] },
      uniqueItems: true,
    });
  });

  it("is required when a version declares groups", () => {
    const schema = extendedSchema();
    delete (schema.properties as SchemaFixture)[OMITTED_SECTIONS_PROPERTY];

    assert.deepEqual(issuesOf(schema), [
      "schema.properties.omittedSections must declare the omitted group keys",
    ]);
  });

  it("refuses a declaration that is not an object", () => {
    for (const declared of [null, "age", [], 1]) {
      const schema = extendedSchema();
      (schema.properties as SchemaFixture)[OMITTED_SECTIONS_PROPERTY] = declared;

      assert.deepEqual(issuesOf(schema), ["schema.properties.omittedSections must be an object"]);
    }
  });

  it("refuses a declaration that is not an array", () => {
    const schema = extendedSchema();
    (schema.properties as SchemaFixture)[OMITTED_SECTIONS_PROPERTY] = {
      ...omittedSectionsDeclaration(DECLARATIONS),
      type: "string",
    };

    assert.deepEqual(issuesOf(schema), ['schema.properties.omittedSections.type must be "array"']);
  });

  it("refuses a list that accepts repeated keys", () => {
    const schema = extendedSchema();
    (schema.properties as SchemaFixture)[OMITTED_SECTIONS_PROPERTY] = {
      ...omittedSectionsDeclaration(DECLARATIONS),
      uniqueItems: false,
    };

    assert.deepEqual(issuesOf(schema), [
      "schema.properties.omittedSections.uniqueItems must be true",
    ]);
  });

  it("refuses an items declaration without the group keys", () => {
    for (const items of [null, {}, { enum: "ceremony" }, { enum: [1, 2] }]) {
      const schema = extendedSchema();
      (schema.properties as SchemaFixture)[OMITTED_SECTIONS_PROPERTY] = {
        type: "array",
        items,
        uniqueItems: true,
      };

      assert.deepEqual(
        issuesOf(schema),
        ["schema.properties.omittedSections.items must declare the group keys in enum"],
        JSON.stringify(items),
      );
    }
  });

  it("refuses an enum that does not name exactly the group keys", () => {
    for (const keys of [
      ["ceremony", "reception"],
      ["ceremony", "reception", "message", "age"],
    ]) {
      const schema = extendedSchema();
      (schema.properties as SchemaFixture)[OMITTED_SECTIONS_PROPERTY] = {
        type: "array",
        items: { type: "string", enum: keys },
        uniqueItems: true,
      };

      assert.deepEqual(issuesOf(schema), [
        'schema.properties.omittedSections.items.enum must be ["ceremony","reception","message"]',
      ]);
    }
  });

  it("refuses a content property listed as required", () => {
    const schema = extendedSchema();
    schema.required = [...FIELDS, OMITTED_SECTIONS_PROPERTY];

    assert.deepEqual(issuesOf(schema), ['schema.required must not include "omittedSections"']);
  });
});
