import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  boundContractIssues,
  isCatalogId,
  MAX_AMOUNT_MINOR,
  MAX_CONTRACT_ISSUE_LENGTH,
  MAX_CONTRACT_ISSUES,
  parseCatalogEntries,
  parseCatalogEntry,
  parseCatalogPackage,
  parseCatalogPackages,
  parseCatalogRenderers,
  parseCatalogTemplate,
  parseCatalogTemplates,
  parseCatalogTemplateVersion,
  parseCatalogTemplateVersions,
  parsePriceHistory,
} from "./admin-catalog-validators.ts";

// The web never trusts an API response shape (M3 T8a; S9): each validator accepts exactly the contract
// of `apps/api/src/catalog/presentation/**` and answers `undefined` for anything else, so the client
// fails closed.

const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const AT = "2026-11-09T12:00:00.000Z";

const ENTRY = {
  id: ID,
  key: "birthday",
  name: "Cumpleaños",
  description: null,
  isActive: true,
  createdAt: AT,
  updatedAt: AT,
};

const PACKAGE = {
  id: ID,
  key: "basic",
  name: "Básico",
  description: "Lo esencial",
  status: "ACTIVE",
  // How long a published invitation of the package lives, in days (S1, T1).
  durationDays: 30,
  createdAt: AT,
  updatedAt: AT,
  features: [{ id: ID, key: "RSVP", name: "Confirmar asistencia", included: true }],
  currentPrices: [{ currency: "MXN", amountMinor: 150000, createdAt: AT }],
};

const PRICE = { currency: "MXN", amountMinor: 150000, createdAt: AT, retiredAt: null };

/** Every way a field can be wrong for these contracts. */
function without<T extends object>(value: T, field: keyof T): unknown {
  const copy = { ...value };
  delete copy[field];
  return copy;
}

describe("isCatalogId", () => {
  it("accepts a canonical UUID and nothing that could change a path", () => {
    assert.equal(isCatalogId(ID), true);
    assert.equal(isCatalogId(ID.toUpperCase()), true);
    for (const value of [
      "",
      "1",
      `${ID}/x`,
      `../${ID}`,
      `${ID}?a=1`,
      ` ${ID}`,
      5,
      null,
      undefined,
    ]) {
      assert.equal(isCatalogId(value), false, String(value));
    }
  });
});

describe("parseCatalogEntry", () => {
  it("accepts a category or a feature and keeps only the known fields", () => {
    assert.deepEqual(parseCatalogEntry({ ...ENTRY, extra: "ignored" }), ENTRY);
    assert.deepEqual(parseCatalogEntry({ ...ENTRY, description: "Texto", isActive: false }), {
      ...ENTRY,
      description: "Texto",
      isActive: false,
    });
  });

  it("refuses a missing or mistyped field", () => {
    for (const field of Object.keys(ENTRY) as Array<keyof typeof ENTRY>) {
      assert.equal(parseCatalogEntry(without(ENTRY, field)), undefined, `missing ${field}`);
    }
    for (const bad of [
      { id: "not-a-uuid" },
      { key: "" },
      { name: 1 },
      { description: 5 },
      { description: undefined },
      { isActive: "true" },
      { isActive: 1 },
      { createdAt: "yesterday" },
      { updatedAt: 0 },
    ]) {
      assert.equal(parseCatalogEntry({ ...ENTRY, ...bad }), undefined, JSON.stringify(bad));
    }
  });

  it("refuses a value that is not an object", () => {
    for (const value of [null, undefined, "x", 1, [], [ENTRY]]) {
      assert.equal(parseCatalogEntry(value), undefined);
    }
  });
});

describe("parseCatalogEntries", () => {
  it("accepts a list, including an empty one", () => {
    assert.deepEqual(parseCatalogEntries([]), []);
    assert.deepEqual(parseCatalogEntries([ENTRY, { ...ENTRY, key: "wedding" }]), [
      ENTRY,
      { ...ENTRY, key: "wedding" },
    ]);
  });

  it("refuses a non-list or a list holding one bad item", () => {
    assert.equal(parseCatalogEntries(ENTRY), undefined);
    assert.equal(parseCatalogEntries(null), undefined);
    assert.equal(parseCatalogEntries([ENTRY, { ...ENTRY, id: 5 }]), undefined);
  });
});

describe("parseCatalogPackage", () => {
  it("accepts a package with features and current prices", () => {
    assert.deepEqual(parseCatalogPackage({ ...PACKAGE, extra: 1 }), PACKAGE);
    assert.deepEqual(parseCatalogPackage({ ...PACKAGE, features: [], currentPrices: [] }), {
      ...PACKAGE,
      features: [],
      currentPrices: [],
    });
  });

  it("accepts each status and refuses any other", () => {
    for (const status of ["DRAFT", "ACTIVE", "ARCHIVED"]) {
      assert.equal(parseCatalogPackage({ ...PACKAGE, status })?.status, status);
    }
    for (const status of ["active", "DELETED", "", null, 1]) {
      assert.equal(parseCatalogPackage({ ...PACKAGE, status }), undefined, String(status));
    }
  });

  it("refuses a missing field, a bad feature, and a bad price", () => {
    for (const field of Object.keys(PACKAGE) as Array<keyof typeof PACKAGE>) {
      assert.equal(parseCatalogPackage(without(PACKAGE, field)), undefined, `missing ${field}`);
    }
    for (const bad of [
      { features: [{ id: ID, key: "RSVP", name: "x" }] },
      { features: [{ id: "x", key: "RSVP", name: "x", included: true }] },
      { features: [{ id: ID, key: "RSVP", name: "x", included: "yes" }] },
      { features: null },
      { currentPrices: [{ currency: "mxn", amountMinor: 1, createdAt: AT }] },
      { currentPrices: [{ currency: "MXN", amountMinor: 1.5, createdAt: AT }] },
      { currentPrices: [{ currency: "MXN", amountMinor: -1, createdAt: AT }] },
      { currentPrices: [{ currency: "MXN", amountMinor: MAX_AMOUNT_MINOR + 1, createdAt: AT }] },
      { currentPrices: [{ currency: "MXN", amountMinor: "100", createdAt: AT }] },
      { currentPrices: [{ currency: "MXN", amountMinor: 1 }] },
      { currentPrices: {} },
    ]) {
      assert.equal(parseCatalogPackage({ ...PACKAGE, ...bad }), undefined, JSON.stringify(bad));
    }
  });

  it("accepts the largest amount and zero", () => {
    for (const amountMinor of [0, MAX_AMOUNT_MINOR]) {
      const parsed = parseCatalogPackage({
        ...PACKAGE,
        currentPrices: [{ currency: "MXN", amountMinor, createdAt: AT }],
      });
      assert.equal(parsed?.currentPrices[0]?.amountMinor, amountMinor);
    }
  });

  it("validates every package of a list", () => {
    assert.deepEqual(parseCatalogPackages([PACKAGE]), [PACKAGE]);
    assert.equal(parseCatalogPackages([PACKAGE, { ...PACKAGE, status: "x" }]), undefined);
    assert.equal(parseCatalogPackages({}), undefined);
  });
});

describe("parsePriceHistory", () => {
  it("accepts current and retired rows", () => {
    const retired = { ...PRICE, retiredAt: AT };
    assert.deepEqual(parsePriceHistory([PRICE, retired]), [PRICE, retired]);
    assert.deepEqual(parsePriceHistory([]), []);
  });

  it("refuses a row with a bad field or a missing retiredAt", () => {
    for (const bad of [
      { currency: "PESOS" },
      { amountMinor: 0.5 },
      { amountMinor: null },
      { createdAt: null },
      { retiredAt: undefined },
      { retiredAt: "never" },
      { retiredAt: 5 },
    ]) {
      assert.equal(parsePriceHistory([{ ...PRICE, ...bad }]), undefined, JSON.stringify(bad));
    }
    assert.equal(parsePriceHistory(PRICE), undefined);
  });
});

const TEMPLATE = {
  id: ID,
  key: "adventure",
  name: "Aventura",
  description: null,
  status: "PUBLISHED",
  category: { id: ID, key: "birthday", name: "Cumpleaños" },
  createdAt: AT,
  updatedAt: AT,
  publishedVersion: { id: ID, version: 2 },
  versionCount: 3,
};

const VERSION = {
  id: ID,
  version: 2,
  status: "PUBLISHED",
  componentKey: "birthday-poster-01",
  schema: { fields: [] },
  configuration: { theme: "dinosaurs" },
  createdAt: AT,
};

describe("parseCatalogTemplate", () => {
  it("accepts the API's template and keeps only the fields the pages use", () => {
    assert.deepEqual(parseCatalogTemplate({ ...TEMPLATE, extra: "ignored" }), TEMPLATE);
    assert.deepEqual(parseCatalogTemplate({ ...TEMPLATE, publishedVersion: null }), {
      ...TEMPLATE,
      publishedVersion: null,
    });
    assert.deepEqual(parseCatalogTemplate({ ...TEMPLATE, description: "Texto", versionCount: 0 }), {
      ...TEMPLATE,
      description: "Texto",
      versionCount: 0,
    });
  });

  it("answers undefined for anything off the contract", () => {
    const bad: unknown[] = [
      null,
      "x",
      [],
      without(TEMPLATE, "id"),
      without(TEMPLATE, "category"),
      without(TEMPLATE, "publishedVersion"),
      without(TEMPLATE, "versionCount"),
      { ...TEMPLATE, id: "1" },
      { ...TEMPLATE, key: "" },
      { ...TEMPLATE, status: "RETIRED" },
      { ...TEMPLATE, status: "published" },
      { ...TEMPLATE, description: 5 },
      { ...TEMPLATE, createdAt: "yesterday" },
      { ...TEMPLATE, versionCount: -1 },
      { ...TEMPLATE, versionCount: 1.5 },
      { ...TEMPLATE, versionCount: "3" },
      { ...TEMPLATE, category: null },
      { ...TEMPLATE, category: { id: ID, key: "birthday" } },
      { ...TEMPLATE, category: { id: "x", key: "birthday", name: "N" } },
      { ...TEMPLATE, publishedVersion: { id: ID } },
      { ...TEMPLATE, publishedVersion: { id: ID, version: 0 } },
      { ...TEMPLATE, publishedVersion: { id: "x", version: 1 } },
      { ...TEMPLATE, publishedVersion: undefined },
    ];
    for (const value of bad) {
      assert.equal(parseCatalogTemplate(value), undefined, JSON.stringify(value));
    }
  });

  it("parses a list only when every row is valid", () => {
    assert.deepEqual(parseCatalogTemplates([TEMPLATE]), [TEMPLATE]);
    assert.deepEqual(parseCatalogTemplates([]), []);
    assert.equal(parseCatalogTemplates([TEMPLATE, { ...TEMPLATE, status: "X" }]), undefined);
    assert.equal(parseCatalogTemplates(TEMPLATE), undefined);
  });
});

describe("parseCatalogTemplateVersion", () => {
  it("accepts a version, keeping the JSON snapshot as it came", () => {
    assert.deepEqual(parseCatalogTemplateVersion({ ...VERSION, extra: 1 }), VERSION);
    for (const status of ["DRAFT", "PUBLISHED", "RETIRED"]) {
      assert.equal(parseCatalogTemplateVersion({ ...VERSION, status })?.status, status);
    }
    assert.deepEqual(
      parseCatalogTemplateVersion({ ...VERSION, schema: null, configuration: [1] }),
      {
        ...VERSION,
        schema: null,
        configuration: [1],
      },
    );
  });

  it("answers undefined for anything off the contract", () => {
    const bad: unknown[] = [
      null,
      [],
      without(VERSION, "schema"),
      without(VERSION, "configuration"),
      without(VERSION, "componentKey"),
      { ...VERSION, id: "1" },
      { ...VERSION, version: 0 },
      { ...VERSION, version: "2" },
      { ...VERSION, status: "ARCHIVED" },
      { ...VERSION, componentKey: "" },
      { ...VERSION, componentKey: 7 },
      { ...VERSION, createdAt: 5 },
    ];
    for (const value of bad) {
      assert.equal(parseCatalogTemplateVersion(value), undefined, JSON.stringify(value));
    }
  });

  it("parses a list only when every row is valid", () => {
    assert.deepEqual(parseCatalogTemplateVersions([VERSION]), [VERSION]);
    assert.equal(parseCatalogTemplateVersions([VERSION, { ...VERSION, version: 0 }]), undefined);
    assert.equal(parseCatalogTemplateVersions("[]"), undefined);
  });
});

describe("parseCatalogRenderers", () => {
  it("accepts the allow-list and keeps only the keys", () => {
    assert.deepEqual(parseCatalogRenderers([{ componentKey: "birthday-poster-01", x: 1 }]), [
      { componentKey: "birthday-poster-01" },
    ]);
    assert.deepEqual(parseCatalogRenderers([]), []);
  });

  it("answers undefined for anything off the contract", () => {
    for (const value of [null, {}, [{}], [{ componentKey: "" }], [{ componentKey: 1 }], ["a"]]) {
      assert.equal(parseCatalogRenderers(value), undefined, JSON.stringify(value));
    }
  });
});

describe("boundContractIssues", () => {
  it("keeps the issue strings of the API as they are", () => {
    assert.deepEqual(boundContractIssues(["a", "configuration.palette must be one of: sunset"]), [
      "a",
      "configuration.palette must be one of: sunset",
    ]);
  });

  it("keeps at most MAX_CONTRACT_ISSUES issues", () => {
    const issues = Array.from({ length: MAX_CONTRACT_ISSUES + 30 }, (_, index) => `issue ${index}`);
    const bounded = boundContractIssues(issues);
    assert.equal(bounded.length, MAX_CONTRACT_ISSUES);
    assert.equal(bounded[0], "issue 0");
  });

  it("cuts a long issue to MAX_CONTRACT_ISSUE_LENGTH characters, ending in an ellipsis", () => {
    const [issue] = boundContractIssues(["x".repeat(MAX_CONTRACT_ISSUE_LENGTH * 10)]);
    assert.equal(issue?.length, MAX_CONTRACT_ISSUE_LENGTH);
    assert.ok(issue?.endsWith("…"));
    assert.deepEqual(boundContractIssues(["y".repeat(MAX_CONTRACT_ISSUE_LENGTH)]), [
      "y".repeat(MAX_CONTRACT_ISSUE_LENGTH),
    ]);
  });

  it("drops what is not text, blank lines, and control characters", () => {
    assert.deepEqual(
      boundContractIssues([1, null, {}, ["x"], "", "   ", "\u0007\n", "a\u0000b\nc\u001b[31m"]),
      ["a b c [31m"],
    );
  });

  it("counts only the kept issues against the limit", () => {
    const mixed = [...Array.from({ length: 50 }, () => 7), "kept"];
    assert.deepEqual(boundContractIssues(mixed), ["kept"]);
  });

  it("answers an empty list for a body without a list of issues", () => {
    for (const value of [undefined, null, "issue", { 0: "issue" }, 5]) {
      assert.deepEqual(boundContractIssues(value), []);
    }
  });
});
