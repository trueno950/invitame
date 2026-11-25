import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BABY_SHOWER_CONTENT_SCHEMA,
  BAPTISM_CONTENT_SCHEMA,
  BIRTHDAY_CONTENT_SCHEMA,
} from "../../../../prisma/catalog-seed";
import { BABY_SHOWER_THEMES } from "./baby-shower-themes";
import { BAPTISM_THEMES } from "./baptism-themes";
import { findRenderer, validateTemplateVersionContract } from "./renderer-registry";

// The baby shower and themed baptism layouts (S13): one layout per occasion, each its own allow-listed
// `componentKey`, its own theme allow-list, and exactly `{ componentKey, theme }` as configuration. Their
// content schemas declare optional fields, which no birthday contract does. Expected messages are literals
// on purpose.

/** One layout family under test: its key, its themes, and the schema the seed publishes for it. */
interface Family {
  readonly componentKey: string;
  readonly themes: readonly string[];
  readonly schema: Record<string, unknown>;
  /** A field the seeded schema declares in `properties` and `required`. */
  readonly requiredField: string;
  /** A field the seeded schema declares in `properties` and keeps out of `required`. */
  readonly optionalField: string;
  /** The declared type of `optionalField`. */
  readonly optionalType: string;
  /** A bounded string field of the seeded schema, for the wrong-type case. */
  readonly mistypedField: string;
}

/** The mutable `properties` and `required` of a fixture, for tests that edit them. */
type MutableSchema = {
  properties: Record<string, unknown>;
  required: string[];
};

const BABY_SHOWER: Family = {
  componentKey: "baby-shower-classic-01",
  themes: BABY_SHOWER_THEMES,
  schema: BABY_SHOWER_CONTENT_SCHEMA,
  requiredField: "hosts",
  optionalField: "genderReveal",
  optionalType: "boolean",
  mistypedField: "rsvpContact",
};

const BAPTISM: Family = {
  componentKey: "baptism-classic-01",
  themes: BAPTISM_THEMES,
  schema: BAPTISM_CONTENT_SCHEMA,
  requiredField: "ceremonyPlace",
  optionalField: "mainPhoto",
  optionalType: "string",
  mistypedField: "parents",
};

function validate(family: Family, overrides: { schema?: unknown; configuration?: unknown } = {}) {
  return validateTemplateVersionContract({
    componentKey: family.componentKey,
    schema: family.schema,
    configuration: { componentKey: family.componentKey, theme: family.themes[0] },
    ...overrides,
  });
}

function issuesOf(result: ReturnType<typeof validate>): string[] {
  assert.equal(result.ok, false, "expected the contract to be refused");
  return result.ok ? [] : result.issues;
}

function editable(schema: Record<string, unknown>): MutableSchema {
  return structuredClone(schema) as MutableSchema;
}

function themeIssue(family: Family): string {
  return `configuration.theme must be one of: ${family.themes.join(", ")}`;
}

it("pins the eight baby shower theme keys in the order the owner chose (S13)", () => {
  assert.deepEqual(
    [...BABY_SHOWER_THEMES],
    [
      "teddy-honey",
      "clouds-stars",
      "baby-safari",
      "hot-air-balloons",
      "boho-rainbow",
      "little-moon",
      "woodland-friends",
      "sweet-bunny",
    ],
  );
});

it("pins the six themed baptism theme keys in the order the owner chose (S13)", () => {
  assert.deepEqual(
    [...BAPTISM_THEMES],
    ["dove-olive", "little-angels", "sky-clouds", "soft-floral", "little-lamb", "star-light"],
  );
});

for (const family of [BABY_SHOWER, BAPTISM]) {
  describe(family.componentKey, () => {
    it("accepts the seeded schema with every allowed theme", () => {
      for (const theme of family.themes) {
        assert.deepEqual(
          validate(family, {
            configuration: { componentKey: family.componentKey, theme },
          }),
          { ok: true },
          theme,
        );
      }
    });

    it("requires componentKey and theme and does not read inherited keys", () => {
      assert.deepEqual(
        issuesOf(validate(family, { configuration: { componentKey: family.componentKey } })),
        ["configuration.theme is required"],
      );

      const inherited = Object.create({
        componentKey: family.componentKey,
        theme: family.themes[0],
      });
      assert.deepEqual(issuesOf(validate(family, { configuration: inherited })), [
        "configuration.componentKey is required",
        "configuration.theme is required",
      ]);
    });

    it("refuses a configuration that is not a JSON object", () => {
      for (const configuration of [null, undefined, "theme", 1, true, [family.themes[0]]]) {
        assert.deepEqual(
          issuesOf(validate(family, { configuration })),
          ["configuration must be a JSON object"],
          JSON.stringify(configuration),
        );
      }
    });

    it("refuses an unknown theme", () => {
      for (const theme of ["neon", "", "Teddy-Honey", "__proto__", "constructor"]) {
        assert.deepEqual(
          issuesOf(
            validate(family, { configuration: { componentKey: family.componentKey, theme } }),
          ),
          [themeIssue(family)],
          theme,
        );
      }
    });

    it("refuses a theme that is not a string", () => {
      for (const theme of [1, null, true, [], {}, [family.themes[0]]]) {
        assert.deepEqual(
          issuesOf(
            validate(family, { configuration: { componentKey: family.componentKey, theme } }),
          ),
          [themeIssue(family)],
          JSON.stringify(theme),
        );
      }
    });

    it("refuses any configuration key other than componentKey and theme", () => {
      for (const key of ["layout", "palette", "fieldOrder", "script"]) {
        assert.deepEqual(
          issuesOf(
            validate(family, {
              configuration: {
                componentKey: family.componentKey,
                theme: family.themes[1],
                [key]: "x",
              },
            }),
          ),
          [`configuration.${key} is not allowed; allowed keys: componentKey, theme`],
          key,
        );
      }
    });

    it("refuses a componentKey that differs from the version's", () => {
      const other = family.componentKey === BABY_SHOWER.componentKey ? BAPTISM : BABY_SHOWER;

      for (const value of ["other", other.componentKey, 1, null, undefined]) {
        assert.deepEqual(
          issuesOf(
            validate(family, {
              configuration: { componentKey: value, theme: family.themes[0] },
            }),
          ),
          [`configuration.componentKey must equal ${JSON.stringify(family.componentKey)}`],
          String(value),
        );
      }
    });

    it("refuses a required field made optional", () => {
      const schema = editable(family.schema);
      schema.required = schema.required.filter((name) => name !== family.requiredField);

      assert.deepEqual(issuesOf(validate(family, { schema })), [
        `schema.required must include ${JSON.stringify(family.requiredField)}`,
      ]);
    });

    it("refuses an optional field declared as required", () => {
      const schema = editable(family.schema);
      schema.required = [...schema.required, family.optionalField];

      assert.deepEqual(issuesOf(validate(family, { schema })), [
        `schema.required must not include ${JSON.stringify(family.optionalField)}`,
      ]);
    });

    it("refuses a declared optional field missing from properties", () => {
      const schema = editable(family.schema);
      delete schema.properties[family.optionalField];

      assert.deepEqual(issuesOf(validate(family, { schema })), [
        `schema.properties.${family.optionalField} is declared by the renderer and is missing`,
      ]);
    });

    it("refuses a declared required field missing from properties", () => {
      const schema = editable(family.schema);
      delete schema.properties[family.requiredField];

      // The themed baptism declares its `ceremony` section over `ceremonyPlace`, so a snapshot that drops the
      // property also names a group field it no longer declares (S8.1).
      assert.deepEqual(issuesOf(validate(family, { schema })), [
        `schema.properties.${family.requiredField} is required by the renderer and is missing`,
        `schema.required lists ${JSON.stringify(family.requiredField)}, which is not declared in schema.properties`,
        ...(family.requiredField === "ceremonyPlace"
          ? [
              'schema["x-omittable"] group "ceremony" names "ceremonyPlace", which the schema does not declare in properties',
            ]
          : []),
      ]);
    });

    it("declares the optional field with its exact type and no minimum length", () => {
      const definition = editable(family.schema).properties[family.optionalField] as Record<
        string,
        unknown
      >;

      assert.equal(definition.type, family.optionalType);
      assert.equal("minLength" in definition, false, "an empty optional value stays valid");
    });

    it("refuses a declared field with the wrong type", () => {
      const schema = editable(family.schema);
      (schema.properties[family.mistypedField] as Record<string, unknown>).type = "integer";

      assert.deepEqual(issuesOf(validate(family, { schema })), [
        `schema.properties.${family.mistypedField}.type must be "string"`,
      ]);
    });

    it("declares no required feature key", () => {
      assert.deepEqual(findRenderer(family.componentKey)?.requiredFeatureKeys, []);
    });
  });
}

describe("optional-field support does not loosen the birthday contracts (S8, S13)", () => {
  const BIRTHDAY_KEYS = ["birthday-map-01", "birthday-poster-01", "birthday-story-01"] as const;
  const BIRTHDAY_FIELDS = [
    "celebrantName",
    "age",
    "date",
    "time",
    "location",
    "address",
    "mainPhoto",
    "message",
  ];

  it("still accepts the seeded birthday schema", () => {
    for (const componentKey of BIRTHDAY_KEYS) {
      assert.deepEqual(
        validateTemplateVersionContract({
          componentKey,
          schema: BIRTHDAY_CONTENT_SCHEMA,
          configuration: { componentKey, theme: "dinosaurs" },
        }),
        { ok: true },
        componentKey,
      );
    }
  });

  it("still requires every birthday field, so none became optional by accident", () => {
    for (const componentKey of BIRTHDAY_KEYS) {
      for (const field of BIRTHDAY_FIELDS) {
        const schema = editable(BIRTHDAY_CONTENT_SCHEMA);
        schema.required = schema.required.filter((name) => name !== field);

        assert.deepEqual(
          validateTemplateVersionContract({
            componentKey,
            schema,
            configuration: { componentKey, theme: "dinosaurs" },
          }),
          { ok: false, issues: [`schema.required must include ${JSON.stringify(field)}`] },
          `${componentKey}/${field}`,
        );
      }
    }
  });
});
