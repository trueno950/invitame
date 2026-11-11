import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { packageFitsTemplateVersion } from "./package-fit";

// The package-fit rule when a draft is created (M4 T2; S6, A1). Creating and editing a draft is free:
// the chosen package is only validated, and it fits a template version when it is ACTIVE and includes
// every feature key that version's renderer requires. Feature keys are data compared by equality; no
// package or feature name selects behavior.

describe("packageFitsTemplateVersion", () => {
  it("fits an empty feature requirement for any ACTIVE package", () => {
    for (const includedFeatureKeys of [[], ["COUNTDOWN"], ["COUNTDOWN", "MAP", "RSVP"]]) {
      assert.equal(
        packageFitsTemplateVersion({ packageStatus: "ACTIVE", includedFeatureKeys }, []),
        true,
        includedFeatureKeys.join(),
      );
    }
  });

  it("fits when the package includes every required key, whatever its extras", () => {
    const cases: [string[], string[]][] = [
      [["COUNTDOWN"], ["COUNTDOWN"]],
      [
        ["COUNTDOWN", "MAP", "RSVP"],
        ["COUNTDOWN", "RSVP"],
      ],
      [
        ["RSVP", "COUNTDOWN"],
        ["COUNTDOWN", "RSVP"],
      ],
      [["COUNTDOWN"], ["COUNTDOWN", "COUNTDOWN"]],
    ];

    for (const [includedFeatureKeys, requiredFeatureKeys] of cases) {
      assert.equal(
        packageFitsTemplateVersion(
          { packageStatus: "ACTIVE", includedFeatureKeys },
          requiredFeatureKeys,
        ),
        true,
        `${includedFeatureKeys.join()} vs ${requiredFeatureKeys.join()}`,
      );
    }
  });

  it("refuses a package that is not ACTIVE, even when it includes every key", () => {
    for (const packageStatus of ["DRAFT", "ARCHIVED", "active", " ACTIVE", "PUBLISHED", ""]) {
      assert.equal(
        packageFitsTemplateVersion({ packageStatus, includedFeatureKeys: ["COUNTDOWN"] }, [
          "COUNTDOWN",
        ]),
        false,
        JSON.stringify(packageStatus),
      );
    }
  });

  it("refuses a package that misses one required key", () => {
    assert.equal(
      packageFitsTemplateVersion(
        { packageStatus: "ACTIVE", includedFeatureKeys: ["COUNTDOWN", "MAP"] },
        ["COUNTDOWN", "RSVP"],
      ),
      false,
    );
    assert.equal(
      packageFitsTemplateVersion({ packageStatus: "ACTIVE", includedFeatureKeys: [] }, ["MAP"]),
      false,
    );
  });

  it("compares feature keys by exact equality, not by case or by prefix", () => {
    assert.equal(
      packageFitsTemplateVersion({ packageStatus: "ACTIVE", includedFeatureKeys: ["countdown"] }, [
        "COUNTDOWN",
      ]),
      false,
    );
    assert.equal(
      packageFitsTemplateVersion(
        { packageStatus: "ACTIVE", includedFeatureKeys: ["COUNTDOWN_PLUS"] },
        ["COUNTDOWN"],
      ),
      false,
    );
  });

  it("reads the entitlements it is given without changing them", () => {
    const includedFeatureKeys = Object.freeze(["COUNTDOWN", "MAP"]);
    const requiredFeatureKeys = Object.freeze(["COUNTDOWN"]);

    assert.equal(
      packageFitsTemplateVersion(
        { packageStatus: "ACTIVE", includedFeatureKeys },
        requiredFeatureKeys,
      ),
      true,
    );
    assert.deepEqual(includedFeatureKeys, ["COUNTDOWN", "MAP"]);
    assert.deepEqual(requiredFeatureKeys, ["COUNTDOWN"]);
  });
});
