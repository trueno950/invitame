import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  IllegalTemplateVersionTransitionError,
  InvalidTemplateVersionNumberError,
  TEMPLATE_VERSION_STATUSES,
  type TemplateVersionStatus,
  assertTemplateVersionTransition,
  canTransitionTemplateVersion,
  nextTemplateVersionNumber,
} from "./template-version-lifecycle";

// The version lifecycle at its source (M3 T3; S5, L4): DRAFT -> PUBLISHED -> RETIRED, nothing else.
// The expected pairs are literals on purpose; the database trigger repeats this table.

const LEGAL: ReadonlyArray<readonly [TemplateVersionStatus, TemplateVersionStatus]> = [
  ["DRAFT", "PUBLISHED"],
  ["PUBLISHED", "RETIRED"],
];

describe("template version transitions", () => {
  for (const from of TEMPLATE_VERSION_STATUSES) {
    for (const to of TEMPLATE_VERSION_STATUSES) {
      const legal = LEGAL.some(([a, b]) => a === from && b === to);

      it(`${from} -> ${to} is ${legal ? "legal" : "illegal"}`, () => {
        assert.equal(canTransitionTemplateVersion(from, to), legal);

        if (legal) {
          assert.doesNotThrow(() => assertTemplateVersionTransition(from, to));
        } else {
          assert.throws(
            () => assertTemplateVersionTransition(from, to),
            (error: unknown) =>
              error instanceof IllegalTemplateVersionTransitionError &&
              error.from === from &&
              error.to === to &&
              error.message === `Illegal template version transition from ${from} to ${to}`,
          );
        }
      });
    }
  }

  it("lists exactly the three statuses of the schema", () => {
    assert.deepEqual([...TEMPLATE_VERSION_STATUSES], ["DRAFT", "PUBLISHED", "RETIRED"]);
  });
});

describe("nextTemplateVersionNumber", () => {
  it("is 1 when the template has no version", () => {
    assert.equal(nextTemplateVersionNumber([]), 1);
  });

  it("is the highest number plus one, whatever the order", () => {
    assert.equal(nextTemplateVersionNumber([1]), 2);
    assert.equal(nextTemplateVersionNumber([3, 1, 2]), 4);
    assert.equal(nextTemplateVersionNumber([1, 5]), 6);
  });

  for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_647]) {
    it(`refuses ${String(invalid)} as an existing version number`, () => {
      assert.throws(
        () => nextTemplateVersionNumber([1, invalid]),
        (error: unknown) =>
          error instanceof InvalidTemplateVersionNumberError &&
          error.message === `Invalid template version number: ${String(invalid)}`,
      );
    });
  }
});
