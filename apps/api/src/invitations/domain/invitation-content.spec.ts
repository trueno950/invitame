import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_MAX_CONTENT_STRING_LENGTH,
  missingRequiredFields,
  validateDraftContent,
} from "./invitation-content";

// Partial draft content against the pinned `TemplateVersion` schema (M4 T2; S7, A3). A draft may be
// incomplete and is never required to satisfy `required`; each provided field must be declared by the
// pinned schema and match its declared primitive type, and the whole object stays bounded. Values are
// validated, never transformed. The expected messages are literals on purpose.

const BIRTHDAY_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["celebrantName", "age", "date", "time", "location", "address", "mainPhoto", "message"],
  properties: {
    celebrantName: { type: "string", title: "Nombre", minLength: 1, maxLength: 80 },
    age: { type: "integer", title: "Edad", minimum: 1, maximum: 120 },
    date: { type: "string", title: "Fecha", format: "date" },
    time: { type: "string", title: "Hora", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
    location: { type: "string", title: "Lugar", maxLength: 120 },
    address: { type: "string", title: "Dirección", maxLength: 200 },
    mainPhoto: { type: "string", title: "Foto principal", format: "uri" },
    message: { type: "string", title: "Mensaje", maxLength: 500 },
  },
};

/** A small pinned schema: five declared properties, two of them required. */
function draftSchema(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["title", "age"],
    properties: {
      title: { type: "string", maxLength: 10 },
      age: { type: "integer" },
      note: { type: "string" },
      ratio: { type: "number" },
      visible: { type: "boolean" },
    },
  };
}

function issuesOf(schema: unknown, content: unknown): string[] {
  const result = validateDraftContent(schema, content);
  assert.equal(result.ok, false, "expected the draft content to be refused");
  return result.ok ? [] : result.issues;
}

describe("validateDraftContent", () => {
  it("accepts an empty draft and returns the very object it validated", () => {
    const content = {};

    const result = validateDraftContent(draftSchema(), content);

    assert.deepEqual(result, { ok: true, value: {} });
    assert.equal(result.ok && result.value, content);
  });

  it("accepts an incomplete draft because required fields are not enforced", () => {
    for (const content of [{}, { title: "Cumple" }, { age: 30 }, { visible: false }]) {
      assert.deepEqual(validateDraftContent(draftSchema(), content), { ok: true, value: content });
    }
  });

  it("refuses content that is not a plain JSON object", () => {
    const notObjects: unknown[] = [
      null,
      undefined,
      [],
      ["title"],
      "title",
      42,
      true,
      new Date(),
      new Map(),
      () => "title",
    ];

    for (const content of notObjects) {
      assert.deepEqual(issuesOf(draftSchema(), content), ["content must be a JSON object"]);
    }
  });

  it("refuses a schema that does not declare its properties and required names", () => {
    const bothIssues = [
      "schema.properties must be an object",
      "schema.required must be an array of strings",
    ];
    const cases: [unknown, string[]][] = [
      [null, bothIssues],
      [undefined, bothIssues],
      [[], bothIssues],
      [{}, bothIssues],
      [{ properties: [] }, bothIssues],
      [{ properties: {}, required: "title" }, ["schema.required must be an array of strings"]],
      [{ properties: {}, required: ["title", 1] }, ["schema.required must be an array of strings"]],
    ];

    for (const [schema, expected] of cases) {
      assert.deepEqual(issuesOf(schema, { title: "Cumple" }), expected, JSON.stringify(schema));
    }
  });

  it("refuses a key the pinned schema does not declare", () => {
    assert.deepEqual(issuesOf(draftSchema(), { title: "Cumple", extra: "x" }), [
      "content.extra is not declared in the template version schema",
    ]);
  });

  it("does not resolve inherited names as declared properties", () => {
    const inherited = JSON.parse('{"__proto__": {"title": "Cumple"}}') as unknown;

    assert.deepEqual(issuesOf(draftSchema(), inherited), [
      "content.__proto__ is not declared in the template version schema",
    ]);
    assert.deepEqual(issuesOf(draftSchema(), { constructor: "x" }), [
      "content.constructor is not declared in the template version schema",
    ]);
    assert.deepEqual(issuesOf(draftSchema(), { toString: "x" }), [
      "content.toString is not declared in the template version schema",
    ]);
  });

  it("refuses a value whose type the pinned schema does not declare", () => {
    const cases: [unknown, string][] = [
      [{ title: 1 }, "content.title must be a string of at most 10 characters"],
      [{ title: null }, "content.title must be a string of at most 10 characters"],
      [{ age: "30" }, "content.age must be an integer"],
      [{ age: 1.5 }, "content.age must be an integer"],
      [{ age: true }, "content.age must be an integer"],
      [{ ratio: "1.5" }, "content.ratio must be a number"],
      [{ visible: "true" }, "content.visible must be a boolean"],
      [{ visible: 0 }, "content.visible must be a boolean"],
    ];

    for (const [content, expected] of cases) {
      assert.deepEqual(issuesOf(draftSchema(), content), [expected], JSON.stringify(content));
    }
  });

  it("accepts every declared primitive type", () => {
    const content = {
      title: "Cumple",
      age: 30,
      note: "",
      ratio: 0.5,
      visible: false,
    };

    assert.deepEqual(validateDraftContent(draftSchema(), content), { ok: true, value: content });
  });

  it("bounds an integer to a safe integer", () => {
    assert.deepEqual(validateDraftContent(draftSchema(), { age: 2 ** 40 }), {
      ok: true,
      value: { age: 2 ** 40 },
    });
    assert.deepEqual(validateDraftContent(draftSchema(), { age: Number.MAX_SAFE_INTEGER }), {
      ok: true,
      value: { age: Number.MAX_SAFE_INTEGER },
    });
    for (const age of [
      Number.MAX_SAFE_INTEGER + 1,
      2 ** 53,
      1e300,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1.5,
    ]) {
      assert.deepEqual(
        issuesOf(draftSchema(), { age }),
        ["content.age must be an integer"],
        String(age),
      );
    }
  });

  it("bounds a number to a finite number", () => {
    for (const ratio of [0, -12, 2.5, 1e300]) {
      assert.deepEqual(validateDraftContent(draftSchema(), { ratio }), {
        ok: true,
        value: { ratio },
      });
    }
    for (const ratio of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null]) {
      assert.deepEqual(
        issuesOf(draftSchema(), { ratio }),
        ["content.ratio must be a number"],
        String(ratio),
      );
    }
  });

  it("bounds a string by the maxLength the pinned schema declares, counted in code points", () => {
    for (const title of ["a".repeat(10), "😀".repeat(10)]) {
      assert.deepEqual(validateDraftContent(draftSchema(), { title }), {
        ok: true,
        value: { title },
      });
    }
    for (const title of ["a".repeat(11), "😀".repeat(11)]) {
      assert.deepEqual(issuesOf(draftSchema(), { title }), [
        "content.title must be a string of at most 10 characters",
      ]);
    }
  });

  it("bounds a string without a declared maxLength to the default", () => {
    assert.equal(DEFAULT_MAX_CONTENT_STRING_LENGTH, 2000);
    assert.deepEqual(validateDraftContent(draftSchema(), { note: "a".repeat(2000) }), {
      ok: true,
      value: { note: "a".repeat(2000) },
    });
    assert.deepEqual(issuesOf(draftSchema(), { note: "a".repeat(2001) }), [
      "content.note must be a string of at most 2000 characters",
    ]);
  });

  it("bounds the number of keys to the properties the pinned schema declares", () => {
    const content = { title: "Cumple", age: 30, note: "", ratio: 1, visible: true, extra: 1 };

    assert.deepEqual(issuesOf(draftSchema(), content), [
      "content has 6 keys; the template version schema declares 5",
    ]);
  });

  it("refuses a declared property whose type it cannot validate", () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        photo: { type: "object" },
        loose: "string",
        untyped: {},
        title: { type: "string" },
      },
    };

    assert.deepEqual(issuesOf(schema, { photo: { url: "x" } }), [
      "content.photo is declared with an unsupported type in the template version schema",
    ]);
    assert.deepEqual(issuesOf(schema, { loose: "x" }), [
      "content.loose is declared with an unsupported type in the template version schema",
    ]);
    assert.deepEqual(issuesOf(schema, { untyped: "x" }), [
      "content.untyped is declared with an unsupported type in the template version schema",
    ]);
    assert.deepEqual(validateDraftContent(schema, { title: "x" }), {
      ok: true,
      value: { title: "x" },
    });
  });

  it("reports every invalid provided value in content key order", () => {
    assert.deepEqual(issuesOf(draftSchema(), { visible: "yes", ratio: "no", age: "30" }), [
      "content.visible must be a boolean",
      "content.ratio must be a number",
      "content.age must be an integer",
    ]);
  });

  it("validates without transforming the values it accepts", () => {
    const content = { title: "  Cumple  ", note: "  ", age: 30 };

    const result = validateDraftContent(draftSchema(), content);

    assert.deepEqual(result, { ok: true, value: { title: "  Cumple  ", note: "  ", age: 30 } });
    assert.equal(result.ok && result.value.title, "  Cumple  ");
  });

  it("accepts values that only violate a format, pattern, minimum, or minLength (S7: drafts may be partial)", () => {
    const content = {
      celebrantName: "",
      age: 0,
      date: "not-a-date",
      time: "99:99",
      mainPhoto: "not-a-uri",
    };

    assert.deepEqual(validateDraftContent(BIRTHDAY_SCHEMA, content), { ok: true, value: content });
  });

  it("validates a real birthday draft against the seeded birthday-adventure schema", () => {
    const content = { celebrantName: "Ana", age: 9, message: "a".repeat(500) };

    assert.deepEqual(validateDraftContent(BIRTHDAY_SCHEMA, content), { ok: true, value: content });
    assert.deepEqual(issuesOf(BIRTHDAY_SCHEMA, { message: "a".repeat(501) }), [
      "content.message must be a string of at most 500 characters",
    ]);
  });
});

describe("missingRequiredFields", () => {
  it("lists every required field the draft does not provide, in schema order", () => {
    assert.deepEqual(missingRequiredFields(draftSchema(), {}), ["title", "age"]);
    assert.deepEqual(missingRequiredFields(draftSchema(), { age: 30 }), ["title"]);
    assert.deepEqual(missingRequiredFields(draftSchema(), { title: "Cumple" }), ["age"]);
    assert.deepEqual(missingRequiredFields(draftSchema(), { title: "Cumple", age: 30 }), []);
  });

  it("counts a provided field as present even when its value is invalid", () => {
    assert.deepEqual(missingRequiredFields(draftSchema(), { title: 1, age: "30" }), []);
  });

  it("lists every required field when the content is not an object", () => {
    for (const content of [null, undefined, [], "title", 42]) {
      assert.deepEqual(missingRequiredFields(draftSchema(), content), ["title", "age"]);
    }
  });

  it("returns nothing when the schema does not declare its required names", () => {
    for (const schema of [null, {}, { properties: [] }, { required: "title" }]) {
      assert.deepEqual(missingRequiredFields(schema, {}), []);
    }
  });

  it("does not resolve inherited names as provided fields", () => {
    assert.deepEqual(missingRequiredFields(draftSchema(), { constructor: "x" }), ["title", "age"]);
    assert.deepEqual(missingRequiredFields(draftSchema(), { age: 30, toString: "x" }), ["title"]);
  });

  it("ignores provided keys the schema does not require", () => {
    assert.deepEqual(missingRequiredFields(draftSchema(), { note: "hola" }), ["title", "age"]);
  });

  it("reports the incomplete fields of a real birthday draft", () => {
    assert.deepEqual(missingRequiredFields(BIRTHDAY_SCHEMA, { celebrantName: "Ana" }), [
      "age",
      "date",
      "time",
      "location",
      "address",
      "mainPhoto",
      "message",
    ]);
  });
});
