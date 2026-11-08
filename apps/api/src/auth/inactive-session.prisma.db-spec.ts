import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { ClientAddresses, requireLocalDatabaseUrl } from "../../test/database";
import { EmailDeliveryService } from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../email/infrastructure/system-email-delivery-runtime";
import { createAuth } from "./auth.factory";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// Sessions of non-ACTIVE users on Better Auth's own endpoints, on real PostgreSQL (M2 T6b; S9, S18;
// L27, L28). Runs only through `pnpm --filter @invitame/api test:db` (locally and in the CI
// `database-tests` job) with an explicit DATABASE_URL that points at a disposable, already migrated
// local database; not part of `pnpm test`.

const AUTH_BASE_URL = "http://localhost:3997";
const SESSION_COOKIE = "better-auth.session_token";

describe("sessions of non-ACTIVE users on Better Auth's endpoints (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const secret = randomBytes(32).toString("base64url");
  const auth = createAuth({
    secret,
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [AUTH_BASE_URL],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    // No probe here requests a sign-in code.
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });
  const runId = randomUUID();
  const emails: string[] = [];
  const clientAddresses = new ClientAddresses();

  // Every enabled Better Auth endpoint that reads a session.
  const endpoints: Array<{ method: "GET" | "POST"; path: string; body?: unknown }> = [
    { method: "GET", path: "/get-session" },
    { method: "GET", path: "/list-sessions" },
    { method: "GET", path: "/list-accounts" },
    { method: "GET", path: "/account-info" },
    { method: "POST", path: "/revoke-session", body: { token: "unknown" } },
    { method: "POST", path: "/revoke-sessions", body: {} },
    { method: "POST", path: "/revoke-other-sessions", body: {} },
    { method: "POST", path: "/verify-password", body: { password: "long-password" } },
    { method: "POST", path: "/get-access-token", body: { providerId: "google" } },
    { method: "POST", path: "/refresh-token", body: { providerId: "google" } },
    { method: "POST", path: "/sign-out", body: {} },
  ];

  after(async () => {
    try {
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.rateLimit.deleteMany({ where: clientAddresses.rateLimitRows() });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function call(endpoint: (typeof endpoints)[number], cookie?: string) {
    const response = await auth.handler(
      new Request(`${AUTH_BASE_URL}/api/auth${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          "content-type": "application/json",
          origin: AUTH_BASE_URL,
          "x-forwarded-for": clientAddresses.next(),
          ...(cookie ? { cookie } : {}),
        },
        ...(endpoint.body === undefined ? {} : { body: JSON.stringify(endpoint.body) }),
      }),
    );
    return { status: response.status, body: await response.text() };
  }

  /** A stored customer, created as the code sign-in creates one. */
  async function createCustomer(label: string): Promise<string> {
    const email = `t6b-${label}-${runId}@example.test`;
    emails.push(email);
    const context = await auth.$context;
    const user = await context.internalAdapter.createUser(
      { email, name: "", emailVerified: true },
      { method: "email-otp" },
    );
    return user.id;
  }

  /** A session for an ACTIVE user and the signed cookie a browser would hold for it. */
  async function createSession(userId: string): Promise<{ cookie: string; token: string }> {
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(userId);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");
    return {
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`,
      token: session.token,
    };
  }

  function setStatus(userId: string, status: "ACTIVE" | "DISABLED") {
    return prisma.user.update({ where: { id: userId }, data: { status } });
  }

  it("still serves get-session to an ACTIVE user", async () => {
    const userId = await createCustomer("active");
    const { cookie } = await createSession(userId);
    const response = await call({ method: "GET", path: "/get-session" }, cookie);

    assert.equal(response.status, 200);
    assert.equal((JSON.parse(response.body) as { user: { id: string } }).user.id, userId);
  });

  it("answers every endpoint exactly as without a session and deletes the session row", async () => {
    const userId = await createCustomer("disabled");
    const answers = new Map<string, { status: number; body: string }>();

    for (const endpoint of endpoints) {
      await setStatus(userId, "ACTIVE");
      const { cookie, token } = await createSession(userId);
      // The race of L28: the session survives, then the stored status changes behind its back.
      await setStatus(userId, "DISABLED");

      const anonymous = await call(endpoint);
      const refused = await call(endpoint, cookie);

      const label = `${endpoint.method} ${endpoint.path}`;
      assert.deepEqual(refused, anonymous, label);
      assert.equal(await prisma.session.count({ where: { token } }), 0, label);
      answers.set(endpoint.path, refused);
    }

    assert.deepEqual(answers.get("/get-session"), { status: 200, body: "null" });
    assert.equal(answers.get("/list-sessions")?.status, 401);
    assert.equal(answers.get("/sign-out")?.status, 200, "sign-out still succeeds");
  });
});
