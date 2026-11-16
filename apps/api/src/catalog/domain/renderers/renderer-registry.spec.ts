import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BIRTHDAY_THEMES } from "./birthday-themes";
import {
  findRenderer,
  listRendererKeys,
  validateTemplateVersionContract,
} from "./renderer-registry";

// The renderer allow-list (M3 T5; S2, S3, S6, S11). Expected messages are literals on purpose. The fixtures
// are a copy of one seeded themed layout pair; they do not import `prisma/seed.ts`.

const KEY = "birthday-poster-01";
const THEME_ISSUE =
  "configuration.theme must be one of: ice-kingdom, rescue-team, spider-hero, classic-mouse, dinosaurs, under-the-sea, fairytale-princess, blocks-and-pixels";

type SchemaFixture = Record<string, unknown>;

/** The mutable `properties` and `required` of a fixture, for tests that edit them. */
function declared(schema: SchemaFixture): Record<string, unknown> {
  return schema.properties as Record<string, unknown>;
}

function requiredOf(schema: SchemaFixture): string[] {
  return schema.required as string[];
}

function definition(schema: SchemaFixture, name: string): Record<string, unknown> {
  return declared(schema)[name] as Record<string, unknown>;
}

function seededSchema(): SchemaFixture {
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
      celebrantName: {
        type: "string",
        title: "Nombre de la persona festejada",
        minLength: 1,
        maxLength: 80,
      },
      age: { type: "integer", title: "Edad", minimum: 1, maximum: 120 },
      date: { type: "string", title: "Fecha", format: "date" },
      time: { type: "string", title: "Hora", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
      location: { type: "string", title: "Lugar", minLength: 1, maxLength: 120 },
      address: { type: "string", title: "Dirección", minLength: 1, maxLength: 200 },
      mainPhoto: { type: "string", title: "Foto principal", format: "uri" },
      message: { type: "string", title: "Mensaje", minLength: 1, maxLength: 500 },
    },
  };
}

function seededConfiguration(): Record<string, unknown> {
  return {
    componentKey: KEY,
    theme: "dinosaurs",
  };
}

function validate(overrides: {
  componentKey?: unknown;
  schema?: unknown;
  configuration?: unknown;
}) {
  return validateTemplateVersionContract({
    componentKey: KEY,
    schema: seededSchema(),
    configuration: seededConfiguration(),
    ...overrides,
  });
}

function withSchema(change: (schema: SchemaFixture) => void): unknown {
  const schema = seededSchema();
  change(schema);
  return schema;
}

function withConfiguration(change: (configuration: Record<string, unknown>) => void): unknown {
  const configuration = seededConfiguration();
  change(configuration);
  return configuration;
}

function issuesOf(result: ReturnType<typeof validate>): string[] {
  assert.equal(result.ok, false, "expected the contract to be refused");
  return result.ok ? [] : result.issues;
}

describe("renderer registry", () => {
  it("lists exactly the eleven registered renderers", () => {
    assert.deepEqual(listRendererKeys(), [
      "birthday-map-01",
      "birthday-poster-01",
      "birthday-story-01",
      "baby-shower-classic-01",
      "baptism-classic-01",
      "xv-arch-01",
      "wedding-arch-01",
      "baptism-arch-01",
      "xv-ornamental-01",
      "wedding-ornamental-01",
      "baptism-ornamental-01",
    ]);
    for (const key of listRendererKeys()) {
      assert.equal(findRenderer(key)?.componentKey, key);
    }
  });

  it("refuses the removed birthday-adventure-01 renderer and its legacy configuration (S11)", () => {
    const legacy = {
      componentKey: "birthday-adventure-01",
      layout: "adventure",
      palette: "ocean",
      typography: "rounded",
      sectionOrder: ["hero", "details", "message"],
    };

    assert.equal(findRenderer("birthday-adventure-01"), undefined);
    assert.deepEqual(
      validateTemplateVersionContract({
        componentKey: "birthday-adventure-01",
        schema: seededSchema(),
        configuration: legacy,
      }),
      {
        ok: false,
        issues: ['componentKey "birthday-adventure-01" is not a registered renderer'],
      },
    );
  });

  it("treats prototype keys and unknown keys as not registered", () => {
    for (const key of [
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      "unknown",
      "",
      "BIRTHDAY-POSTER-01",
    ]) {
      assert.equal(findRenderer(key), undefined, JSON.stringify(key));
    }
  });
});

describe("renderer feature requirements (S6, A1)", () => {
  it("declares requiredFeatureKeys for every registered renderer", () => {
    for (const key of listRendererKeys()) {
      const requiredFeatureKeys = findRenderer(key)?.requiredFeatureKeys;

      assert.ok(Array.isArray(requiredFeatureKeys), `${key} must declare requiredFeatureKeys`);
      assert.equal(new Set(requiredFeatureKeys).size, requiredFeatureKeys.length, key);
      for (const featureKey of requiredFeatureKeys) {
        assert.equal(typeof featureKey, "string", key);
        assert.ok(featureKey.length > 0, key);
      }
    }
  });

  it("requires no feature key for any seeded renderer", () => {
    for (const key of listRendererKeys()) {
      assert.deepEqual(findRenderer(key)?.requiredFeatureKeys, [], key);
    }
  });
});

describe("validateTemplateVersionContract", () => {
  it("accepts the seeded schema and configuration", () => {
    assert.deepEqual(validate({}), { ok: true });
  });

  it("refuses an unregistered componentKey without reading the rest", () => {
    assert.deepEqual(validate({ componentKey: "x", schema: null, configuration: null }), {
      ok: false,
      issues: ['componentKey "x" is not a registered renderer'],
    });
    for (const key of ["__proto__", "constructor", "toString"]) {
      assert.deepEqual(validate({ componentKey: key }), {
        ok: false,
        issues: [`componentKey "${key}" is not a registered renderer`],
      });
    }
  });

  it("refuses a componentKey that is not a string", () => {
    for (const componentKey of [undefined, null, 1, {}, [KEY]]) {
      assert.deepEqual(validate({ componentKey }), {
        ok: false,
        issues: ["componentKey must be a string"],
      });
    }
  });

  it("refuses non-object schema and configuration", () => {
    for (const value of [null, undefined, "text", 1, true, []]) {
      assert.deepEqual(issuesOf(validate({ schema: value })), ["schema must be a JSON object"]);
      assert.deepEqual(issuesOf(validate({ configuration: value })), [
        "configuration must be a JSON object",
      ]);
    }
  });

  describe("configuration", () => {
    it("refuses a componentKey that differs from the version's", () => {
      const configuration = withConfiguration((c) => {
        c.componentKey = "other";
      });
      assert.deepEqual(issuesOf(validate({ configuration })), [
        'configuration.componentKey must equal "birthday-poster-01"',
      ]);
    });

    it("accepts every allowed theme and refuses others", () => {
      for (const theme of BIRTHDAY_THEMES) {
        const configuration = withConfiguration((c) => {
          c.theme = theme;
        });
        assert.deepEqual(validate({ configuration }), { ok: true }, theme);
      }
      for (const theme of ["neon", "", "Ice-Kingdom", 1, null, "__proto__"]) {
        const configuration = withConfiguration((c) => {
          c.theme = theme;
        });
        assert.deepEqual(issuesOf(validate({ configuration })), [THEME_ISSUE], String(theme));
      }
    });

    it("refuses missing and extra configuration keys", () => {
      const missing = withConfiguration((c) => {
        delete c.theme;
      });
      assert.deepEqual(issuesOf(validate({ configuration: missing })), [
        "configuration.theme is required",
      ]);

      const extra = withConfiguration((c) => {
        c.script = "alert(1)";
      });
      assert.deepEqual(issuesOf(validate({ configuration: extra })), [
        "configuration.script is not allowed; allowed keys: componentKey, theme",
      ]);
    });

    it("does not read inherited keys as configuration values", () => {
      const issues = issuesOf(validate({ configuration: {} }));
      assert.deepEqual(issues, [
        "configuration.componentKey is required",
        "configuration.theme is required",
      ]);
    });
  });

  describe("schema", () => {
    it("refuses a wrong $schema, type, or additionalProperties", () => {
      assert.deepEqual(
        issuesOf(
          validate({
            schema: withSchema((s) => {
              s.$schema = "http://json-schema.org/draft-07/schema#";
              s.type = "array";
              s.additionalProperties = true;
            }),
          }),
        ),
        [
          'schema.$schema must be "https://json-schema.org/draft/2020-12/schema"',
          'schema.type must be "object"',
          "schema.additionalProperties must be false",
        ],
      );
    });

    it("refuses a renderer field missing from properties", () => {
      const schema = withSchema((s) => {
        delete declared(s).mainPhoto;
      });
      assert.deepEqual(issuesOf(validate({ schema })), [
        "schema.properties.mainPhoto is required by the renderer and is missing",
        'schema.required lists "mainPhoto", which is not declared in schema.properties',
      ]);
    });

    it("refuses a renderer field missing from required", () => {
      const schema = withSchema((s) => {
        s.required = requiredOf(s).filter((name: string) => name !== "message");
      });
      assert.deepEqual(issuesOf(validate({ schema })), ['schema.required must include "message"']);
    });

    it("refuses a renderer field with the wrong type", () => {
      const schema = withSchema((s) => {
        definition(s, "age").type = "string";
        definition(s, "date").type = "integer";
      });
      assert.deepEqual(issuesOf(validate({ schema })), [
        'schema.properties.age.type must be "integer"',
        'schema.properties.date.type must be "string"',
      ]);
    });

    it("refuses a renderer field that is not an object", () => {
      const schema = withSchema((s) => {
        declared(s).time = "string";
      });
      assert.deepEqual(issuesOf(validate({ schema })), [
        "schema.properties.time must be an object",
      ]);
    });

    it("refuses malformed properties and required", () => {
      assert.deepEqual(
        issuesOf(
          validate({
            schema: withSchema((s) => {
              s.properties = [];
              s.required = "age";
            }),
          }),
        ),
        ["schema.properties must be an object", "schema.required must be an array of strings"],
      );
      assert.deepEqual(
        issuesOf(
          validate({
            schema: withSchema((s) => {
              s.required = [...requiredOf(s), "age"];
            }),
          }),
        ),
        ["schema.required must not contain duplicates"],
      );
    });

    it("allows extra properties only when declared with a primitive type", () => {
      for (const type of ["string", "integer", "number", "boolean"]) {
        const schema = withSchema((s) => {
          declared(s).extra = { type };
        });
        assert.deepEqual(validate({ schema }), { ok: true }, type);
      }

      const refused = withSchema((s) => {
        declared(s).extra = { type: "object" };
        declared(s).untyped = {};
        declared(s).loose = "string";
      });
      assert.deepEqual(issuesOf(validate({ schema: refused })), [
        "schema.properties.extra.type must be one of: string, integer, number, boolean",
        "schema.properties.untyped.type must be one of: string, integer, number, boolean",
        "schema.properties.loose.type must be one of: string, integer, number, boolean",
      ]);
    });

    it("refuses a required name that is not declared", () => {
      const schema = withSchema((s) => {
        s.required = [...requiredOf(s), "ghost"];
      });
      assert.deepEqual(issuesOf(validate({ schema })), [
        'schema.required lists "ghost", which is not declared in schema.properties',
      ]);
    });

    it("does not resolve inherited names as declared fields", () => {
      const schema = withSchema((s) => {
        s.properties = {};
        s.required = [];
      });
      const issues = issuesOf(validate({ schema }));
      assert.equal(issues.length, 16, "8 missing properties and 8 missing required names");
      assert.ok(
        issues.includes("schema.properties.age is required by the renderer and is missing"),
      );
    });
  });
});
