import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import {
  hashInvitationPassword,
  INVITATION_PASSWORD_DUMMY_HASH,
  INVITATION_PASSWORD_HASH_PREFIX,
  INVITATION_PASSWORD_SCRYPT,
  INVITATION_PASSWORD_SALT_BYTES,
  spendInvitationPasswordVerification,
  verifyInvitationPassword,
} from "./invitation-password";

// The stored form of one access code (F13; S2.13, L18.1): Node's own `crypto.scrypt`, a random salt per password, a stated
// cost, and a constant-time comparison. Nothing here invents cryptography, and nothing here stores or returns the plain
// value.

const PASSWORD = "clave-familiar";

describe("hashInvitationPassword (L18.1)", () => {
  it("encodes the scheme, the cost, the salt, and the derived key", async () => {
    const stored = await hashInvitationPassword(PASSWORD);
    const parts = stored.split("$");

    assert.equal(parts.length, 6);
    assert.equal(parts[0], INVITATION_PASSWORD_HASH_PREFIX);
    assert.equal(parts[1], String(INVITATION_PASSWORD_SCRYPT.N));
    assert.equal(parts[2], String(INVITATION_PASSWORD_SCRYPT.r));
    assert.equal(parts[3], String(INVITATION_PASSWORD_SCRYPT.p));
    assert.equal(Buffer.from(parts[4] ?? "", "base64url").length, INVITATION_PASSWORD_SALT_BYTES);
    assert.equal(
      Buffer.from(parts[5] ?? "", "base64url").length,
      INVITATION_PASSWORD_SCRYPT.keyLength,
    );
  });

  it("states the cost this deployment writes: scrypt N=16384, r=8, p=1, a 64-byte key", () => {
    assert.deepEqual(
      {
        N: INVITATION_PASSWORD_SCRYPT.N,
        r: INVITATION_PASSWORD_SCRYPT.r,
        p: INVITATION_PASSWORD_SCRYPT.p,
        keyLength: INVITATION_PASSWORD_SCRYPT.keyLength,
      },
      { N: 16_384, r: 8, p: 1, keyLength: 64 },
    );
  });

  it("never stores the plain value, and a fresh salt makes two hashes differ", async () => {
    const first = await hashInvitationPassword(PASSWORD);
    const second = await hashInvitationPassword(PASSWORD);

    assert.notEqual(first, second, "each password gets its own random salt");
    assert.equal(first.includes(PASSWORD), false);
    assert.notEqual(first.split("$")[4], second.split("$")[4]);
    assert.notEqual(first.split("$")[5], second.split("$")[5]);
  });

  it("draws the salt from the injected random source, one fresh salt per call", async () => {
    const salts: string[] = [];
    const random = (size: number): Buffer => {
      const bytes = randomBytes(size);
      salts.push(bytes.toString("base64url"));
      return bytes;
    };

    const stored = await hashInvitationPassword(PASSWORD, random);

    assert.equal(salts.length, 1);
    assert.equal(stored.split("$")[4], salts[0]);
    assert.equal(Buffer.from(salts[0] ?? "", "base64url").length, INVITATION_PASSWORD_SALT_BYTES);
  });
});

describe("verifyInvitationPassword (L18.1, L18.4)", () => {
  it("opens the invitation with the same code and nothing else", async () => {
    const stored = await hashInvitationPassword(PASSWORD);

    assert.equal(await verifyInvitationPassword(stored, PASSWORD), true);
    // The same normalization the set applies: the surrounding whitespace never decides.
    assert.equal(await verifyInvitationPassword(stored, `  ${PASSWORD}  `), true);
    assert.equal(await verifyInvitationPassword(stored, "clave-Familiar"), false);
    assert.equal(await verifyInvitationPassword(stored, `${PASSWORD}!`), false);
    assert.equal(await verifyInvitationPassword(stored, ""), false);
  });

  it("fails closed for an invitation with no code, and for a value no verifier can read", async () => {
    for (const stored of [
      null,
      "",
      "scrypt",
      "bcrypt$1$2$3$4$5",
      "scrypt$16384$8$1$onlyfivefields",
      "scrypt$0$8$1$AAAA$AAAA",
      "scrypt$16384$8$1$$",
      "scrypt$999999999$8$1$AAAA$AAAA",
      "scrypt$16384$999$1$AAAA$AAAA",
      "scrypt$16384$8$1$not base64$AAAA",
      `scrypt$16384$8$1$${randomBytes(16).toString("base64url")}$${randomBytes(8).toString("base64url")}`,
    ]) {
      assert.equal(await verifyInvitationPassword(stored, PASSWORD), false, String(stored));
    }
  });

  it("treats a value that is not a string as an attempt with no code", async () => {
    const stored = await hashInvitationPassword(PASSWORD);

    for (const presented of [undefined, null, 12_345, { password: PASSWORD }, [PASSWORD]]) {
      assert.equal(await verifyInvitationPassword(stored, presented), false);
    }
  });

  it("verifies against the cost the stored hash was written with, not the current one", async () => {
    // A row written when the deployment used a lower cost keeps opening its invitation.
    const { scryptSync } = await import("node:crypto");
    const salt = randomBytes(INVITATION_PASSWORD_SALT_BYTES);
    const key = scryptSync(PASSWORD, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const stored = `scrypt$16384$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;

    assert.equal(await verifyInvitationPassword(stored, PASSWORD), true);
  });
});

describe("spendInvitationPasswordVerification (L18.3)", () => {
  it("answers false after the same work, so an attempt with nothing to verify is not faster", async () => {
    const stored = await hashInvitationPassword(PASSWORD);
    const startedReal = process.hrtime.bigint();
    await verifyInvitationPassword(stored, "no-es-la-clave");
    const real = Number(process.hrtime.bigint() - startedReal);

    const startedDummy = process.hrtime.bigint();
    const answer = await spendInvitationPasswordVerification("no-es-la-clave");
    const dummy = Number(process.hrtime.bigint() - startedDummy);

    assert.equal(answer, false);
    assert.equal(
      await verifyInvitationPassword(INVITATION_PASSWORD_DUMMY_HASH, "no-es-la-clave"),
      false,
    );
    // A generous bound: both paths run one scrypt derivation, so neither is an order of magnitude cheaper.
    assert.ok(
      dummy > real / 10,
      `the dummy verification (${dummy} ns) is not free next to ${real} ns`,
    );
  });
});
