import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { emailCodeQuotaKey } from "../../auth/abuse-limits";
import { createAuth } from "../../auth/auth.factory";
import { BackgroundTasks } from "../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../auth/sign-in-code/sign-in-code-sender";
import { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { DisableUserUseCase } from "../application/disable-user.use-case";
import { PrismaUserAccessRepository } from "./prisma-user-access.repository";

// Disabling a user on real PostgreSQL (M2 T6a; ADR 0004 decision 6, S9, S18). Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a disposable,
// already migrated local database. It is not part of `pnpm test` or CI.

const AUTH_BASE_URL = "http://localhost:3999";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CODE_PATTERN = /\b(\d{6})\b/;
const SESSION_COOKIE = "better-auth.session_token";

function requireLocalDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "test:db requires an explicit DATABASE_URL");
  // Fail closed: this suite writes and deletes rows, so it never runs against a remote database.
  assert.ok(LOCAL_HOSTS.has(new URL(url).hostname), "test:db only runs against a local database");
  return url;
}

describe("disabling a user on the Prisma schema (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const sender = new InMemoryEmailSender();
  const tasks = new BackgroundTasks(() => {});
  const auth = createAuth({
    secret: randomBytes(32).toString("base64url"),
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [AUTH_BASE_URL],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(sender, {
        now: () => Date.now(),
        sleep: async () => {},
        warn: () => {},
        error: () => {},
      }),
      tasks,
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    log: () => {},
  });
  const events: unknown[] = [];
  const useCase = new DisableUserUseCase(new PrismaUserAccessRepository(prisma), (event) =>
    events.push(event),
  );
  const runId = randomUUID();
  const emails: string[] = [];
  const clientPrefix = `198.18.${randomBytes(1)[0]}.`;
  let clientCounter = 0;

  function newEmail(label: string): string {
    const email = `t6a-${label}-${runId}@example.test`;
    emails.push(email);
    return email;
  }

  function post(path: string, body: unknown): Promise<Response> {
    clientCounter += 1;
    return auth.handler(
      new Request(`${AUTH_BASE_URL}/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: AUTH_BASE_URL,
          "x-forwarded-for": `${clientPrefix}${clientCounter}`,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  /** Signs in through the email-code flow; returns the HTTP response of the sign-in. */
  async function signInByCode(email: string): Promise<Response> {
    assert.equal(
      (await post("/email-otp/send-verification-otp", { email, type: "sign-in" })).status,
      200,
    );
    await tasks.drain();
    const message = sender.delivered.filter((sent) => sent.to === email).at(-1);
    const code = CODE_PATTERN.exec(message?.text ?? "")?.[1];
    assert.ok(code, "the customer received a code");
    return post("/sign-in/email-otp", { email, otp: code });
  }

  function sessionCookie(response: Response): string {
    const cookie = response.headers
      .getSetCookie()
      .map((header) => header.split(";")[0] ?? "")
      .find((pair) => pair.startsWith(`${SESSION_COOKIE}=`));
    assert.ok(cookie, "the sign-in set a session cookie");
    return cookie;
  }

  async function currentSession(cookie: string) {
    return auth.api.getSession({ headers: new Headers({ cookie }) });
  }

  after(async () => {
    try {
      await tasks.drain();
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.verification.deleteMany({
        where: { identifier: { in: emails.map((email) => `sign-in-otp-${email}`) } },
      });
      await prisma.rateLimit.deleteMany({
        where: {
          OR: [
            { key: { in: emails.map(emailCodeQuotaKey) } },
            { key: { startsWith: clientPrefix } },
          ],
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("sets DISABLED and deletes every session in one call, so existing cookies stop working", async () => {
    const email = newEmail("disable");
    const first = sessionCookie(await signInByCode(email));
    const second = sessionCookie(await signInByCode(email));
    assert.ok(await currentSession(first), "the first session is valid before disabling");
    assert.ok(await currentSession(second), "the second session is valid before disabling");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    const result = await useCase.execute(email.toUpperCase());

    assert.deepEqual(result, { userId: user.id, alreadyDisabled: false, revokedSessions: 2 });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { email } })).status, "DISABLED");
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    assert.equal(await currentSession(first), null);
    assert.equal(await currentSession(second), null);
    assert.ok(!JSON.stringify(events).includes(email), "the email never reaches the log");
  });

  it("is idempotent and revokes a session left behind by a write outside the command", async () => {
    const email = newEmail("idempotent");
    await signInByCode(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await useCase.execute(email);

    // A stray row, as if a session had been written behind the hook's back.
    await prisma.session.create({
      data: {
        userId: user.id,
        token: randomBytes(24).toString("base64url"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const again = await useCase.execute(email);

    assert.deepEqual(again, { userId: user.id, alreadyDisabled: true, revokedSessions: 1 });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { email } })).status, "DISABLED");
  });

  it("sends a DISABLED user no code and refuses them any new session", async () => {
    const email = newEmail("refused");
    await signInByCode(email);
    await useCase.execute(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    const sent = sender.delivered.length;
    await post("/email-otp/send-verification-otp", { email, type: "sign-in" });
    await tasks.drain();
    assert.equal(sender.delivered.length, sent, "no code was sent to the DISABLED user");

    const context = await auth.$context;
    await assert.rejects(context.internalAdapter.createSession(user.id));
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
  });

  it("changes nothing for an unknown email", async () => {
    const email = newEmail("unknown");
    // Scoped to this run: other database suites write users concurrently.
    const ownRows = { email: { in: emails } };
    const before = await prisma.user.findMany({
      where: ownRows,
      select: { id: true, status: true },
    });

    assert.equal(await useCase.execute(email), null);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
    assert.deepEqual(
      await prisma.user.findMany({ where: ownRows, select: { id: true, status: true } }),
      before,
    );
  });
});
