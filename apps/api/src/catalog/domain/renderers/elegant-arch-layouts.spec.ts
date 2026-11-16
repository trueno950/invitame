import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BAPTISM_CONTENT_SCHEMA,
  WEDDING_ARCH_CONTENT_SCHEMA,
  XV_ARCH_CONTENT_SCHEMA,
} from "../../../../prisma/catalog-seed";
import { ELEGANT_THEMES } from "./elegant-themes";
import { findRenderer, validateTemplateVersionContract } from "./renderer-registry";

// The elegant line for XV años, weddings, and formal baptism (S3, S4): one visual layout, «Arco y foto»,
// shipped as three allow-listed renderers because each occasion has its own content schema. Every layout
// takes exactly `{ componentKey, theme }` over the shared eight-theme allow-list, and the formal baptism
// reuses the themed baptism schema exactly so no published invitation has to migrate. Expected messages are
// literals on purpose.

const TIME_PATTERN = "^([01]\\d|2[0-3]):[0-5]\\d$";
const ONE_NAME_PER_LINE = "Un nombre por línea.";

/** The Spanish display name of every elegant theme, in the board's order (S4). */
const ELEGANT_THEME_NAMES: Readonly<Record<string, string>> = {
  "blush-gold": "Rosa empolvado y oro",
  "ivory-black": "Marfil y negro",
  "midnight-gold": "Azul medianoche y oro",
  "olive-cream": "Verde olivo y crema",
  champagne: "Champaña",
  "lavender-silver": "Lavanda y plata",
  "terracotta-sage": "Terracota y salvia",
  "burgundy-gold": "Borgoña y oro",
};

/** One declared field and the bounds, format, and note the schema must declare for it. */
type Limits = Record<string, unknown>;

const XV_ARCH_LIMITS: Readonly<Record<string, Limits>> = {
  celebrantName: { minLength: 1, maxLength: 80 },
  date: { format: "date" },
  parents: { minLength: 1, maxLength: 400, description: ONE_NAME_PER_LINE },
  honorSponsors: { minLength: 1, maxLength: 400, description: ONE_NAME_PER_LINE },
  ceremonyPlace: { minLength: 1, maxLength: 120 },
  ceremonyAddress: { minLength: 1, maxLength: 200 },
  ceremonyTime: { pattern: TIME_PATTERN },
  receptionPlace: { minLength: 1, maxLength: 120 },
  receptionAddress: { minLength: 1, maxLength: 200 },
  receptionTime: { pattern: TIME_PATTERN },
  dressCode: { minLength: 1, maxLength: 120 },
  message: { minLength: 1, maxLength: 500 },
  rsvpContact: { minLength: 1, maxLength: 120 },
  chambelanes: { maxLength: 400, description: ONE_NAME_PER_LINE },
  giftRegistry: { maxLength: 200 },
  mainPhoto: { format: "uri" },
};

const WEDDING_ARCH_LIMITS: Readonly<Record<string, Limits>> = {
  coupleNameOne: { minLength: 1, maxLength: 80 },
  coupleNameTwo: { minLength: 1, maxLength: 80 },
  date: { format: "date" },
  ceremonyPlace: { minLength: 1, maxLength: 120 },
  ceremonyAddress: { minLength: 1, maxLength: 200 },
  ceremonyTime: { pattern: TIME_PATTERN },
  receptionPlace: { minLength: 1, maxLength: 120 },
  receptionAddress: { minLength: 1, maxLength: 200 },
  receptionTime: { pattern: TIME_PATTERN },
  dressCode: { minLength: 1, maxLength: 120 },
  message: { minLength: 1, maxLength: 500 },
  rsvpContact: { minLength: 1, maxLength: 120 },
  firstFamilyParents: { maxLength: 400, description: ONE_NAME_PER_LINE },
  secondFamilyParents: { maxLength: 400, description: ONE_NAME_PER_LINE },
  weddingSponsors: { maxLength: 400, description: ONE_NAME_PER_LINE },
  giftRegistry: { maxLength: 200 },
  mainPhoto: { format: "uri" },
  hashtag: { maxLength: 60 },
};

/** One elegant layout family under test: its key, its seeded schema, and the bounds it must declare. */
interface Family {
  readonly componentKey: string;
  readonly schema: Record<string, unknown>;
  readonly limits: Readonly<Record<string, Limits>>;
  readonly required: readonly string[];
  /** A required field of the seeded schema, used for the missing-field refusal. */
  readonly requiredField: string;
  /** An optional field of the seeded schema, used for the optional-in-required refusal. */
  readonly optionalField: string;
  /** The declared type of `optionalField`. */
  readonly optionalType: string;
  /** A bounded string field of the seeded schema, used for the wrong-type refusal. */
  readonly mistypedField: string;
}

const XV_ARCH: Family = {
  componentKey: "xv-arch-01",
  schema: XV_ARCH_CONTENT_SCHEMA,
  limits: XV_ARCH_LIMITS,
  required: [
    "celebrantName",
    "date",
    "parents",
    "honorSponsors",
    "ceremonyPlace",
    "ceremonyAddress",
    "ceremonyTime",
    "receptionPlace",
    "receptionAddress",
    "receptionTime",
    "dressCode",
    "message",
    "rsvpContact",
  ],
  requiredField: "honorSponsors",
  optionalField: "chambelanes",
  optionalType: "string",
  mistypedField: "dressCode",
};

const WEDDING_ARCH: Family = {
  componentKey: "wedding-arch-01",
  schema: WEDDING_ARCH_CONTENT_SCHEMA,
  limits: WEDDING_ARCH_LIMITS,
  required: [
    "coupleNameOne",
    "coupleNameTwo",
    "date",
    "ceremonyPlace",
    "ceremonyAddress",
    "ceremonyTime",
    "receptionPlace",
    "receptionAddress",
    "receptionTime",
    "dressCode",
    "message",
    "rsvpContact",
  ],
  requiredField: "coupleNameOne",
  optionalField: "hashtag",
  optionalType: "string",
  mistypedField: "ceremonyTime",
};

/** The baptism family reuses the themed baptism schema, so its bounds are that schema's own. */
const BAPTISM_ARCH: Family = {
  componentKey: "baptism-arch-01",
  schema: BAPTISM_CONTENT_SCHEMA,
  limits: {},
  required: BAPTISM_CONTENT_SCHEMA.required as string[],
  requiredField: "ceremonyPlace",
  optionalField: "mainPhoto",
  optionalType: "string",
  mistypedField: "parents",
};

const FAMILIES = [XV_ARCH, WEDDING_ARCH, BAPTISM_ARCH] as const;

/** The mutable `properties` and `required` of a fixture, for tests that edit them. */
type MutableSchema = {
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties?: unknown;
};

function validate(family: Family, overrides: { schema?: unknown; configuration?: unknown } = {}) {
  return validateTemplateVersionContract({
    componentKey: family.componentKey,
    schema: family.schema,
    configuration: { componentKey: family.componentKey, theme: ELEGANT_THEMES[0] },
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

function themeIssue(): string {
  return `configuration.theme must be one of: ${ELEGANT_THEMES.join(", ")}`;
}

/** The bounds, format, and note a property declares, ignoring the other JSON Schema keywords. */
const BOUND_KEYS = ["minLength", "maxLength", "pattern", "format", "description"] as const;

function boundsOf(definition: Record<string, unknown>): Limits {
  return Object.fromEntries(
    BOUND_KEYS.filter((key) => key in definition).map((key) => [key, definition[key]]),
  );
}

it("pins the eight elegant theme keys in the order the owner chose (S4)", () => {
  assert.deepEqual(
    [...ELEGANT_THEMES],
    [
      "blush-gold",
      "ivory-black",
      "midnight-gold",
      "olive-cream",
      "champagne",
      "lavender-silver",
      "terracotta-sage",
      "burgundy-gold",
    ],
  );

  for (const theme of ELEGANT_THEMES) {
    assert.ok(ELEGANT_THEME_NAMES[theme], theme);
  }
});

for (const family of FAMILIES) {
  describe(family.componentKey, () => {
    it("is registered with no required feature key", () => {
      assert.equal(findRenderer(family.componentKey)?.componentKey, family.componentKey);
      assert.deepEqual(findRenderer(family.componentKey)?.requiredFeatureKeys, []);
    });

    it("accepts the seeded schema with every allowed theme", () => {
      for (const theme of ELEGANT_THEMES) {
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
        theme: ELEGANT_THEMES[0],
      });
      assert.deepEqual(issuesOf(validate(family, { configuration: inherited })), [
        "configuration.componentKey is required",
        "configuration.theme is required",
      ]);
    });

    it("refuses a configuration that is not a JSON object", () => {
      for (const configuration of [null, undefined, "theme", 1, true, [ELEGANT_THEMES[0]]]) {
        assert.deepEqual(
          issuesOf(validate(family, { configuration })),
          ["configuration must be a JSON object"],
          JSON.stringify(configuration),
        );
      }
    });

    it("refuses an unknown theme, a non-string theme, and a theme of another occasion", () => {
      for (const theme of [
        "neon",
        "",
        "Blush-Gold",
        "dinosaurs",
        "dove-olive",
        "__proto__",
        "constructor",
      ]) {
        assert.deepEqual(
          issuesOf(
            validate(family, { configuration: { componentKey: family.componentKey, theme } }),
          ),
          [themeIssue()],
          theme,
        );
      }

      for (const theme of [1, null, true, [], {}, [ELEGANT_THEMES[0]]]) {
        assert.deepEqual(
          issuesOf(
            validate(family, { configuration: { componentKey: family.componentKey, theme } }),
          ),
          [themeIssue()],
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
                theme: ELEGANT_THEMES[1],
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
      for (const value of ["other", "birthday-map-01", "xv-arch", 1, null, undefined]) {
        assert.deepEqual(
          issuesOf(
            validate(family, {
              configuration: { componentKey: value, theme: ELEGANT_THEMES[0] },
            }),
          ),
          [`configuration.componentKey must equal ${JSON.stringify(family.componentKey)}`],
          String(value),
        );
      }
    });

    it("declares the agreed fields in properties and required", () => {
      const schema = family.schema as MutableSchema;

      assert.deepEqual(schema.required, [...family.required]);

      const expectedProperties =
        family.componentKey === BAPTISM_ARCH.componentKey
          ? Object.keys(BAPTISM_CONTENT_SCHEMA.properties)
          : Object.keys(family.limits);

      assert.deepEqual(
        Object.keys(schema.properties).sort(),
        [...expectedProperties].sort(),
        "declared properties",
      );
    });

    it("declares the agreed bounds and notes for every field", () => {
      const properties = (family.schema as MutableSchema).properties as Record<
        string,
        Record<string, unknown>
      >;

      for (const [name, limits] of Object.entries(family.limits)) {
        assert.deepEqual(boundsOf(properties[name] ?? {}), limits, name);
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

    it("refuses a declared field missing from properties", () => {
      const requiredMissing = editable(family.schema);
      delete requiredMissing.properties[family.requiredField];
      assert.deepEqual(issuesOf(validate(family, { schema: requiredMissing })), [
        `schema.properties.${family.requiredField} is required by the renderer and is missing`,
        `schema.required lists ${JSON.stringify(family.requiredField)}, which is not declared in schema.properties`,
      ]);

      const optionalMissing = editable(family.schema);
      delete optionalMissing.properties[family.optionalField];
      assert.deepEqual(issuesOf(validate(family, { schema: optionalMissing })), [
        `schema.properties.${family.optionalField} is declared by the renderer and is missing`,
      ]);
    });

    it("declares the optional field with its exact type and no minimum length", () => {
      const properties = (family.schema as MutableSchema).properties as Record<
        string,
        Record<string, unknown>
      >;
      const definition = properties[family.optionalField] ?? {};

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
  });
}

describe("formal baptism reuses the themed baptism schema (S4)", () => {
  const themed = findRenderer("baptism-classic-01");
  const formal = findRenderer("baptism-arch-01");

  it("accepts the themed baptism schema and refuses exactly what that layout refuses", () => {
    assert.ok(themed && formal, "both baptism renderers must be registered");

    const schemas: unknown[] = [BAPTISM_CONTENT_SCHEMA];
    const mutations: ((schema: MutableSchema) => void)[] = [
      (schema) => {
        schema.required = schema.required.filter((name) => name !== "godparents");
      },
      (schema) => {
        schema.required = [...schema.required, "mainPhoto"];
      },
      (schema) => {
        delete schema.properties.giftRegistry;
      },
      (schema) => {
        (schema.properties.message as Record<string, unknown>).type = "integer";
      },
      (schema) => {
        schema.additionalProperties = true;
      },
    ];
    for (const mutate of mutations) {
      const schema = editable(BAPTISM_CONTENT_SCHEMA);
      mutate(schema);
      schemas.push(schema);
    }

    for (const schema of schemas) {
      assert.deepEqual(
        formal.validateSchema(schema),
        themed.validateSchema(schema),
        JSON.stringify(schema).slice(0, 120),
      );
    }
  });
});
