import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InvalidDisplayNameError } from "./own-profile.use-cases";

describe("InvalidDisplayNameError", () => {
  it("keeps the 400 message that PATCH /me returns, with the limit read from the domain", () => {
    assert.equal(
      new InvalidDisplayNameError().message,
      "displayName must be 1 to 120 characters after trimming, without control characters.",
    );
  });
});
