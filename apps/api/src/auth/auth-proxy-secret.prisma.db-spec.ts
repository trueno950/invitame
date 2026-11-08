import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { ClientAddresses, requireLocalDatabaseUrl } from "../../test/database";
import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { emailCodeQuotaKey } from "./abuse-limits";
import { createAuth } from "./auth.factory";
import { SIGN_IN_CODE_REQUEST_PATH } from "./auth-paths";
import { AUTH_PROXY_SECRET_HEADER } from "./auth-request-guard";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// The production proxy-secret requirement (M2 T8b; L36) through `createAuth` on the Prisma adapter:
// a refused request leaves no RateLimit or Verification row. Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a disposable,
// already migrated local database, locally and in the CI `database-tests` job; not part of `pnpm test`.

const AUTH_BASE_URL = "http://localhost:3999";
const AUTH_PATH = "/api/auth";
const CLIENT_IP_HEADER = "x-invitame-client-ip";

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
  // This suite counts rows on one address, so it draws from its own block, which no other suite shares.
  const clientAddresses = new ClientAddresses("auth-proxy-secret.prisma");
  const emails: string[] = [];

  function requestCode(label: string, headers: Record<string, string>) {
    const email = `t8b-${label}-${runId}@example.test`;
    const clientIp = clientAddresses.next();
    emails.push(email);
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
            ...clientAddresses.rateLimitRows().OR,
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
