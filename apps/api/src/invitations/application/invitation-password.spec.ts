import assert from "node:assert/strict";
import crypto, { randomBytes } from "node:crypto";
import { describe, it, mock } from "node:test";

import {
  hashInvitationPassword,
  INVITATION_PASSWORD_DUMMY_HASH,
  INVITATION_PASSWORD_HASH_PREFIX,
  INVITATION_PASSWORD_SCRYPT,
  INVITATION_PASSWORD_SALT_BYTES,
  INVITATION_PASSWORD_STORED_SCRYPT_BOUNDS,
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
    // A row written with a cost this deployment no longer writes keeps opening its invitation. The cost is deliberately
    // a different N than the writer's default, so a verifier that ignored the stored parameters would answer false.
    const { scryptSync } = await import("node:crypto");
    const storedCost = { N: 2 ** 15, r: 8, p: 1 };
    assert.notEqual(storedCost.N, INVITATION_PASSWORD_SCRYPT.N);
    const salt = randomBytes(INVITATION_PASSWORD_SALT_BYTES);
    const key = scryptSync(PASSWORD, salt, INVITATION_PASSWORD_SCRYPT.keyLength, {
      ...storedCost,
      maxmem: INVITATION_PASSWORD_SCRYPT.maxMemory,
    });
    const stored = `scrypt$${storedCost.N}$${storedCost.r}$${storedCost.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;

    assert.equal(await verifyInvitationPassword(stored, PASSWORD), true);
    assert.equal(await verifyInvitationPassword(stored, "otra-clave"), false);
  });

  it("accepts no stored cost that asks scrypt for more memory than the verifier passes", () => {
    // Node refuses a derivation whose `128 * r * (N + p + 2)` bytes exceed `maxmem`, and that refusal must be a
    // parameter the parser already rejected, never an error thrown out of a verification.
    const bounds = INVITATION_PASSWORD_STORED_SCRYPT_BOUNDS;
    const cost = INVITATION_PASSWORD_SCRYPT;

    for (const N of [bounds.N.minimum, bounds.N.maximum]) {
      for (const r of [bounds.r.minimum, bounds.r.maximum]) {
        for (const p of [bounds.p.minimum, bounds.p.maximum]) {
          assert.ok(
            128 * r * (N + p + 2) <= cost.maxMemory,
            `N=${N} r=${r} p=${p} must fit within maxmem=${cost.maxMemory}`,
          );
        }
      }
    }
    assert.ok(
      128 * cost.r * (cost.N + cost.p + 2) <= cost.maxMemory,
      "the cost this deployment writes must fit the same bound",
    );
  });

  it("answers false, never throws, when scrypt fails during verification", async () => {
    // A value the process cannot derive is a code that does not match: failing closed locks the invitation, and an
    // error out of the route would answer a status the neutral refusal never uses.
    const stored = await hashInvitationPassword(PASSWORD);
    const failing = mock.method(crypto, "scrypt", (...args: unknown[]) => {
      const callback = args.at(-1) as (error: Error, derived?: Buffer) => void;
      callback(new Error("scrypt is unavailable"));
    });

    try {
      assert.equal(await verifyInvitationPassword(stored, PASSWORD), false);
      assert.equal(await spendInvitationPasswordVerification(PASSWORD), false);
    } finally {
      failing.mock.restore();
    }
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
