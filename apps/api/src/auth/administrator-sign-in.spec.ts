import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Controller, Get, type INestApplication, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { MemoryOwnProfileRepository } from "../../test/memory-own-profile.repository";
import { createApp } from "../app.setup";
import { createConfigModule } from "../config/config.module";
import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { INITIAL_PASSWORD_WINDOW_HOURS } from "../users/application/initial-password";
import { OWN_PROFILE_REPOSITORY } from "../users/application/own-profile.repository";
import { OwnProfileController } from "../users/presentation/own-profile.controller";
import { OWN_PROFILE_USE_CASES } from "../users/users.module";
import { AdminOnly } from "./access-control/access-control";
import { AccessControlModule } from "./access-control/access-control.module";
import { ADMINISTRATOR_ENROLLMENT_WINDOW_SECONDS } from "./account-access";
import { PENDING_ADMINISTRATOR_ENDPOINTS } from "./administrator-enrollment";
import { createAuth } from "./auth.factory";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// Administrator sign-in (M2 T7; ADR 0004 decisions 3, 6, 7; S6, S20, S21, S22) through the shared
// createApp boundary, the project-owned guard, and Better Auth on the in-memory adapter: no network,
// no database. Administrators are seeded through Better Auth's own internal adapter and password
// hasher, never through the `admin:create` command. TOTP codes come from Better Auth's own server-only
// `generateTOTP` endpoint.

const TRUSTED_ORIGIN = "http://localhost:3000";
// The public web origin, which must be one of the trusted origins (L33).
const AUTH_BASE_URL = TRUSTED_ORIGIN;
const SESSION_COOKIE = "better-auth.session_token";
const TWO_FACTOR_COOKIE = "better-auth.two_factor";
const TRUST_DEVICE_COOKIE = "better-auth.trust_device";
const CODE_PATTERN = /\b(\d{6})\b/;
const HOUR_MS = 60 * 60 * 1000;

type Row = Record<string, unknown>;

@Controller("probe")
class ProbeController {
  @Get("undecorated")
  readUndecorated(): { ok: true } {
    return { ok: true };
  }

  @AdminOnly()
  @Get("admin")
  readAdmin(): { ok: true } {
    return { ok: true };
  }
}

/** RFC 4648 base32, as in the `secret` parameter of an `otpauth://` URI. */
function decodeBase32(input: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of input.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    assert.ok(index >= 0, "the TOTP secret is base32");
    bits += index.toString(2).padStart(5, "0");
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

async function snapshot(response: Response): Promise<{ status: number; body: string }> {
  return { status: response.status, body: await response.text() };
}

describe("administrator sign-in, enrollment gate, and second factor", () => {
  const database: Record<string, Row[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
    twoFactor: [],
  };
  const emailSender = new InMemoryEmailSender();
  const runtime: EmailDeliveryRuntime = {
    now: () => Date.now(),
    sleep: async () => {},
    warn: () => {},
    error: () => {},
  };
  const tasks = new BackgroundTasks(() => {});
  const secret = randomBytes(32).toString("base64url");
  const auth = createAuth({
    secret,
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [TRUSTED_ORIGIN],
    database: memoryAdapter(database),
    signInCodes: new SignInCodeSender(new EmailDeliveryService(emailSender, runtime), tasks),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });
  // `createAuth` returns the generic `Auth`; plugin endpoints are reached through this view.
  const api = auth.api as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  let app: INestApplication;
  let baseUrl: string;
  let clientCounter = 0;
  let emailCounter = 0;

  before(async () => {
    @Module({
      imports: [
        createConfigModule({
          NODE_ENV: "development",
          CORS_ORIGIN: TRUSTED_ORIGIN,
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: secret,
          AUTH_BASE_URL,
        }),
        AuthModule.forRoot({ auth, disableTrustedOriginsCors: true, disableGlobalAuthGuard: true }),
        AccessControlModule,
      ],
      controllers: [ProbeController, OwnProfileController],
      providers: [
        ...OWN_PROFILE_USE_CASES,
        {
          provide: OWN_PROFILE_REPOSITORY,
          useValue: new MemoryOwnProfileRepository(() => database.user ?? []),
        },
      ],
    })
    class AdministratorTestModule {}

    app = await createApp(AdministratorTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  /** A distinct client IP per request, so the per-IP limits never mix probes. */
  function nextClientIp(): string {
    clientCounter += 1;
    return `10.70.${clientCounter >> 8}.${clientCounter & 255}`;
  }

  function authPost(
    path: string,
    body: unknown,
    cookie?: string,
    clientIp = nextClientIp(),
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: TRUSTED_ORIGIN,
        "x-forwarded-for": clientIp,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  function authGet(path: string, cookie?: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth${path}`, {
      headers: { "x-forwarded-for": nextClientIp(), ...(cookie ? { cookie } : {}) },
    });
  }

  function get(path: string, cookie?: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {} });
  }

  function patch(path: string, body: unknown, cookie?: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
  }

  function newEmail(label: string): string {
    emailCounter += 1;
    return `t7-${label}-${emailCounter}@example.test`;
  }

  function storedUser(id: string): Row {
    const user = database.user?.find((row) => row.id === id);
    assert.ok(user, "the user is stored");
    return user;
  }

  function credentialAccount(userId: string): Row {
    const account = database.account?.find(
      (row) => row.userId === userId && row.providerId === "credential",
    );
    assert.ok(account, "the credential account is stored");
    return account;
  }

  function twoFactorRow(userId: string): Row | undefined {
    return database.twoFactor?.find((row) => row.userId === userId);
  }

  function sessionsOf(userId: string): Row[] {
    return (database.session ?? []).filter((row) => row.userId === userId);
  }

  /**
   * An ADMIN with a credential account, as the creation command leaves one: Better Auth's own
   * internal adapter and password hasher. `issuedAt` is the credential account's creation time.
   */
  async function seedAdministrator(
    options: { issuedAt?: Date; status?: string } = {},
  ): Promise<{ id: string; email: string; password: string }> {
    const context = await auth.$context;
    const email = newEmail("admin");
    const password = randomBytes(18).toString("base64url");
    const user = await context.internalAdapter.createUser(
      { email, name: "", emailVerified: false },
      { method: "admin-seed" },
    );
    const row = storedUser(user.id);
    row.role = "ADMIN";
    row.status = options.status ?? "ACTIVE";
    await context.internalAdapter.createAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await context.password.hash(password),
      ...(options.issuedAt ? { createdAt: options.issuedAt, updatedAt: options.issuedAt } : {}),
    });
    return { id: user.id, email, password };
  }

  async function seedCustomer(): Promise<{ id: string; email: string }> {
    const context = await auth.$context;
    const email = newEmail("customer");
    const user = await context.internalAdapter.createUser(
      { email, name: "", emailVerified: true },
      { method: "email-otp" },
    );
    return { id: user.id, email };
  }

  /** A signed session cookie for a stored user, created through Better Auth's internal adapter. */
  async function createSession(userId: string): Promise<{ cookie: string; token: string }> {
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(userId);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");
    return {
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`,
      token: session.token,
    };
  }

  function signInWithPassword(email: string, password: string, cookie?: string) {
    return authPost("/sign-in/email", { email, password }, cookie);
  }

  async function signedInPending(): Promise<{
    admin: { id: string; email: string; password: string };
    cookie: string;
  }> {
    const admin = await seedAdministrator();
    const response = await signInWithPassword(admin.email, admin.password);
    assert.equal(response.status, 200, "the initial password signs in within the window");
    const cookie = cookieFrom(response, SESSION_COOKIE);
    assert.ok(cookie, "the sign-in set a session cookie");
    return { admin, cookie };
  }

  /**
   * A TOTP code from Better Auth's own server-only `generateTOTP` endpoint. With an offset, the code of
   * another 30-second period: outside the one period either side that verification accepts.
   */
  async function totpCode(rawSecret: string, offsetSeconds = 0): Promise<string> {
    const generateTOTP = api.generateTOTP;
    assert.ok(generateTOTP, "Better Auth exposes generateTOTP");
    const original = Date.now;
    Date.now = () => original() + offsetSeconds * 1000;
    try {
      return ((await generateTOTP({ body: { secret: rawSecret } })) as { code: string }).code;
    } finally {
      Date.now = original;
    }
  }

  async function startEnrollment(cookie: string, password: string, body: Row = {}) {
    const response = await authPost("/two-factor/enable", { password, ...body }, cookie);
    assert.equal(response.status, 200, "enabling two-factor answers 200");
    const result = (await response.json()) as { totpURI: string; backupCodes: string[] };
    const uri = new URL(result.totpURI);
    const rawSecret = decodeBase32(uri.searchParams.get("secret") ?? "");
    return { ...result, uri, rawSecret };
  }

  /** Enrolls a pending administrator and returns the fresh session cookie and the factors. */
  async function enrolledAdministrator() {
    const { admin, cookie } = await signedInPending();
    const enrollment = await startEnrollment(cookie, admin.password);
    const response = await authPost(
      "/two-factor/verify-totp",
      { code: await totpCode(enrollment.rawSecret) },
      cookie,
    );
    assert.equal(response.status, 200, "the first valid code confirms enrollment");
    const enrolledCookie = cookieFrom(response, SESSION_COOKIE);
    assert.ok(enrolledCookie, "enrollment issues a new session cookie");
    return { admin, cookie: enrolledCookie, ...enrollment };
  }

  /** Password step of an enrolled administrator: returns the two-factor challenge cookie. */
  async function passwordStep(email: string, password: string): Promise<string> {
    const response = await signInWithPassword(email, password);
    assert.equal(response.status, 200);
    const challenge = cookieFrom(response, TWO_FACTOR_COOKIE);
    assert.ok(challenge, "the password step sets the two-factor challenge cookie");
    return challenge;
  }

  describe("password sign-in for administrators only (decision 3, S17)", () => {
    it("enables email and password with sign-up disabled", () => {
      assert.equal(auth.options.emailAndPassword?.enabled, true);
      assert.equal(auth.options.emailAndPassword?.disableSignUp, true);
    });

    it("answers /sign-up/email with 400 EMAIL_PASSWORD_SIGN_UP_DISABLED and stores nothing", async () => {
      const email = newEmail("sign-up");
      const response = await authPost("/sign-up/email", {
        email,
        password: "a-long-enough-password",
        name: "x",
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
        message: "Email and password sign up is not enabled",
      });
      assert.equal(
        database.user?.some((row) => row.email === email),
        false,
      );
    });

    it("signs in an administrator with the right password", async () => {
      const { admin, cookie } = await signedInPending();
      const session = await authGet("/get-session", cookie);

      assert.equal(session.status, 200);
      assert.equal(((await session.json()) as { user: { id: string } }).user.id, admin.id);
    });

    it("answers a customer, an unknown address, a wrong password, and a DISABLED administrator identically", async () => {
      const admin = await seedAdministrator();
      const disabled = await seedAdministrator({ status: "DISABLED" });
      const customer = await seedCustomer();
      const before = database.session?.length;

      const wrongPassword = await snapshot(
        await signInWithPassword(admin.email, "not-the-right-password"),
      );
      const answers = [
        await snapshot(await signInWithPassword(customer.email, "a-long-enough-password")),
        await snapshot(await signInWithPassword(newEmail("unknown"), "a-long-enough-password")),
        await snapshot(await signInWithPassword(disabled.email, disabled.password)),
      ];

      assert.equal(wrongPassword.status, 401);
      assert.deepEqual(JSON.parse(wrongPassword.body), {
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
      });
      for (const answer of answers) {
        assert.deepEqual(answer, wrongPassword);
      }
      assert.equal(database.session?.length, before, "no session row was created");
    });

    it("refuses a customer who somehow holds a password, exactly like a wrong password", async () => {
      const customer = await seedCustomer();
      const context = await auth.$context;
      await context.internalAdapter.createAccount({
        userId: customer.id,
        providerId: "credential",
        accountId: customer.id,
        password: await context.password.hash("a-long-enough-password"),
      });
      const wrong = await snapshot(await signInWithPassword(customer.email, "wrong-password-x"));

      const response = await signInWithPassword(customer.email, "a-long-enough-password");

      assert.deepEqual(await snapshot(response), wrong);
      assert.deepEqual(response.headers.getSetCookie(), []);
      assert.equal(sessionsOf(customer.id).length, 0);
    });

    it("keeps password change and every reset route disabled, and set-password server-only", async () => {
      const { admin, cookie } = await signedInPending();
      const before = { ...credentialAccount(admin.id) };
      const body = {
        email: admin.email,
        currentPassword: admin.password,
        newPassword: "another-long-password",
        token: "x",
        otp: "000000",
      };

      for (const path of [
        "/change-password",
        "/request-password-reset",
        "/reset-password",
        "/email-otp/request-password-reset",
        "/forget-password/email-otp",
        "/email-otp/reset-password",
        "/set-password",
      ]) {
        assert.equal((await authPost(path, body, cookie)).status, 404, path);
      }

      assert.deepEqual(credentialAccount(admin.id), before);
    });
  });

  describe("rate limits on password and second-factor attempts (decision 7)", () => {
    it("pins explicit per-IP rules", () => {
      const rules = auth.options.rateLimit?.customRules ?? {};

      assert.equal(auth.options.rateLimit?.storage, "database");
      assert.deepEqual(rules["/sign-in/email"], { window: 60, max: 3 });
      assert.deepEqual(rules["/two-factor/enable"], { window: 60, max: 3 });
      assert.deepEqual(rules["/two-factor/generate-backup-codes"], { window: 60, max: 3 });
      assert.deepEqual(rules["/two-factor/verify-totp"], { window: 60, max: 5 });
      assert.deepEqual(rules["/two-factor/verify-backup-code"], { window: 60, max: 5 });
    });

    it("answers the 4th password attempt from one client IP within a minute with 429", async () => {
      const admin = await seedAdministrator();
      const clientIp = nextClientIp();
      const statuses: number[] = [];

      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await authPost(
          "/sign-in/email",
          { email: admin.email, password: "wrong-password-x" },
          undefined,
          clientIp,
        );
        statuses.push(response.status);
      }

      assert.deepEqual(statuses, [401, 401, 401, 429]);
    });

    it("answers the 6th second-factor attempt from one client IP within a minute with 429", async () => {
      const clientIp = nextClientIp();
      const statuses: number[] = [];

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await authPost(
          "/two-factor/verify-totp",
          { code: "000000" },
          undefined,
          clientIp,
        );
        statuses.push(response.status);
      }

      assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
    });
  });

  describe("pre-enrollment window of 24 hours (S20)", () => {
    it("pins the window at 24 hours, as the creation and recovery commands print it", () => {
      assert.equal(ADMINISTRATOR_ENROLLMENT_WINDOW_SECONDS, 24 * 60 * 60);
      assert.equal(
        INITIAL_PASSWORD_WINDOW_HOURS * 60 * 60,
        ADMINISTRATOR_ENROLLMENT_WINDOW_SECONDS,
      );
    });

    it("accepts the initial password shortly before the window ends", async () => {
      const admin = await seedAdministrator({
        issuedAt: new Date(Date.now() - 24 * HOUR_MS + 60_000),
      });

      assert.equal((await signInWithPassword(admin.email, admin.password)).status, 200);
    });

    it("answers the initial password after the window exactly like a wrong password", async () => {
      const admin = await seedAdministrator({ issuedAt: new Date(Date.now() - 24 * HOUR_MS) });
      const wrong = await snapshot(await signInWithPassword(admin.email, "wrong-password-x"));

      const response = await signInWithPassword(admin.email, admin.password);

      assert.deepEqual(await snapshot(response), wrong);
      assert.deepEqual(response.headers.getSetCookie(), []);
      assert.equal(sessionsOf(admin.id).length, 0, "no session row was created");
    });

    it("stops an existing pre-enrollment session once the window ends, and refuses enrollment", async () => {
      const { admin, cookie } = await signedInPending();
      credentialAccount(admin.id).createdAt = new Date(Date.now() - 24 * HOUR_MS - 1000);
      const anonymousEnable = await snapshot(
        await authPost("/two-factor/enable", { password: admin.password }),
      );

      const session = await authGet("/get-session", cookie);
      assert.equal(session.status, 200);
      assert.equal(await session.text(), "null");
      assert.equal(sessionsOf(admin.id).length, 0, "the session row is deleted");

      const enable = await snapshot(
        await authPost("/two-factor/enable", { password: admin.password }, cookie),
      );
      assert.deepEqual(enable, anonymousEnable);
      assert.equal(enable.status, 401);
      assert.equal(twoFactorRow(admin.id), undefined, "no enrollment was started");
      assert.equal((await get("/probe/undecorated", cookie)).status, 401);
    });

    it("treats a missing credential account as an expired window", async () => {
      const admin = await seedAdministrator();
      const { cookie } = await createSession(admin.id);
      database.account = (database.account ?? []).filter((row) => row.userId !== admin.id);

      assert.equal(await (await authGet("/get-session", cookie)).text(), "null");
      assert.equal(sessionsOf(admin.id).length, 0);
    });

    it("keeps the issue time through every API path an administrator can call", async () => {
      const { admin, cookie } = await signedInPending();
      const issuedAt = credentialAccount(admin.id).createdAt;
      const body = { password: admin.password, newPassword: "another-long-password" };

      for (const path of [
        "/sign-in/email",
        "/change-password",
        "/set-password",
        "/reset-password",
        "/email-otp/reset-password",
        "/update-user",
        "/unlink-account",
        "/link-social",
        "/verify-password",
        "/refresh-token",
        "/get-access-token",
      ]) {
        await authPost(path, { ...body, email: admin.email, providerId: "credential" }, cookie);
      }
      const enrollment = await startEnrollment(cookie, admin.password);
      await authPost(
        "/two-factor/verify-totp",
        { code: await totpCode(enrollment.rawSecret) },
        cookie,
      );

      assert.equal(storedUser(admin.id).twoFactorEnabled, true);
      assert.deepEqual(credentialAccount(admin.id).createdAt, issuedAt);
      assert.equal(
        (database.account ?? []).filter((row) => row.userId === admin.id).length,
        1,
        "no second account was created",
      );
    });
  });

  describe("enrollment gate (S6, S21)", () => {
    const refusedEndpoints: Array<{ method: "GET" | "POST"; path: string; body?: unknown }> = [
      { method: "GET", path: "/list-sessions" },
      { method: "GET", path: "/list-accounts" },
      { method: "GET", path: "/account-info" },
      { method: "POST", path: "/revoke-session", body: { token: "unknown" } },
      { method: "POST", path: "/revoke-sessions", body: {} },
      { method: "POST", path: "/revoke-other-sessions", body: {} },
      { method: "POST", path: "/verify-password", body: { password: "a-long-enough-password" } },
      { method: "POST", path: "/get-access-token", body: { providerId: "google" } },
      { method: "POST", path: "/refresh-token", body: { providerId: "google" } },
      {
        method: "POST",
        path: "/two-factor/generate-backup-codes",
        body: { password: "a-long-enough-password" },
      },
      { method: "POST", path: "/two-factor/verify-backup-code", body: { code: "aaaaa-bbbbb" } },
    ];

    async function call(endpoint: (typeof refusedEndpoints)[number], cookie?: string) {
      const response =
        endpoint.method === "GET"
          ? await authGet(endpoint.path, cookie)
          : await authPost(endpoint.path, endpoint.body, cookie);
      return snapshot(response);
    }

    it("refuses every project route to an un-enrolled administrator with 401 and a generic body", async () => {
      const { cookie } = await signedInPending();

      for (const [label, request] of [
        ["GET /probe/undecorated", () => get("/probe/undecorated", cookie)],
        ["GET /probe/admin", () => get("/probe/admin", cookie)],
        ["GET /me", () => get("/me", cookie)],
        ["PATCH /me", () => patch("/me", { displayName: "x" }, cookie)],
      ] as const) {
        const response = await request();
        assert.equal(response.status, 401, label);
        assert.deepEqual(
          await response.json(),
          { message: "Unauthorized", statusCode: 401 },
          label,
        );
      }
    });

    it("gives an enrolled administrator the administrator routes and /me", async () => {
      const { cookie } = await enrolledAdministrator();

      assert.equal((await get("/probe/admin", cookie)).status, 200);
      assert.equal((await get("/me", cookie)).status, 200);
    });

    it("still serves customers on project routes and refuses them administrator routes", async () => {
      const customer = await seedCustomer();
      const { cookie } = await createSession(customer.id);

      assert.equal((await get("/me", cookie)).status, 200);
      assert.equal((await get("/probe/admin", cookie)).status, 403);
    });

    // ADR 0004 decision 3, clarified (2026-11-07; T11, L64): the session hook hides a pending session
    // from every path outside this set, so the set is the whole allow list. The tests around this one
    // prove each allowed endpoint works and a sample of the others answers as without a session.
    it("lists exactly four Better Auth endpoints in the pending-administrator allow list", () => {
      assert.deepEqual([...PENDING_ADMINISTRATOR_ENDPOINTS].sort(), [
        "/get-session",
        "/sign-out",
        "/two-factor/enable",
        "/two-factor/verify-totp",
      ]);
    });

    it("lets an un-enrolled administrator read its session", async () => {
      const { admin, cookie } = await signedInPending();
      const response = await authGet("/get-session", cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as { user: { id: string; twoFactorEnabled: boolean } };
      assert.equal(body.user.id, admin.id);
      assert.equal(body.user.twoFactorEnabled, false);
    });

    for (const endpoint of refusedEndpoints) {
      it(`answers ${endpoint.method} ${endpoint.path} for an un-enrolled administrator exactly as without a session`, async () => {
        const { admin, cookie } = await signedInPending();

        const anonymous = await call(endpoint);
        const refused = await call(endpoint, cookie);

        assert.deepEqual(refused, anonymous);
        assert.equal(sessionsOf(admin.id).length, 1, "the session itself survives");
        assert.equal((await authGet("/get-session", cookie)).status, 200);
      });
    }

    it("lets an un-enrolled administrator sign out", async () => {
      const { admin, cookie } = await signedInPending();
      const response = await authPost("/sign-out", {}, cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true });
      assert.equal(sessionsOf(admin.id).length, 0);
    });

    it("refuses the two-factor endpoints to a customer session, as without a session", async () => {
      const customer = await seedCustomer();
      const { cookie } = await createSession(customer.id);
      const body = { password: "a-long-enough-password" };

      for (const path of ["/two-factor/enable", "/two-factor/verify-totp"]) {
        const anonymous = await snapshot(await authPost(path, body));
        assert.deepEqual(await snapshot(await authPost(path, body, cookie)), anonymous, path);
      }
      assert.equal(twoFactorRow(customer.id), undefined);
    });

    it("decides enrollment from twoFactorEnabled, never from a TwoFactor row's verified default (L17)", async () => {
      const { admin, cookie } = await signedInPending();
      // A row as the database default would leave it: verified, but never confirmed by a code.
      database.twoFactor?.push({
        id: "forged",
        userId: admin.id,
        secret: "x",
        backupCodes: "x",
        verified: true,
      });

      assert.equal((await get("/probe/admin", cookie)).status, 401);
      const response = await signInWithPassword(admin.email, admin.password);
      assert.equal(cookieFrom(response, TWO_FACTOR_COOKIE), undefined);
      assert.equal((await get("/probe/admin", cookieFrom(response, SESSION_COOKIE))).status, 401);
    });
  });

  describe("TOTP enrollment and backup codes (decision 3)", () => {
    it("pins the two-factor options", () => {
      const plugin = auth.options.plugins?.find((entry) => entry.id === "two-factor") as
        | { options?: Record<string, unknown> }
        | undefined;

      assert.deepEqual(plugin?.options, {
        issuer: "InvitaMe",
        allowPasswordless: false,
        skipVerificationOnEnable: false,
        twoFactorCookieMaxAge: 600,
        totpOptions: { digits: 6, period: 30 },
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
        accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 900 },
      });
    });

    it("returns the TOTP URI with the InvitaMe issuer and 10 backup codes, whatever issuer the client sends", async () => {
      const { admin, cookie } = await signedInPending();
      const enrollment = await startEnrollment(cookie, admin.password, { issuer: "Elsewhere" });

      assert.equal(enrollment.uri.protocol, "otpauth:");
      assert.equal(enrollment.uri.searchParams.get("issuer"), "InvitaMe");
      assert.equal(enrollment.backupCodes.length, 10);
      assert.equal(storedUser(admin.id).twoFactorEnabled, false, "not enrolled before a code");
      assert.equal(twoFactorRow(admin.id)?.verified, false);
    });

    it("stores backup codes encrypted, never in plain text", async () => {
      const { admin, cookie } = await signedInPending();
      const { backupCodes } = await startEnrollment(cookie, admin.password);
      const stored = String(twoFactorRow(admin.id)?.backupCodes);

      for (const code of backupCodes) {
        assert.equal(stored.includes(code), false);
      }
    });

    it("keeps the account un-enrolled after a wrong code", async () => {
      const { admin, cookie } = await signedInPending();
      const enrollment = await startEnrollment(cookie, admin.password);

      const response = await authPost(
        "/two-factor/verify-totp",
        { code: await totpCode(enrollment.rawSecret, 300) },
        cookie,
      );

      assert.equal(response.status, 401);
      assert.equal(((await response.json()) as { code: string }).code, "INVALID_CODE");
      assert.equal(storedUser(admin.id).twoFactorEnabled, false);
      assert.equal((await get("/probe/admin", cookie)).status, 401);
    });

    it("confirms enrollment with the first valid code and replaces the session", async () => {
      const { admin, cookie } = await signedInPending();
      const enrollment = await startEnrollment(cookie, admin.password);

      const response = await authPost(
        "/two-factor/verify-totp",
        { code: await totpCode(enrollment.rawSecret) },
        cookie,
      );

      assert.equal(response.status, 200);
      assert.equal(storedUser(admin.id).twoFactorEnabled, true);
      assert.equal(twoFactorRow(admin.id)?.verified, true);
      assert.equal((await authGet("/get-session", cookie)).status, 200);
      assert.equal(await (await authGet("/get-session", cookie)).text(), "null");
      const enrolledCookie = cookieFrom(response, SESSION_COOKIE);
      assert.equal((await get("/probe/admin", enrolledCookie)).status, 200);
    });

    it("refuses a second enable once enrolled", async () => {
      const { admin, cookie } = await enrolledAdministrator();
      const response = await authPost("/two-factor/enable", { password: admin.password }, cookie);

      assert.equal(response.status, 400);
      assert.equal(((await response.json()) as { code: string }).code, "TOTP_ALREADY_ENABLED");
    });

    it("requires a second factor after the password once enrolled: no session before the code", async () => {
      const { admin, rawSecret } = await enrolledAdministrator();
      database.session = (database.session ?? []).filter((row) => row.userId !== admin.id);

      const response = await signInWithPassword(admin.email, admin.password);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        twoFactorRedirect: true,
        twoFactorMethods: ["totp"],
      });
      assert.equal(cookieFrom(response, SESSION_COOKIE), undefined);
      assert.equal(sessionsOf(admin.id).length, 0, "the password step leaves no session row");

      const challenge = cookieFrom(response, TWO_FACTOR_COOKIE);
      const verified = await authPost(
        "/two-factor/verify-totp",
        { code: await totpCode(rawSecret) },
        challenge,
      );
      assert.equal(verified.status, 200);
      assert.equal((await get("/probe/admin", cookieFrom(verified, SESSION_COOKIE))).status, 200);
    });

    it("accepts each backup code once", async () => {
      const { admin, backupCodes } = await enrolledAdministrator();
      const [code] = backupCodes;

      const first = await authPost(
        "/two-factor/verify-backup-code",
        { code },
        await passwordStep(admin.email, admin.password),
      );
      assert.equal(first.status, 200);
      assert.ok(cookieFrom(first, SESSION_COOKIE));

      const second = await authPost(
        "/two-factor/verify-backup-code",
        { code },
        await passwordStep(admin.email, admin.password),
      );
      assert.equal(second.status, 401);
      assert.equal(((await second.json()) as { code: string }).code, "INVALID_BACKUP_CODE");
    });

    it("never trusts a device: the next password sign-in still asks for the second factor", async () => {
      const { admin, rawSecret } = await enrolledAdministrator();

      const verified = await authPost(
        "/two-factor/verify-totp",
        { code: await totpCode(rawSecret), trustDevice: true },
        await passwordStep(admin.email, admin.password),
      );
      assert.equal(verified.status, 200);
      const trust = cookieFrom(verified, TRUST_DEVICE_COOKIE);
      assert.equal(trust, undefined, "no trust-device cookie is issued");

      const next = await signInWithPassword(admin.email, admin.password);
      assert.ok(cookieFrom(next, TWO_FACTOR_COOKIE));
      assert.equal(cookieFrom(next, SESSION_COOKIE), undefined);
    });

    it("ends a challenge after 5 wrong codes", async () => {
      const { admin, rawSecret } = await enrolledAdministrator();
      const challenge = await passwordStep(admin.email, admin.password);
      const wrong = await totpCode(rawSecret, 300);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        assert.equal(
          (await authPost("/two-factor/verify-totp", { code: wrong }, challenge)).status,
          401,
        );
      }
      const sixth = await authPost(
        "/two-factor/verify-totp",
        { code: await totpCode(rawSecret) },
        challenge,
      );

      assert.equal(sixth.status, 400);
      assert.equal(
        ((await sixth.json()) as { code: string }).code,
        "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
      );
    });

    it("locks the second factor for 15 minutes after 10 consecutive failures", async () => {
      const { admin, rawSecret } = await enrolledAdministrator();
      const wrong = await totpCode(rawSecret, 300);

      for (let challengeIndex = 0; challengeIndex < 2; challengeIndex += 1) {
        const challenge = await passwordStep(admin.email, admin.password);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await authPost("/two-factor/verify-totp", { code: wrong }, challenge);
        }
      }
      const row = twoFactorRow(admin.id);
      assert.equal(row?.failedVerificationCount, 10);
      const lockedFor = new Date(String(row?.lockedUntil)).getTime() - Date.now();
      assert.ok(lockedFor > 14 * 60_000 && lockedFor <= 15 * 60_000, String(lockedFor));

      const locked = await authPost(
        "/two-factor/verify-totp",
        { code: await totpCode(rawSecret) },
        await passwordStep(admin.email, admin.password),
      );
      assert.equal(locked.status, 429);
      assert.equal(((await locked.json()) as { code: string }).code, "ACCOUNT_TEMPORARILY_LOCKED");
    });

    it("disables two-factor removal, URI re-reading, and email two-factor codes", async () => {
      const { admin, cookie } = await enrolledAdministrator();

      for (const path of [
        "/two-factor/disable",
        "/two-factor/get-totp-uri",
        "/two-factor/send-otp",
        "/two-factor/verify-otp",
      ]) {
        assert.equal(
          (await authPost(path, { password: admin.password, code: "000000" }, cookie)).status,
          404,
          path,
        );
      }
      assert.equal(storedUser(admin.id).twoFactorEnabled, true);
    });
  });

  describe("email codes for administrators in every enrollment state (S22)", () => {
    async function invalidCodeResponse(): Promise<{ status: number; body: string }> {
      const customer = await seedCustomer();
      return snapshot(
        await authPost("/sign-in/email-otp", { email: customer.email, otp: "000000" }),
      );
    }

    /** A real code issued while the address was a customer, then the account becomes an admin. */
    async function codeThenAdministrator(state: "pending" | "enrolled" | "expired") {
      const customer = await seedCustomer();
      assert.equal(
        (
          await authPost("/email-otp/send-verification-otp", {
            email: customer.email,
            type: "sign-in",
          })
        ).status,
        200,
      );
      await tasks.drain();
      const code = CODE_PATTERN.exec(
        emailSender.delivered.find((sent) => sent.to === customer.email)?.text ?? "",
      )?.[1];
      assert.ok(code, "the customer received a code");

      const context = await auth.$context;
      const user = storedUser(customer.id);
      user.role = "ADMIN";
      user.twoFactorEnabled = state === "enrolled";
      await context.internalAdapter.createAccount({
        userId: customer.id,
        providerId: "credential",
        accountId: customer.id,
        password: await context.password.hash("a-long-enough-password"),
        ...(state === "expired" ? { createdAt: new Date(Date.now() - 25 * HOUR_MS) } : {}),
      });
      return { ...customer, code };
    }

    for (const state of ["pending", "enrolled", "expired"] as const) {
      it(`refuses an email-code session to a ${state} administrator, exactly like an invalid code`, async () => {
        const expected = await invalidCodeResponse();
        const admin = await codeThenAdministrator(state);

        const response = await authPost("/sign-in/email-otp", {
          email: admin.email,
          otp: admin.code,
        });

        assert.deepEqual(await snapshot(response), expected);
        assert.equal(expected.status, 400);
        assert.deepEqual(response.headers.getSetCookie(), []);
        assert.equal(sessionsOf(admin.id).length, 0);
      });

      it(`sends a ${state} administrator no code, with the identical 200 response`, async () => {
        const admin = await codeThenAdministrator(state);
        emailSender.clear();

        const response = await authPost("/email-otp/send-verification-otp", {
          email: admin.email,
          type: "sign-in",
        });
        await tasks.drain();

        assert.deepEqual(await snapshot(response), { status: 200, body: '{"success":true}' });
        assert.equal(
          emailSender.delivered.some((sent) => sent.to === admin.email),
          false,
        );
      });
    }
  });

  // S52 (L72, T11c): every session records whether it passed the second factor, and the API ends the
  // session of an enrolled administrator that did not, whether or not the delete of the sibling
  // sessions at the first confirmation worked.
  describe("second-factor marker on sessions (S52)", () => {
    const markers = (userId: string) => sessionsOf(userId).map((row) => row.secondFactorVerified);

    /** A session with no second factor for an enrolled administrator, as a failed sibling delete leaves one. */
    async function passwordOnlySession(userId: string) {
      return (await createSession(userId)).cookie;
    }

    it("declares the marker to Better Auth as a server-only boolean that defaults to false", async () => {
      const field = (await auth.$context).options.session?.additionalFields?.secondFactorVerified;

      assert.deepEqual(field, {
        type: "boolean",
        required: false,
        input: false,
        defaultValue: false,
      });
    });

    it("stores false for the password-only session of a pending administrator", async () => {
      const { admin } = await signedInPending();

      assert.deepEqual(markers(admin.id), [false]);
    });

    it("stores false for a customer session opened with a sign-in code, and keeps serving it", async () => {
      const customer = await seedCustomer();
      await authPost("/email-otp/send-verification-otp", {
        email: customer.email,
        type: "sign-in",
      });
      await tasks.drain();
      const otp = CODE_PATTERN.exec(
        emailSender.delivered.filter((sent) => sent.to === customer.email).at(-1)?.text ?? "",
      )?.[1];
      const response = await authPost("/sign-in/email-otp", { email: customer.email, otp });
      const cookie = cookieFrom(response, SESSION_COOKIE);
      assert.ok(cookie, "the code opened a session");

      assert.deepEqual(markers(customer.id), [false]);
      assert.equal((await get("/me", cookie)).status, 200);
      assert.equal((await authGet("/list-sessions", cookie)).status, 200);
      assert.deepEqual(markers(customer.id), [false], "the customer session is not ended");
    });

    it("stores true only for the session that completes the first TOTP confirmation", async () => {
      const { admin, cookie } = await signedInPending();
      const enrollment = await startEnrollment(cookie, admin.password);
      assert.deepEqual(markers(admin.id), [false], "the pending session is unmarked");

      const response = await authPost(
        "/two-factor/verify-totp",
        { code: await totpCode(enrollment.rawSecret) },
        cookie,
      );

      assert.equal(response.status, 200);
      assert.deepEqual(
        markers(admin.id),
        [true],
        "the pending session is replaced by a marked one",
      );
    });

    it("stores true for a session opened with the TOTP code at sign-in", async () => {
      const { admin, rawSecret } = await enrolledAdministrator();
      const verified = await authPost(
        "/two-factor/verify-totp",
        { code: await totpCode(rawSecret) },
        await passwordStep(admin.email, admin.password),
      );

      assert.equal(verified.status, 200);
      assert.deepEqual(markers(admin.id), [true, true]);
    });

    it("stores true for a session opened with a backup code at sign-in", async () => {
      const { admin, backupCodes } = await enrolledAdministrator();
      const [code] = backupCodes;
      const verified = await authPost(
        "/two-factor/verify-backup-code",
        { code },
        await passwordStep(admin.email, admin.password),
      );

      assert.equal(verified.status, 200);
      assert.deepEqual(markers(admin.id), [true, true]);
    });

    const protectedReads: Array<{ label: string; read: (cookie: string) => Promise<Response> }> = [
      { label: "GET /me", read: (cookie) => get("/me", cookie) },
      { label: "GET /probe/admin", read: (cookie) => get("/probe/admin", cookie) },
      { label: "GET /api/auth/get-session", read: (cookie) => authGet("/get-session", cookie) },
      { label: "GET /api/auth/list-sessions", read: (cookie) => authGet("/list-sessions", cookie) },
    ];

    for (const { label, read } of protectedReads) {
      it(`ends a password-only session of an enrolled administrator on ${label}, as a missing session`, async () => {
        const { admin, cookie: marked } = await enrolledAdministrator();
        const anonymous = await snapshot(await read(""));
        const sibling = await passwordOnlySession(admin.id);

        assert.deepEqual(await snapshot(await read(sibling)), anonymous);
        assert.deepEqual(markers(admin.id), [true], "only the marked session is left");
        assert.equal((await get("/probe/admin", marked)).status, 200, "the marked session works");
      });
    }

    it("ends an enrolled administrator's session that has no marker, as one opened before the migration", async () => {
      const { admin } = await enrolledAdministrator();
      const legacy = await passwordOnlySession(admin.id);
      const row = sessionsOf(admin.id).find((stored) => stored.secondFactorVerified !== true);
      assert.ok(row);
      row.secondFactorVerified = undefined;

      assert.equal((await get("/me", legacy)).status, 401);
      assert.deepEqual(markers(admin.id), [true]);
    });

    it("keeps a pending administrator's unmarked session on the four allowed endpoints only", async () => {
      const { admin, cookie } = await signedInPending();

      assert.equal((await get("/me", cookie)).status, 401);
      assert.equal((await authGet("/list-sessions", cookie)).status, 401);
      assert.equal((await authGet("/get-session", cookie)).status, 200);
      assert.deepEqual(markers(admin.id), [false], "the pending session is not ended");
    });

    // Independent verification of S52 (T11c): the marker comes from the endpoint alone, is true only
    // after a verified code, and ends a session that lacks it on every route that reads sessions.

    /** The marker the session-create hook stores for a new session of `who` created on `path`. */
    async function markerStoredFor(
      path: string | undefined,
      who: "enrolled administrator" | "pending administrator" | "customer",
    ): Promise<unknown> {
      const context = await auth.$context;
      const before = auth.options.databaseHooks?.session?.create?.before;
      assert.ok(before, "the session-create hook is configured");
      const subject = who === "customer" ? await seedCustomer() : await seedAdministrator();
      if (who === "enrolled administrator") {
        storedUser(subject.id).twoFactorEnabled = true;
      }
      const now = new Date();
      const result = (await before(
        {
          id: "probe",
          userId: subject.id,
          token: "probe",
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + 60_000),
        },
        path === undefined
          ? null
          : ({
              path,
              context: {
                internalAdapter: context.internalAdapter,
                adapter: context.adapter,
                session: null,
              },
            } as never),
      )) as { data: { secondFactorVerified?: unknown } } | undefined;
      return result?.data.secondFactorVerified;
    }

    it("stores true for an enrolled administrator only on the exact verification endpoints", async () => {
      const expected: Array<[string | undefined, boolean]> = [
        ["/two-factor/verify-totp", true],
        ["/two-factor/verify-backup-code", true],
        ["/two-factor/enable", false],
        ["/two-factor/disable", false],
        ["/two-factor/verify-otp", false],
        ["/two-factor/generate-backup-codes", false],
        ["/two-factor/verify-totp/", false],
        ["/TWO-FACTOR/VERIFY-TOTP", false],
        ["/api/auth/two-factor/verify-totp", false],
        ["/sign-in/email", false],
        ["/get-session", false],
        [undefined, false],
      ];

      for (const [path, marker] of expected) {
        assert.equal(await markerStoredFor(path, "enrolled administrator"), marker, String(path));
      }
    });

    it("stores false for a pending administrator and for a customer on the verification endpoints", async () => {
      for (const path of ["/two-factor/verify-totp", "/two-factor/verify-backup-code"]) {
        assert.equal(
          await markerStoredFor(path, "pending administrator"),
          false,
          `pending ${path}`,
        );
        assert.equal(await markerStoredFor(path, "customer"), false, `customer ${path}`);
      }
    });

    it("takes the marker from the endpoint alone: no sign-in body, path spelling, or server-side update sets it", async () => {
      const admin = await seedAdministrator();
      const password = await authPost("/sign-in/email", {
        email: admin.email,
        password: admin.password,
        secondFactorVerified: true,
      });
      assert.equal(password.status, 200);
      assert.deepEqual(markers(admin.id), [false]);

      const customer = await seedCustomer();
      await authPost("/email-otp/send-verification-otp", {
        email: customer.email,
        type: "sign-in",
      });
      await tasks.drain();
      const otp = CODE_PATTERN.exec(
        emailSender.delivered.filter((sent) => sent.to === customer.email).at(-1)?.text ?? "",
      )?.[1];
      const signedIn = await authPost("/sign-in/email-otp", {
        email: customer.email,
        otp,
        secondFactorVerified: true,
      });
      const cookie = cookieFrom(signedIn, SESSION_COOKIE);
      assert.ok(cookie, "the code opened a session");
      assert.deepEqual(markers(customer.id), [false]);

      for (const path of [
        "/update-session",
        "/update-session/",
        "//update-session",
        "/UPDATE-SESSION",
        "/update-user",
        "/update-user/",
      ]) {
        const response = await authPost(path, { secondFactorVerified: true }, cookie);
        assert.equal(response.status, 404, path);
      }

      const updateSession = api.updateSession;
      assert.ok(updateSession, "Better Auth exposes updateSession to server code");
      await assert.rejects(
        updateSession({ headers: new Headers({ cookie }), body: { secondFactorVerified: true } }),
        (error: unknown) =>
          (error as { body?: { code?: string } }).body?.code === "FIELD_NOT_ALLOWED",
      );
      assert.deepEqual(markers(customer.id), [false], "no path changed the stored marker");
    });

    it("stores false when a password sign-in is dressed as a verification endpoint", async () => {
      const decoys: Array<{ path: string; headers?: Record<string, string>; body?: Row }> = [
        { path: "/sign-in/email?path=/two-factor/verify-totp" },
        { path: "/two-factor/../sign-in/email" },
        { path: "/two-factor/verify-totp/../../sign-in/email" },
        {
          path: "/sign-in/email",
          headers: {
            "x-original-url": "/api/auth/two-factor/verify-totp",
            "x-forwarded-uri": "/api/auth/two-factor/verify-totp",
            "x-rewrite-url": "/api/auth/two-factor/verify-totp",
          },
        },
        { path: "/sign-in/email", body: { path: "/two-factor/verify-totp" } },
      ];

      for (const decoy of decoys) {
        const admin = await seedAdministrator();
        const response = await fetch(`${baseUrl}/api/auth${decoy.path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: TRUSTED_ORIGIN,
            "x-forwarded-for": nextClientIp(),
            ...decoy.headers,
          },
          body: JSON.stringify({ email: admin.email, password: admin.password, ...decoy.body }),
        });

        assert.equal(response.status, 200, decoy.path);
        assert.deepEqual(markers(admin.id), [false], decoy.path);
      }
    });

    it("opens no marked session without a verified code: a wrong code, a replayed challenge, or disableSession", async () => {
      const { admin, backupCodes, rawSecret } = await enrolledAdministrator();
      assert.deepEqual(markers(admin.id), [true]);

      const challenge = await passwordStep(admin.email, admin.password);
      const wrong = await authPost("/two-factor/verify-totp", { code: "000000" }, challenge);
      assert.equal(wrong.status, 401);
      assert.deepEqual(markers(admin.id), [true], "a wrong code opens nothing");

      const verified = await authPost(
        "/two-factor/verify-totp",
        { code: await totpCode(rawSecret) },
        challenge,
      );
      assert.equal(verified.status, 200);
      assert.deepEqual(markers(admin.id), [true, true]);

      const replayed = await authPost(
        "/two-factor/verify-totp",
        { code: await totpCode(rawSecret) },
        challenge,
      );
      assert.notEqual(replayed.status, 200, "a consumed challenge is not replayable");
      assert.deepEqual(markers(admin.id), [true, true]);

      const [code] = backupCodes;
      const withoutSession = await authPost(
        "/two-factor/verify-backup-code",
        { code, disableSession: true },
        await passwordStep(admin.email, admin.password),
      );
      assert.equal(withoutSession.status, 200);
      assert.deepEqual(markers(admin.id), [true, true], "disableSession creates no session");
    });

    it("answers every Better Auth route to a password-only session of an enrolled administrator as to no session", async () => {
      const { admin, cookie: marked } = await enrolledAdministrator();
      const endpoints = Object.values(
        auth.api as unknown as Record<string, { path?: string; options?: { method?: unknown } }>,
      );
      const routes = endpoints.flatMap((endpoint) => {
        if (typeof endpoint.path !== "string") {
          return [];
        }
        const method = endpoint.options?.method;
        const methods = (Array.isArray(method) ? method : [method ?? "GET"]).flatMap((entry) =>
          entry === "*" ? ["GET", "POST"] : [String(entry)],
        );
        return methods.map((entry) => ({
          method: entry,
          path: endpoint.path?.replace(/:[A-Za-z]+/g, "x") ?? "",
        }));
      });
      assert.ok(routes.length > 40, "the route list was read from Better Auth");

      const call = (route: { method: string; path: string }, cookie?: string) =>
        fetch(`${baseUrl}/api/auth${route.path}`, {
          method: route.method,
          headers: {
            origin: TRUSTED_ORIGIN,
            "x-forwarded-for": nextClientIp(),
            ...(route.method === "GET" ? {} : { "content-type": "application/json" }),
            ...(cookie ? { cookie } : {}),
          },
          ...(route.method === "GET" ? {} : { body: "{}" }),
          redirect: "manual",
        });
      const different: string[] = [];
      for (const route of routes) {
        const stray = await createSession(admin.id);
        const anonymous = await snapshot(await call(route));
        const asStray = await snapshot(await call(route, stray.cookie));
        if (asStray.status !== anonymous.status || asStray.body !== anonymous.body) {
          different.push(`${route.method} ${route.path}`);
        }
        // A disabled route answers 404 before any hook runs, so it cannot have used the session.
        if (asStray.status !== 404) {
          assert.equal(
            sessionsOf(admin.id).some((row) => row.token === stray.token),
            false,
            `${route.method} ${route.path} ended the session`,
          );
        }
        await authGet("/get-session", stray.cookie);
      }

      assert.deepEqual(different, []);
      assert.equal((await get("/me", marked)).status, 200, "the marked session still works");
    });

    it("refuses PATCH /me and the project routes to a password-only session of an enrolled administrator", async () => {
      const { admin, cookie: marked } = await enrolledAdministrator();
      const calls: Array<[string, (cookie?: string) => Promise<Response>]> = [
        ["PATCH /me", (cookie) => patch("/me", { displayName: "Changed" }, cookie)],
        ["GET /probe/undecorated", (cookie) => get("/probe/undecorated", cookie)],
      ];

      for (const [label, call] of calls) {
        const stray = await createSession(admin.id);
        const anonymous = await snapshot(await call());
        const asStray = await snapshot(await call(stray.cookie));

        assert.deepEqual(asStray, anonymous, label);
        assert.equal(asStray.status, 401, label);
        assert.equal(
          sessionsOf(admin.id).some((row) => row.token === stray.token),
          false,
          `${label} ended the session`,
        );
      }
      const stored = storedUser(admin.id);
      assert.notEqual(stored.name ?? stored.displayName, "Changed", "PATCH /me stored nothing");
      assert.equal((await get("/me", marked)).status, 200);
    });

    it("refuses a password-only session whose account turns enrolled between the hook's read and the guard's", async () => {
      const { admin, cookie } = await signedInPending();
      const adapter = (await auth.$context).internalAdapter;
      const original = adapter.findSession;
      let reads = 0;
      adapter.findSession = async (token) => {
        const found = await original(token);
        reads += 1;
        if (reads === 1) {
          // Another tab's first confirmation commits after the hook's read and before the guard's.
          storedUser(admin.id).twoFactorEnabled = true;
        }
        return found;
      };
      try {
        assert.equal((await get("/me", cookie)).status, 401);
      } finally {
        adapter.findSession = original;
      }
    });

    it("refuses every session update that touches the marker", async () => {
      const before = auth.options.databaseHooks?.session?.update?.before;
      assert.ok(before, "the session-update hook is configured");

      assert.equal(await before({ secondFactorVerified: true }, null), false);
      assert.equal(await before({ secondFactorVerified: false }, null), false);
    });
  });
});
