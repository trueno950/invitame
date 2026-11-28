import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import {
  createInvitationAccessTokens,
  INVITATION_ACCESS_TOKEN_LIFETIME_SECONDS,
  INVITATION_ACCESS_TOKEN_PREFIX,
} from "./invitation-access-token";

// The access token of a password-protected invitation (F13; S2.13, L18.2): an HMAC-SHA256 over the invitation id, the
// password version, and the expiry, keyed with the deployment's own secret. The suite proves the three properties the
// design relies on — a token opens only its own invitation at its own version, it stops working when it expires, and an
// edited token fails the MAC — and that nothing about the invitation travels inside the value.

const INVITATION = "22222222-2222-4222-8222-222222222222";
const OTHER_INVITATION = "33333333-3333-4333-8333-333333333333";
const SECRET = randomBytes(32).toString("base64url");

describe("the invitation access token (L18.2)", () => {
  const tokens = createInvitationAccessTokens(SECRET);
  const issuedAt = new Date("2026-12-16T10:00:00.000Z");

  it("mints a token of the documented shape and a 30-day expiry", () => {
    const minted = tokens.mint(INVITATION, 3, issuedAt);
    const parts = minted.token.split(".");

    assert.equal(parts.length, 4);
    assert.equal(parts[0], INVITATION_ACCESS_TOKEN_PREFIX);
    assert.equal(parts[1], "3");
    assert.equal(
      Number(parts[2]),
      Math.floor(issuedAt.getTime() / 1000) + INVITATION_ACCESS_TOKEN_LIFETIME_SECONDS,
    );
    assert.equal(INVITATION_ACCESS_TOKEN_LIFETIME_SECONDS, 30 * 24 * 60 * 60);
    assert.deepEqual(minted.expiresAt, new Date(issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000));
  });

  it("keeps the invitation id and the password out of the token", () => {
    const minted = tokens.mint(INVITATION, 3, issuedAt);

    assert.equal(minted.token.includes(INVITATION), false);
    assert.equal(minted.token.includes("clave-familiar"), false);
  });

  it("opens exactly its own invitation at exactly its own password version", () => {
    const minted = tokens.mint(INVITATION, 3, issuedAt).token;

    assert.equal(tokens.isValid(minted, INVITATION, 3, issuedAt), true);
    // Another invitation, even with the same version and the same secret, is not opened by it.
    assert.equal(tokens.isValid(minted, OTHER_INVITATION, 3, issuedAt), false);
    // A changed or removed password raises the version, so every older token stops opening the invitation.
    assert.equal(tokens.isValid(minted, INVITATION, 4, issuedAt), false);
    assert.equal(tokens.isValid(minted, INVITATION, 2, issuedAt), false);
  });

  it("stops working once it expires, and answers at the exact boundary", () => {
    const minted = tokens.mint(INVITATION, 3, issuedAt);

    assert.equal(
      tokens.isValid(minted.token, INVITATION, 3, new Date(minted.expiresAt.getTime() - 1000)),
      true,
    );
    assert.equal(tokens.isValid(minted.token, INVITATION, 3, minted.expiresAt), false);
    assert.equal(
      tokens.isValid(minted.token, INVITATION, 3, new Date(minted.expiresAt.getTime() + 1000)),
      false,
    );
  });

  it("refuses an edited version, an edited expiry, an edited MAC, and a token of another secret", () => {
    const minted = tokens.mint(INVITATION, 3, issuedAt);
    const [prefix, version, expiry, mac = ""] = minted.token.split(".");
    const later = Number(expiry) + 10 ** 6;
    // One byte of the MAC flipped, deterministically: the value is never a literal that could coincide with the real one.
    const flippedMac = `${mac[0] === "A" ? "B" : "A"}${mac.slice(1)}`;
    assert.notEqual(flippedMac, mac);

    for (const presented of [
      `${prefix}.4.${expiry}.${mac}`,
      `${prefix}.3.${later}.${mac}`,
      `${prefix}.3.${expiry}.${flippedMac}`,
      "not-a-token",
      "",
      `${prefix}.3.${expiry}`,
      `other.${version}.${expiry}.${mac}`,
      `${prefix}.03.${expiry}.${mac}`,
      `${prefix}.3.${expiry}.not base64`,
    ]) {
      assert.equal(tokens.isValid(presented, INVITATION, 3, issuedAt), false, presented);
    }
    assert.equal(
      createInvitationAccessTokens(randomBytes(32).toString("base64url")).isValid(
        minted.token,
        INVITATION,
        3,
        issuedAt,
      ),
      false,
      "another deployment's secret does not verify",
    );
  });

  it("refuses a missing token and refuses to be built without a secret", () => {
    assert.equal(tokens.isValid(undefined, INVITATION, 3, issuedAt), false);
    assert.equal(tokens.isValid("", INVITATION, 3, issuedAt), false);
    assert.throws(() => createInvitationAccessTokens(""), {
      message: "INVITATION_ACCESS_SECRET must be provided.",
    });
  });

  it("mints a distinct value every time, so two guests never share a token", () => {
    const first = tokens.mint(INVITATION, 3, issuedAt).token;
    const second = tokens.mint(INVITATION, 3, issuedAt).token;

    // The same fields and the same secret are deterministic on purpose: the value is a signature, not a random id, and a
    // rotate of the code is what invalidates it (the version it covers).
    assert.equal(first, second);
    assert.equal(tokens.isValid(first, INVITATION, 3, issuedAt), true);
  });
});
