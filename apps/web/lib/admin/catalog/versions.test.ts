import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CatalogTemplateVersion } from "../../server/admin-catalog-validators.ts";
import {
  formatSnapshotJson,
  MAX_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_TEXT_LENGTH,
  parseSnapshotJson,
  prefillValues,
  prefillVersion,
  versionAction,
} from "./versions.ts";

// The version form's pure rules (M3 T8b; S5, S6, S8): JSON text is parsed and bounded on the server
// before any API call, a new version starts from a copy of the published (or latest) one, and only a
// DRAFT is published and only a PUBLISHED one retired.

const AT = "2026-11-09T12:00:00.000Z";

function version(
  number: number,
  status: CatalogTemplateVersion["status"],
  extra: Partial<CatalogTemplateVersion> = {},
): CatalogTemplateVersion {
  return {
    id: `0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e${String(number).padStart(2, "0")}`,
    version: number,
    status,
    componentKey: "birthday-adventure-01",
    schema: { n: number },
    configuration: { palette: "ocean" },
    createdAt: AT,
    ...extra,
  };
}

describe("parseSnapshotJson", () => {
  it("accepts any valid JSON value and leaves the shape to the renderer contract", () => {
    for (const [text, value] of [
      ['{"a":[1,2,{"b":null}]}', { a: [1, 2, { b: null }] }],
      ["  [1]  ", [1]],
      ["null", null],
      ["5", 5],
      ['"text"', "text"],
    ] as const) {
      assert.deepEqual(parseSnapshotJson(text), { ok: true, value }, text);
    }
  });

  it("refuses blank text as empty", () => {
    for (const text of ["", "   ", "\n\t"]) {
      assert.deepEqual(parseSnapshotJson(text), { ok: false, reason: "empty" });
    }
  });

  it("refuses text that is not JSON as a syntax error", () => {
    for (const text of [
      "{",
      "{'a': 1}",
      "{a: 1}",
      "[1,]",
      "undefined",
      "{} {}",
      '{"a":1} x',
      "NaN",
    ]) {
      assert.deepEqual(parseSnapshotJson(text), { ok: false, reason: "syntax" }, text);
    }
  });

  it("measures 64 KiB on the compact form, as the API does", () => {
    const fits = { text: "a".repeat(MAX_SNAPSHOT_BYTES - '{"text":""}'.length) };
    assert.equal(new TextEncoder().encode(JSON.stringify(fits)).length, MAX_SNAPSHOT_BYTES);
    assert.deepEqual(parseSnapshotJson(JSON.stringify(fits)), { ok: true, value: fits });
    // The indented form of the same value is longer than 64 KiB and is still accepted.
    assert.ok(parseSnapshotJson(`{\n  "text": "${fits.text}"\n}`).ok);

    const over = { text: `${fits.text}a` };
    assert.deepEqual(parseSnapshotJson(JSON.stringify(over)), { ok: false, reason: "too-large" });
  });

  it("counts bytes, not characters", () => {
    const text = JSON.stringify({ text: "ñ".repeat(MAX_SNAPSHOT_BYTES / 2) });
    assert.deepEqual(parseSnapshotJson(text), { ok: false, reason: "too-large" });
  });

  it("refuses a huge text without parsing it", () => {
    const text = `[${" ".repeat(MAX_SNAPSHOT_TEXT_LENGTH)}1]`;
    assert.deepEqual(parseSnapshotJson(text), { ok: false, reason: "too-large" });
  });

  it("keeps an own __proto__ key as data, so it never reaches a prototype", () => {
    const result = parseSnapshotJson('{"__proto__": {"polluted": true}}');
    assert.ok(result.ok);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(Object.getPrototypeOf(result.value), Object.prototype);
  });
});

describe("formatSnapshotJson", () => {
  it("indents the stored value so an administrator can edit a copy, and round-trips it", () => {
    const value = { palette: "ocean", sectionOrder: ["hero", "details"] };
    const text = formatSnapshotJson(value);

    assert.match(text, /\n {2}"palette": "ocean"/);
    assert.deepEqual(parseSnapshotJson(text), { ok: true, value });
  });
});

describe("prefillVersion", () => {
  it("starts from the published version even when a newer draft exists", () => {
    const versions = [version(3, "DRAFT"), version(2, "PUBLISHED"), version(1, "RETIRED")];
    assert.equal(prefillVersion(versions)?.version, 2);
  });

  it("starts from the newest version when none is published (the list is newest first)", () => {
    assert.equal(prefillVersion([version(2, "RETIRED"), version(1, "RETIRED")])?.version, 2);
    assert.equal(prefillVersion([version(1, "DRAFT")])?.version, 1);
  });

  it("starts from nothing for a template without versions", () => {
    assert.equal(prefillVersion([]), undefined);
  });
});

describe("prefillValues", () => {
  it("copies the renderer and the indented snapshot of the source version", () => {
    const values = prefillValues(version(2, "PUBLISHED"), ["birthday-adventure-01"]);

    assert.equal(values.componentKey, "birthday-adventure-01");
    assert.deepEqual(JSON.parse(values.schema), { n: 2 });
    assert.deepEqual(JSON.parse(values.configuration), { palette: "ocean" });
  });

  it("falls back to the first renderer when the source's key is no longer listed", () => {
    const values = prefillValues(version(1, "RETIRED", { componentKey: "gone" }), ["a", "b"]);
    assert.equal(values.componentKey, "a");
  });

  it("is empty, on the first renderer, without a source", () => {
    assert.deepEqual(prefillValues(undefined, ["a", "b"]), {
      componentKey: "a",
      schema: "",
      configuration: "",
    });
    assert.equal(prefillValues(undefined, []).componentKey, "");
  });
});

describe("versionAction", () => {
  it("offers publish for a draft, retire for a published version, and nothing else", () => {
    assert.equal(versionAction("DRAFT"), "publish");
    assert.equal(versionAction("PUBLISHED"), "retire");
    assert.equal(versionAction("RETIRED"), null);
  });
});
