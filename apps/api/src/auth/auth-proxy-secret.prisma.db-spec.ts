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
import { emailCodeQuotaKey, SIGN_IN_CODE_REQUEST_PATH } from "./abuse-limits";
import { createAuth } from "./auth.factory";
import { AUTH_PROXY_SECRET_HEADER } from "./auth-request-guard";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// The production proxy-secret requirement (M2 T8b; L36) through `createAuth` on the Prisma adapter:
// a refused request leaves no RateLimit or Verification row. Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a disposable,
// already migrated local database. It is not part of `pnpm test` or CI.

const AUTH_BASE_URL = "http://localhost:3999";
const AUTH_PATH = "/api/auth";
const CLIENT_IP_HEADER = "x-invitame-client-ip";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function requireLocalDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "test:db requires an explicit DATABASE_URL");
  // Fail closed: this suite writes and deletes rows, so it never runs against a remote database.
  assert.ok(LOCAL_HOSTS.has(new URL(url).hostname), "test:db only runs against a local database");
  return url;
}

describe("the proxy secret on the PostgreSQL store (L36)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const sender = new InMemoryEmailSender();
  const runtime: EmailDeliveryRuntime = {
    now: () => Date.now(),
    sleep: async () => {},
    warn: () => {},
    error: () => {},
  };
  const tasks = new BackgroundTasks(() => {});
  const proxySecret = randomBytes(32).toString("base64url");
  const auth = createAuth({
    secret: randomBytes(32).toString("base64url"),
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [AUTH_BASE_URL],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    signInCodes: new SignInCodeSender(new EmailDeliveryService(sender, runtime), tasks),
    clientIp: { header: CLIENT_IP_HEADER, trustedProxies: [] },
    requireClientIp: false,
    proxySecret,
    requireProxySecret: true,
    log: () => {},
  });
  const runId = randomUUID();
  // Benchmarking range (RFC 2544), unique per run so parallel or repeated runs never collide.
  const clientPrefix = `198.19.${randomBytes(1)[0]}.`;
  const emails: string[] = [];
  const clientIps: string[] = [];

  function requestCode(label: string, headers: Record<string, string>) {
    const email = `t8b-${label}-${runId}@example.test`;
    const clientIp = `${clientPrefix}${clientIps.length + 1}`;
    emails.push(email);
    clientIps.push(clientIp);
    const response = auth.handler(
      new Request(`${AUTH_BASE_URL}${AUTH_PATH}${SIGN_IN_CODE_REQUEST_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: AUTH_BASE_URL,
          [CLIENT_IP_HEADER]: clientIp,
          ...headers,
        },
        body: JSON.stringify({ email, type: "sign-in" }),
      }),
    );
    return { email, clientIp, response };
  }

  async function storedRows(email: string, clientIp: string) {
    await tasks.drain();
    const [rateLimits, codes] = await Promise.all([
      prisma.rateLimit.count({
        where: { OR: [{ key: { startsWith: `${clientIp}|` } }, { key: emailCodeQuotaKey(email) }] },
      }),
      prisma.verification.count({ where: { identifier: `sign-in-otp-${email}` } }),
    ]);
    return { rateLimits, codes };
  }

  after(async () => {
    try {
      await tasks.drain();
      await prisma.verification.deleteMany({
        where: { identifier: { in: emails.map((email) => `sign-in-otp-${email}`) } },
      });
      await prisma.rateLimit.deleteMany({
        where: {
          OR: [
            ...emails.map((email) => ({ key: emailCodeQuotaKey(email) })),
            ...clientIps.map((ip) => ({ key: { startsWith: `${ip}|` } })),
          ],
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("stores nothing for a request without the secret or with a wrong one", async () => {
    for (const [label, headers] of [
      ["missing", {}],
      ["wrong", { [AUTH_PROXY_SECRET_HEADER]: randomBytes(32).toString("base64url") }],
    ] as const) {
      const { email, clientIp, response } = requestCode(label, headers);

      assert.equal((await response).status, 403, label);
      assert.deepEqual(await storedRows(email, clientIp), { rateLimits: 0, codes: 0 }, label);
    }
    assert.equal(sender.attempts.length, 0, "no email was sent");
  });

  it("stores the client IP bucket and the code for a request with the secret", async () => {
    const { email, clientIp, response } = requestCode("proxied", {
      [AUTH_PROXY_SECRET_HEADER]: proxySecret,
    });

    assert.equal((await response).status, 200);
    await tasks.drain();
    const bucket = await prisma.rateLimit.findUnique({
      where: { key: `${clientIp}|${SIGN_IN_CODE_REQUEST_PATH}` },
    });
    assert.ok(bucket, "the forwarded client IP keys the rate limit");
    assert.equal(bucket.count, 1);
    assert.equal(
      await prisma.verification.count({ where: { identifier: `sign-in-otp-${email}` } }),
      1,
    );
  });
});
