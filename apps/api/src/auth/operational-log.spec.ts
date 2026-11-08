import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { memoryAdapter } from "better-auth/adapters/memory";

import { EmailDeliveryService } from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../email/infrastructure/system-email-delivery-runtime";
import {
  refuseSupersededConfirmation,
  type SessionCreateContext,
  settleFirstConfirmation,
} from "./administrator-enrollment";
import { createAuth } from "./auth.factory";
import type { AuthRequestEvent } from "./auth-request-guard";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// The operational log contract of the session hooks (M2 T11d; S50, L71): one structured event for
// every session the create hook refuses, every session the access hook ends, and every change the
// update hook refuses. Each event is asserted whole, so an extra field fails the test, and the
// inputs carry an email address and a session token that must never appear in what is logged.

const ORIGIN = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const DAY_MS = 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;

function createHarness() {
  const database: Record<string, Row[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
    twoFactor: [],
  };
  const secret = randomBytes(32).toString("base64url");
  const events: AuthRequestEvent[] = [];
  const auth = createAuth({
    secret,
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    database: memoryAdapter(database),
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: (event) => events.push(event),
  });
  const api = auth.api as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  let counter = 0;

  function call(path: string, options: { body?: unknown; cookie?: string } = {}) {
    counter += 1;
    return auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: options.body === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": `10.90.0.${counter}`,
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      }),
    );
  }

  /** A stored user; `fields` are written to its row the way an operator command would. */
  async function seedUser(label: string, fields: Row = {}) {
    const context = await auth.$context;
    const email = `t11d-${label}-${randomBytes(4).toString("hex")}@example.test`;
    const user = await context.internalAdapter.createUser(
      { email, name: "", emailVerified: false },
      { method: "seed" },
    );
    Object.assign(database.user?.find((row) => row.id === user.id) ?? {}, fields);
    return { id: user.id, email };
  }

  async function seedCredential(userId: string, createdAt: Date = new Date()) {
    const context = await auth.$context;
    await context.internalAdapter.createAccount({
      userId,
      providerId: "credential",
      accountId: userId,
      password: await context.password.hash(randomBytes(18).toString("base64url")),
    });
    for (const row of database.account ?? []) {
      if (row.userId === userId) {
        row.createdAt = createdAt;
      }
    }
  }

  /** A session opened outside any endpoint, with the cookie that presents it. */
  async function openSession(userId: string) {
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(userId, false, {}, true);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");
    return {
      token: session.token,
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`,
    };
  }

  async function emailCode(email: string): Promise<string> {
    const create = api.createVerificationOTP;
    assert.ok(create);
    return (await create({ body: { email, type: "sign-in" } })) as string;
  }

  function storedSessions(userId: string): number {
    return (database.session ?? []).filter((row) => row.userId === userId).length;
  }

  return {
    auth,
    database,
    events,
    call,
    seedUser,
    seedCredential,
    openSession,
    emailCode,
    storedSessions,
  };
}

/** What a log line must never hold: the address, the session token, and the signed cookie. */
function assertNoSecretsLogged(events: unknown[], ...secrets: string[]): void {
  const logged = JSON.stringify(events);
  for (const secret of secrets) {
    assert.ok(!logged.includes(secret), "the log holds no address, token, or cookie");
  }
}

describe("session_refused: the create hook refuses a session (S50, L71)", () => {
  it("logs account_missing for a user that does not exist, outside any endpoint", async () => {
    const harness = createHarness();
    const context = await harness.auth.$context;

    await assert.rejects(context.internalAdapter.createSession("no-such-user", false, {}, true));

    assert.deepEqual(harness.events, [{ event: "session_refused", reason: "account_missing" }]);
  });

  it("logs account_not_active for a DISABLED user", async () => {
    const harness = createHarness();
    const user = await harness.seedUser("disabled", { status: "DISABLED" });
    const context = await harness.auth.$context;

    await assert.rejects(context.internalAdapter.createSession(user.id, false, {}, true));

    assert.deepEqual(harness.events, [{ event: "session_refused", reason: "account_not_active" }]);
    assertNoSecretsLogged(harness.events, user.email, user.id);
  });

  it("logs email_code_not_allowed with the path when an administrator uses an emailed code", async () => {
    const harness = createHarness();
    const admin = await harness.seedUser("admin-code", { role: "ADMIN" });
    const code = await harness.emailCode(admin.email);

    const response = await harness.call("/sign-in/email-otp", {
      body: { email: admin.email, otp: code },
    });

    assert.equal(response.status, 400);
    assert.deepEqual(harness.events, [
      { event: "session_refused", reason: "email_code_not_allowed", path: "/sign-in/email-otp" },
    ]);
    assertNoSecretsLogged(harness.events, admin.email, code);
  });

  it("logs password_not_allowed with the path when a customer signs in with a password", async () => {
    const harness = createHarness();
    const customer = await harness.seedUser("customer-password");
    await harness.seedCredential(customer.id);
    const password = randomBytes(18).toString("base64url");
    const context = await harness.auth.$context;
    for (const row of harness.database.account ?? []) {
      row.password = await context.password.hash(password);
    }

    const response = await harness.call("/sign-in/email", {
      body: { email: customer.email, password },
    });

    assert.equal(response.status, 401);
    assert.deepEqual(harness.events, [
      { event: "session_refused", reason: "password_not_allowed", path: "/sign-in/email" },
    ]);
    assertNoSecretsLogged(harness.events, customer.email, password);
  });

  it("logs enrollment_window_closed with the path when an initial password is older than 24 hours", async () => {
    const harness = createHarness();
    const admin = await harness.seedUser("admin-window", { role: "ADMIN" });
    await harness.seedCredential(admin.id, new Date(Date.now() - 25 * 60 * 60 * 1000));
    const password = randomBytes(18).toString("base64url");
    const context = await harness.auth.$context;
    for (const row of harness.database.account ?? []) {
      row.password = await context.password.hash(password);
    }

    const response = await harness.call("/sign-in/email", {
      body: { email: admin.email, password },
    });

    assert.equal(response.status, 401);
    assert.deepEqual(harness.events, [
      { event: "session_refused", reason: "enrollment_window_closed", path: "/sign-in/email" },
    ]);
    assertNoSecretsLogged(harness.events, admin.email, password);
  });

  it("logs nothing when a session is allowed", async () => {
    const harness = createHarness();
    const customer = await harness.seedUser("customer-ok");
    const code = await harness.emailCode(customer.email);

    const response = await harness.call("/sign-in/email-otp", {
      body: { email: customer.email, otp: code },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(harness.events, []);
  });
});

describe("session_ended: the access hook deletes a stored session (S50, L71)", () => {
  it("logs account_not_active and deletes the session of a user disabled after sign-in", async () => {
    const harness = createHarness();
    const customer = await harness.seedUser("ended-disabled");
    const session = await harness.openSession(customer.id);
    const row = harness.database.user?.find((candidate) => candidate.id === customer.id);
    assert.ok(row);
    row.status = "DISABLED";

    const response = await harness.call("/get-session", { cookie: session.cookie });

    assert.equal(await response.json(), null);
    assert.equal(harness.storedSessions(customer.id), 0);
    assert.deepEqual(harness.events, [
      { event: "session_ended", reason: "account_not_active", path: "/get-session" },
    ]);
    assertNoSecretsLogged(harness.events, customer.email, session.token, session.cookie);
  });

  it("logs second_factor_missing for an enrolled administrator's session without the marker", async () => {
    const harness = createHarness();
    const admin = await harness.seedUser("ended-marker", { role: "ADMIN", twoFactorEnabled: true });
    const session = await harness.openSession(admin.id);

    const response = await harness.call("/get-session", { cookie: session.cookie });

    assert.equal(await response.json(), null);
    assert.equal(harness.storedSessions(admin.id), 0);
    assert.deepEqual(harness.events, [
      { event: "session_ended", reason: "second_factor_missing", path: "/get-session" },
    ]);
    assertNoSecretsLogged(harness.events, admin.email, session.token, session.cookie);
  });

  it("logs enrollment_window_closed for a pending administrator whose window ended", async () => {
    const harness = createHarness();
    const admin = await harness.seedUser("ended-window", { role: "ADMIN" });
    await harness.seedCredential(admin.id);
    const session = await harness.openSession(admin.id);
    for (const row of harness.database.account ?? []) {
      row.createdAt = new Date(Date.now() - DAY_MS - 60_000);
    }

    const response = await harness.call("/get-session", { cookie: session.cookie });

    assert.equal(await response.json(), null);
    assert.equal(harness.storedSessions(admin.id), 0);
    assert.deepEqual(harness.events, [
      { event: "session_ended", reason: "enrollment_window_closed", path: "/get-session" },
    ]);
    assertNoSecretsLogged(harness.events, admin.email, session.token, session.cookie);
  });

  it("logs one event with the first failing reason when several apply", async () => {
    const harness = createHarness();
    const admin = await harness.seedUser("ended-both", { role: "ADMIN", twoFactorEnabled: true });
    const session = await harness.openSession(admin.id);
    const row = harness.database.user?.find((candidate) => candidate.id === admin.id);
    assert.ok(row);
    row.status = "DISABLED";

    await harness.call("/get-session", { cookie: session.cookie });

    assert.deepEqual(harness.events, [
      { event: "session_ended", reason: "account_not_active", path: "/get-session" },
    ]);
  });

  it("logs nothing and keeps the session of an active customer", async () => {
    const harness = createHarness();
    const customer = await harness.seedUser("kept");
    const session = await harness.openSession(customer.id);

    const response = await harness.call("/get-session", { cookie: session.cookie });

    assert.equal(response.status, 200);
    assert.equal(harness.storedSessions(customer.id), 1);
    assert.deepEqual(harness.events, []);
  });
});

describe("session_update_refused: the update hook refuses a change (S50, L71)", () => {
  it("logs second_factor_marker when a change carries the marker", async () => {
    const harness = createHarness();
    const customer = await harness.seedUser("update-marker");
    const session = await harness.openSession(customer.id);
    const context = await harness.auth.$context;

    await context.internalAdapter.updateSession(session.token, { secondFactorVerified: true });

    assert.deepEqual(harness.events, [
      { event: "session_update_refused", reason: "second_factor_marker" },
    ]);
    assertNoSecretsLogged(harness.events, customer.email, session.token);
  });

  it("logs expiry_change_not_allowed when an expiry moves outside a customer's session read", async () => {
    const harness = createHarness();
    const admin = await harness.seedUser("update-expiry", { role: "ADMIN" });
    await harness.seedCredential(admin.id);
    const session = await harness.openSession(admin.id);
    const context = await harness.auth.$context;

    await context.internalAdapter.updateSession(session.token, {
      expiresAt: new Date(Date.now() + DAY_MS),
    });

    assert.deepEqual(harness.events, [
      { event: "session_update_refused", reason: "expiry_change_not_allowed" },
    ]);
    assertNoSecretsLogged(harness.events, admin.email, session.token);
  });

  it("logs nothing for a change that touches neither the marker nor the expiry", async () => {
    const harness = createHarness();
    const customer = await harness.seedUser("update-other");
    const session = await harness.openSession(customer.id);
    const context = await harness.auth.$context;

    await context.internalAdapter.updateSession(session.token, { userAgent: "test" });

    assert.deepEqual(harness.events, []);
  });
});

/** The pieces of Better Auth's session-create context that the first-confirmation code reads. */
function confirmationContext(adapter: Record<string, unknown>, internal: Record<string, unknown>) {
  return {
    path: "/two-factor/verify-totp",
    context: {
      session: { session: { token: "pending-token", createdAt: new Date("2026-11-08T10:00:00Z") } },
      adapter,
      internalAdapter: internal,
    },
  } as unknown as SessionCreateContext;
}

const ADMIN = { id: "user-1", role: "ADMIN", status: "ACTIVE", twoFactorEnabled: true };
const SIBLING_FAILURE = "administrator_sibling_sessions_delete_failed";

describe("administrator_sibling_sessions_delete_failed (S50, L71)", () => {
  it("logs the path and the error class when ending the other sessions fails, and still throws", async () => {
    const failure = new RangeError("Boom for admin@example.test with token-abc");
    const events: AuthRequestEvent[] = [];
    const context = confirmationContext(
      {
        findOne: async () => ({ userId: ADMIN.id }),
        deleteMany: async () => {
          throw failure;
        },
      },
      {},
    );

    await assert.rejects(
      settleFirstConfirmation(context, ADMIN, (event) => events.push(event)),
      (error: unknown) => error === failure,
    );

    assert.deepEqual(events, [
      { event: SIBLING_FAILURE, path: "/two-factor/verify-totp", error: "RangeError" },
    ]);
    assertNoSecretsLogged(events, "admin@example.test", "token-abc", ADMIN.id);
  });

  it("logs the same event when ending every session of a superseded confirmation fails", async () => {
    const failure = new TypeError("Boom for admin@example.test");
    const events: AuthRequestEvent[] = [];
    const context = confirmationContext(
      {
        findOne: async ({ model }: { model: string }) =>
          model === "session" ? null : { verified: false },
        count: async () => 1,
        deleteMany: async () => {
          throw failure;
        },
      },
      { findCredentialAccount: async () => ({ createdAt: new Date("2026-11-08T09:00:00Z") }) },
    );

    await assert.rejects(
      settleFirstConfirmation(context, ADMIN, (event) => events.push(event)),
      (error: unknown) => error === failure,
    );

    assert.deepEqual(events, [
      { event: SIBLING_FAILURE, path: "/two-factor/verify-totp", error: "TypeError" },
    ]);
  });

  it("logs nothing and allows when the other sessions are ended", async () => {
    const events: AuthRequestEvent[] = [];
    const context = confirmationContext(
      { findOne: async () => ({ userId: ADMIN.id }), deleteMany: async () => 2 },
      {},
    );

    assert.equal(await settleFirstConfirmation(context, ADMIN, (e) => events.push(e)), "allow");
    assert.deepEqual(events, []);
  });
});

describe("administrator_enrollment_revert_result: logged after the attempt (S50, L71)", () => {
  const SUPERSEDED = "administrator_enrollment_superseded";
  const RESULT = "administrator_enrollment_revert_result";
  const PATH = "/two-factor/verify-totp";

  async function revert(updateMany: () => Promise<number>, decision: "refuse" | "revert") {
    const events: AuthRequestEvent[] = [];
    const context = confirmationContext({ updateMany }, {});
    const error = await refuseSupersededConfirmation(context, ADMIN.id, decision, (event) =>
      events.push(event),
    );
    return { events, error };
  }

  it("logs reverted after the attempt when the flag was cleared", async () => {
    const { events, error } = await revert(async () => 1, "revert");

    assert.equal(error.status, "UNAUTHORIZED");
    assert.deepEqual(events, [
      { event: SUPERSEDED, path: PATH, compensation: "reverted" },
      { event: RESULT, path: PATH, result: "reverted" },
    ]);
    assertNoSecretsLogged(events, ADMIN.id);
  });

  it("logs unchanged when the guarded update matched no row", async () => {
    const { events } = await revert(async () => 0, "revert");

    assert.deepEqual(events, [
      { event: SUPERSEDED, path: PATH, compensation: "reverted" },
      { event: RESULT, path: PATH, result: "unchanged" },
    ]);
  });

  it("logs the compensation failure and then the failed result, with the class only", async () => {
    const { events, error } = await revert(async () => {
      throw new RangeError("outage for admin@example.test");
    }, "revert");

    assert.equal(error.status, "UNAUTHORIZED");
    assert.deepEqual(events, [
      { event: SUPERSEDED, path: PATH, compensation: "reverted" },
      { event: "administrator_enrollment_compensation_failed", path: PATH, error: "RangeError" },
      { event: RESULT, path: PATH, result: "failed" },
    ]);
    assertNoSecretsLogged(events, "admin@example.test");
  });

  it("keeps the superseded event alone, as before, when the decision is refuse", async () => {
    const { events } = await revert(async () => assert.fail("no revert"), "refuse");

    assert.deepEqual(events, [{ event: SUPERSEDED, path: PATH, compensation: "skipped" }]);
  });
});
