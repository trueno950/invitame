import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BAPTISM_CONTENT_SCHEMA,
  WEDDING_ARCH_CONTENT_SCHEMA,
  XV_ARCH_CONTENT_SCHEMA,
} from "../../../../prisma/catalog-seed";
import { ELEGANT_THEMES } from "./elegant-themes";
import { findRenderer, validateTemplateVersionContract } from "./renderer-registry";

// The second elegant layout, «Ornamental — papelería clásica» (S5): the same eight themes and the same content
// contract as the «Arco y foto» sibling of each occasion, shipped as three allow-listed renderers. Every
// layout takes exactly `{ componentKey, theme }`. Expected messages are literals on purpose. There is no
// separate ornamental schema on purpose: the content fields are imported, so the two layouts of an occasion
// cannot drift apart.

/** The mutable `properties` and `required` of a fixture, for tests that edit them. */
type MutableSchema = {
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties?: unknown;
};

/** One ornamental layout under test: its key, the arch sibling it must agree with, and the seeded schema. */
interface Family {
  readonly componentKey: string;
  readonly siblingKey: string;
  readonly schema: Record<string, unknown>;
  /** A required field of the seeded schema, used for the missing-field refusal. */
  readonly requiredField: string;
  /** An optional field of the seeded schema, used for the optional-in-required refusal. */
  readonly optionalField: string;
  /** A bounded string field of the seeded schema, used for the wrong-type refusal. */
  readonly mistypedField: string;
}

const XV_ORNAMENTAL: Family = {
  componentKey: "xv-ornamental-01",
  siblingKey: "xv-arch-01",
  schema: XV_ARCH_CONTENT_SCHEMA,
  requiredField: "honorSponsors",
  optionalField: "chambelanes",
  mistypedField: "dressCode",
};

const WEDDING_ORNAMENTAL: Family = {
  componentKey: "wedding-ornamental-01",
  siblingKey: "wedding-arch-01",
  schema: WEDDING_ARCH_CONTENT_SCHEMA,
  requiredField: "coupleNameOne",
  optionalField: "hashtag",
  mistypedField: "ceremonyTime",
};

const BAPTISM_ORNAMENTAL: Family = {
  componentKey: "baptism-ornamental-01",
  siblingKey: "baptism-arch-01",
  schema: BAPTISM_CONTENT_SCHEMA,
  requiredField: "ceremonyPlace",
  optionalField: "mainPhoto",
  mistypedField: "parents",
};

const FAMILIES = [XV_ORNAMENTAL, WEDDING_ORNAMENTAL, BAPTISM_ORNAMENTAL] as const;

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

/** Every schema a test feeds to both the ornamental renderer and its arch sibling. */
function schemaVariants(family: Family): (readonly [string, unknown])[] {
  const requiredMissing = editable(family.schema);
  requiredMissing.required = requiredMissing.required.filter(
    (name) => name !== family.requiredField,
  );

  const optionalListed = editable(family.schema);
  optionalListed.required = [...optionalListed.required, family.optionalField];

  const propertyRemoved = editable(family.schema);
  delete propertyRemoved.properties[family.requiredField];

  const sharedPropertyRemoved = editable(family.schema);
  delete sharedPropertyRemoved.properties.message;

  const optionalPropertyRemoved = editable(family.schema);
  delete optionalPropertyRemoved.properties[family.optionalField];

  const mistyped = editable(family.schema);
  (mistyped.properties[family.mistypedField] as Record<string, unknown>).type = "integer";

  const sharedMistyped = editable(family.schema);
  (sharedMistyped.properties.rsvpContact as Record<string, unknown>).type = "integer";

  const openObject = editable(family.schema);
  openObject.additionalProperties = true;

  const wrongDraft = editable(family.schema) as MutableSchema & { $schema: unknown };
  wrongDraft.$schema = "http://json-schema.org/draft-07/schema#";

  return [
    ["seeded schema", family.schema],
    ["required field removed", requiredMissing],
    ["optional field listed as required", optionalListed],
    ["declared property removed", propertyRemoved],
    ["shared property removed", sharedPropertyRemoved],
    ["optional property removed", optionalPropertyRemoved],
    ["declared field mistyped", mistyped],
    ["shared field mistyped", sharedMistyped],
    ["additionalProperties true", openObject],
    ["wrong JSON Schema draft", wrongDraft],
    ["not a JSON object", "schema"],
  ];
}

for (const family of FAMILIES) {
  describe(family.componentKey, () => {
    it("is registered with no required feature key next to its arch sibling", () => {
      const renderer = findRenderer(family.componentKey);
      const sibling = findRenderer(family.siblingKey);

      assert.equal(renderer?.componentKey, family.componentKey);
      assert.deepEqual(renderer?.requiredFeatureKeys, []);
      assert.ok(sibling, `${family.siblingKey} must stay registered`);
      assert.notEqual(renderer, sibling, "the ornamental layout is its own renderer");
    });

    it("accepts the seeded schema with every allowed theme", () => {
      for (const theme of ELEGANT_THEMES) {
        assert.deepEqual(
          validate(family, { configuration: { componentKey: family.componentKey, theme } }),
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

    it("refuses an unknown theme, a non-string theme, and a theme of another line", () => {
      for (const theme of ["neon", "", "Blush-Gold", "dinosaurs", "ice-kingdom", "__proto__"]) {
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
      for (const key of ["layout", "palette", "doubleRule", "script"]) {
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
      for (const value of ["other", family.siblingKey, 1, null, undefined]) {
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

    it("accepts and refuses exactly the content schema of its arch sibling", () => {
      const renderer = findRenderer(family.componentKey);
      const sibling = findRenderer(family.siblingKey);

      assert.ok(renderer && sibling, "both renderers must be registered");

      for (const [label, schema] of schemaVariants(family)) {
        assert.deepEqual(
          renderer.validateSchema(schema),
          sibling.validateSchema(schema),
          `${family.componentKey} vs ${family.siblingKey}: ${label}`,
        );
      }

      assert.deepEqual(renderer.validateSchema(family.schema), [], "the seeded schema is accepted");
    });

    it("refuses the content schema of another occasion", () => {
      for (const other of FAMILIES) {
        if (other.componentKey === family.componentKey) {
          continue;
        }

        assert.ok(
          issuesOf(validate(family, { schema: other.schema })).length > 0,
          `${family.componentKey} must refuse the ${other.componentKey} schema`,
        );
      }
    });
  });
}
