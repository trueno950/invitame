import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_PACKAGE_FEATURES,
  PACKAGE_STATUSES,
  parsePackageFeatureIds,
  parsePackageStatus,
} from "./package";

// Package rules at their source (M3 T6b; S1, S9): the status allow-list and the bounded, unique list of
// feature ids that replaces a package's links.

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

function ids(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
}

describe("package status", () => {
  it("allows DRAFT, ACTIVE, and ARCHIVED", () => {
    assert.deepEqual([...PACKAGE_STATUSES], ["DRAFT", "ACTIVE", "ARCHIVED"]);
    for (const status of PACKAGE_STATUSES) {
      assert.equal(parsePackageStatus(status), status);
    }
  });

  it("refuses any other value, including a different case or padding", () => {
    for (const value of ["active", " ACTIVE", "PUBLISHED", "", null, undefined, 1, {}]) {
      assert.equal(parsePackageStatus(value), null);
    }
  });
});

describe("parsePackageFeatureIds", () => {
  it("accepts an empty list, which removes every link", () => {
    assert.deepEqual(parsePackageFeatureIds([]), []);
  });

  it("keeps the order and lowercases canonical UUIDs", () => {
    assert.deepEqual(parsePackageFeatureIds([ID_B, ID_A.toUpperCase()]), [ID_B, ID_A]);
  });

  it("refuses a duplicate, also when only the case differs", () => {
    assert.equal(parsePackageFeatureIds([ID_A, ID_A]), null);
    assert.equal(parsePackageFeatureIds([ID_A, ID_A.toUpperCase()]), null);
  });

  it("refuses an id that is not a UUID and a value that is not a list", () => {
    for (const value of [["not-a-uuid"], [1], [null], [ID_A, ""], ID_A, null, undefined, {}]) {
      assert.equal(parsePackageFeatureIds(value), null);
    }
  });

  it("accepts exactly 100 ids and refuses 101", () => {
    assert.equal(MAX_PACKAGE_FEATURES, 100);
    assert.equal(parsePackageFeatureIds(ids(100))?.length, 100);
    assert.equal(parsePackageFeatureIds(ids(101)), null);
  });
});
