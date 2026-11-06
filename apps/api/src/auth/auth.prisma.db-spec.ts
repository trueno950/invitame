import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP, twoFactor } from "better-auth/plugins";

import { ClientAddresses, requireLocalDatabaseUrl } from "../../test/database";

// Database integration test for the Better Auth persistence mapping (M2 T2).
// Runs only through `pnpm --filter @invitame/api test:db` (locally and in the CI `database-tests` job)
// with an explicit DATABASE_URL that points at a disposable, already migrated local database; not part
// of `pnpm test`.

const AUTH_BASE_URL = "http://localhost:3999";
const AUTH_PATH = "/api/auth";

function createTestAuth(prisma: PrismaClient, sentCodes: Map<string, string>) {
  return betterAuth({
    secret: randomBytes(32).toString("base64url"),
    baseURL: AUTH_BASE_URL,
    telemetry: { enabled: false },
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    advanced: { database: { generateId: "uuid" } },
    user: {
      fields: { name: "displayName" },
      additionalFields: {
        role: {
          type: ["CUSTOMER", "ADMIN"],
          required: false,
          input: false,
          defaultValue: "CUSTOMER",
        },
      },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          sentCodes.set(email, otp);
        },
      }),
      twoFactor(),
    ],
  });
}

type TestAuth = ReturnType<typeof createTestAuth>;

describe("Better Auth on the Prisma schema (real PostgreSQL)", () => {
  const databaseUrl = requireLocalDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const sentCodes = new Map<string, string>();
  const runId = randomUUID();
  // One address for the whole suite, from the range no other suite shares (L17, L37).
  const clientAddresses = new ClientAddresses("counted");
  const clientIp = clientAddresses.next();
  const emails: string[] = [];
  let auth: TestAuth;

  function newEmail(label: string): string {
    const email = `t2-${label}-${runId}@example.test`;
    emails.push(email);
    return email;
  }

  function post(path: string, body: unknown): Promise<Response> {
    return auth.handler(
      new Request(`${AUTH_BASE_URL}${AUTH_PATH}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: AUTH_BASE_URL,
          "x-forwarded-for": clientIp,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  async function requestCode(email: string): Promise<string> {
    const response = await post("/email-otp/send-verification-otp", { email, type: "sign-in" });
    assert.equal(response.status, 200);
    const code = sentCodes.get(email);
    assert.ok(code, "the in-memory sender captured a code");
    return code;
  }

  function verificationRowsFor(email: string) {
    return prisma.verification.findMany({ where: { identifier: `sign-in-otp-${email}` } });
  }

  before(() => {
    auth = createTestAuth(prisma, sentCodes);
  });

  after(async () => {
    try {
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.verification.deleteMany({
        where: { identifier: { in: emails.map((email) => `sign-in-otp-${email}`) } },
      });
      await prisma.rateLimit.deleteMany({ where: clientAddresses.rateLimitRows() });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("creates a verified customer User and a Session from an email code and consumes the Verification row", async () => {
    const email = newEmail("customer");
    const code = await requestCode(email);

    assert.equal((await verificationRowsFor(email)).length, 1);
    assert.equal(await prisma.user.count({ where: { email } }), 0);

    const response = await post("/sign-in/email-otp", { email, otp: code });
    assert.equal(response.status, 200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.role, "CUSTOMER");
    assert.equal(user.status, "ACTIVE");
    assert.equal(user.emailVerified, true);
    assert.equal(user.twoFactorEnabled, false);
    assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);
    assert.equal((await verificationRowsFor(email)).length, 0);

    const cookie = response.headers
      .getSetCookie()
      .map((header) => header.split(";")[0])
      .join("; ");
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });

    assert.ok(session, "getSession resolves the issued session cookie");
    assert.equal(session.user.id, user.id);
    assert.equal(session.user.email, email);
    assert.equal(session.user.role, "CUSTOMER");
    assert.equal(session.user.emailVerified, true);
  });

  it("writes rate-limit rows to the database", async () => {
    // Self-contained: the test makes its own request instead of relying on an earlier test (L17).
    await requestCode(newEmail("rate-limit"));
    const rows = await prisma.rateLimit.findMany({
      where: { key: { startsWith: `${clientIp}|` } },
    });

    assert.ok(rows.length > 0, "rate-limit storage persisted at least one row");
    for (const row of rows) {
      assert.ok(row.count >= 1);
      assert.equal(typeof row.lastRequest, "bigint");
    }
  });

  it("ignores a client-supplied role when an email code creates the account", async () => {
    const email = newEmail("role");
    const code = await requestCode(email);

    const response = await post("/sign-in/email-otp", { email, otp: code, role: "ADMIN" });
    assert.equal(response.status, 200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    assert.equal(user.role, "CUSTOMER");
  });
});
