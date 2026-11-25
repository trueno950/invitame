import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extendSchemaWithOmittableSections } from "./omittable-section-groups";
import { planOmittableSectionUpgrade, type UpgradeCandidate } from "./omittable-section-upgrade";

// The plan of the upgrade script (S8.4, S8.5): which published versions get a new version with the
// omittable-section extension, which are already done, and which must be refused. The function is pure, so
// the script only performs the writes it plans.

/** A baptism version schema as it was published before the extension existed. */
function baptismSchema(): Record<string, unknown> {
  const fields = [
    "celebrantName",
    "date",
    "parents",
    "godparents",
    "ceremonyPlace",
    "ceremonyAddress",
    "ceremonyTime",
    "receptionPlace",
    "receptionAddress",
    "receptionTime",
    "message",
    "rsvpContact",
  ];

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: [...fields],
    properties: Object.fromEntries(
      fields.map((name) => [name, { type: "string", maxLength: 200 }]),
    ),
  };
}

function candidate(overrides: Partial<UpgradeCandidate> = {}): UpgradeCandidate {
  return {
    templateId: "9d1c9d0e-0000-4000-8000-000000000001",
    templateKey: "baptism-classic-teddy-honey",
    publishedVersion: {
      componentKey: "baptism-classic-01",
      schema: baptismSchema(),
      configuration: { componentKey: "baptism-classic-01", theme: "teddy-honey" },
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
          templateKey: "baptism-classic-teddy-honey",
          componentKey: "baptism-classic-01",
          configuration: { componentKey: "baptism-classic-01", theme: "teddy-honey" },
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
        configuration: { componentKey: "baptism-classic-01", theme: "teddy-honey" },
      },
    });

    assert.deepEqual(planOmittableSectionUpgrade([alreadyDone]), {
      upgrades: [],
      alreadyExtended: ["baptism-classic-teddy-honey"],
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
    assert.deepEqual(second.alreadyExtended, ["baptism-classic-teddy-honey"]);
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
        templateKey: "baptism-classic-teddy-honey",
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
        templateKey: "baptism-classic-teddy-honey",
        issues: ["schema.properties must be an object"],
      },
    ]);
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
