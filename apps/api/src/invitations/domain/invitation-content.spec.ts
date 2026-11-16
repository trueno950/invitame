import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BABY_SHOWER_CONTENT_SCHEMA,
  BAPTISM_CONTENT_SCHEMA,
  BIRTHDAY_CONTENT_SCHEMA,
} from "../../../prisma/catalog-seed";
import {
  DEFAULT_MAX_CONTENT_STRING_LENGTH,
  missingRequiredFields,
  validateDraftContent,
} from "./invitation-content";

// Partial draft content against the pinned `TemplateVersion` schema (M4 T2, T7; S7, S11, A3). A draft may be
// incomplete and is never required to satisfy `required`; each provided field must be declared by the
// pinned schema and satisfy the rules that schema declares for it, and the whole object stays bounded.
// Values are validated, never transformed. The expected messages are literals on purpose.

/** A generic pinned schema: five declared properties, two of them required, none of them formatted. */

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

  it("enforces the inclusive minimum and maximum an integer declares (S11: no negative age)", () => {
    const schema = {
      type: "object",
      required: [],
      properties: { age: { type: "integer", minimum: 1, maximum: 120 } },
    };

    for (const age of [1, 120]) {
      assert.deepEqual(validateDraftContent(schema, { age }), { ok: true, value: { age } });
    }
    const refused: [number, string][] = [
      [0, "content.age must be at least 1"],
      [-5, "content.age must be at least 1"],
      [121, "content.age must be at most 120"],
    ];

    for (const [age, expected] of refused) {
      assert.deepEqual(issuesOf(schema, { age }), [expected], String(age));
    }
  });

  it("enforces the numeric exclusive bounds a number declares and ignores any other shape", () => {
    const exclusive = {
      type: "object",
      required: [],
      properties: { ratio: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1 } },
    };

    assert.deepEqual(validateDraftContent(exclusive, { ratio: 0.5 }), {
      ok: true,
      value: { ratio: 0.5 },
    });
    assert.deepEqual(issuesOf(exclusive, { ratio: 0 }), ["content.ratio must be greater than 0"]);
    assert.deepEqual(issuesOf(exclusive, { ratio: -0.5 }), [
      "content.ratio must be greater than 0",
    ]);
    assert.deepEqual(issuesOf(exclusive, { ratio: 1 }), ["content.ratio must be less than 1"]);

    // The draft-04 boolean form and a bound that is not a number declare no rule this validation enforces.
    const legacy = {
      type: "object",
      required: [],
      properties: { ratio: { type: "number", minimum: 0, exclusiveMinimum: true, maximum: "1" } },
    };

    for (const ratio of [0, 5]) {
      assert.deepEqual(validateDraftContent(legacy, { ratio }), { ok: true, value: { ratio } });
    }
  });

  it("enforces the minLength the pinned schema declares, counted in code points", () => {
    const schema = {
      type: "object",
      required: [],
      properties: { celebrantName: { type: "string", minLength: 1, maxLength: 2 } },
    };

    for (const celebrantName of ["A", "😀", "😀😀"]) {
      assert.deepEqual(validateDraftContent(schema, { celebrantName }), {
        ok: true,
        value: { celebrantName },
      });
    }
    assert.deepEqual(issuesOf(schema, { celebrantName: "" }), [
      "content.celebrantName must be a string of at least 1 character",
    ]);
    assert.deepEqual(issuesOf(schema, { celebrantName: "😀😀😀" }), [
      "content.celebrantName must be a string of at most 2 characters",
    ]);

    const longer = {
      type: "object",
      required: [],
      properties: { note: { type: "string", minLength: 2 } },
    };

    assert.deepEqual(issuesOf(longer, { note: "a" }), [
      "content.note must be a string of at least 2 characters",
    ]);
  });

  it("enforces the pattern the pinned schema declares for a string", () => {
    const schema = {
      type: "object",
      required: [],
      properties: { time: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" } },
    };

    assert.deepEqual(validateDraftContent(schema, { time: "18:30" }), {
      ok: true,
      value: { time: "18:30" },
    });
    for (const time of ["24:00", "6:30", ""]) {
      assert.deepEqual(
        issuesOf(schema, { time }),
        ["content.time must match the pattern ^([01]\\d|2[0-3]):[0-5]\\d$"],
        time,
      );
    }
  });

  it("fails closed when the pinned schema declares a pattern that does not compile", () => {
    for (const pattern of ["(", "[", 42, null, {}]) {
      const schema = {
        type: "object",
        required: [],
        properties: { time: { type: "string", pattern } },
      };

      assert.deepEqual(
        issuesOf(schema, { time: "18:30" }),
        ["content.time is declared with an invalid pattern in the template version schema"],
        JSON.stringify(pattern),
      );
    }
  });

  it("enforces the date format the pinned schema declares as a real calendar date", () => {
    const schema = {
      type: "object",
      required: [],
      properties: { date: { type: "string", format: "date" } },
    };

    for (const date of ["2026-02-28", "2024-02-29", "2026-12-31"]) {
      assert.deepEqual(validateDraftContent(schema, { date }), { ok: true, value: { date } });
    }
    for (const date of ["2026-02-30", "2026-02-29", "28/02/2026", "2026-2-28", " 2026-02-28", ""]) {
      assert.deepEqual(
        issuesOf(schema, { date }),
        ["content.date must be a calendar date as YYYY-MM-DD"],
        date,
      );
    }
  });

  it("enforces the uri format the pinned schema declares as an absolute http or https URL", () => {
    const schema = {
      type: "object",
      required: [],
      properties: { mainPhoto: { type: "string", format: "uri" } },
    };

    for (const mainPhoto of [
      "https://cdn.example.test/ana.jpg",
      "http://example.test/foto.jpg?x=1#y",
    ]) {
      assert.deepEqual(validateDraftContent(schema, { mainPhoto }), {
        ok: true,
        value: { mainPhoto },
      });
    }
    for (const mainPhoto of [
      "ftp://example.test/foto.jpg",
      "foto.jpg",
      "/foto.jpg",
      "example.test",
      "",
    ]) {
      assert.deepEqual(
        issuesOf(schema, { mainPhoto }),
        ["content.mainPhoto must be an absolute http or https URL"],
        mainPhoto,
      );
    }
  });

  it("enforces the time format when the pinned schema declares it", () => {
    const schema = {
      type: "object",
      required: [],
      properties: { time: { type: "string", format: "time" } },
    };

    for (const time of ["18:30", "00:00", "23:59", "18:30:00", "23:59:59"]) {
      assert.deepEqual(validateDraftContent(schema, { time }), { ok: true, value: { time } });
    }
    for (const time of ["24:00", "6:30", "18:60", "18:30:60", "18:30:00.000", ""]) {
      assert.deepEqual(
        issuesOf(schema, { time }),
        ["content.time must be a time as HH:MM or HH:MM:SS"],
        time,
      );
    }
  });

  it("ignores a format the pinned schema declares that draft validation does not implement", () => {
    const schema = {
      type: "object",
      required: [],
      properties: { email: { type: "string", format: "email" } },
    };

    assert.deepEqual(validateDraftContent(schema, { email: "not-an-email" }), {
      ok: true,
      value: { email: "not-an-email" },
    });
  });

  it("reports every rule one string violates in a fixed order", () => {
    const schema = {
      type: "object",
      required: [],
      properties: {
        code: { type: "string", minLength: 3, maxLength: 5, pattern: "^[a-c]+$", format: "date" },
      },
    };

    assert.deepEqual(issuesOf(schema, { code: "xy" }), [
      "content.code must be a string of at least 3 characters",
      "content.code must match the pattern ^[a-c]+$",
      "content.code must be a calendar date as YYYY-MM-DD",
    ]);
  });

  it("refuses every field of a birthday draft the seeded schema's rules reject", () => {
    const content = {
      celebrantName: "",
      age: 0,
      date: "not-a-date",
      time: "99:99",
      mainPhoto: "not-a-uri",
    };

    assert.deepEqual(issuesOf(BIRTHDAY_CONTENT_SCHEMA, content), [
      "content.celebrantName must be a string of at least 1 character",
      "content.age must be at least 1",
      "content.date must be a calendar date as YYYY-MM-DD",
      "content.time must match the pattern ^([01]\\d|2[0-3]):[0-5]\\d$",
      "content.mainPhoto must be an absolute http or https URL",
    ]);
  });

  it("still accepts an incomplete birthday draft because required is not enforced", () => {
    for (const content of [
      {},
      { age: 120 },
      { time: "18:30" },
      { mainPhoto: "https://a.test/b.jpg" },
    ]) {
      assert.deepEqual(validateDraftContent(BIRTHDAY_CONTENT_SCHEMA, content), {
        ok: true,
        value: content,
      });
    }
  });

  it("validates a real birthday draft against the seeded birthday content schema", () => {
    const content = {
      celebrantName: "Ana",
      age: 9,
      date: "2026-12-05",
      time: "18:30",
      location: "Salón Aurora",
      address: "Calle 12 #34-56",
      mainPhoto: "https://cdn.example.test/ana.jpg",
      message: "Te espero para celebrar.",
    };

    assert.deepEqual(validateDraftContent(BIRTHDAY_CONTENT_SCHEMA, content), {
      ok: true,
      value: content,
    });
  });

  it("refuses each invalid field of a birthday draft against the seeded schema", () => {
    const valid = {
      celebrantName: "Ana",
      age: 9,
      date: "2026-12-05",
      time: "18:30",
      location: "Salón Aurora",
      address: "Calle 12 #34-56",
      mainPhoto: "https://cdn.example.test/ana.jpg",
      message: "Te espero para celebrar.",
    };
    const timePattern = "content.time must match the pattern ^([01]\\d|2[0-3]):[0-5]\\d$";
    const cases: [string, unknown, string][] = [
      ["celebrantName", "", "content.celebrantName must be a string of at least 1 character"],
      [
        "celebrantName",
        "a".repeat(81),
        "content.celebrantName must be a string of at most 80 characters",
      ],
      ["age", -5, "content.age must be at least 1"],
      ["age", 0, "content.age must be at least 1"],
      ["age", 121, "content.age must be at most 120"],
      ["date", "2026-02-30", "content.date must be a calendar date as YYYY-MM-DD"],
      ["date", "28/02/2026", "content.date must be a calendar date as YYYY-MM-DD"],
      ["time", "24:00", timePattern],
      ["time", "6:30", timePattern],
      ["location", "", "content.location must be a string of at least 1 character"],
      ["address", "", "content.address must be a string of at least 1 character"],
      [
        "mainPhoto",
        "ftp://example.test/ana.jpg",
        "content.mainPhoto must be an absolute http or https URL",
      ],
      ["mainPhoto", "ana.jpg", "content.mainPhoto must be an absolute http or https URL"],
      ["message", "", "content.message must be a string of at least 1 character"],
      ["message", "a".repeat(501), "content.message must be a string of at most 500 characters"],
    ];

    for (const [key, value, expected] of cases) {
      assert.deepEqual(
        issuesOf(BIRTHDAY_CONTENT_SCHEMA, { ...valid, [key]: value }),
        [expected],
        `${key}=${String(value)}`,
      );
    }
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
    assert.deepEqual(missingRequiredFields(BIRTHDAY_CONTENT_SCHEMA, { celebrantName: "Ana" }), [
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

describe("baby shower and baptism content with optional fields (S13)", () => {
  const COMPLETE_BABY_SHOWER = {
    hosts: "Ana y Luis",
    date: "2027-03-14",
    time: "17:00",
    location: "Casa de la familia",
    address: "Calle 1",
    message: "Te esperamos",
    rsvpContact: "Ana",
  };

  it("accepts a baby shower draft that omits every optional field", () => {
    assert.deepEqual(validateDraftContent(BABY_SHOWER_CONTENT_SCHEMA, COMPLETE_BABY_SHOWER), {
      ok: true,
      value: COMPLETE_BABY_SHOWER,
    });
  });

  it("accepts an optional boolean and an optional text, and keeps both out of the required list", () => {
    const content = { genderReveal: false, giftRegistry: "Tienda Luna, código 1234" };

    assert.deepEqual(validateDraftContent(BABY_SHOWER_CONTENT_SCHEMA, content), {
      ok: true,
      value: content,
    });
    assert.deepEqual(missingRequiredFields(BABY_SHOWER_CONTENT_SCHEMA, COMPLETE_BABY_SHOWER), []);
  });

  it("refuses a non-boolean gender reveal and a mistyped required baptism field", () => {
    assert.deepEqual(issuesOf(BABY_SHOWER_CONTENT_SCHEMA, { genderReveal: "sorpresa" }), [
      "content.genderReveal must be a boolean",
    ]);
    assert.deepEqual(issuesOf(BAPTISM_CONTENT_SCHEMA, { parents: 42 }), [
      "content.parents must be a string of at most 160 characters",
    ]);
  });
});
