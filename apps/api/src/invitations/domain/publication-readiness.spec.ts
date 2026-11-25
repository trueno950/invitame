import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { type PublicationReadiness, publicationIssues } from "./publication-readiness";

// The publication readiness rule (M5 T2; S2, S3, S6, A1): an invitation publishes only when every required
// field of the pinned schema is present, the full content re-validates, the package still fits the pinned
// version's required features, and that version is still published. The issue strings are literals on
// purpose: they are deterministic, in English, and never echo a stored value.

/** The schema of a pinned version: three required fields, one optional, all of them bounded. */
const SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["celebrantName", "date", "address"],
  properties: {
    celebrantName: { type: "string", maxLength: 80 },
    date: { type: "string", format: "date" },
    address: { type: "string", maxLength: 200 },
    message: { type: "string", maxLength: 500 },
  },
};

/** Content that satisfies every declaration of `SCHEMA`. */
const COMPLETE_CONTENT = { celebrantName: "Ana", date: "2027-03-14", address: "Calle 1" };

/** A package that is ACTIVE and includes the pinned version's required features. */
const FITTING_PACKAGE = { packageStatus: "ACTIVE", includedFeatureKeys: ["RSVP", "MAP"] };

/** A publishable invitation: complete, fitting, and pinned to a published version. */
function readiness(overrides: Partial<PublicationReadiness> = {}): PublicationReadiness {
  return {
    schema: SCHEMA,
    content: COMPLETE_CONTENT,
    packageEntitlements: FITTING_PACKAGE,
    requiredFeatureKeys: ["RSVP"],
    versionPublished: true,
    ...overrides,
  };
}

describe("publicationIssues", () => {
  it("has no issue for a complete invitation of a fitting package on a published version", () => {
    assert.deepEqual(publicationIssues(readiness()), []);
  });

  it("has no issue when the pinned version requires no feature and the package is ACTIVE", () => {
    assert.deepEqual(publicationIssues(readiness({ requiredFeatureKeys: [] })), []);
  });
});

describe("publicationIssues required fields", () => {
  it("names every missing required field in schema order", () => {
    assert.deepEqual(publicationIssues(readiness({ content: {} })), [
      "content.celebrantName is required to publish",
      "content.date is required to publish",
      "content.address is required to publish",
    ]);
  });

  it("names only the required fields the content does not provide", () => {
    assert.deepEqual(publicationIssues(readiness({ content: { date: "2027-03-14" } })), [
      "content.celebrantName is required to publish",
      "content.address is required to publish",
    ]);
    assert.deepEqual(
      publicationIssues(
        readiness({ content: { celebrantName: "Ana", date: "2027-03-14", address: "Calle 1" } }),
      ),
      [],
    );
  });

  it("reports the required fields of content that is not an object", () => {
    assert.deepEqual(publicationIssues(readiness({ content: null })), [
      "content.celebrantName is required to publish",
      "content.date is required to publish",
      "content.address is required to publish",
      "content must be a JSON object",
    ]);
  });
});

describe("publicationIssues content re-validation", () => {
  it("reports an invalid value the schema declares a rule for", () => {
    assert.deepEqual(
      publicationIssues(readiness({ content: { ...COMPLETE_CONTENT, date: "14/03/2027" } })),
      ["content.date must be a calendar date as YYYY-MM-DD"],
    );
  });

  it("reports a provided key the pinned schema does not declare", () => {
    assert.deepEqual(
      publicationIssues(readiness({ content: { ...COMPLETE_CONTENT, ownerId: "x" } })),
      ["content.ownerId is not declared in the template version schema"],
    );
  });

  it("reports a drifted pinned schema instead of accepting content silently", () => {
    const schema = { properties: SCHEMA.properties };

    assert.deepEqual(publicationIssues(readiness({ schema })), [
      "schema.required must be an array of strings",
    ]);
  });

  it("never echoes a stored value in an issue", () => {
    const issues = publicationIssues(
      readiness({
        content: { ...COMPLETE_CONTENT, date: "SECRET-VALUE-2027" },
        // A value a naive implementation could quote when naming a missing feature.
        packageEntitlements: { packageStatus: "ACTIVE", includedFeatureKeys: ["SECRET-MAP"] },
        requiredFeatureKeys: ["SECRET-MAP", "SECRET-RSVP"],
      }),
    );

    assert.deepEqual(issues, [
      "content.date must be a calendar date as YYYY-MM-DD",
      "package does not include the template's required features",
    ]);
    assert.equal(
      issues.some((issue) => issue.includes("SECRET")),
      false,
      "no issue echoes a stored value",
    );
  });
});

describe("publicationIssues package fit", () => {
  it("reports a package that misses a required feature", () => {
    assert.deepEqual(
      publicationIssues(
        readiness({ packageEntitlements: { packageStatus: "ACTIVE", includedFeatureKeys: [] } }),
      ),
      ["package does not include the template's required features"],
    );
  });

  it("reports a package that is no longer ACTIVE, even when it includes every feature", () => {
    assert.deepEqual(
      publicationIssues(
        readiness({
          packageEntitlements: { packageStatus: "ARCHIVED", includedFeatureKeys: ["RSVP", "MAP"] },
        }),
      ),
      ["package does not include the template's required features"],
    );
  });
});

describe("publicationIssues pinned version", () => {
  it("reports a pinned template version that is no longer published", () => {
    assert.deepEqual(publicationIssues(readiness({ versionPublished: false })), [
      "template version is no longer published",
    ]);
  });
});

describe("publicationIssues ordering", () => {
  it("reports every issue in a fixed order: required fields, validation, package, version", () => {
    assert.deepEqual(
      publicationIssues(
        readiness({
          content: { celebrantName: "x".repeat(81), date: "SECRET-DATE" },
          packageEntitlements: { packageStatus: "DRAFT", includedFeatureKeys: [] },
          requiredFeatureKeys: ["RSVP"],
          versionPublished: false,
        }),
      ),
      [
        "content.address is required to publish",
        "content.celebrantName must be a string of at most 80 characters",
        "content.date must be a calendar date as YYYY-MM-DD",
        "package does not include the template's required features",
        "template version is no longer published",
      ],
    );
  });

  it("is deterministic across calls", () => {
    const input = readiness({
      content: {},
      packageEntitlements: { packageStatus: "DRAFT", includedFeatureKeys: [] },
      versionPublished: false,
    });

    assert.deepEqual(publicationIssues(input), publicationIssues(input));
  });
});

describe("publicationIssues omittable sections (S8.1, S8.3)", () => {
  /** A two-place schema with two omittable sections and one require-one set. */
  const SECTION_SCHEMA = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["celebrantName", "date", "ceremonyPlace", "receptionPlace", "message"],
    properties: {
      celebrantName: { type: "string", maxLength: 80 },
      date: { type: "string", format: "date" },
      ceremonyPlace: { type: "string", maxLength: 120 },
      receptionPlace: { type: "string", maxLength: 120 },
      message: { type: "string", maxLength: 500 },
      omittedSections: {
        type: "array",
        items: { type: "string", enum: ["ceremony", "reception", "message"] },
        uniqueItems: true,
      },
    },
    "x-omittable": [
      { key: "ceremony", fields: ["ceremonyPlace"] },
      { key: "reception", fields: ["receptionPlace"] },
      { key: "message", fields: ["message"] },
    ],
    "x-require-one": [["ceremony", "reception"]],
  };

  /** The content of an invitation that shows the ceremony and hides the reception and the message. */
  const OMITTING_CONTENT = {
    celebrantName: "Mateo",
    date: "2027-05-08",
    ceremonyPlace: "Parroquia San José",
    omittedSections: ["reception", "message"],
  };

  it("does not report the required fields of an omitted group", () => {
    assert.deepEqual(
      publicationIssues(readiness({ schema: SECTION_SCHEMA, content: OMITTING_CONTENT })),
      [],
    );
  });

  it("still reports the required fields of a group that stays shown", () => {
    assert.deepEqual(
      publicationIssues(
        readiness({
          schema: SECTION_SCHEMA,
          content: {
            celebrantName: "Mateo",
            date: "2027-05-08",
            omittedSections: ["reception", "message"],
          },
        }),
      ),
      ["content.ceremonyPlace is required to publish"],
    );
  });

  it("refuses a publication that hides every group of one require-one set", () => {
    assert.deepEqual(
      publicationIssues(
        readiness({
          schema: SECTION_SCHEMA,
          content: {
            celebrantName: "Mateo",
            date: "2027-05-08",
            omittedSections: ["ceremony", "reception", "message"],
          },
        }),
      ),
      ["content.ceremony,reception needs one shown"],
    );
  });

  it("names the require-one issue after the missing fields, in a fixed order", () => {
    assert.deepEqual(
      publicationIssues(
        readiness({
          schema: SECTION_SCHEMA,
          content: { omittedSections: ["ceremony", "reception"] },
        }),
      ),
      [
        "content.celebrantName is required to publish",
        "content.date is required to publish",
        "content.message is required to publish",
        "content.ceremony,reception needs one shown",
      ],
    );
  });

  it("does not refuse a list that keeps one group of every require-one set", () => {
    for (const omittedSections of [[], ["ceremony"], ["reception"], ["message"]]) {
      assert.deepEqual(
        publicationIssues(
          readiness({
            schema: SECTION_SCHEMA,
            content: {
              celebrantName: "Mateo",
              date: "2027-05-08",
              ceremonyPlace: "Parroquia San José",
              receptionPlace: "Salón Aurora",
              message: "Te esperamos",
              omittedSections,
            },
          }),
        ),
        [],
        JSON.stringify(omittedSections),
      );
    }
  });

  it("keeps every issue of a version that declares no omittable section", () => {
    assert.deepEqual(publicationIssues(readiness({ content: {} })), [
      "content.celebrantName is required to publish",
      "content.date is required to publish",
      "content.address is required to publish",
    ]);
  });

  it("never echoes an omitted key in the require-one issue", () => {
    const issues = publicationIssues(
      readiness({
        schema: SECTION_SCHEMA,
        content: {
          celebrantName: "Mateo",
          date: "2027-05-08",
          omittedSections: ["ceremony", "reception", "message"],
        },
      }),
    );

    assert.deepEqual(issues, ["content.ceremony,reception needs one shown"]);
    assert.equal(
      issues.some((issue) => issue.includes("Mateo") || issue.includes("SECRET")),
      false,
      "no issue echoes a stored value",
    );
  });
});
