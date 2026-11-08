import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { hashPassword } from "better-auth/crypto";
import { ClientAddresses, requireLocalDatabaseUrl } from "../../test/database";
import { decodeBase32Ascii } from "../../test/totp";
import { EmailDeliveryService } from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../email/infrastructure/system-email-delivery-runtime";
import { PrismaAdministratorAccountRepository } from "../users/infrastructure/prisma-administrator-account.repository";
import { createAuth } from "./auth.factory";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// The second-factor marker on `Session` (M2 T11c; S52, L72) on real PostgreSQL: the migration's
// default, sessions that predate it, and the marker Better Auth's Prisma adapter writes on each path.
// Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL.

const ORIGIN = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";

describe("second-factor marker on sessions (real PostgreSQL)", () => {
  const databaseUrl = requireLocalDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const secret = randomBytes(32).toString("base64url");
  const runId = randomUUID();
  const emails: string[] = [];
  const clientAddresses = new ClientAddresses();
  const auth = createAuth({
    secret,
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });

  after(async () => {
    try {
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.rateLimit.deleteMany({ where: clientAddresses.rateLimitRows() });
    } finally {
      await prisma.$disconnect();
    }
  });

  function call(path: string, body: unknown, cookie?: string): Promise<Response> {
    return auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": clientAddresses.next(),
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  }

  function cookieOf(response: Response): string {
    const pair = response.headers
      .getSetCookie()
      .map((header) => header.split(";")[0] ?? "")
      .find((candidate) => candidate.startsWith(`${SESSION_COOKIE}=`));
    assert.ok(pair, "the response set a session cookie");
    return pair;
  }

  function signedCookie(token: string): string {
    const signature = createHmac("sha256", secret).update(token).digest("base64");
    return `${SESSION_COOKIE}=${encodeURIComponent(`${token}.${signature}`)}`;
  }

  async function createUser(label: string, role: "ADMIN" | "CUSTOMER", twoFactorEnabled: boolean) {
    const email = `t11c-${label}-${runId}@example.test`;
    emails.push(email);
    return prisma.user.create({ data: { email, role, twoFactorEnabled } });
  }

  /** A session row written as it was before the migration: without the marker column. */
  async function insertPreMigrationSession(userId: string): Promise<string> {
    const token = randomBytes(24).toString("base64url");
    await prisma.$executeRaw`
      INSERT INTO "Session" (id, "userId", token, "expiresAt", "updatedAt")
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${token}, now() + interval '12 hours', now())`;
    return token;
  }

  const markers = async (userId: string) =>
    (await prisma.session.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map(
      (row) => row.secondFactorVerified,
    );

  const sessionOf = (cookie: string) => auth.api.getSession({ headers: new Headers({ cookie }) });

  it("adds a NOT NULL boolean column whose default is false", async () => {
    const [column] = await prisma.$queryRaw<
      Array<{ data_type: string; is_nullable: string; column_default: string }>
    >`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'Session' AND column_name = 'secondFactorVerified'`;

    assert.deepEqual(column, { data_type: "boolean", is_nullable: "NO", column_default: "false" });
  });

  it("reads false for a session row inserted without the column", async () => {
    const admin = await createUser("default", "ADMIN", true);
    await insertPreMigrationSession(admin.id);

    assert.deepEqual(await markers(admin.id), [false]);
  });

  it("ends an enrolled administrator's session that predates the marker and keeps a customer's", async () => {
    const admin = await createUser("legacy-admin", "ADMIN", true);
    const customer = await createUser("legacy-customer", "CUSTOMER", false);
    const adminCookie = signedCookie(await insertPreMigrationSession(admin.id));
    const customerCookie = signedCookie(await insertPreMigrationSession(customer.id));

    assert.equal(await sessionOf(adminCookie), null);
    assert.equal(await prisma.session.count({ where: { userId: admin.id } }), 0);
    assert.equal((await sessionOf(customerCookie))?.user.id, customer.id);
    assert.deepEqual(await markers(customer.id), [false]);
  });

  it("marks only the sessions that passed the second factor", async () => {
    const email = `t11c-marking-${runId}@example.test`;
    emails.push(email);
    const password = randomBytes(18).toString("base64url");
    const issued = await new PrismaAdministratorAccountRepository(prisma).issueInitialPassword({
      email,
      passwordHash: await hashPassword(password),
      issuedAt: new Date(),
    });
    assert.equal(issued.outcome, "created");
    const userId = (issued as { userId: string }).userId;
    const generateTOTP = (
      auth.api as unknown as Record<string, (input: unknown) => Promise<unknown>>
    ).generateTOTP;
    assert.ok(generateTOTP, "Better Auth exposes generateTOTP");
    const totp = async (rawSecret: string) =>
      ((await generateTOTP({ body: { secret: rawSecret } })) as { code: string }).code;

    const pending = cookieOf(await call("/sign-in/email", { email, password }));
    assert.deepEqual(await markers(userId), [false], "a password-only session is unmarked");

    const { totpURI } = (await (
      await call("/two-factor/enable", { password }, pending)
    ).json()) as { totpURI: string };
    const rawSecret = decodeBase32Ascii(new URL(totpURI).searchParams.get("secret") ?? "");
    const confirmed = await call(
      "/two-factor/verify-totp",
      { code: await totp(rawSecret) },
      pending,
    );
    assert.equal(confirmed.status, 200);
    assert.deepEqual(await markers(userId), [true], "the confirming session is marked");

    const challenge = await call("/sign-in/email", { email, password });
    const challengeCookie = challenge.headers
      .getSetCookie()
      .map((header) => header.split(";")[0] ?? "")
      .find((pair) => pair.startsWith("better-auth.two_factor="));
    assert.ok(challengeCookie, "the password step asks for the second factor");
    assert.deepEqual(await markers(userId), [true], "the password step leaves no session");
    const signedIn = await call(
      "/two-factor/verify-totp",
      { code: await totp(rawSecret) },
      challengeCookie,
    );
    assert.equal(signedIn.status, 200);
    assert.deepEqual(await markers(userId), [true, true]);
    assert.equal((await sessionOf(cookieOf(signedIn)))?.user.id, userId);
  });
});
