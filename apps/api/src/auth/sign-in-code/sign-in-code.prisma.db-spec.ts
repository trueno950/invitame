import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";

import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../../email/application/email-delivery.service";
import type { EmailMessage, EmailSender } from "../../email/application/email-sender.port";
import { emailCodeQuotaKey } from "../abuse-limits";
import { createAuth } from "../auth.factory";
import { BackgroundTasks } from "./background-tasks";
import { SignInCodeSender } from "./sign-in-code-sender";

// The production `createAuth` sign-in code flow on the Prisma adapter (M2 T5a). Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a disposable,
// already migrated local database. It is not part of `pnpm test` or CI.

const AUTH_BASE_URL = "http://localhost:3999";
const AUTH_PATH = "/api/auth";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CODE_PATTERN = /\b(\d{6})\b/;

function requireLocalDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "test:db requires an explicit DATABASE_URL");
  // Fail closed: this suite writes and deletes rows, so it never runs against a remote database.
  assert.ok(LOCAL_HOSTS.has(new URL(url).hostname), "test:db only runs against a local database");
  return url;
}

/** Delivers at once unless the next send is held; a held send fails when released. */
class HoldingEmailSender implements EmailSender {
  readonly attempts: EmailMessage[] = [];
  readonly delivered: EmailMessage[] = [];
  private held: Promise<void> | undefined;

  holdNextAndFail(): () => void {
    let release!: () => void;
    this.held = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  async send(message: EmailMessage): Promise<void> {
    this.attempts.push(message);
    const held = this.held;
    this.held = undefined;

    if (held) {
      await held;
      throw new Error("held delivery failed");
    }

    this.delivered.push(message);
  }
}

function codeFrom(message: EmailMessage | undefined): string {
  const code = message ? CODE_PATTERN.exec(message.text)?.[1] : undefined;
  assert.ok(code, "the message carries a 6-digit code");
  return code;
}

describe("sign-in codes through createAuth on the Prisma schema (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const sender = new HoldingEmailSender();
  const runtime: EmailDeliveryRuntime = {
    now: () => Date.now(),
    sleep: async () => {},
    warn: () => {},
    error: () => {},
  };
  const tasks = new BackgroundTasks(() => {});
  const auth = createAuth({
    secret: randomBytes(32).toString("base64url"),
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [AUTH_BASE_URL],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    signInCodes: new SignInCodeSender(new EmailDeliveryService(sender, runtime), tasks),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    log: () => {},
  });
  const runId = randomUUID();
  const emails: string[] = [];
  const clientPrefix = `198.18.${randomBytes(1)[0]}.`;
  let clientCounter = 0;

  function newEmail(label: string): string {
    const email = `t5a-${label}-${runId}@example.test`;
    emails.push(email);
    return email;
  }

  function post(path: string, body: unknown): Promise<Response> {
    clientCounter += 1;
    return auth.handler(
      new Request(`${AUTH_BASE_URL}${AUTH_PATH}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: AUTH_BASE_URL,
          // A fresh client IP per request keeps the per-IP limit out of these flows.
          "x-forwarded-for": `${clientPrefix}${clientCounter}`,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  function requestCode(email: string): Promise<Response> {
    return post("/email-otp/send-verification-otp", { email, type: "sign-in" });
  }

  function verificationRows(email: string) {
    return prisma.verification.findMany({ where: { identifier: `sign-in-otp-${email}` } });
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

  it("stores the code hashed and ignores client name and image when the code creates a customer", async () => {
    const email = newEmail("customer");

    assert.equal((await requestCode(email)).status, 200);
    await tasks.drain();
    const code = codeFrom(sender.delivered.at(-1));

    const [row] = await verificationRows(email);
    assert.ok(row);
    assert.equal(row.value, `${createHash("sha256").update(code).digest("base64url")}:0`);

    const response = await post("/sign-in/email-otp", {
      email,
      otp: code,
      name: "x".repeat(10_000),
      image: "https://tracker.example.test/pixel.png",
      role: "ADMIN",
    });
    assert.equal(response.status, 200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.displayName, "");
    assert.equal(user.image, null);
    assert.equal(user.role, "CUSTOMER");
  });

  it("invalidates only a code whose delivery failed, keeping a newer code valid", async () => {
    const email = newEmail("failed");
    const releaseFailure = sender.holdNextAndFail();

    await requestCode(email);
    await requestCode(email);
    while (sender.delivered.every((message) => message.to !== email)) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal((await verificationRows(email)).length, 2);

    releaseFailure();
    await tasks.drain();

    const failedCode = codeFrom(sender.attempts.find((message) => message.to === email));
    const newerCode = codeFrom(sender.delivered.find((message) => message.to === email));
    assert.equal((await verificationRows(email)).length, 1);

    const rejected = await post("/sign-in/email-otp", { email, otp: failedCode });
    assert.equal(rejected.status, 400);
    // The wrong guess counted against the newer code; the newer code itself still signs in.
    const accepted = await post("/sign-in/email-otp", { email, otp: newerCode });
    assert.equal(accepted.status, 200);
  });

  it("sends an administrator no code and removes the issued row", async () => {
    const email = newEmail("admin");
    await prisma.user.create({ data: { email, role: "ADMIN", emailVerified: true } });
    const attemptsBefore = sender.attempts.length;

    assert.equal((await requestCode(email)).status, 200);
    await tasks.drain();

    assert.equal(sender.attempts.length, attemptsBefore);
    assert.equal((await verificationRows(email)).length, 0);
  });
});
