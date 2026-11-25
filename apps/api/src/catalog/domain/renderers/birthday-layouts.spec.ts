import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BIRTHDAY_CONTENT_SCHEMA } from "../../../../prisma/catalog-seed";
import { BIRTHDAY_THEMES } from "./birthday-themes";
import { findRenderer, validateTemplateVersionContract } from "./renderer-registry";

// The three birthday layouts the owner chose (S7, S8): each one is its own allow-listed `componentKey`,
// shares the eight birthday content fields, and takes exactly `{ componentKey, theme }` as configuration.
// Expected messages are literals on purpose.

const THEME_ISSUE =
  "configuration.theme must be one of: ice-kingdom, rescue-team, spider-hero, classic-mouse, dinosaurs, under-the-sea, fairytale-princess, blocks-and-pixels";
const LAYOUT_KEYS = ["birthday-map-01", "birthday-poster-01", "birthday-story-01"] as const;

type SchemaFixture = {
  properties: Record<string, unknown>;
  required: string[];
};

function validate(input: { componentKey: string; schema?: unknown; configuration?: unknown }) {
  const { componentKey } = input;

  return validateTemplateVersionContract({
    componentKey,
    schema: "schema" in input ? input.schema : BIRTHDAY_CONTENT_SCHEMA,
    configuration:
      "configuration" in input ? input.configuration : { componentKey, theme: BIRTHDAY_THEMES[0] },
  });
}

function issuesOf(result: ReturnType<typeof validate>): string[] {
  assert.equal(result.ok, false, "expected the contract to be refused");
  return result.ok ? [] : result.issues;
}

function schemaMissing(field: string): unknown {
  const schema = structuredClone(BIRTHDAY_CONTENT_SCHEMA) as SchemaFixture;
  delete schema.properties[field];
  return schema;
}

it("pins the eight theme keys in the order the owner chose (S8)", () => {
  assert.deepEqual(
    [...BIRTHDAY_THEMES],
    [
      "ice-kingdom",
      "rescue-team",
      "spider-hero",
      "classic-mouse",
      "dinosaurs",
      "under-the-sea",
      "fairytale-princess",
      "blocks-and-pixels",
    ],
  );
});

for (const componentKey of LAYOUT_KEYS) {
  describe(componentKey, () => {
    it("accepts every allowed theme with the shared eight-field schema", () => {
      for (const theme of BIRTHDAY_THEMES) {
        assert.deepEqual(
          validate({ componentKey, configuration: { componentKey, theme } }),
          { ok: true },
          theme,
        );
      }
    });

    it("requires theme and does not read inherited keys", () => {
      assert.deepEqual(issuesOf(validate({ componentKey, configuration: { componentKey } })), [
        "configuration.theme is required",
      ]);

      const inherited = Object.create({ componentKey, theme: BIRTHDAY_THEMES[0] });
      assert.deepEqual(issuesOf(validate({ componentKey, configuration: inherited })), [
        "configuration.componentKey is required",
        "configuration.theme is required",
      ]);
    });

    it("refuses a configuration that is not a JSON object", () => {
      for (const configuration of [null, undefined, "theme", 1, true, [BIRTHDAY_THEMES[0]]]) {
        assert.deepEqual(issuesOf(validate({ componentKey, configuration })), [
          "configuration must be a JSON object",
        ]);
      }
    });

    it("refuses an unknown theme", () => {
      for (const theme of ["neon", "", "Ice-Kingdom", "__proto__", "constructor"]) {
        assert.deepEqual(
          issuesOf(validate({ componentKey, configuration: { componentKey, theme } })),
          [THEME_ISSUE],
          theme,
        );
      }
    });

    it("refuses a theme that is not a string", () => {
      for (const theme of [1, null, true, [], {}, ["ice-kingdom"]]) {
        assert.deepEqual(
          issuesOf(validate({ componentKey, configuration: { componentKey, theme } })),
          [THEME_ISSUE],
          JSON.stringify(theme),
        );
      }
    });

    it("refuses any configuration key other than componentKey and theme", () => {
      for (const key of ["layout", "palette", "typography", "sectionOrder", "script"]) {
        assert.deepEqual(
          issuesOf(
            validate({
              componentKey,
              configuration: { componentKey, theme: BIRTHDAY_THEMES[1], [key]: "x" },
            }),
          ),
          [`configuration.${key} is not allowed; allowed keys: componentKey, theme`],
          key,
        );
      }
    });

    it("refuses a componentKey that differs from the version's", () => {
      for (const value of ["other", "birthday-nope-01", 1, null, undefined]) {
        assert.deepEqual(
          issuesOf(
            validate({
              componentKey,
              configuration: { componentKey: value, theme: BIRTHDAY_THEMES[0] },
            }),
          ),
          [`configuration.componentKey must equal ${JSON.stringify(componentKey)}`],
          String(value),
        );
      }
    });

    it("refuses a schema that is missing or mistypes one of the shared fields", () => {
      // The seeded schema declares `message` as an omittable section, so a snapshot that drops the property
      // also names a group field it no longer declares (S8.1).
      assert.deepEqual(issuesOf(validate({ componentKey, schema: schemaMissing("message") })), [
        "schema.properties.message is required by the renderer and is missing",
        'schema.required lists "message", which is not declared in schema.properties',
        'schema["x-omittable"] group "message" names "message", which the schema does not declare in properties',
      ]);

      const mistyped = structuredClone(BIRTHDAY_CONTENT_SCHEMA) as SchemaFixture;
      (mistyped.properties.age as Record<string, unknown>).type = "string";
      assert.deepEqual(issuesOf(validate({ componentKey, schema: mistyped })), [
        'schema.properties.age.type must be "integer"',
      ]);
    });

    it("declares no required feature key", () => {
      assert.deepEqual(findRenderer(componentKey)?.requiredFeatureKeys, []);
    });
  });
}
