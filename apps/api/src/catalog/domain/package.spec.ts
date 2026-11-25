import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PACKAGE_DURATION_DAYS,
  MAX_PACKAGE_DURATION_DAYS,
  MAX_PACKAGE_FEATURES,
  MIN_PACKAGE_DURATION_DAYS,
  PACKAGE_STATUSES,
  parsePackageDurationDays,
  parsePackageFeatureIds,
  parsePackageStatus,
} from "./package";

// Package rules at their source (M3 T6b; S1, S9): the status allow-list, the bounded, unique list of
// feature ids that replaces a package's links, and the duration a published invitation of the package lives.

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

describe("package duration (S1, S4)", () => {
  it("bounds the duration between one day and ten years, and defaults to the basic month", () => {
    assert.equal(MIN_PACKAGE_DURATION_DAYS, 1);
    assert.equal(MAX_PACKAGE_DURATION_DAYS, 3650);
    assert.equal(DEFAULT_PACKAGE_DURATION_DAYS, 30);
  });

  it("accepts a whole number of days inside the bounds, its boundaries included", () => {
    assert.equal(parsePackageDurationDays(30), 30);
    assert.equal(parsePackageDurationDays(90), 90);
    assert.equal(parsePackageDurationDays(180), 180);
    assert.equal(parsePackageDurationDays(MIN_PACKAGE_DURATION_DAYS), 1);
    assert.equal(parsePackageDurationDays(MAX_PACKAGE_DURATION_DAYS), 3650);
  });

  it("refuses zero, a negative duration, a fraction, and a value past the bound", () => {
    for (const value of [0, -1, -30, 1.5, 30.000_001, MAX_PACKAGE_DURATION_DAYS + 1, 1e9]) {
      assert.equal(parsePackageDurationDays(value), null, String(value));
    }
  });

  it("refuses a value that is not a number, and a numeric string a form may send", () => {
    for (const value of ["30", " 30", "30 ", "", null, undefined, {}, [], true, Number.NaN]) {
      assert.equal(parsePackageDurationDays(value), null, JSON.stringify(value));
    }
  });
});
