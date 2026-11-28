import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createInvitationAccessTokens } from "./invitation-access-token";
import {
  type InvitationLockReader,
  InvitationPasswordGate,
  type StoredInvitationLock,
} from "./invitation-lock";
import { hashInvitationPassword } from "./invitation-password";
import { InvitationUnlockRateLimitedError } from "./invitation-password.errors";
import type { InvitationUnlockRateLimiter } from "./invitation-unlock-rate-limiter";
import { UnlockInvitationUseCase } from "./invitation-unlock.use-cases";

// The unlock route and the gate (F13; S2.13, L18.2, L18.3). The use case runs against an in-memory lock and an in-memory
// limit, so each case observes the exact decision: which scope was counted, whether the code was even verified, which
// token came back, and what a refusal answers.

const INVITATION = "22222222-2222-4222-8222-222222222222";
const OTHER_INVITATION = "33333333-3333-4333-8333-333333333333";
const SLUG = "boda-protegida";
const PASSWORD = "clave-familiar";
const SECRET = randomBytes(32).toString("base64url");
const TOKENS = createInvitationAccessTokens(SECRET);
const NOW = new Date("2026-12-16T10:00:00.000Z");

class MemoryLocks implements InvitationLockReader {
  readonly locks = new Map<string, StoredInvitationLock>();
  reads = 0;

  async findLockBySlug(slug: string): Promise<StoredInvitationLock | null> {
    this.reads += 1;

    return this.locks.get(slug) ?? null;
  }
}

class MemoryLimiter implements InvitationUnlockRateLimiter {
  readonly scopes: string[] = [];
  readonly addresses: string[] = [];
  allow = true;

  async consume(scope: string, clientAddress: string): Promise<boolean> {
    this.scopes.push(scope);
    this.addresses.push(clientAddress);

    return this.allow;
  }
}

async function locksWith(passwordHash: string | null, version = 3): Promise<MemoryLocks> {
  const locks = new MemoryLocks();
  locks.locks.set(SLUG, {
    invitationId: INVITATION,
    passwordHash,
    passwordVersion: version,
    content: { coupleNameOne: "Ana", coupleNameTwo: "Luis" },
  });

  return locks;
}

function useCase(locks: MemoryLocks, limiter: MemoryLimiter): UnlockInvitationUseCase {
  return new UnlockInvitationUseCase(locks, TOKENS, limiter, () => NOW);
}

describe("UnlockInvitationUseCase (L18.2, L18.3)", () => {
  it("mints a token for the invitation and version when the code matches", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const limiter = new MemoryLimiter();
    const result = await useCase(locks, limiter).execute({
      slug: SLUG,
      password: PASSWORD,
      clientAddress: "198.18.0.1",
    });

    assert.equal(result.status, "unlocked");
    assert.ok(result.status === "unlocked");
    assert.deepEqual(result.expiresAt, new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000));
    assert.equal(TOKENS.isValid(result.token, INVITATION, 3, NOW), true);
    // The attempt is counted under the invitation it named, and the address never enters the scope.
    assert.deepEqual(limiter.scopes, [`invitation:${INVITATION}`]);
    assert.deepEqual(limiter.addresses, ["198.18.0.1"]);
  });

  it("answers the neutral refusal for a wrong code, without minting anything", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const result = await useCase(locks, new MemoryLimiter()).execute({
      slug: SLUG,
      password: "no-es-la-clave",
      clientAddress: "198.18.0.2",
    });

    assert.deepEqual(result, { status: "rejected" });
  });

  it("answers the same refusal for an address no invitation holds, under a digest of that address", async () => {
    const locks = new MemoryLocks();
    const limiter = new MemoryLimiter();
    const result = await useCase(locks, limiter).execute({
      slug: "no-existe",
      password: PASSWORD,
      clientAddress: "198.18.0.3",
    });

    assert.deepEqual(result, { status: "rejected" });
    assert.equal(limiter.scopes.length, 1);
    // A digest, never the address itself, so the budget names no lookup.
    assert.match(limiter.scopes[0] ?? "", /^address:[0-9a-f]{64}$/u);
    assert.equal(limiter.scopes[0]?.includes("no-existe"), false);
  });

  it("answers the same refusal for an invitation with no access code", async () => {
    const locks = await locksWith(null);
    const result = await useCase(locks, new MemoryLimiter()).execute({
      slug: SLUG,
      password: PASSWORD,
      clientAddress: "198.18.0.4",
    });

    assert.deepEqual(result, { status: "rejected" });
  });

  it("answers the same refusal for a code that is not a string", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));

    for (const password of [undefined, null, 1234, { password: PASSWORD }]) {
      const result = await useCase(locks, new MemoryLimiter()).execute({
        slug: SLUG,
        password,
        clientAddress: "198.18.0.5",
      });

      assert.deepEqual(result, { status: "rejected" });
    }
  });

  it("is limited before anything is verified, and refuses without touching the invitation", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const limiter = new MemoryLimiter();
    limiter.allow = false;

    await assert.rejects(
      () =>
        useCase(locks, limiter).execute({
          slug: SLUG,
          password: PASSWORD,
          clientAddress: "198.18.0.6",
        }),
      InvitationUnlockRateLimitedError,
    );
    // The budget is spent before the read: a locked-out attempt never reaches the hash or the store.
    assert.equal(locks.reads, 1, "the lock is read to name the scope, and nothing else");
  });

  it("counts the attempt on a malformed address too, so no request of the route is free", async () => {
    const locks = new MemoryLocks();
    const limiter = new MemoryLimiter();
    const result = await useCase(locks, limiter).execute({
      slug: "NOT A SLUG",
      password: PASSWORD,
      clientAddress: "198.18.0.7",
    });

    assert.deepEqual(result, { status: "rejected" });
    assert.equal(limiter.scopes.length, 1);
    assert.equal(limiter.scopes[0]?.includes("NOT A SLUG"), false);
  });
});

describe("InvitationPasswordGate (L18.2, L18.3)", () => {
  it("passes an invitation with no access code and an address no visible invitation holds", async () => {
    const open = await locksWith(null);
    const gate = new InvitationPasswordGate(open, TOKENS, () => NOW);

    assert.deepEqual(await gate.check(SLUG, undefined), { locked: false });
    assert.deepEqual(await gate.check("no-existe", undefined), { locked: false });
    assert.deepEqual(await gate.check("NOT A SLUG", undefined), { locked: false });
    assert.deepEqual(await gate.check(undefined, undefined), { locked: false });
  });

  it("locks a coded invitation without a valid token, and carries only the display name", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const gate = new InvitationPasswordGate(locks, TOKENS, () => NOW);

    assert.deepEqual(await gate.check(SLUG, undefined), {
      locked: true,
      displayName: "Ana y Luis",
    });
    assert.deepEqual(await gate.check(SLUG, "not-a-token"), {
      locked: true,
      displayName: "Ana y Luis",
    });
    // Another invitation's token, and a token of an older version, are both refused.
    assert.deepEqual(await gate.check(SLUG, TOKENS.mint(OTHER_INVITATION, 3, NOW).token), {
      locked: true,
      displayName: "Ana y Luis",
    });
    assert.deepEqual(await gate.check(SLUG, TOKENS.mint(INVITATION, 2, NOW).token), {
      locked: true,
      displayName: "Ana y Luis",
    });
  });

  it("passes a coded invitation with a token minted for it and its current version", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const gate = new InvitationPasswordGate(locks, TOKENS, () => NOW);

    assert.deepEqual(await gate.check(SLUG, TOKENS.mint(INVITATION, 3, NOW).token), {
      locked: false,
    });
  });

  it("answers a display name of null when the content names nobody, and never opens on a store failure", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    locks.locks.set("sin-nombre", {
      invitationId: randomUUID(),
      passwordHash: await hashInvitationPassword(PASSWORD),
      passwordVersion: 0,
      content: {},
    });
    const gate = new InvitationPasswordGate(locks, TOKENS, () => NOW);

    assert.deepEqual(await gate.check("sin-nombre", undefined), {
      locked: true,
      displayName: null,
    });

    const failing: InvitationLockReader = {
      findLockBySlug: async () => {
        throw new Error("the store is down");
      },
    };
    await assert.rejects(
      () => new InvitationPasswordGate(failing, TOKENS, () => NOW).check(SLUG, undefined),
      { message: "the store is down" },
    );
  });
});
