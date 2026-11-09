import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCatalogEntryId,
  parseCategoryKey,
  parseEntryDescription,
  parseEntryName,
  parseFeatureKey,
} from "./catalog-entry";

describe("parseCategoryKey", () => {
  it("accepts lowercase kebab-case keys up to 100 characters", () => {
    for (const key of ["a", "birthday", "baby-shower", "year-2026", "a".repeat(100)]) {
      assert.equal(parseCategoryKey(key), key);
    }
  });

  it("refuses everything else, including padding and a value that is not a string", () => {
    for (const key of [
      "",
      " birthday",
      "Birthday",
      "baby_shower",
      "-birthday",
      "birthday-",
      "baby--shower",
      "cumpleaños",
      "a b",
      "birthday\n",
      "a".repeat(101),
      "BABY_SHOWER",
      42,
      null,
      undefined,
      ["birthday"],
    ]) {
      assert.equal(parseCategoryKey(key), null, JSON.stringify(key));
    }
  });
});

describe("parseFeatureKey", () => {
  it("accepts UPPER_SNAKE keys up to 100 characters", () => {
    for (const key of ["A", "RSVP", "GUEST_LIST", "PHOTO_GALLERY_2", `A${"B".repeat(99)}`]) {
      assert.equal(parseFeatureKey(key), key);
    }
  });

  it("refuses everything else", () => {
    for (const key of [
      "",
      "rsvp",
      "Rsvp",
      "guest-list",
      "GUEST-LIST",
      "_RSVP",
      "RSVP_",
      "GUEST__LIST",
      "2FA",
      "GUEST LIST",
      "RSVP\n",
      `A${"B".repeat(100)}`,
      7,
      null,
      undefined,
    ]) {
      assert.equal(parseFeatureKey(key), null, JSON.stringify(key));
    }
  });
});

describe("parseEntryName", () => {
  it("trims and accepts 1 to 120 code points", () => {
    assert.equal(parseEntryName("  Cumpleaños  "), "Cumpleaños");
    assert.equal(parseEntryName("a"), "a");
    assert.equal(parseEntryName("a".repeat(120)), "a".repeat(120));
    assert.equal(parseEntryName("😀".repeat(120)), "😀".repeat(120));
  });

  it("refuses empty, blank, too long, control, bidirectional, and non-string values", () => {
    for (const name of [
      "",
      "   ",
      "a".repeat(121),
      "😀".repeat(121),
      "a\nb",
      "a\tb",
      "a\u0000",
      "a\ud800",
      "a\u202eb",
      42,
      null,
      undefined,
    ]) {
      assert.equal(parseEntryName(name), null, JSON.stringify(name));
    }
  });
});

describe("parseEntryDescription", () => {
  it("keeps null, trims text, and reads a blank text as null", () => {
    assert.deepEqual(parseEntryDescription(null), { value: null });
    assert.deepEqual(parseEntryDescription("  Fiestas  "), { value: "Fiestas" });
    assert.deepEqual(parseEntryDescription("   "), { value: null });
    assert.deepEqual(parseEntryDescription("línea 1\nlínea 2"), { value: "línea 1\nlínea 2" });
  });

  it("accepts up to 1000 code points", () => {
    assert.deepEqual(parseEntryDescription("a".repeat(1000)), { value: "a".repeat(1000) });
    assert.deepEqual(parseEntryDescription("😀".repeat(1000)), { value: "😀".repeat(1000) });
  });

  it("refuses too long text, NUL, unpaired surrogates, and values that are not text", () => {
    for (const description of ["a".repeat(1001), "a\u0000b", "a\ud800", 42, true, {}, undefined]) {
      assert.equal(parseEntryDescription(description), null, JSON.stringify(description));
    }
  });
});

describe("isCatalogEntryId", () => {
  it("accepts canonical UUIDs only", () => {
    assert.equal(isCatalogEntryId("0d0f4a6e-5f43-4c52-9d68-3c8a4d4a0b11"), true);
    for (const id of [
      "",
      "1",
      "not-a-uuid",
      "0d0f4a6e5f434c529d683c8a4d4a0b11",
      " 0d0f4a6e-5f43-4c52-9d68-3c8a4d4a0b11",
    ]) {
      assert.equal(isCatalogEntryId(id), false, id);
    }
  });
});
