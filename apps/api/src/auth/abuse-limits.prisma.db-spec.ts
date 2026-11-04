import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";

import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { EMAIL_CODE_QUOTA, SIGN_IN_CODE_REQUEST_PATH, emailCodeQuotaKey } from "./abuse-limits";
import { createAuth } from "./auth.factory";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// Abuse limits through the production `createAuth` on the Prisma adapter (M2 T5b). Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a disposable,
// already migrated local database. It is not part of `pnpm test` or CI.

const AUTH_BASE_URL = "http://localhost:3999";
const AUTH_PATH = "/api/auth";
const CLIENT_IP_HEADER = "x-real-ip";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function requireLocalDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "test:db requires an explicit DATABASE_URL");
  // Fail closed: this suite writes and deletes rows, so it never runs against a remote database.
  assert.ok(LOCAL_HOSTS.has(new URL(url).hostname), "test:db only runs against a local database");
  return url;
}

describe("abuse limits on the PostgreSQL RateLimit table", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const sender = new InMemoryEmailSender();
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
    clientIp: { header: CLIENT_IP_HEADER, trustedProxies: [] },
    requireClientIp: false,
    log: () => {},
  });
  const runId = randomUUID();
  // Documentation range (RFC 5737), unique per run so parallel or repeated runs never collide.
  const clientPrefix = `198.18.${randomBytes(1)[0]}.`;
  const email = `t5b-quota-${runId}@example.test`;
  const clientIps: string[] = [];
  let clientCounter = 0;

  function nextClientIp(): string {
    clientCounter += 1;
    const ip = `${clientPrefix}${clientCounter}`;
    clientIps.push(ip);
    return ip;
  }

  function requestCode(address: string, clientIp: string): Promise<Response> {
    return auth.handler(
      new Request(`${AUTH_BASE_URL}${AUTH_PATH}${SIGN_IN_CODE_REQUEST_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: AUTH_BASE_URL,
          [CLIENT_IP_HEADER]: clientIp,
        },
        body: JSON.stringify({ email: address, type: "sign-in" }),
      }),
    );
  }

  after(async () => {
    try {
      await tasks.drain();
      await prisma.verification.deleteMany({ where: { identifier: `sign-in-otp-${email}` } });
      await prisma.rateLimit.deleteMany({
        where: {
          OR: [
            { key: emailCodeQuotaKey(email) },
            ...clientIps.map((ip) => ({ key: { startsWith: `${ip}|` } })),
          ],
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("persists client IP buckets and answers the 4th request from one IP with 429", async () => {
    const client = nextClientIp();
    const other = `t5b-ip-${runId}@example.test`;

    for (let request = 1; request <= 3; request += 1) {
      assert.equal((await requestCode(other, client)).status, 200);
    }
    assert.equal((await requestCode(other, client)).status, 429);
    await tasks.drain();

    const row = await prisma.rateLimit.findUnique({
      where: { key: `${client}|${SIGN_IN_CODE_REQUEST_PATH}` },
    });
    assert.ok(row, "the client IP bucket is a RateLimit row");
    assert.equal(row.count, 3);
    assert.equal(typeof row.lastRequest, "bigint");
    await prisma.rateLimit.deleteMany({ where: { key: emailCodeQuotaKey(other) } });
    await prisma.verification.deleteMany({ where: { identifier: `sign-in-otp-${other}` } });
  });

  it("stores the per-email count under a hashed key and sends no 6th code within the hour", async () => {
    for (let request = 1; request <= EMAIL_CODE_QUOTA.max + 1; request += 1) {
      assert.equal((await requestCode(email, nextClientIp())).status, 200);
      // One background count at a time keeps the expected count exact.
      await tasks.drain();
    }

    assert.equal(sender.delivered.filter((message) => message.to === email).length, 5);
    const row = await prisma.rateLimit.findUnique({ where: { key: emailCodeQuotaKey(email) } });
    assert.ok(row, "the per-email count is a RateLimit row");
    assert.equal(row.count, 5);
    assert.match(row.key, /^sign-in-code-email\|[0-9a-f]{64}$/);

    const leaked = await prisma.rateLimit.count({ where: { key: { contains: runId } } });
    assert.equal(leaked, 0, "no RateLimit key contains the plain address");
    assert.equal(
      await prisma.verification.count({ where: { identifier: `sign-in-otp-${email}` } }),
      5,
      "the 6th code row was removed",
    );
  });
});
