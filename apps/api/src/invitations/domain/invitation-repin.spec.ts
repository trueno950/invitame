import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type DraftRepinInput,
  decideDraftRepin,
  type RepinTargetVersion,
} from "./invitation-repin";

// The re-pin rule (S5, S8.6): an existing DRAFT follows its template to the version that template publishes now,
// while every PUBLISHED and ARCHIVED invitation keeps the version it has, a version of another template is never
// accepted, a version that is not PUBLISHED is never accepted, and the stored content must validate against the new
// schema before the move — the new version only adds the omittable-section extension, so nothing typed is lost
// (S8.2). The rule is pure: it reads the invitation's state and the target snapshot and writes nothing.

/** The schema the previous version declared, without the omittable-section extension (S8.1). */
const OLD_SCHEMA = {
  type: "object",
  required: ["title", "date"],
  properties: {
    title: { type: "string", maxLength: 120 },
    date: { type: "string", format: "date" },
    message: { type: "string", maxLength: 600 },
  },
};

/** The same schema plus the extension and the optional list: what T2's script publishes (S8.1, S8.2). */
const NEW_SCHEMA = {
  ...OLD_SCHEMA,
  properties: {
    ...OLD_SCHEMA.properties,
    omittedSections: {
      type: "array",
      items: { enum: ["message"] },
      uniqueItems: true,
    },
  },
  "x-omittable": [{ key: "message", fields: ["message"] }],
  "x-require-one": [],
};

function target(overrides: Partial<RepinTargetVersion> = {}): RepinTargetVersion {
  return {
    id: "version-new",
    templateId: "template-xv",
    status: "PUBLISHED",
    schema: NEW_SCHEMA,
    ...overrides,
  };
}

function input(overrides: Partial<DraftRepinInput> = {}): DraftRepinInput {
  return {
    status: "DRAFT",
    pinnedVersionId: "version-old",
    pinnedTemplateId: "template-xv",
    content: { title: "Mis XV", date: "2027-04-10", message: "Los esperamos" },
    target: target(),
    ...overrides,
  };
}

describe("re-pinning a draft to its template's current published version", () => {
  it("moves a DRAFT pinned to an older version of the same template", () => {
    assert.deepEqual(decideDraftRepin(input()), { move: true, toVersionId: "version-new" });
  });

  it("accepts the stored content because the new schema only adds the extension (S8.2)", () => {
    const decision = decideDraftRepin(
      input({
        content: {
          title: "Mis XV",
          date: "2027-04-10",
          message: "Los esperamos",
          omittedSections: ["message"],
        },
      }),
    );

    assert.deepEqual(decision, { move: true, toVersionId: "version-new" });
  });

  it("decides only the target version: the content travels unchanged", () => {
    const decision = decideDraftRepin(input());

    assert.deepEqual(Object.keys(decision).sort(), ["move", "toVersionId"]);
  });

  it("never moves a PUBLISHED invitation and keeps its pinned version", () => {
    assert.deepEqual(decideDraftRepin(input({ status: "PUBLISHED" })), {
      move: false,
      reason: "NOT_DRAFT",
      issues: [],
    });
  });

  it("never moves an ARCHIVED invitation and keeps its pinned version", () => {
    assert.deepEqual(decideDraftRepin(input({ status: "ARCHIVED" })), {
      move: false,
      reason: "NOT_DRAFT",
      issues: [],
    });
  });

  it("skips a draft that already pins the current published version", () => {
    assert.deepEqual(decideDraftRepin(input({ pinnedVersionId: "version-new" })), {
      move: false,
      reason: "ALREADY_CURRENT",
      issues: [],
    });
  });

  it("skips an invitation pinned to the current version in any status, because there is nothing to move", () => {
    assert.deepEqual(
      decideDraftRepin(input({ status: "PUBLISHED", pinnedVersionId: "version-new" })),
      { move: false, reason: "ALREADY_CURRENT", issues: [] },
    );
  });

  it("skips a draft whose template has no published version", () => {
    assert.deepEqual(decideDraftRepin(input({ target: null })), {
      move: false,
      reason: "NO_PUBLISHED_VERSION",
      issues: [],
    });
  });

  it("skips a draft whose pinned version cannot be read", () => {
    assert.deepEqual(decideDraftRepin(input({ pinnedTemplateId: null, target: null })), {
      move: false,
      reason: "PINNED_VERSION_MISSING",
      issues: [],
    });
  });

  it("refuses a version of another template", () => {
    assert.deepEqual(
      decideDraftRepin(input({ target: target({ templateId: "template-wedding" }) })),
      {
        move: false,
        reason: "OTHER_TEMPLATE",
        issues: [],
      },
    );
  });

  it("refuses a DRAFT version of the same template", () => {
    assert.deepEqual(decideDraftRepin(input({ target: target({ status: "DRAFT" }) })), {
      move: false,
      reason: "TARGET_NOT_PUBLISHED",
      issues: [],
    });
  });

  it("refuses a RETIRED version of the same template", () => {
    assert.deepEqual(decideDraftRepin(input({ target: target({ status: "RETIRED" }) })), {
      move: false,
      reason: "TARGET_NOT_PUBLISHED",
      issues: [],
    });
  });

  it("skips a draft whose stored content the new schema refuses, with the schema's own issues", () => {
    const decision = decideDraftRepin(input({ content: { title: "Mis XV", date: "10/04/2027" } }));

    assert.deepEqual(decision, {
      move: false,
      reason: "CONTENT_INVALID",
      issues: ["content.date must be a calendar date as YYYY-MM-DD"],
    });
  });

  it("skips a draft that stores a value the new version no longer declares", () => {
    const decision = decideDraftRepin(
      input({ content: { title: "Mis XV", date: "2027-04-10", dressCode: "Formal" } }),
    );

    assert.deepEqual(decision, {
      move: false,
      reason: "CONTENT_INVALID",
      issues: ["content.dressCode is not declared in the template version schema"],
    });
  });
});
