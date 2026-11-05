import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { hashPassword } from "better-auth/crypto";

import { createAuth } from "../../auth/auth.factory";
import { BackgroundTasks } from "../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../auth/sign-in-code/sign-in-code-sender";
import { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../email/infrastructure/system-email-delivery-runtime";
import {
  type CreateAdministratorEvent,
  CreateAdministratorUseCase,
} from "../application/create-administrator.use-case";
import { PrismaAdministratorAccountRepository } from "./prisma-administrator-account.repository";

// The administrator creation command's transaction on real PostgreSQL (M2 T7; ADR 0004 decision 3,
// S20): the use case with Better Auth's own hasher and the Prisma adapter, checked against Better
// Auth's real password sign-in. Runs only through `pnpm --filter @invitame/api test:db` with an
// explicit DATABASE_URL that points at a disposable, already migrated local database. It is not
// part of `pnpm test` or CI.

const AUTH_BASE_URL = "http://localhost:3995";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SESSION_COOKIE = "better-auth.session_token";
const HOUR_MS = 60 * 60 * 1000;

function requireLocalDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "test:db requires an explicit DATABASE_URL");
  // Fail closed: this suite writes and deletes rows, so it never runs against a remote database.
  assert.ok(LOCAL_HOSTS.has(new URL(url).hostname), "test:db only runs against a local database");
  return url;
}

describe("creating an administrator on the Prisma schema (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const auth = createAuth({
    secret: randomBytes(32).toString("base64url"),
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [AUTH_BASE_URL],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    log: () => {},
  });
  const events: CreateAdministratorEvent[] = [];
  const useCase = new CreateAdministratorUseCase({
    accounts: new PrismaAdministratorAccountRepository(prisma),
    hashPassword,
    log: (event) => events.push(event),
  });
  const runId = randomUUID();
  const emails: string[] = [];
  const clientPrefix = `198.19.${randomBytes(1)[0]}.`;
  let clientCounter = 0;

  after(async () => {
    try {
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.rateLimit.deleteMany({ where: { key: { startsWith: clientPrefix } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function newEmail(label: string): string {
    const email = `t7-command-${label}-${runId}@example.test`;
    emails.push(email);
    return email;
  }

  async function signIn(email: string, password: string) {
    clientCounter += 1;
    const response = await auth.handler(
      new Request(`${AUTH_BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: AUTH_BASE_URL,
          "x-forwarded-for": `${clientPrefix}${clientCounter % 250}`,
        },
        body: JSON.stringify({ email, password }),
      }),
    );
    const cookie = response.headers
      .getSetCookie()
      .map((header) => header.split(";")[0] ?? "")
      .find((pair) => pair.startsWith(`${SESSION_COOKIE}=`));
    return { status: response.status, body: await response.text(), cookie };
  }

  function credentialOf(userId: string) {
    return prisma.account.findMany({ where: { userId, providerId: "credential" } });
  }

  it("creates an ACTIVE ADMIN and a credential account whose password Better Auth accepts", async () => {
    const email = newEmail("create");
    const before = Date.now();

    const { outcome, initialPassword } = await useCase.execute(email);

    assert.equal(outcome.outcome, "created");
    assert.ok(initialPassword);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.id, outcome.userId);
    assert.equal(user.role, "ADMIN");
    assert.equal(user.status, "ACTIVE");
    assert.equal(user.twoFactorEnabled, false);
    const [account, ...others] = await credentialOf(user.id);
    assert.equal(others.length, 0);
    assert.equal(account?.accountId, user.id);
    assert.notEqual(account?.password, initialPassword, "only the hash is stored");
    assert.ok((account?.createdAt.getTime() ?? 0) >= before - 1000, "the window starts now");

    const signedIn = await signIn(email, initialPassword);
    assert.equal(signedIn.status, 200);
    assert.ok(signedIn.cookie);
    assert.deepEqual(events.at(-1), { event: "administrator_created", userId: user.id });
  });

  it("creates nothing when the credential account cannot be written", async () => {
    const email = newEmail("atomic-create");
    const failing = prisma.$extends({
      query: {
        account: {
          create: () => {
            throw new Error("simulated account write failure");
          },
        },
      },
    }) as unknown as PrismaClient;
    const failingUseCase = new CreateAdministratorUseCase({
      accounts: new PrismaAdministratorAccountRepository(failing),
      hashPassword,
      log: () => {},
    });

    await assert.rejects(failingUseCase.execute(email), /simulated account write failure/);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  });

  it("reissues an un-enrolled administrator's password, restarts the window, and revokes sessions", async () => {
    const email = newEmail("reissue");
    const first = await useCase.execute(email);
    assert.ok(first.initialPassword);
    const userId = first.outcome.userId;
    const pending = await signIn(email, first.initialPassword);
    assert.equal(pending.status, 200);
    // An enrollment that was started but never confirmed, and a window that has already ended.
    await prisma.twoFactor.create({
      data: { userId, secret: "pending", backupCodes: "pending", verified: false },
    });
    await prisma.account.updateMany({
      where: { userId, providerId: "credential" },
      data: { createdAt: new Date(Date.now() - 30 * HOUR_MS) },
    });
    const wrong = await signIn(email, "not-the-password-x");

    const second = await useCase.execute(email);

    assert.equal(second.outcome.outcome, "reissued");
    assert.equal(second.outcome.userId, userId);
    assert.ok(second.initialPassword);
    assert.notEqual(second.initialPassword, first.initialPassword);
    assert.equal(await prisma.session.count({ where: { userId } }), 0, "sessions are revoked");
    assert.equal(
      await prisma.twoFactor.count({ where: { userId } }),
      0,
      "pending enrollment dropped",
    );
    const [account, ...others] = await credentialOf(userId);
    assert.equal(others.length, 0);
    assert.ok(Date.now() - (account?.createdAt.getTime() ?? 0) < 60_000, "the window restarts");
    assert.deepEqual(events.at(-1), {
      event: "administrator_password_reissued",
      userId,
      revokedSessions: 1,
    });

    const old = await signIn(email, first.initialPassword);
    assert.deepEqual(
      { status: old.status, body: old.body },
      { status: wrong.status, body: wrong.body },
    );
    assert.equal((await signIn(email, second.initialPassword)).status, 200);
  });

  it("rolls the whole reissue back when its last write fails", async () => {
    const email = newEmail("atomic-reissue");
    const first = await useCase.execute(email);
    assert.ok(first.initialPassword);
    const userId = first.outcome.userId;
    await signIn(email, first.initialPassword);
    await prisma.twoFactor.create({
      data: { userId, secret: "pending", backupCodes: "pending", verified: false },
    });
    const before = await credentialOf(userId);
    // Session revocation is the last write; its failure must undo the new credential account too.
    const failing = prisma.$extends({
      query: {
        session: {
          deleteMany: () => {
            throw new Error("simulated session write failure");
          },
        },
      },
    }) as unknown as PrismaClient;
    const failingUseCase = new CreateAdministratorUseCase({
      accounts: new PrismaAdministratorAccountRepository(failing),
      hashPassword,
      log: () => {},
    });

    await assert.rejects(failingUseCase.execute(email), /simulated session write failure/);

    assert.deepEqual(await credentialOf(userId), before);
    assert.equal(await prisma.twoFactor.count({ where: { userId } }), 1, "enrollment is kept");
    assert.equal(await prisma.session.count({ where: { userId } }), 1, "sessions are kept");
    assert.equal((await signIn(email, first.initialPassword)).status, 200);
  });

  it("refuses an enrolled administrator and changes nothing", async () => {
    const email = newEmail("enrolled");
    const first = await useCase.execute(email);
    const userId = first.outcome.userId;
    await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    const before = await credentialOf(userId);

    const second = await useCase.execute(email);

    assert.deepEqual(second, { outcome: { outcome: "refused", userId, reason: "enrolled" } });
    assert.deepEqual(await credentialOf(userId), before);
  });

  it("refuses a DISABLED administrator and changes nothing", async () => {
    const email = newEmail("disabled");
    const first = await useCase.execute(email);
    const userId = first.outcome.userId;
    await prisma.user.update({ where: { id: userId }, data: { status: "DISABLED" } });
    const before = await credentialOf(userId);

    const second = await useCase.execute(email);

    assert.deepEqual(second, { outcome: { outcome: "refused", userId, reason: "disabled" } });
    assert.deepEqual(await credentialOf(userId), before);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).status,
      "DISABLED",
    );
  });

  it("refuses a customer address: no promotion and no password", async () => {
    const email = newEmail("customer");
    const customer = await prisma.user.create({ data: { email, displayName: "" } });

    const result = await useCase.execute(email);

    assert.deepEqual(result, {
      outcome: { outcome: "refused", userId: customer.id, reason: "customer" },
    });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: customer.id } });
    assert.equal(stored.role, "CUSTOMER");
    assert.equal(await prisma.account.count({ where: { userId: customer.id } }), 0);
  });
});
