import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { isGuestTokenFormat } from "../domain/invitation-guest";
import { guestTokenHash, mintGuestToken } from "./guest-token";

// The personal guest token (M6 G2; S1, S4): 128 bits from the platform's cryptographic random source, encoded as
// 22 base64url characters, and stored only as its SHA-256 hex digest. The token itself is the secret; the digest is
// what the database holds, so a leaked table cannot be replayed as a working link.

describe("minting a guest token (M6 G2; S4)", () => {
  it("draws 16 bytes from the platform's cryptographic random source and encodes 22 base64url characters", () => {
    const sizes: number[] = [];
    const token = mintGuestToken((size) => {
      sizes.push(size);
      return Buffer.from("0123456789abcdef", "utf8");
    });

    assert.deepEqual(sizes, [16]);
    assert.equal(token.length, 22);
    assert.equal(isGuestTokenFormat(token), true);
    // base64url of the injected bytes: no padding, and the URL-safe alphabet only.
    assert.equal(token, Buffer.from("0123456789abcdef", "utf8").toString("base64url"));
    assert.equal(token.includes("+"), false);
    assert.equal(token.includes("/"), false);
    assert.equal(token.endsWith("="), false);
  });

  it("answers a different token every time, and every token satisfies the stored format", () => {
    const tokens = new Set<string>();
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const token = mintGuestToken();
      assert.equal(token.length, 22);
      assert.equal(isGuestTokenFormat(token), true, token);
      tokens.add(token);
    }
    // 128 bits of entropy: a collision in 500 draws would mean the source is not random.
    assert.equal(tokens.size, 500);
  });
});

describe("hashing a guest token (M6 G2; S4)", () => {
  it("answers the lower-case SHA-256 hex digest, which is what the unique index stores", () => {
    const token = "0123456789-_abcdefghij";
    const hash = guestTokenHash(token);

    assert.equal(hash, createHash("sha256").update(token, "utf8").digest("hex"));
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash.includes(token), false);
  });

  it("is deterministic for one token and different for two tokens that differ in one character", () => {
    assert.equal(
      guestTokenHash("AAAAAAAAAAAAAAAAAAAAAA"),
      guestTokenHash("AAAAAAAAAAAAAAAAAAAAAA"),
    );
    assert.notEqual(
      guestTokenHash("AAAAAAAAAAAAAAAAAAAAAA"),
      guestTokenHash("AAAAAAAAAAAAAAAAAAAAAB"),
    );
  });

  it("hashes the minted token the same way the lookup will", () => {
    const token = mintGuestToken();
    const hash = guestTokenHash(token);

    assert.equal(hash.length, 64);
    assert.equal(guestTokenHash(token), hash);
  });
});
