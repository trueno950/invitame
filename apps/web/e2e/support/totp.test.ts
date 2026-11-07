import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeBase32, hotp, totpCode, wrongTotpCode } from "./totp.ts";

// The browser tests' TOTP generator (M2 T9b part B) against the published test vectors, so a
// refused code in a browser test means the API refused a correct code, not that the helper is wrong.

// RFC 6238 appendix B and RFC 4226 appendix D use the ASCII secret "12345678901234567890" (SHA-1).
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("e2e TOTP helper", () => {
  it("decodes the base32 setup key as shown on the page, in groups of four", () => {
    assert.deepEqual(decodeBase32(RFC_SECRET_BASE32), RFC_SECRET);
    assert.deepEqual(decodeBase32("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ"), RFC_SECRET);
    assert.throws(() => decodeBase32("GEZD 1BVG"), /not base32/);
  });

  it("matches the RFC 4226 HOTP values", () => {
    assert.deepEqual(
      [0, 1, 2, 9].map((counter) => hotp(RFC_SECRET, counter)),
      ["755224", "287082", "359152", "520489"],
    );
  });

  it("matches the RFC 6238 SHA-1 values, truncated to 6 digits", () => {
    assert.equal(totpCode(RFC_SECRET_BASE32, 59_000), "287082");
    assert.equal(totpCode(RFC_SECRET_BASE32, 1_111_111_109_000), "081804");
    assert.equal(totpCode(RFC_SECRET_BASE32, 2_000_000_000_000), "279037");
  });

  it("finds a wrong code outside the steps the API accepts", () => {
    const at = 1_111_111_109_000;
    const wrong = wrongTotpCode(RFC_SECRET_BASE32, at);
    assert.match(wrong, /^\d{6}$/);
    for (const offset of [-30_000, 0, 30_000, 60_000]) {
      assert.notEqual(wrong, totpCode(RFC_SECRET_BASE32, at + offset));
    }
  });
});
