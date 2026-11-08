import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InvalidDisplayNameError } from "./own-profile.use-cases";

describe("InvalidDisplayNameError", () => {
  it("keeps the exact message that PATCH /me returns when the use case rejects a name", () => {
    assert.equal(
      new InvalidDisplayNameError().message,
      "displayName must be 1 to 120 characters after trimming, without control characters.",
    );
  });
});
