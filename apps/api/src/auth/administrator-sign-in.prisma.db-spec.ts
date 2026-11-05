import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { EmailDeliveryService } from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../email/infrastructure/system-email-delivery-runtime";
import { createAuth } from "./auth.factory";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// Administrator password sign-in, the enrollment window and gate, TOTP enrollment, the second-factor
// sign-in, and backup codes on real PostgreSQL (M2 T7; S6, S20, S21). Administrators are seeded through
// Better Auth's internal adapter and password hasher, not through `admin:create`. Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a disposable,
// already migrated local database. It is not part of `pnpm test` or CI.

const AUTH_BASE_URL = "http://localhost:3996";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SESSION_COOKIE = "better-auth.session_token";
const TWO_FACTOR_COOKIE = "better-auth.two_factor";
const HOUR_MS = 60 * 60 * 1000;

function requireLocalDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "test:db requires an explicit DATABASE_URL");
  // Fail closed: this suite writes and deletes rows, so it never runs against a remote database.
  assert.ok(LOCAL_HOSTS.has(new URL(url).hostname), "test:db only runs against a local database");
  return url;
}

function decodeBase32(input: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of input.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes).toString("utf8");
}

function cookieFrom(response: Response, name: string): string | undefined {
  return response.headers
    .getSetCookie()
    .map((header) => header.split(";")[0] ?? "")
    .find((pair) => pair.startsWith(`${name}=`) && pair.length > name.length + 1);
}

describe("administrator sign-in and enrollment (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const auth = createAuth({
    secret: randomBytes(32).toString("base64url"),
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
    log: () => {},
  });
  const api = auth.api as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  const runId = randomUUID();
  const emails: string[] = [];
  // Addresses from 198.18.0.0/15 (benchmarking), so rows of this run are easy to remove.
  const clientPrefix = `198.18.${randomBytes(1)[0]}.`;
  let clientCounter = 0;

  after(async () => {
    try {
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.rateLimit.deleteMany({ where: { key: { startsWith: clientPrefix } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function call(path: string, body?: unknown, cookie?: string) {
    clientCounter += 1;
    return auth.handler(
      new Request(`${AUTH_BASE_URL}/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          origin: AUTH_BASE_URL,
          "x-forwarded-for": `${clientPrefix}${clientCounter % 250}`,
          ...(cookie ? { cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  }

  async function snapshot(response: Response) {
    return { status: response.status, body: await response.text() };
  }

  async function seedAdministrator(issuedAt = new Date()) {
    const context = await auth.$context;
    const email = `t7-admin-${emails.length}-${runId}@example.test`;
    emails.push(email);
    const password = randomBytes(18).toString("base64url");
    const user = await context.internalAdapter.createUser(
      { email, name: "", emailVerified: false },
      { method: "admin-seed" },
    );
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    await context.internalAdapter.createAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await context.password.hash(password),
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });
    return { id: user.id, email, password };
  }

  async function totpCode(rawSecret: string, offsetSeconds = 0): Promise<string> {
    const generateTOTP = api.generateTOTP;
    assert.ok(generateTOTP);
    const original = Date.now;
    Date.now = () => original() + offsetSeconds * 1000;
    try {
      return ((await generateTOTP({ body: { secret: rawSecret } })) as { code: string }).code;
    } finally {
      Date.now = original;
    }
  }

  async function signIn(email: string, password: string) {
    return call("/sign-in/email", { email, password });
  }

  it("refuses an expired initial password exactly like a wrong one and creates no session", async () => {
    const admin = await seedAdministrator(new Date(Date.now() - 24 * HOUR_MS - 1000));
    const wrong = await snapshot(await signIn(admin.email, "wrong-password-x"));

    const response = await signIn(admin.email, admin.password);

    assert.deepEqual(await snapshot(response), wrong);
    assert.equal(wrong.status, 401);
    assert.equal(await prisma.session.count({ where: { userId: admin.id } }), 0);
  });

  it("gates a pre-enrollment session, then enrolls, then requires the second factor", async () => {
    const admin = await seedAdministrator();
    const signedIn = await signIn(admin.email, admin.password);
    assert.equal(signedIn.status, 200);
    const pending = cookieFrom(signedIn, SESSION_COOKIE);
    assert.ok(pending);

    // Gate: the session reads itself; every other session endpoint answers as without one.
    assert.equal((await call("/get-session", undefined, pending)).status, 200);
    assert.deepEqual(
      await snapshot(await call("/list-sessions", undefined, pending)),
      await snapshot(await call("/list-sessions")),
    );

    // Enrollment: the URI and backup codes come once; the first valid code confirms it.
    const enable = await call("/two-factor/enable", { password: admin.password }, pending);
    assert.equal(enable.status, 200);
    const { totpURI, backupCodes } = (await enable.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    const rawSecret = decodeBase32(new URL(totpURI).searchParams.get("secret") ?? "");
    const stored = await prisma.twoFactor.findUniqueOrThrow({ where: { userId: admin.id } });
    assert.equal(stored.verified, false, "Better Auth writes verified: false explicitly");
    for (const code of backupCodes) {
      assert.equal(stored.backupCodes.includes(code), false, "backup codes are stored encrypted");
    }
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).twoFactorEnabled,
      false,
    );

    const confirmed = await call(
      "/two-factor/verify-totp",
      { code: await totpCode(rawSecret) },
      pending,
    );
    assert.equal(confirmed.status, 200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    assert.equal(user.twoFactorEnabled, true);
    assert.equal(
      (await prisma.twoFactor.findUniqueOrThrow({ where: { userId: admin.id } })).verified,
      true,
    );
    await prisma.session.deleteMany({ where: { userId: admin.id } });

    // Second factor: the password step leaves no session row and only a challenge cookie.
    const step = await signIn(admin.email, admin.password);
    assert.deepEqual(await step.json(), { twoFactorRedirect: true, twoFactorMethods: ["totp"] });
    assert.equal(cookieFrom(step, SESSION_COOKIE), undefined);
    assert.equal(await prisma.session.count({ where: { userId: admin.id } }), 0);

    const verified = await call(
      "/two-factor/verify-totp",
      { code: await totpCode(rawSecret) },
      cookieFrom(step, TWO_FACTOR_COOKIE),
    );
    assert.equal(verified.status, 200);
    assert.ok(cookieFrom(verified, SESSION_COOKIE));
    assert.equal(await prisma.session.count({ where: { userId: admin.id } }), 1);

    // Backup codes: each works once.
    const [backupCode] = backupCodes;
    for (const expected of [200, 401]) {
      const challenge = cookieFrom(await signIn(admin.email, admin.password), TWO_FACTOR_COOKIE);
      const response = await call(
        "/two-factor/verify-backup-code",
        { code: backupCode },
        challenge,
      );
      assert.equal(response.status, expected);
    }

    // Lockout counter: a wrong code during sign-in increments failedVerificationCount atomically.
    const challenge = cookieFrom(await signIn(admin.email, admin.password), TWO_FACTOR_COOKIE);
    await call("/two-factor/verify-totp", { code: await totpCode(rawSecret, 300) }, challenge);
    assert.equal(
      (await prisma.twoFactor.findUniqueOrThrow({ where: { userId: admin.id } }))
        .failedVerificationCount,
      2,
      "one wrong backup code and one wrong TOTP code since the last success",
    );
  });

  it("stores an administrator session for 12 hours from sign-in and never extends it (S16)", async () => {
    const admin = await seedAdministrator();
    const before = Date.now();
    const signedIn = await signIn(admin.email, admin.password);
    const after = Date.now();
    assert.equal(signedIn.status, 200);
    const cookie = cookieFrom(signedIn, SESSION_COOKIE);
    assert.ok(cookie);

    const stored = await prisma.session.findFirstOrThrow({ where: { userId: admin.id } });
    assert.equal(stored.expiresAt.getTime() - stored.createdAt.getTime(), 12 * HOUR_MS);
    assert.ok(stored.expiresAt.getTime() >= before + 12 * HOUR_MS - 5_000);
    assert.ok(stored.expiresAt.getTime() <= after + 12 * HOUR_MS + 5_000);

    // Eleven hours in: Better Auth's own rule would extend the session to 7 days from now.
    const expiresAt = new Date(Date.now() + HOUR_MS);
    const createdAt = new Date(expiresAt.getTime() - 12 * HOUR_MS);
    await prisma.session.update({
      where: { id: stored.id },
      data: { createdAt, updatedAt: createdAt, expiresAt },
    });

    const read = await call("/get-session", undefined, cookie);

    assert.equal(read.status, 200);
    assert.equal(((await read.json()) as { user: { id: string } }).user.id, admin.id);
    assert.equal(cookieFrom(read, SESSION_COOKIE), undefined, "no cookie is reissued");
    const unchanged = await prisma.session.findUniqueOrThrow({ where: { id: stored.id } });
    assert.equal(unchanged.expiresAt.getTime(), expiresAt.getTime());
    assert.equal(unchanged.updatedAt.getTime(), createdAt.getTime(), "the row was not rewritten");
  });

  it("deletes a pre-enrollment session once the window ends and refuses enrollment", async () => {
    const admin = await seedAdministrator();
    const pending = cookieFrom(await signIn(admin.email, admin.password), SESSION_COOKIE);
    assert.ok(pending);
    await prisma.account.updateMany({
      where: { userId: admin.id, providerId: "credential" },
      data: { createdAt: new Date(Date.now() - 24 * HOUR_MS - 1000) },
    });

    assert.equal(await (await call("/get-session", undefined, pending)).text(), "null");
    assert.equal(await prisma.session.count({ where: { userId: admin.id } }), 0);
    const enable = await call("/two-factor/enable", { password: admin.password }, pending);
    assert.equal(enable.status, 401);
    assert.equal(await prisma.twoFactor.count({ where: { userId: admin.id } }), 0);
  });
});
