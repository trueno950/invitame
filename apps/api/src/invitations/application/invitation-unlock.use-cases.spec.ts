import assert from "node:assert/strict";
import crypto, { randomBytes, randomUUID } from "node:crypto";
import { describe, it, mock } from "node:test";

import { createInvitationAccessTokens } from "./invitation-access-token";
import {
  type InvitationLockReader,
  InvitationPasswordGate,
  type StoredInvitationLock,
} from "./invitation-lock";
import { hashInvitationPassword } from "./invitation-password";
import { InvitationUnlockRateLimitedError } from "./invitation-password.errors";
import {
  INVITATION_UNLOCK_CLIENT_RATE_LIMIT,
  INVITATION_UNLOCK_CLIENT_SCOPE,
  INVITATION_UNLOCK_RATE_LIMIT,
  INVITATION_UNLOCK_RATE_LIMIT_KEY_PREFIX,
  invitationUnlockRateLimitKey,
  invitationUnlockRateLimitRule,
  type InvitationUnlockRateLimiter,
  invitationUnlockScope,
  UNKNOWN_CLIENT_ADDRESS,
} from "./invitation-unlock-rate-limiter";
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

/** The unlock limit on its own counters, with the same fixed-window rule the real store enforces. */
class MemoryLimiter implements InvitationUnlockRateLimiter {
  readonly scopes: string[] = [];
  readonly addresses: string[] = [];
  readonly counts = new Map<string, number>();

  async consume(scope: string, clientAddress: string): Promise<boolean> {
    this.scopes.push(scope);
    this.addresses.push(clientAddress);
    const key = `${scope}|${clientAddress}`;
    const count = (this.counts.get(key) ?? 0) + 1;

    if (count > invitationUnlockRateLimitRule(scope).max) {
      return false;
    }
    this.counts.set(key, count);

    return true;
  }

  async refund(scope: string, clientAddress: string): Promise<void> {
    const key = `${scope}|${clientAddress}`;
    const count = this.counts.get(key) ?? 0;

    if (count > 0) {
      this.counts.set(key, count - 1);
    }
  }

  count(scope: string, clientAddress: string): number {
    return this.counts.get(`${scope}|${clientAddress}`) ?? 0;
  }
}

async function locksWith(passwordHash: string | null, version = 3): Promise<MemoryLocks> {
  const locks = new MemoryLocks();
  locks.locks.set(SLUG, {
    invitationId: INVITATION,
    passwordHash,
    passwordVersion: version,
    content: { coupleNameOne: "Ana", coupleNameTwo: "Luis" },
    redirectTo: null,
  });

  return locks;
}

function useCase(locks: MemoryLocks, limiter: MemoryLimiter): UnlockInvitationUseCase {
  return new UnlockInvitationUseCase(locks, TOKENS, limiter, () => NOW);
}

function attempt(
  locks: MemoryLocks,
  limiter: MemoryLimiter,
  password: unknown,
  options: { slug?: string; clientAddress?: string } = {},
) {
  return useCase(locks, limiter).execute({
    slug: options.slug ?? SLUG,
    password,
    clientAddress: options.clientAddress ?? "198.18.0.1",
  });
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
    // The cap that spans every address is counted first, then the per-address budget under a digest of the requested
    // address, so an attempt already over the cross-address cap spends nothing else.
    assert.equal(limiter.scopes.length, 2);
    assert.equal(limiter.scopes[0], INVITATION_UNLOCK_CLIENT_SCOPE);
    assert.match(limiter.scopes[1] ?? "", /^address:[0-9a-f]{64}$/u);
    assert.equal(limiter.scopes[1]?.includes(SLUG), false);
    assert.deepEqual(limiter.addresses, ["198.18.0.1", "198.18.0.1"]);
    // A successful unlock does not spend either budget.
    assert.equal(limiter.count(invitationUnlockScope(SLUG), "198.18.0.1"), 0);
    assert.equal(limiter.count(INVITATION_UNLOCK_CLIENT_SCOPE, "198.18.0.1"), 0);
  });

  it("answers the neutral refusal for a wrong code, without minting anything", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const result = await attempt(locks, new MemoryLimiter(), "no-es-la-clave", {
      clientAddress: "198.18.0.2",
    });

    assert.deepEqual(result, { status: "rejected" });
  });

  it("answers the same refusal for an address no invitation holds, under a digest of that address", async () => {
    const locks = new MemoryLocks();
    const limiter = new MemoryLimiter();
    const result = await attempt(locks, limiter, PASSWORD, {
      slug: "no-existe",
      clientAddress: "198.18.0.3",
    });

    assert.deepEqual(result, { status: "rejected" });
    assert.equal(limiter.scopes.length, 2);
    assert.equal(limiter.scopes[0], INVITATION_UNLOCK_CLIENT_SCOPE);
    // A digest of the requested address, never the address itself, so the budget names no lookup.
    assert.equal(limiter.scopes[1], invitationUnlockScope("no-existe"));
    assert.equal(limiter.scopes[1]?.includes("no-existe"), false);
  });

  it("answers the same refusal for an invitation with no access code", async () => {
    const locks = await locksWith(null);
    const result = await attempt(locks, new MemoryLimiter(), PASSWORD, {
      clientAddress: "198.18.0.4",
    });

    assert.deepEqual(result, { status: "rejected" });
  });

  it("answers the same refusal for a code that is not a string", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));

    for (const password of [undefined, null, 1234, { password: PASSWORD }]) {
      const result = await attempt(locks, new MemoryLimiter(), password, {
        clientAddress: "198.18.0.5",
      });

      assert.deepEqual(result, { status: "rejected" });
    }
  });

  it("refuses a code the domain cannot hold before any budget, read, or hashing work", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const limiter = new MemoryLimiter();
    const scryptSpy = mock.method(crypto, "scrypt");

    try {
      for (const password of [`a${"b".repeat(9_999)}`, "clave\u0000familiar", "abc"]) {
        const result = await attempt(locks, limiter, password, { clientAddress: "198.18.0.6" });

        assert.deepEqual(result, { status: "rejected" });
      }

      assert.equal(
        scryptSpy.mock.callCount(),
        0,
        "the hasher is never spent on a value no code can be",
      );
      assert.equal(locks.reads, 0, "no lock is read for a value no code can be");
      assert.deepEqual(limiter.scopes, [], "an impossible value spends no guest's budget");
    } finally {
      scryptSpy.mock.restore();
    }
  });

  it("is limited before the lock is read or anything is verified", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const limiter = new MemoryLimiter();

    for (let failure = 0; failure < INVITATION_UNLOCK_RATE_LIMIT.max; failure += 1) {
      assert.deepEqual(await attempt(locks, limiter, "no-es-la-clave"), { status: "rejected" });
    }
    const readsBeforeRefusal = locks.reads;

    await assert.rejects(
      () => attempt(locks, limiter, PASSWORD, { clientAddress: "198.18.0.1" }),
      InvitationUnlockRateLimitedError,
    );
    // The budget is spent before the read: a locked-out attempt never reaches the store or the hash.
    assert.equal(locks.reads, readsBeforeRefusal);
  });

  it("counts the attempt on a malformed address too, so no request of the route is free", async () => {
    const locks = new MemoryLocks();
    const limiter = new MemoryLimiter();
    const result = await attempt(locks, limiter, PASSWORD, {
      slug: "NOT A SLUG",
      clientAddress: "198.18.0.7",
    });

    assert.deepEqual(result, { status: "rejected" });
    assert.equal(limiter.scopes.length, 2);
    assert.equal(limiter.scopes[1]?.includes("NOT A SLUG"), false);
  });

  it("lets the eleventh correct unlock from one address through (a success spends no budget)", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const limiter = new MemoryLimiter();

    for (let unlock = 0; unlock < 11; unlock += 1) {
      const result = await attempt(locks, limiter, PASSWORD, { clientAddress: "198.18.0.8" });

      assert.equal(result.status, "unlocked", `unlock ${unlock + 1} must succeed`);
    }
    assert.equal(limiter.count(invitationUnlockScope(SLUG), "198.18.0.8"), 0);
    assert.equal(limiter.count(INVITATION_UNLOCK_CLIENT_SCOPE, "198.18.0.8"), 0);
  });

  it("keeps counting failures across a success, so one correct code does not reset the budget", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const limiter = new MemoryLimiter();

    for (let failure = 0; failure < 3; failure += 1) {
      await attempt(locks, limiter, "no-es-la-clave");
    }
    assert.equal((await attempt(locks, limiter, PASSWORD)).status, "unlocked");
    assert.equal(limiter.count(invitationUnlockScope(SLUG), "198.18.0.1"), 3);

    for (let failure = 3; failure < INVITATION_UNLOCK_RATE_LIMIT.max; failure += 1) {
      await attempt(locks, limiter, "no-es-la-clave");
    }
    await assert.rejects(
      () => attempt(locks, limiter, "no-es-la-clave"),
      InvitationUnlockRateLimitedError,
    );
  });

  it("caps one address across every address, so varying the slug buys no fresh budget", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const limiter = new MemoryLimiter();
    const address = "198.18.0.9";
    const slugs = [SLUG, "otra-invitacion", "una-tercera"];

    for (const slug of slugs) {
      for (let failure = 0; failure < INVITATION_UNLOCK_RATE_LIMIT.max; failure += 1) {
        assert.deepEqual(
          await attempt(locks, limiter, "no-es-la-clave", { slug, clientAddress: address }),
          {
            status: "rejected",
          },
        );
      }
    }
    // 30 failures later, an address no invitation holds is refused as well: the cap spans every slug.
    await assert.rejects(
      () => attempt(locks, limiter, PASSWORD, { slug: "cuarta", clientAddress: address }),
      InvitationUnlockRateLimitedError,
    );
    assert.equal(limiter.count(INVITATION_UNLOCK_CLIENT_SCOPE, address), 30);
  });

  it("does not share one bucket across every guest when no client address resolves", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const limiter = new MemoryLimiter();
    const unknown = UNKNOWN_CLIENT_ADDRESS;

    // The public-form limiters hash the shared `unknown` value into a key that also names the invitation, so the bucket
    // spans one address and never every guest of the deployment. The cap that spans every address cannot follow that
    // shape, so an address that did not resolve does not spend it.
    for (let failure = 0; failure < INVITATION_UNLOCK_RATE_LIMIT.max; failure += 1) {
      await attempt(locks, limiter, "no-es-la-clave", { clientAddress: unknown });
    }
    await assert.rejects(
      () => attempt(locks, limiter, "no-es-la-clave", { clientAddress: unknown }),
      InvitationUnlockRateLimitedError,
    );
    assert.equal(
      limiter.count(invitationUnlockScope(SLUG), unknown),
      INVITATION_UNLOCK_RATE_LIMIT.max,
    );
    assert.equal(limiter.count(INVITATION_UNLOCK_CLIENT_SCOPE, unknown), 0);
  });

  it("refuses an attempt already over the cross-address cap before it spends another address's budget", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const limiter = new MemoryLimiter();
    const address = "198.18.0.11";
    for (const slug of [SLUG, "otra-invitacion", "una-tercera"]) {
      for (let failure = 0; failure < INVITATION_UNLOCK_RATE_LIMIT.max; failure += 1) {
        await attempt(locks, limiter, "no-es-la-clave", { slug, clientAddress: address });
      }
    }
    await assert.rejects(
      () => attempt(locks, limiter, "no-es-la-clave", { slug: "cuarta", clientAddress: address }),
      InvitationUnlockRateLimitedError,
    );
    // A caller already over the cap that spans every address cannot keep spending other addresses' budgets: only that
    // scope is consulted, and the address it named keeps its whole budget.
    assert.equal(limiter.count(invitationUnlockScope("cuarta"), address), 0);
    assert.equal(
      limiter.count(INVITATION_UNLOCK_CLIENT_SCOPE, address),
      INVITATION_UNLOCK_CLIENT_RATE_LIMIT.max,
    );
  });

  it("spends no cross-address count on an attempt its own address's budget refuses", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    const limiter = new MemoryLimiter();
    const address = "198.18.0.12";
    for (let failure = 0; failure < INVITATION_UNLOCK_RATE_LIMIT.max; failure += 1) {
      await attempt(locks, limiter, "no-es-la-clave", { clientAddress: address });
    }
    await assert.rejects(
      () => attempt(locks, limiter, "no-es-la-clave", { clientAddress: address }),
      InvitationUnlockRateLimitedError,
    );
    // The attempt never reached the verifier, so it does not spend the budget shared by every address either: one guest
    // retrying a capped invitation cannot lock a whole venue out of the others.
    assert.equal(
      limiter.count(INVITATION_UNLOCK_CLIENT_SCOPE, address),
      INVITATION_UNLOCK_RATE_LIMIT.max,
    );
  });

  it("spends the budget under a key prefix of its own", () => {
    const key = invitationUnlockRateLimitKey(invitationUnlockScope(SLUG), "198.18.0.10");

    assert.equal(key.startsWith(INVITATION_UNLOCK_RATE_LIMIT_KEY_PREFIX), true);
    assert.equal(key.includes("198.18.0.10"), false);
    assert.equal(key.includes(SLUG), false);
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
      redirectTo: null,
    });
    assert.deepEqual(await gate.check(SLUG, "not-a-token"), {
      locked: true,
      displayName: "Ana y Luis",
      redirectTo: null,
    });
    // Another invitation's token, and a token of an older version, are both refused.
    assert.deepEqual(await gate.check(SLUG, TOKENS.mint(OTHER_INVITATION, 3, NOW).token), {
      locked: true,
      displayName: "Ana y Luis",
      redirectTo: null,
    });
    assert.deepEqual(await gate.check(SLUG, TOKENS.mint(INVITATION, 2, NOW).token), {
      locked: true,
      displayName: "Ana y Luis",
      redirectTo: null,
    });
  });

  it("carries the current address a previous one must redirect to before the lock screen (F11; L15.3)", async () => {
    const locks = await locksWith(await hashInvitationPassword(PASSWORD));
    locks.locks.set("boda-protegida-vieja", {
      invitationId: INVITATION,
      passwordHash: await hashInvitationPassword(PASSWORD),
      passwordVersion: 3,
      content: { coupleNameOne: "Ana", coupleNameTwo: "Luis" },
      redirectTo: SLUG,
    });
    const gate = new InvitationPasswordGate(locks, TOKENS, () => NOW);

    assert.deepEqual(await gate.check("boda-protegida-vieja", undefined), {
      locked: true,
      displayName: "Ana y Luis",
      redirectTo: SLUG,
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
      redirectTo: null,
    });
    const gate = new InvitationPasswordGate(locks, TOKENS, () => NOW);

    assert.deepEqual(await gate.check("sin-nombre", undefined), {
      locked: true,
      displayName: null,
      redirectTo: null,
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
