import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BAPTISM_CONTENT_SCHEMA,
  WEDDING_ARCH_CONTENT_SCHEMA,
  XV_ARCH_CONTENT_SCHEMA,
} from "../../../prisma/catalog-seed";
import {
  extendSchemaWithOmittableSections,
  OMITTABLE_SECTIONS_BY_FAMILY,
  omittableSectionsExtension,
} from "./omittable-section-groups";
import { planOmittableSectionUpgrade, type UpgradeCandidate } from "./omittable-section-upgrade";
import { validateTemplateVersionContract } from "./renderers/renderer-registry";

// The plan of the upgrade script (S8.4, S8.5): which published versions get a new version with the
// omittable-section extension, which are already done, and which must be refused. The function is pure, so
// the script only performs the writes it plans.

/**
 * A baptism-classic version as it was published before the extension existed: the seed's own schema without
 * the extension and without the omitted-key declaration, so the fixture is a real contract-valid version.
 */
function baptismSchema(): Record<string, unknown> {
  return withoutExtension(BAPTISM_CONTENT_SCHEMA as Record<string, unknown>);
}

/** A seeded version schema as it was published before the extension existed: no extension, no list. */
function withoutExtension(schema: Record<string, unknown>): Record<string, unknown> {
  const { "x-omittable": _groups, "x-require-one": _requireOne, properties, ...rest } = schema;
  const { omittedSections: _omitted, ...publishedProperties } = properties as Record<
    string,
    unknown
  >;

  return { ...rest, properties: publishedProperties };
}

function candidate(overrides: Partial<UpgradeCandidate> = {}): UpgradeCandidate {
  return {
    templateId: "9d1c9d0e-0000-4000-8000-000000000001",
    templateKey: "baptism-classic-little-angels",
    publishedVersion: {
      componentKey: "baptism-classic-01",
      schema: baptismSchema(),
      configuration: { componentKey: "baptism-classic-01", theme: "little-angels" },
    },
    ...overrides,
  };
}

describe("planOmittableSectionUpgrade", () => {
  it("plans one new version per published version without the extension", () => {
    const plan = planOmittableSectionUpgrade([candidate()]);
    const extended = extendSchemaWithOmittableSections(baptismSchema(), "baptism");

    assert.equal(extended.ok, true);
    assert.deepEqual(plan, {
      upgrades: [
        {
          templateId: "9d1c9d0e-0000-4000-8000-000000000001",
          templateKey: "baptism-classic-little-angels",
          componentKey: "baptism-classic-01",
          configuration: { componentKey: "baptism-classic-01", theme: "little-angels" },
          schema: extended.ok ? extended.value : {},
        },
      ],
      alreadyExtended: [],
      unsupported: [],
      refused: [],
    });
  });

  it("keeps the input order of the templates", () => {
    const plan = planOmittableSectionUpgrade([
      candidate({ templateKey: "b", templateId: "9d1c9d0e-0000-4000-8000-00000000000b" }),
      candidate({ templateKey: "a", templateId: "9d1c9d0e-0000-4000-8000-00000000000a" }),
    ]);

    assert.deepEqual(
      plan.upgrades.map((upgrade) => upgrade.templateKey),
      ["b", "a"],
    );
  });

  it("skips a template whose published version already carries the extension", () => {
    const extended = extendSchemaWithOmittableSections(baptismSchema(), "baptism");
    assert.equal(extended.ok, true);
    if (!extended.ok) {
      return;
    }
    const alreadyDone = candidate({
      publishedVersion: {
        componentKey: "baptism-classic-01",
        schema: extended.value,
        configuration: { componentKey: "baptism-classic-01", theme: "little-angels" },
      },
    });

    assert.deepEqual(planOmittableSectionUpgrade([alreadyDone]), {
      upgrades: [],
      alreadyExtended: ["baptism-classic-little-angels"],
      unsupported: [],
      refused: [],
    });
  });

  it("is idempotent: planning the version it just planned skips it", () => {
    const first = planOmittableSectionUpgrade([candidate()]);
    const second = planOmittableSectionUpgrade(
      first.upgrades.map((upgrade) => ({
        templateId: upgrade.templateId,
        templateKey: upgrade.templateKey,
        publishedVersion: {
          componentKey: upgrade.componentKey,
          schema: upgrade.schema,
          configuration: upgrade.configuration,
        },
      })),
    );

    assert.equal(first.upgrades.length, 1);
    assert.deepEqual(second.upgrades, []);
    assert.deepEqual(second.alreadyExtended, ["baptism-classic-little-angels"]);
  });

  it("skips a renderer key the catalog has no section family for", () => {
    const plan = planOmittableSectionUpgrade([
      candidate({
        templateKey: "birthday-map-unknown",
        publishedVersion: {
          componentKey: "graduation-classic-01",
          schema: baptismSchema(),
          configuration: {},
        },
      }),
    ]);

    assert.deepEqual(plan, {
      upgrades: [],
      alreadyExtended: [],
      unsupported: ["birthday-map-unknown"],
      refused: [],
    });
  });

  it("refuses a published schema whose extension is already invalid", () => {
    const schema = {
      ...baptismSchema(),
      "x-omittable": [{ key: "ceremony", fields: ["closingNote"] }],
      "x-require-one": [],
    };
    const plan = planOmittableSectionUpgrade([
      candidate({
        publishedVersion: { componentKey: "baptism-classic-01", schema, configuration: {} },
      }),
    ]);

    assert.equal(plan.upgrades.length, 0);
    assert.deepEqual(plan.refused, [
      {
        templateKey: "baptism-classic-little-angels",
        issues: [
          'schema["x-omittable"] group "ceremony" names "closingNote", which the schema does not declare in properties',
          "schema.properties.omittedSections must declare the omitted group keys",
        ],
      },
    ]);
  });

  it("refuses a published schema that declares no properties", () => {
    const plan = planOmittableSectionUpgrade([
      candidate({
        publishedVersion: { componentKey: "baptism-classic-01", schema: {}, configuration: {} },
      }),
    ]);

    assert.deepEqual(plan.refused, [
      {
        templateKey: "baptism-classic-little-angels",
        issues: ["schema.properties must be an object"],
      },
    ]);
  });

  // A published version the dev catalog carries from a database fixture: a stub schema the current renderer
  // contract refuses, planned as an upgrade only while the plan skipped the contract the create use case runs.
  it("refuses a published version the create-time contract refuses, and names its issues", () => {
    const plan = planOmittableSectionUpgrade([
      candidate({
        templateKey: "m9-unpublish-template-0dd79c1220d7",
        publishedVersion: {
          componentKey: "birthday-poster-01",
          schema: { type: "object", required: [], properties: {} },
          configuration: { componentKey: "birthday-poster-01" },
        },
      }),
    ]);

    assert.deepEqual(plan.upgrades, []);
    assert.deepEqual(plan.refused, [
      {
        templateKey: "m9-unpublish-template-0dd79c1220d7",
        issues: [
          'schema.$schema must be "https://json-schema.org/draft/2020-12/schema"',
          "schema.additionalProperties must be false",
          "schema.properties.celebrantName is required by the renderer and is missing",
          "schema.properties.age is required by the renderer and is missing",
          "schema.properties.date is required by the renderer and is missing",
          "schema.properties.time is required by the renderer and is missing",
          "schema.properties.location is required by the renderer and is missing",
          "schema.properties.address is required by the renderer and is missing",
          "schema.properties.mainPhoto is required by the renderer and is missing",
          "schema.properties.message is required by the renderer and is missing",
          'schema.required must include "celebrantName"',
          'schema.required must include "age"',
          'schema.required must include "date"',
          'schema.required must include "time"',
          'schema.required must include "location"',
          'schema.required must include "address"',
          'schema.required must include "mainPhoto"',
          'schema.required must include "message"',
          'schema["x-omittable"] group "age" names "age", which the schema does not declare in properties',
          'schema["x-omittable"] group "mainPhoto" names "mainPhoto", which the schema does not declare in properties',
          'schema["x-omittable"] group "message" names "message", which the schema does not declare in properties',
          "configuration.theme is required",
        ],
      },
    ]);
  });

  // The published versions of the XV and wedding elegant lines, from the seed's own schemas without the
  // extension: the four `xml-omittable` families of S8.4 must keep being planned, never refused.
  it("plans the published XV and wedding versions of the elegant line", () => {
    const published = [
      {
        templateKey: "xv-arch-blush-gold",
        componentKey: "xv-arch-01",
        family: "xv",
        schema: XV_ARCH_CONTENT_SCHEMA,
      },
      {
        templateKey: "xv-ornamental-blush-gold",
        componentKey: "xv-ornamental-01",
        family: "xv",
        schema: XV_ARCH_CONTENT_SCHEMA,
      },
      {
        templateKey: "wedding-arch-blush-gold",
        componentKey: "wedding-arch-01",
        family: "wedding",
        schema: WEDDING_ARCH_CONTENT_SCHEMA,
      },
      {
        templateKey: "wedding-ornamental-blush-gold",
        componentKey: "wedding-ornamental-01",
        family: "wedding",
        schema: WEDDING_ARCH_CONTENT_SCHEMA,
      },
    ] as const;

    for (const version of published) {
      const plan = planOmittableSectionUpgrade([
        candidate({
          templateKey: version.templateKey,
          publishedVersion: {
            componentKey: version.componentKey,
            schema: withoutExtension(version.schema as Record<string, unknown>),
            configuration: { componentKey: version.componentKey, theme: "blush-gold" },
          },
        }),
      ]);

      assert.deepEqual(plan.refused, [], version.templateKey);
      assert.equal(plan.upgrades.length, 1, version.templateKey);
      const upgrade = plan.upgrades[0];
      assert.ok(upgrade !== undefined, version.templateKey);
      if (upgrade === undefined) {
        continue;
      }
      // The groups S8.4 names for the line, unchanged: the plan adds the extension and drops no group.
      assert.deepEqual(
        upgrade.schema["x-omittable"],
        omittableSectionsExtension(version.family)["x-omittable"],
        version.templateKey,
      );
      assert.deepEqual(
        upgrade.schema["x-omittable"],
        OMITTABLE_SECTIONS_BY_FAMILY[version.family].groups.map((group) => ({
          key: group.key,
          fields: [...group.fields],
        })),
        version.templateKey,
      );
      assert.deepEqual(
        validateTemplateVersionContract({
          componentKey: upgrade.componentKey,
          schema: upgrade.schema,
          configuration: upgrade.configuration,
        }),
        { ok: true },
        version.templateKey,
      );
    }
  });

  it("answers an empty plan for no candidates", () => {
    assert.deepEqual(planOmittableSectionUpgrade([]), {
      upgrades: [],
      alreadyExtended: [],
      unsupported: [],
      refused: [],
    });
  });
});
