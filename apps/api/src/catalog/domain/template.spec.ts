import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_VERSION_JSON_BYTES,
  MAX_VERSION_JSON_DEPTH,
  parseTemplateStatus,
  parseVersionJson,
  TEMPLATE_STATUSES,
} from "./template";

// Template rules at their source (M3 T6c; S1, S8, S9, L4): the status allow-list and the bounded,
// storable JSON of a version snapshot.

describe("template status", () => {
  it("allows DRAFT, PUBLISHED, and ARCHIVED", () => {
    assert.deepEqual([...TEMPLATE_STATUSES], ["DRAFT", "PUBLISHED", "ARCHIVED"]);
    for (const status of TEMPLATE_STATUSES) {
      assert.equal(parseTemplateStatus(status), status);
    }
  });

  it("refuses any other value", () => {
    for (const value of ["draft", "RETIRED", "ACTIVE", "", null, undefined, 1, {}]) {
      assert.equal(parseTemplateStatus(value), null);
    }
  });
});

describe("version JSON", () => {
  it("accepts an object and an array within the limit", () => {
    assert.equal(MAX_VERSION_JSON_BYTES, 64 * 1024);
    assert.equal(parseVersionJson({ a: [1, "x", null, true] }), true);
    assert.equal(parseVersionJson([]), true);
  });

  it("measures the serialized size in bytes, inclusive of the limit", () => {
    // {"k":"..."} adds 8 bytes around the text.
    const fits = { k: "a".repeat(MAX_VERSION_JSON_BYTES - 8) };
    const over = { k: "a".repeat(MAX_VERSION_JSON_BYTES - 7) };
    const multibyte = { k: "ñ".repeat(MAX_VERSION_JSON_BYTES / 2) };

    assert.equal(parseVersionJson(fits), true);
    assert.equal(parseVersionJson(over), false);
    assert.equal(parseVersionJson(multibyte), false);
  });

  it("refuses text PostgreSQL JSONB cannot store, in values and in keys", () => {
    assert.equal(parseVersionJson({ a: "x\u0000y" }), false);
    assert.equal(parseVersionJson({ "a\u0000": 1 }), false);
    assert.equal(parseVersionJson({ list: [{ deep: "\ud800" }] }), false);
  });

  it("allows 32 levels of nesting and refuses more, however deep", () => {
    const nested = (levels: number) => {
      let value: unknown = "end";
      for (let level = 0; level < levels; level++) {
        value = [value];
      }
      return value;
    };

    assert.equal(MAX_VERSION_JSON_DEPTH, 32);
    assert.equal(parseVersionJson(nested(32)), true);
    assert.equal(parseVersionJson(nested(33)), false);
    assert.equal(parseVersionJson(nested(20_000)), false);
  });

  it("refuses a value that cannot be serialized", () => {
    assert.equal(parseVersionJson(undefined), false);
    assert.equal(
      parseVersionJson(() => 1),
      false,
    );
  });
});
