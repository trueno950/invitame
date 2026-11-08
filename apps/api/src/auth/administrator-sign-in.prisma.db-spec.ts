import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { hashPassword } from "better-auth/crypto";
import { ClientAddresses, requireLocalDatabaseUrl } from "../../test/database";
import { EmailDeliveryService } from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../email/infrastructure/system-email-delivery-runtime";
import type { IssueInitialPasswordResult } from "../users/application/administrator-account.repository";
import { DisableUserUseCase } from "../users/application/disable-user.use-case";
import { ResetSecondFactorUseCase } from "../users/application/reset-second-factor.use-case";
import { PrismaAdministratorAccountRepository } from "../users/infrastructure/prisma-administrator-account.repository";
import { PrismaUserAccessRepository } from "../users/infrastructure/prisma-user-access.repository";
import { ADMINISTRATOR_ENROLLMENT_WINDOW_SECONDS } from "./account-access";
import { createAuth } from "./auth.factory";
import type { AuthRequestLog } from "./auth-request-guard";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// Administrator password sign-in, the enrollment window and gate, TOTP enrollment, the second-factor
// sign-in, and backup codes on real PostgreSQL (M2 T7; S6, S20, S21). Administrators are seeded through
// Better Auth's internal adapter and password hasher, not through `admin:create`. Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a disposable,
// already migrated local database, locally and in the CI `database-tests` job; not part of `pnpm test`.

const AUTH_BASE_URL = "http://localhost:3996";
const SESSION_COOKIE = "better-auth.session_token";
const TWO_FACTOR_COOKIE = "better-auth.two_factor";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** S20: the enforced window in which an initial password works unless an app is enrolled. */
const ENROLLMENT_WINDOW_MS = ADMINISTRATOR_ENROLLMENT_WINDOW_SECONDS * 1000;

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

  /** The production `createAuth` on a given Prisma client; the race probes pass a wrapped one. */
  function buildAuth(client: PrismaClient, log: AuthRequestLog = () => {}) {
    return createAuth({
      secret: randomBytes(32).toString("base64url"),
      baseURL: AUTH_BASE_URL,
      trustedOrigins: [AUTH_BASE_URL],
      database: prismaAdapter(client, { provider: "postgresql" }),
      // No probe here requests a sign-in code.
      signInCodes: new SignInCodeSender(
        new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
        new BackgroundTasks(() => {}),
      ),
      clientIp: { header: "x-forwarded-for", trustedProxies: [] },
      requireClientIp: false,
      requireProxySecret: false,
      log,
    });
  }

  const auth = buildAuth(prisma);
  const api = auth.api as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  const runId = randomUUID();
  const emails: string[] = [];
  const clientAddresses = new ClientAddresses();

  after(async () => {
    try {
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.rateLimit.deleteMany({ where: clientAddresses.rateLimitRows() });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function call(path: string, body?: unknown, cookie?: string, target = auth) {
    return target.handler(
      new Request(`${AUTH_BASE_URL}/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          origin: AUTH_BASE_URL,
          "x-forwarded-for": clientAddresses.next(),
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

  async function signIn(email: string, password: string, target = auth) {
    return call("/sign-in/email", { email, password }, undefined, target);
  }

  /** Enrolls through the HTTP endpoints; returns the TOTP secret and the confirmed session cookie. */
  async function enroll(admin: { email: string; password: string }, target = auth) {
    const pending = cookieFrom(await signIn(admin.email, admin.password, target), SESSION_COOKIE);
    assert.ok(pending, "the initial password opens a pending session");
    const enable = await call("/two-factor/enable", { password: admin.password }, pending, target);
    assert.equal(enable.status, 200);
    const { totpURI } = (await enable.json()) as { totpURI: string };
    const rawSecret = decodeBase32(new URL(totpURI).searchParams.get("secret") ?? "");
    const confirmed = await call(
      "/two-factor/verify-totp",
      { code: await totpCode(rawSecret) },
      pending,
      target,
    );
    assert.equal(confirmed.status, 200);
    return { rawSecret, session: cookieFrom(confirmed, SESSION_COOKIE) };
  }

  it("refuses an expired initial password exactly like a wrong one and creates no session", async () => {
    const admin = await seedAdministrator(new Date(Date.now() - ENROLLMENT_WINDOW_MS - 1000));
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
      data: { createdAt: new Date(Date.now() - ENROLLMENT_WINDOW_MS - 1000) },
    });

    assert.equal(await (await call("/get-session", undefined, pending)).text(), "null");
    assert.equal(await prisma.session.count({ where: { userId: admin.id } }), 0);
    const enable = await call("/two-factor/enable", { password: admin.password }, pending);
    assert.equal(enable.status, 401);
    assert.equal(await prisma.twoFactor.count({ where: { userId: admin.id } }), 0);
  });

  // S17: password sign-up stays closed, whatever the body asks for, and stores nothing.
  it("answers password sign-up with 400 EMAIL_PASSWORD_SIGN_UP_DISABLED and stores no user", async () => {
    const email = `t9-sign-up-${runId}@example.test`;
    emails.push(email);

    const response = await call("/sign-up/email", {
      email,
      password: randomBytes(18).toString("base64url"),
      name: "Ana",
      role: "ADMIN",
    });

    assert.equal(response.status, 400);
    assert.equal(
      ((await response.json()) as { code: string }).code,
      "EMAIL_PASSWORD_SIGN_UP_DISABLED",
    );
    assert.deepEqual(response.headers.getSetCookie(), []);
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  });

  // S17: password sign-in reveals nothing about the address or the account behind it.
  it("answers an unknown address, a customer, and a DISABLED administrator exactly like a wrong password", async () => {
    const admin = await seedAdministrator();
    const wrong = await snapshot(await signIn(admin.email, "wrong-password-x"));
    const customer = `t9-customer-${runId}@example.test`;
    emails.push(customer);
    const customerId = (await prisma.user.create({ data: { email: customer } })).id;
    const disabled = await seedAdministrator();
    await prisma.user.update({ where: { id: disabled.id }, data: { status: "DISABLED" } });

    const answers = [
      await snapshot(await signIn(`t9-unknown-${runId}@example.test`, admin.password)),
      await snapshot(await signIn(customer, admin.password)),
      await snapshot(await signIn(disabled.email, disabled.password)),
    ];

    assert.equal(wrong.status, 401);
    for (const answer of answers) {
      assert.deepEqual(answer, wrong);
    }
    assert.equal(
      await prisma.session.count({
        where: { userId: { in: [admin.id, customerId, disabled.id] } },
      }),
      0,
    );
  });

  // L35 R3-admin-cap-only-at-creation: every session an administrator can obtain is created through
  // the session hook, so each one stores 12 hours, the second-factor sign-in included.
  it("stores 12 hours for the enrollment session and for a second-factor sign-in", async () => {
    const admin = await seedAdministrator();
    const { rawSecret } = await enroll(admin);
    const enrolled = await prisma.session.findFirstOrThrow({ where: { userId: admin.id } });
    assert.equal(enrolled.expiresAt.getTime() - enrolled.createdAt.getTime(), 12 * HOUR_MS);
    await prisma.session.deleteMany({ where: { userId: admin.id } });

    const challenge = cookieFrom(await signIn(admin.email, admin.password), TWO_FACTOR_COOKIE);
    const verified = await call(
      "/two-factor/verify-totp",
      { code: await totpCode(rawSecret) },
      challenge,
    );

    assert.equal(verified.status, 200);
    const stored = await prisma.session.findFirstOrThrow({ where: { userId: admin.id } });
    assert.equal(stored.expiresAt.getTime() - stored.createdAt.getTime(), 12 * HOUR_MS);
  });

  // L35 R4-silent-session-update-refusal: an expiry change outside a customer's session read is
  // refused on PostgreSQL too, for administrators and customers alike; the stored row is unchanged.
  it("refuses a server-side session expiry change and leaves the stored row unchanged", async () => {
    const context = await auth.$context;
    const admin = await seedAdministrator();
    assert.equal((await signIn(admin.email, admin.password)).status, 200);
    const customerEmail = `t9-expiry-${runId}@example.test`;
    emails.push(customerEmail);
    const customer = await context.internalAdapter.createUser(
      { email: customerEmail, name: "", emailVerified: true },
      { method: "email-otp" },
    );
    await context.internalAdapter.createSession(customer.id);

    for (const userId of [admin.id, customer.id]) {
      const stored = await prisma.session.findFirstOrThrow({ where: { userId } });

      const updated = await context.internalAdapter.updateSession(stored.token, {
        expiresAt: new Date(Date.now() + 7 * DAY_MS),
      });

      assert.equal(updated, null, "the update is refused");
      const unchanged = await prisma.session.findUniqueOrThrow({ where: { id: stored.id } });
      assert.equal(unchanged.expiresAt.getTime(), stored.expiresAt.getTime());
      assert.equal(unchanged.updatedAt.getTime(), stored.updatedAt.getTime());
    }
  });

  // T9a-D1, fixed by T7c (L31, L48, S39): something commits while the first TOTP code of an
  // enrollment is being confirmed. Better Auth 1.7.16 `verify-totp` sets `twoFactorEnabled` and then
  // creates the enrolled session, each in its own statement, so the session-create hook must refuse
  // the session and revert the flag. The race is forced deterministically: a wrapped Prisma client
  // runs `during` right after the confirmation has read the `TwoFactor` row, before it writes.
  const SUPERSEDED = { status: 401, code: "ENROLLMENT_SUPERSEDED" };
  const SUPERSEDED_EVENT = {
    event: "administrator_enrollment_superseded",
    path: "/two-factor/verify-totp",
  } as const;

  /** The simulated failure of the compensating update (T7d, S40). */
  class RevertOutage extends Error {
    override name = "RevertOutage";
  }

  /**
   * A pending administrator with a started enrollment on an auth instance whose Prisma client can be
   * interposed. The one option, `failRevert`, makes the compensating `updateMany` that sets
   * `twoFactorEnabled` back to false throw. The returned `pauseVerifiedUpdate()` holds the next
   * `verified: true` write of a `TwoFactor` row, the last step of a first confirmation, until its
   * `release` is called; its `reached` resolves when that write is held.
   */
  async function racingEnrollment(label: string, options: { failRevert?: boolean } = {}) {
    let interpose: (() => Promise<void>) | undefined;
    let holdVerified: (() => Promise<void>) | undefined;
    const racing = prisma.$extends({
      query: {
        twoFactor: {
          async findFirst({ args, query }) {
            const result = await query(args);
            const run = interpose;
            interpose = undefined;
            await run?.();
            return result;
          },
          async update({ args, query }) {
            if ((args.data as { verified?: unknown }).verified === true) {
              const hold = holdVerified;
              holdVerified = undefined;
              await hold?.();
            }
            return query(args);
          },
        },
        user: {
          async updateMany({ args, query }) {
            // The compensating update: flag false where it is still true (the adapter nests the
            // condition under `AND`, so the filter is matched by field name).
            const clearsFlag =
              (args.data as { twoFactorEnabled?: unknown }).twoFactorEnabled === false;
            const guardedByFlag = JSON.stringify(args.where ?? {}).includes('"twoFactorEnabled"');
            if (options.failRevert && clearsFlag && guardedByFlag) {
              throw new RevertOutage("simulated outage");
            }
            return query(args);
          },
        },
      },
    });
    const events: unknown[] = [];
    const raceAuth = buildAuth(racing as unknown as PrismaClient, (event) => events.push(event));
    const accounts = new PrismaAdministratorAccountRepository(prisma);
    const email = `t7c-${label}-${runId}@example.test`;
    emails.push(email);
    const issue = async (password: string) =>
      accounts.issueInitialPassword({
        email,
        passwordHash: await hashPassword(password),
        issuedAt: new Date(),
      });
    const oldPassword = randomBytes(18).toString("base64url");
    assert.equal((await issue(oldPassword)).outcome, "created");
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

    const pending = cookieFrom(await signIn(email, oldPassword, raceAuth), SESSION_COOKIE);
    assert.ok(pending);
    const enable = await call("/two-factor/enable", { password: oldPassword }, pending, raceAuth);
    assert.equal(enable.status, 200);
    const { totpURI } = (await enable.json()) as { totpURI: string };
    const rawSecret = decodeBase32(new URL(totpURI).searchParams.get("secret") ?? "");

    return {
      raceAuth,
      events,
      email,
      userId,
      oldPassword,
      issue,
      pending,
      rawSecret,
      /** Holds the next `verified: true` write until `release` is called. */
      pauseVerifiedUpdate() {
        let release = () => {};
        const released = new Promise<void>((resolve) => {
          release = resolve;
        });
        let reachedResolve = () => {};
        const reached = new Promise<void>((resolve) => {
          reachedResolve = resolve;
        });
        holdVerified = async () => {
          reachedResolve();
          await released;
        };
        return { reached, release };
      },
      /** Confirms the first code with the pending session while `during` commits in between. */
      async confirm(during: () => Promise<void>) {
        let ran = false;
        interpose = async () => {
          await during();
          ran = true;
        };
        const response = await call(
          "/two-factor/verify-totp",
          { code: await totpCode(rawSecret) },
          pending,
          raceAuth,
        );
        // A harness failure must not pass as a refusal (L48 R3-race-todo-masks-harness-failure).
        assert.equal(ran, true, "the interposed step completed inside the confirmation");
        return response;
      },
    };
  }

  async function refusal(response: Response) {
    const body = await response.text();
    let code: unknown;
    try {
      code = (JSON.parse(body) as { code?: unknown } | null)?.code;
    } catch {
      code = body;
    }
    return {
      status: response.status,
      code,
      sessionCookie: cookieFrom(response, SESSION_COOKIE) !== undefined,
    };
  }

  async function storedEnrollment(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      sessionRows: await prisma.session.count({ where: { userId } }),
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorRows: await prisma.twoFactor.count({ where: { userId } }),
    };
  }

  it("fails closed when admin:create reissues the password during the first TOTP confirmation", async () => {
    const race = await racingEnrollment("reissue");
    const newPassword = randomBytes(18).toString("base64url");
    let reissue: IssueInitialPasswordResult | undefined;

    const confirmation = await race.confirm(async () => {
      reissue = await race.issue(newPassword);
    });

    assert.equal(reissue?.outcome, "reissued", "the reissue committed inside the confirmation");
    assert.deepEqual(await refusal(confirmation), { ...SUPERSEDED, sessionCookie: false });
    assert.deepEqual(await storedEnrollment(race.userId), {
      sessionRows: 0,
      twoFactorEnabled: false,
      twoFactorRows: 0,
    });
    // Only the reissued password works; it opens a pending session (`enroll` asserts it) that enrolls.
    assert.equal((await signIn(race.email, race.oldPassword, race.raceAuth)).status, 401);
    await enroll({ email: race.email, password: newPassword }, race.raceAuth);
    assert.equal((await storedEnrollment(race.userId)).twoFactorEnabled, true);
  });

  it("logs one administrator_enrollment_superseded event without personal data when it reverts a confirmation", async () => {
    const race = await racingEnrollment("log");

    await race.confirm(async () => {
      await race.issue(randomBytes(18).toString("base64url"));
    });

    assert.deepEqual(race.events, [{ ...SUPERSEDED_EVENT, compensation: "reverted" }]);
    const logged = JSON.stringify(race.events);
    for (const personal of [race.email, race.userId, race.oldPassword]) {
      assert.equal(logged.includes(personal), false);
    }
  });

  it("refuses the old confirmation after the reissued password has started a new enrollment", async () => {
    const race = await racingEnrollment("re-enable");
    const newPassword = randomBytes(18).toString("base64url");
    let newPending: string | undefined;
    let newSecret = "";

    const confirmation = await race.confirm(async () => {
      assert.equal((await race.issue(newPassword)).outcome, "reissued");
      // The same auth instance throughout: each test instance signs cookies with its own secret.
      newPending = cookieFrom(await signIn(race.email, newPassword, race.raceAuth), SESSION_COOKIE);
      assert.ok(newPending);
      const enable = await call(
        "/two-factor/enable",
        { password: newPassword },
        newPending,
        race.raceAuth,
      );
      assert.equal(enable.status, 200);
      const { totpURI } = (await enable.json()) as { totpURI: string };
      newSecret = decodeBase32(new URL(totpURI).searchParams.get("secret") ?? "");
    });

    assert.deepEqual(await refusal(confirmation), { ...SUPERSEDED, sessionCookie: false });
    assert.deepEqual(await storedEnrollment(race.userId), {
      sessionRows: 1,
      twoFactorEnabled: false,
      twoFactorRows: 1,
    });
    assert.equal(
      (await prisma.twoFactor.findUniqueOrThrow({ where: { userId: race.userId } })).verified,
      false,
      "the new enrollment is still unconfirmed",
    );

    // The new holder confirms the new enrollment; a normal first confirmation logs nothing.
    const confirmed = await call(
      "/two-factor/verify-totp",
      { code: await totpCode(newSecret) },
      newPending,
      race.raceAuth,
    );
    assert.equal(confirmed.status, 200);
    assert.ok(cookieFrom(confirmed, SESSION_COOKIE));
    assert.equal((await storedEnrollment(race.userId)).twoFactorEnabled, true);
    assert.equal(race.events.length, 1);
  });

  it("refuses a first TOTP confirmation that races user:disable and leaves no session", async () => {
    const race = await racingEnrollment("disable");
    const disable = new DisableUserUseCase(new PrismaUserAccessRepository(prisma), () => {});

    const confirmation = await race.confirm(async () => {
      assert.ok(await disable.execute(race.email));
    });

    assert.deepEqual(await refusal(confirmation), { ...SUPERSEDED, sessionCookie: false });
    const stored = await storedEnrollment(race.userId);
    assert.deepEqual(
      { sessionRows: stored.sessionRows, twoFactorEnabled: stored.twoFactorEnabled },
      { sessionRows: 0, twoFactorEnabled: false },
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: race.userId } })).status,
      "DISABLED",
    );
  });

  /** Confirms the first code with the pending session of `race`, as a second browser submit would. */
  async function siblingConfirmation(race: Awaited<ReturnType<typeof racingEnrollment>>) {
    return call(
      "/two-factor/verify-totp",
      { code: await totpCode(race.rawSecret) },
      race.pending,
      race.raceAuth,
    );
  }

  async function readsSession(cookie: string | undefined, target: typeof auth) {
    const response = await call("/get-session", undefined, cookie, target);
    return ((await response.json()) as { user?: { id: string } } | null)?.user?.id ?? null;
  }

  // T7d (S40, L49 R3-verified-row-shortcut-admits-stale-confirmation): the reissued password enrolls
  // completely while the old confirmation is in flight; the old one must not get a session.
  it("refuses a stale first confirmation without reverting after the reissued password enrolled", async () => {
    const race = await racingEnrollment("stale");
    const newPassword = randomBytes(18).toString("base64url");
    let newSession: string | undefined;

    const confirmation = await race.confirm(async () => {
      assert.equal((await race.issue(newPassword)).outcome, "reissued");
      ({ session: newSession } = await enroll(
        { email: race.email, password: newPassword },
        race.raceAuth,
      ));
    });

    assert.deepEqual(await refusal(confirmation), { ...SUPERSEDED, sessionCookie: false });
    assert.deepEqual(await storedEnrollment(race.userId), {
      sessionRows: 1,
      twoFactorEnabled: true,
      twoFactorRows: 1,
    });
    assert.equal(
      await prisma.twoFactor.count({ where: { userId: race.userId, verified: true } }),
      1,
    );
    assert.equal(await readsSession(newSession, race.raceAuth), race.userId);
    assert.deepEqual(race.events, [{ ...SUPERSEDED_EVENT, compensation: "skipped" }]);
  });

  // T7d (S40, L49 R4-concurrent-first-confirmation-reverts-success): a double submit of the same code.
  it("refuses a duplicate first confirmation without reverting when the sibling completed first", async () => {
    const race = await racingEnrollment("double-done");
    let sibling: Response | undefined;

    const confirmation = await race.confirm(async () => {
      sibling = await siblingConfirmation(race);
    });

    assert.equal(sibling?.status, 200);
    assert.deepEqual(await refusal(confirmation), { ...SUPERSEDED, sessionCookie: false });
    assert.deepEqual(await storedEnrollment(race.userId), {
      sessionRows: 1,
      twoFactorEnabled: true,
      twoFactorRows: 1,
    });
    assert.equal(
      await readsSession(sibling && cookieFrom(sibling, SESSION_COOKIE), race.raceAuth),
      race.userId,
    );
    assert.deepEqual(race.events, [{ ...SUPERSEDED_EVENT, compensation: "skipped" }]);
  });

  it("refuses a duplicate first confirmation without reverting and ends every session while the sibling is completing", async () => {
    const race = await racingEnrollment("double-midway");
    const held = race.pauseVerifiedUpdate();
    let sibling: Promise<Response> | undefined;

    // The sibling deleted the pending session and stored its own, but has not marked the row verified.
    const confirmation = await race.confirm(async () => {
      sibling = siblingConfirmation(race);
      await held.reached;
    });
    const refused = await refusal(confirmation);
    held.release();
    const completed = await sibling;

    assert.deepEqual(refused, { ...SUPERSEDED, sessionCookie: false });
    assert.equal(completed?.status, 200);
    assert.deepEqual(await storedEnrollment(race.userId), {
      sessionRows: 0,
      twoFactorEnabled: true,
      twoFactorRows: 1,
    });
    assert.equal(
      await prisma.twoFactor.count({ where: { userId: race.userId, verified: true } }),
      1,
    );
    assert.equal(
      await readsSession(completed && cookieFrom(completed, SESSION_COOKIE), race.raceAuth),
      null,
    );
    assert.deepEqual(race.events, [{ ...SUPERSEDED_EVENT, compensation: "skipped" }]);

    // Enrolled all the same: the password and the second factor open a session again.
    const signedIn = await signIn(race.email, race.oldPassword, race.raceAuth);
    const challenge = cookieFrom(signedIn, TWO_FACTOR_COOKIE);
    assert.ok(challenge);
    const code = await totpCode(race.rawSecret);
    const verified = await call("/two-factor/verify-totp", { code }, challenge, race.raceAuth);
    const session = cookieFrom(verified, SESSION_COOKIE);
    assert.equal(await readsSession(session, race.raceAuth), race.userId);
  });

  it("reverts a first confirmation that races a sign-out, then lets the password enroll", async () => {
    const race = await racingEnrollment("sign-out");

    const confirmation = await race.confirm(async () => {
      const signedOut = await call("/sign-out", {}, race.pending, race.raceAuth);
      assert.equal(signedOut.status, 200);
    });

    assert.deepEqual(await refusal(confirmation), { ...SUPERSEDED, sessionCookie: false });
    const stored = await storedEnrollment(race.userId);
    assert.deepEqual(
      { sessionRows: stored.sessionRows, twoFactorEnabled: stored.twoFactorEnabled },
      { sessionRows: 0, twoFactorEnabled: false },
    );
    assert.deepEqual(race.events, [{ ...SUPERSEDED_EVENT, compensation: "reverted" }]);
    await enroll({ email: race.email, password: race.oldPassword }, race.raceAuth);
    assert.equal((await storedEnrollment(race.userId)).twoFactorEnabled, true);
  });

  // T7d review correction (R3-newer-session-refuse-keeps-flag-with-password-session): a newer
  // password session from a second tab must not gain authority when the refusal keeps the flag.
  it("ends a second tab's session when it refuses a confirmation that races a sign-out", async () => {
    const race = await racingEnrollment("second-tab");
    const secondTab = cookieFrom(
      await signIn(race.email, race.oldPassword, race.raceAuth),
      SESSION_COOKIE,
    );
    assert.ok(secondTab);

    const confirmation = await race.confirm(async () => {
      const signedOut = await call("/sign-out", {}, race.pending, race.raceAuth);
      assert.equal(signedOut.status, 200);
    });

    assert.deepEqual(await refusal(confirmation), { ...SUPERSEDED, sessionCookie: false });
    assert.equal(await readsSession(secondTab, race.raceAuth), null);
    assert.deepEqual(await storedEnrollment(race.userId), {
      sessionRows: 0,
      twoFactorEnabled: true,
      twoFactorRows: 1,
    });
    assert.equal(
      await prisma.twoFactor.count({ where: { userId: race.userId, verified: true } }),
      0,
    );
    assert.deepEqual(race.events, [{ ...SUPERSEDED_EVENT, compensation: "skipped" }]);
  });

  // T7d (S40, L49 R3-revert-failure-locks-without-log): the account stays locked, fails closed, and
  // the failure is logged with the error class only.
  it("refuses with 401 and logs administrator_enrollment_compensation_failed when the revert itself fails", async () => {
    const race = await racingEnrollment("revert-fails", { failRevert: true });

    const confirmation = await race.confirm(async () => {
      await race.issue(randomBytes(18).toString("base64url"));
    });

    assert.deepEqual(await refusal(confirmation), { ...SUPERSEDED, sessionCookie: false });
    assert.deepEqual(race.events, [
      { ...SUPERSEDED_EVENT, compensation: "reverted" },
      {
        event: "administrator_enrollment_compensation_failed",
        path: "/two-factor/verify-totp",
        error: "RevertOutage",
      },
    ]);
    assert.deepEqual(await storedEnrollment(race.userId), {
      sessionRows: 0,
      twoFactorEnabled: true,
      twoFactorRows: 0,
    });
  });

  // T7d (S40, L49): a session opened with the password alone must not gain administrator authority
  // when enrollment completes in another session.
  it("ends every other session of the administrator at a successful first confirmation", async () => {
    const events: unknown[] = [];
    const logged = buildAuth(prisma, (event) => events.push(event));
    const admin = await seedAdministrator();
    const tabA = cookieFrom(await signIn(admin.email, admin.password, logged), SESSION_COOKIE);
    const tabB = cookieFrom(await signIn(admin.email, admin.password, logged), SESSION_COOKIE);
    assert.ok(tabA && tabB);
    const enable = await call("/two-factor/enable", { password: admin.password }, tabA, logged);
    const { totpURI } = (await enable.json()) as { totpURI: string };
    const rawSecret = decodeBase32(new URL(totpURI).searchParams.get("secret") ?? "");

    const confirmed = await call(
      "/two-factor/verify-totp",
      { code: await totpCode(rawSecret) },
      tabA,
      logged,
    );

    assert.equal(confirmed.status, 200);
    assert.equal(await (await call("/get-session", undefined, tabB, logged)).text(), "null");
    const listed = await snapshot(await call("/list-sessions", undefined, tabB, logged));
    assert.equal(listed.status, 401);
    assert.deepEqual(
      listed,
      await snapshot(await call("/list-sessions", undefined, undefined, logged)),
    );
    assert.equal(await prisma.session.count({ where: { userId: admin.id } }), 1);
    assert.equal(
      await readsSession(cookieFrom(confirmed, SESSION_COOKIE), logged),
      admin.id,
      "the enrolled session is the one that remains",
    );
    assert.deepEqual(events, [], "a normal first confirmation logs nothing");
  });

  it("lets an enrolled administrator pass the sign-in challenge with a stale session cookie", async () => {
    const admin = await seedAdministrator();
    const { rawSecret, session: stale } = await enroll(admin);
    assert.ok(stale);
    await prisma.session.deleteMany({ where: { userId: admin.id } });
    const challenge = cookieFrom(await signIn(admin.email, admin.password), TWO_FACTOR_COOKIE);
    assert.ok(challenge);

    const verified = await call(
      "/two-factor/verify-totp",
      { code: await totpCode(rawSecret) },
      `${stale}; ${challenge}`,
    );

    assert.equal(verified.status, 200);
    assert.ok(cookieFrom(verified, SESSION_COOKIE));
    assert.equal(await prisma.session.count({ where: { userId: admin.id } }), 1);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).twoFactorEnabled,
      true,
    );
  });

  // T10a (S44): the recovery command, run as `admin:reset-second-factor` runs it.
  const recovery = () =>
    new ResetSecondFactorUseCase({
      accounts: new PrismaAdministratorAccountRepository(prisma),
      hashPassword,
      log: () => {},
    });

  it("recovers an enrolled administrator, who signs in as a pending administrator and enrolls again", async () => {
    const admin = await seedAdministrator();
    const { rawSecret, session } = await enroll(admin);
    const challenge = cookieFrom(await signIn(admin.email, admin.password), TWO_FACTOR_COOKIE);
    const verify = { code: await totpCode(rawSecret) };
    assert.equal((await call("/two-factor/verify-totp", verify, challenge)).status, 200);
    assert.ok(
      (await prisma.twoFactor.findUniqueOrThrow({ where: { userId: admin.id } })).backupCodes,
    );
    assert.equal(await prisma.session.count({ where: { userId: admin.id } }), 2);
    const credentials = () =>
      prisma.account.findMany({ where: { userId: admin.id, providerId: "credential" } });
    const [old] = await credentials();
    const wrong = await snapshot(await signIn(admin.email, "wrong-password-x"));

    const { outcome, initialPassword } = await recovery().execute(admin.email);

    assert.equal(outcome.outcome, "reset");
    assert.ok(initialPassword);
    assert.deepEqual(await storedEnrollment(admin.id), {
      sessionRows: 0,
      twoFactorEnabled: false,
      twoFactorRows: 0,
    });
    const [credential, ...others] = await credentials();
    assert.equal(others.length, 0);
    assert.ok((credential?.createdAt ?? 0) > (old?.createdAt ?? 0), "a new enrollment window");
    assert.equal(await (await call("/get-session", undefined, session)).text(), "null");
    assert.deepEqual(await snapshot(await signIn(admin.email, admin.password)), wrong);
    // Pending again: no challenge, a gated session, and the new password enrolls a new app.
    const signedIn = await signIn(admin.email, initialPassword);
    assert.equal(cookieFrom(signedIn, TWO_FACTOR_COOKIE), undefined);
    const pending = cookieFrom(signedIn, SESSION_COOKIE);
    assert.ok(pending);
    assert.deepEqual(
      await snapshot(await call("/list-sessions", undefined, pending)),
      await snapshot(await call("/list-sessions")),
    );
    await enroll({ email: admin.email, password: initialPassword });
    assert.equal((await storedEnrollment(admin.id)).twoFactorEnabled, true);
  });

  it("fails closed when admin:reset-second-factor runs during the first TOTP confirmation", async () => {
    const race = await racingEnrollment("reset");
    let reset: Awaited<ReturnType<ResetSecondFactorUseCase["execute"]>> | undefined;

    const confirmation = await race.confirm(async () => {
      reset = await recovery().execute(race.email);
    });

    assert.equal(reset?.outcome.outcome, "reset", "the recovery committed inside the confirmation");
    assert.deepEqual(await refusal(confirmation), { ...SUPERSEDED, sessionCookie: false });
    assert.deepEqual(await storedEnrollment(race.userId), {
      sessionRows: 0,
      twoFactorEnabled: false,
      twoFactorRows: 0,
    });
    assert.ok(reset?.initialPassword);
    await enroll({ email: race.email, password: reset.initialPassword }, race.raceAuth);
  });
});
