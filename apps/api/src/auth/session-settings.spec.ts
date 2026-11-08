import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { memoryAdapter } from "better-auth/adapters/memory";

import { EmailDeliveryService } from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../email/infrastructure/system-email-delivery-runtime";
import { createAuth } from "./auth.factory";
import { AUTH_REQUEST_EVENT, type AuthRequestEvent } from "./auth-request-guard";
import {
  ADMINISTRATOR_SESSION_LIFETIME_SECONDS,
  administratorSessionExpiresAt,
} from "./session-settings";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// Session lifetimes and the session cookie (M2 T8a; ADR 0004 decision 4; S14, S16, L33, L34) through
// Better Auth's own HTTP handler on the in-memory adapter: no network, no database. Expected values
// are literals on purpose, so a changed constant cannot make its own test pass.

const LOCAL_ORIGIN = "http://localhost:3000";
const SECURE_ORIGIN = "https://app.example.test";
const DAY_SECONDS = 24 * 60 * 60;
const SEVEN_DAYS_MS = 7 * DAY_SECONDS * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;
// Wall-clock slack between the request and the moment the session row is written.
const SLACK_MS = 5_000;

type Row = Record<string, unknown>;

interface ParsedSetCookie {
  name: string;
  value: string;
  attributes: string[];
}

function parseSetCookies(response: Response): ParsedSetCookie[] {
  return response.headers.getSetCookie().map((header) => {
    const [pair = "", ...attributes] = header.split(";").map((part) => part.trim());
    const separator = pair.indexOf("=");
    return {
      name: pair.slice(0, separator),
      value: pair.slice(separator + 1),
      attributes,
    };
  });
}

function setCookie(response: Response, name: string): ParsedSetCookie | undefined {
  return parseSetCookies(response).find((cookie) => cookie.name === name && cookie.value !== "");
}

/** RFC 4648 base32, as in the `secret` parameter of an `otpauth://` URI. */
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

function createHarness(origin: string) {
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
    baseURL: origin,
    trustedOrigins: [origin],
    database: memoryAdapter(database),
    // No probe here requests a sign-in code by email; codes come from the server-only endpoint.
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    // This harness calls Better Auth directly, not through the web proxy.
    requireProxySecret: false,
    log: (event) => events.push(event),
  });
  const api = auth.api as unknown as Record<string, (input: unknown) => Promise<unknown>>;
  let clientCounter = 0;
  let emailCounter = 0;

  function call(path: string, options: { body?: unknown; cookie?: string } = {}) {
    clientCounter += 1;
    return auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: options.body === undefined ? "GET" : "POST",
        headers: {
          "content-type": "application/json",
          origin,
          "x-forwarded-for": `10.80.${clientCounter >> 8}.${clientCounter & 255}`,
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      }),
    );
  }

  function newEmail(label: string): string {
    emailCounter += 1;
    return `t8a-${label}-${emailCounter}@example.test`;
  }

  function sessionsOf(userId: string): Row[] {
    return (database.session ?? []).filter((row) => row.userId === userId);
  }

  function onlySessionOf(userId: string): Row {
    const sessions = sessionsOf(userId);
    assert.equal(sessions.length, 1, "exactly one stored session");
    return sessions[0] as Row;
  }

  /** A customer signs in with an emailed code; the code comes from Better Auth's server-only endpoint. */
  async function signInCustomer() {
    const email = newEmail("customer");
    const createVerificationOTP = api.createVerificationOTP;
    assert.ok(createVerificationOTP, "Better Auth exposes createVerificationOTP");
    const otp = (await createVerificationOTP({ body: { email, type: "sign-in" } })) as string;
    const before = Date.now();
    const response = await call("/sign-in/email-otp", { body: { email, otp } });
    const after = Date.now();
    assert.equal(response.status, 200, "the customer signs in");
    const user = database.user?.find((row) => row.email === email);
    assert.ok(user, "the customer is stored");
    return { id: String(user.id), response, before, after };
  }

  async function seedAdministrator() {
    const context = await auth.$context;
    const email = newEmail("admin");
    const password = randomBytes(18).toString("base64url");
    const user = await context.internalAdapter.createUser(
      { email, name: "", emailVerified: false },
      { method: "admin-seed" },
    );
    const row = database.user?.find((candidate) => candidate.id === user.id);
    assert.ok(row);
    row.role = "ADMIN";
    await context.internalAdapter.createAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await context.password.hash(password),
    });
    return { id: user.id, email, password };
  }

  async function signInAdministrator(admin: { email: string; password: string }) {
    const before = Date.now();
    const response = await call("/sign-in/email", {
      body: { email: admin.email, password: admin.password },
    });
    const after = Date.now();
    assert.equal(response.status, 200, "the administrator signs in");
    return { response, before, after };
  }

  async function totpCode(rawSecret: string): Promise<string> {
    const generateTOTP = api.generateTOTP;
    assert.ok(generateTOTP, "Better Auth exposes generateTOTP");
    return ((await generateTOTP({ body: { secret: rawSecret } })) as { code: string }).code;
  }

  /** Enrolls a pending administrator and signs the session out, so only the factors remain. */
  async function enrolledAdministrator(sessionCookieName: string) {
    const admin = await seedAdministrator();
    const pending = setCookie((await signInAdministrator(admin)).response, sessionCookieName);
    assert.ok(pending, "the pending administrator holds a session cookie");
    const cookie = `${pending.name}=${pending.value}`;
    const enable = await call("/two-factor/enable", { body: { password: admin.password }, cookie });
    assert.equal(enable.status, 200);
    const { totpURI } = (await enable.json()) as { totpURI: string };
    const rawSecret = decodeBase32(new URL(totpURI).searchParams.get("secret") ?? "");
    const confirmed = await call("/two-factor/verify-totp", {
      body: { code: await totpCode(rawSecret) },
      cookie,
    });
    assert.equal(confirmed.status, 200, "the first valid code confirms enrollment");
    if (database.session) {
      database.session = database.session.filter((row) => row.userId !== admin.id);
    }
    return { ...admin, rawSecret };
  }

  /** A signed session cookie for a stored session token, as Better Auth signs it. */
  function signedCookie(name: string, token: string): string {
    const signature = createHmac("sha256", secret).update(token).digest("base64");
    return `${name}=${encodeURIComponent(`${token}.${signature}`)}`;
  }

  return {
    auth,
    database,
    events,
    call,
    sessionsOf,
    onlySessionOf,
    signInCustomer,
    seedAdministrator,
    signInAdministrator,
    enrolledAdministrator,
    totpCode,
    signedCookie,
  };
}

function time(value: unknown): number {
  return value instanceof Date ? value.getTime() : new Date(value as string).getTime();
}

function assertWithin(actual: number, earliest: number, latest: number, label: string): void {
  assert.ok(
    actual >= earliest - SLACK_MS && actual <= latest + SLACK_MS,
    `${label}: ${new Date(actual).toISOString()} is outside [${new Date(earliest).toISOString()}, ${new Date(latest).toISOString()}]`,
  );
}

const LOCAL_SESSION_COOKIE = "better-auth.session_token";
const SECURE_SESSION_COOKIE = "__Host-better-auth.session_token";

describe("customer sessions: 7 days, refreshed at most once per day of use (S16, L34)", () => {
  const harness = createHarness(LOCAL_ORIGIN);

  it("stores a new customer session for 7 days and sets a 7-day cookie", async () => {
    const { id, response, before, after } = await harness.signInCustomer();
    const stored = harness.onlySessionOf(id);

    assertWithin(time(stored.expiresAt), before + SEVEN_DAYS_MS, after + SEVEN_DAYS_MS, "expiry");
    assert.ok(
      setCookie(response, LOCAL_SESSION_COOKIE)?.attributes.includes("Max-Age=604800"),
      "the session cookie lives 7 days",
    );
  });

  it("does not refresh a session that was issued or refreshed less than a day ago", async () => {
    const { id, response } = await harness.signInCustomer();
    const cookie = setCookie(response, LOCAL_SESSION_COOKIE);
    assert.ok(cookie);
    const stored = harness.onlySessionOf(id);
    // Refreshed one minute less than a day ago: 6 days and 1 minute remain.
    const almostADay = new Date(Date.now() + SEVEN_DAYS_MS - DAY_SECONDS * 1000 + MINUTE_MS);
    stored.expiresAt = almostADay;

    const read = await harness.call("/get-session", { cookie: `${cookie.name}=${cookie.value}` });

    assert.equal(read.status, 200);
    assert.equal(((await read.json()) as { user: { id: string } }).user.id, id);
    assert.equal(setCookie(read, LOCAL_SESSION_COOKIE), undefined, "no cookie is reissued");
    assert.equal(time(harness.onlySessionOf(id).expiresAt), almostADay.getTime());
  });

  it("extends a session used more than a day after its last refresh to 7 days from now", async () => {
    const { id, response } = await harness.signInCustomer();
    const cookie = setCookie(response, LOCAL_SESSION_COOKIE);
    assert.ok(cookie);
    // Refreshed one minute more than a day ago.
    harness.onlySessionOf(id).expiresAt = new Date(
      Date.now() + SEVEN_DAYS_MS - DAY_SECONDS * 1000 - MINUTE_MS,
    );

    const before = Date.now();
    const read = await harness.call("/get-session", { cookie: `${cookie.name}=${cookie.value}` });
    const after = Date.now();

    assert.equal(read.status, 200);
    assertWithin(
      time(harness.onlySessionOf(id).expiresAt),
      before + SEVEN_DAYS_MS,
      after + SEVEN_DAYS_MS,
      "refreshed expiry",
    );
    assert.ok(
      setCookie(read, LOCAL_SESSION_COOKIE)?.attributes.includes("Max-Age=604800"),
      "the refreshed cookie lives 7 days",
    );
  });
});

describe("administrator session expiry with an invalid creation time (S49, L71)", () => {
  it("gives a valid creation time exactly 12 hours and logs nothing", () => {
    const createdAt = new Date("2026-11-08T10:00:00.000Z");

    const expiresAt = administratorSessionExpiresAt(createdAt, () => assert.fail("no event"));

    assert.equal(ADMINISTRATOR_SESSION_LIFETIME_SECONDS, 12 * 60 * 60);
    assert.equal(expiresAt.toISOString(), "2026-11-08T22:00:00.000Z");
  });

  it("treats a missing, invalid, or non-date creation time as expired and reports it once", () => {
    for (const createdAt of [
      new Date(Number.NaN),
      undefined,
      null,
      "2026-11-08",
      1_790_000_000_000,
    ]) {
      let reports = 0;

      const expiresAt = administratorSessionExpiresAt(createdAt, () => {
        reports += 1;
      });

      assert.ok(expiresAt.getTime() <= Date.now(), `expired for ${String(createdAt)}`);
      assert.equal(reports, 1);
    }
  });

  it("ends a stored administrator session whose creation time is invalid and logs one event without personal data", async () => {
    const harness = createHarness(LOCAL_ORIGIN);
    const admin = await harness.seedAdministrator();
    const context = await harness.auth.$context;

    const session = await context.internalAdapter.createSession(
      admin.id,
      false,
      { createdAt: new Date(Number.NaN) },
      true,
    );

    const stored = harness.onlySessionOf(admin.id);
    assert.ok(time(stored.expiresAt) <= Date.now(), "the stored expiry is already past");
    const read = await harness.auth.api.getSession({
      headers: new Headers({ cookie: harness.signedCookie(LOCAL_SESSION_COOKIE, session.token) }),
    });
    assert.equal(read, null, "the session reads as expired");
    assert.deepEqual(harness.events, [
      { event: AUTH_REQUEST_EVENT.ADMINISTRATOR_SESSION_CREATED_AT_INVALID },
    ]);
    const logged = JSON.stringify(harness.events);
    assert.ok(!logged.includes(admin.email) && !logged.includes(admin.id));
  });

  it("deletes the expired session and clears the cookie on the next read over HTTP, and nothing extends it", async () => {
    const harness = createHarness(LOCAL_ORIGIN);
    const admin = await harness.seedAdministrator();
    const context = await harness.auth.$context;
    const session = await context.internalAdapter.createSession(
      admin.id,
      false,
      { createdAt: new Date(Number.NaN) },
      true,
    );
    const cookie = harness.signedCookie(LOCAL_SESSION_COOKIE, session.token);
    const weekAhead = new Date(Date.now() + SEVEN_DAYS_MS);

    // Neither the update hook nor Better Auth's disabled endpoint moves the stored expiry forward.
    assert.equal(
      await context.internalAdapter.updateSession(session.token, { expiresAt: weekAhead }),
      null,
    );
    const endpoint = await harness.call("/update-session", {
      body: { expiresAt: weekAhead.toISOString() },
      cookie,
    });
    assert.equal(endpoint.status, 404);
    assert.ok(time(harness.onlySessionOf(admin.id).expiresAt) <= Date.now());

    const read = await harness.call("/get-session", { cookie });

    assert.equal(read.status, 200);
    assert.equal(await read.json(), null);
    assert.equal(harness.sessionsOf(admin.id).length, 0, "the expired session is deleted");
    const cleared = parseSetCookies(read).find((entry) => entry.name === LOCAL_SESSION_COOKIE);
    assert.equal(cleared?.value, "", "the session cookie is cleared");
  });
});

describe("administrator sessions: 12 hours from sign-in, never refreshed (S16, L34)", () => {
  const harness = createHarness(LOCAL_ORIGIN);

  it("stores a pending administrator's session for 12 hours from sign-in", async () => {
    const admin = await harness.seedAdministrator();
    const { before, after } = await harness.signInAdministrator(admin);
    const stored = harness.onlySessionOf(admin.id);

    assertWithin(
      time(stored.expiresAt),
      before + TWELVE_HOURS_MS,
      after + TWELVE_HOURS_MS,
      "expiry",
    );
    assert.equal(time(stored.expiresAt) - time(stored.createdAt), TWELVE_HOURS_MS);
    assert.deepEqual(harness.events, [], "a valid creation time logs nothing");
  });

  it("stores an enrolled administrator's session for 12 hours from the second factor", async () => {
    const admin = await harness.enrolledAdministrator(LOCAL_SESSION_COOKIE);
    const step = await harness.signInAdministrator(admin);
    const challenge = setCookie(step.response, "better-auth.two_factor");
    assert.ok(challenge, "the password step sets the two-factor challenge cookie");
    assert.equal(harness.sessionsOf(admin.id).length, 0, "the password step leaves no session");

    const before = Date.now();
    const verified = await harness.call("/two-factor/verify-totp", {
      body: { code: await harness.totpCode(admin.rawSecret) },
      cookie: `${challenge.name}=${challenge.value}`,
    });
    const after = Date.now();

    assert.equal(verified.status, 200);
    const stored = harness.onlySessionOf(admin.id);
    assertWithin(
      time(stored.expiresAt),
      before + TWELVE_HOURS_MS,
      after + TWELVE_HOURS_MS,
      "expiry",
    );
  });

  it("never extends an administrator session, through Better Auth or a project route", async () => {
    const admin = await harness.seedAdministrator();
    const { response } = await harness.signInAdministrator(admin);
    const cookie = setCookie(response, LOCAL_SESSION_COOKIE);
    assert.ok(cookie);
    const stored = harness.onlySessionOf(admin.id);
    // Eleven hours into the session: Better Auth's own rule would extend it to 7 days.
    const originalExpiry = new Date(Date.now() + 60 * MINUTE_MS);
    stored.createdAt = new Date(originalExpiry.getTime() - TWELVE_HOURS_MS);
    stored.updatedAt = stored.createdAt;
    stored.expiresAt = originalExpiry;

    const read = await harness.call("/get-session", { cookie: `${cookie.name}=${cookie.value}` });
    assert.equal(read.status, 200);
    assert.equal(((await read.json()) as { user: { id: string } }).user.id, admin.id);
    assert.equal(setCookie(read, LOCAL_SESSION_COOKIE), undefined, "no cookie is reissued");

    // The project guard reads the session through `auth.api.getSession`.
    const guardRead = await harness.auth.api.getSession({
      headers: new Headers({ cookie: `${cookie.name}=${cookie.value}` }),
      returnHeaders: true,
    });
    assert.equal(guardRead.response?.user.id, admin.id);
    assert.deepEqual(guardRead.headers.getSetCookie(), [], "no cookie is reissued");

    const after = harness.onlySessionOf(admin.id);
    assert.equal(time(after.expiresAt), originalExpiry.getTime(), "the stored expiry is unchanged");
    assert.equal(time(after.updatedAt), time(stored.createdAt), "the row was not rewritten");
  });

  it("refuses a session expiry change made outside a session read", async () => {
    const context = await harness.auth.$context;
    for (const userId of [
      (await harness.seedAdministrator()).id,
      (await harness.signInCustomer()).id,
    ]) {
      if (harness.sessionsOf(userId).length === 0) {
        await context.internalAdapter.createSession(userId);
      }
      const stored = harness.onlySessionOf(userId);
      const originalExpiry = time(stored.expiresAt);

      const updated = await context.internalAdapter.updateSession(String(stored.token), {
        expiresAt: new Date(Date.now() + SEVEN_DAYS_MS),
      });

      assert.equal(updated, null, "the update is refused");
      assert.equal(time(harness.onlySessionOf(userId).expiresAt), originalExpiry);
    }
  });
});

describe("session cookie: host-only on the web host (S14, S16, L33)", () => {
  it("names it better-auth.session_token without Secure or Domain over local http", async () => {
    const harness = createHarness(LOCAL_ORIGIN);
    const { response } = await harness.signInCustomer();
    const cookie = setCookie(response, LOCAL_SESSION_COOKIE);

    assert.ok(cookie, "the session cookie has the plain name");
    assert.deepEqual(cookie.attributes, ["Max-Age=604800", "Path=/", "HttpOnly", "SameSite=Lax"]);
  });

  it("names it __Host-better-auth.session_token with Secure, Path=/, and no Domain over https", async () => {
    const harness = createHarness(SECURE_ORIGIN);
    const { response } = await harness.signInCustomer();
    const cookie = setCookie(response, SECURE_SESSION_COOKIE);

    assert.ok(cookie, "the session cookie carries the __Host- prefix");
    assert.deepEqual(cookie.attributes, [
      "Max-Age=604800",
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
    ]);
  });

  it("gives every Better Auth cookie the __Host- prefix and no Domain over https", async () => {
    const harness = createHarness(SECURE_ORIGIN);
    const { response } = await harness.signInCustomer();
    const cookie = setCookie(response, SECURE_SESSION_COOKIE);
    assert.ok(cookie);

    const signOut = await harness.call("/sign-out", {
      body: {},
      cookie: `${cookie.name}=${cookie.value}`,
    });
    assert.equal(signOut.status, 200);
    const names = parseSetCookies(signOut).map((entry) => entry.name);
    assert.ok(names.includes(SECURE_SESSION_COOKIE), "sign-out expires the session cookie");
    assert.ok(names.includes("__Host-better-auth.session_data"));
    assert.ok(names.includes("__Host-better-auth.dont_remember"));

    for (const entry of [...parseSetCookies(response), ...parseSetCookies(signOut)]) {
      assert.ok(entry.name.startsWith("__Host-better-auth."), `${entry.name} is host-only`);
      assert.ok(!entry.name.includes("__Secure-"), `${entry.name} has no __Secure- prefix`);
      assert.ok(entry.attributes.includes("Secure"), `${entry.name} is Secure`);
      assert.ok(entry.attributes.includes("Path=/"), `${entry.name} has Path=/`);
      assert.ok(
        !entry.attributes.some((attribute) => attribute.toLowerCase().startsWith("domain=")),
        `${entry.name} has no Domain`,
      );
    }
  });

  it("reads the session only from the __Host- cookie over https", async () => {
    const harness = createHarness(SECURE_ORIGIN);
    const { id, response } = await harness.signInCustomer();
    const cookie = setCookie(response, SECURE_SESSION_COOKIE);
    assert.ok(cookie);

    const read = await harness.call("/get-session", { cookie: `${cookie.name}=${cookie.value}` });
    assert.equal(((await read.json()) as { user: { id: string } }).user.id, id);

    for (const name of [LOCAL_SESSION_COOKIE, "__Secure-better-auth.session_token"]) {
      const other = await harness.call("/get-session", { cookie: `${name}=${cookie.value}` });
      assert.equal(await other.text(), "null", `${name} is not a session cookie`);
    }
  });

  it("issues and reads the two-factor challenge cookie as __Host-better-auth.two_factor", async () => {
    const harness = createHarness(SECURE_ORIGIN);
    const admin = await harness.enrolledAdministrator(SECURE_SESSION_COOKIE);
    const step = await harness.signInAdministrator(admin);
    const challenge = setCookie(step.response, "__Host-better-auth.two_factor");
    assert.ok(challenge, "the challenge cookie carries the __Host- prefix");
    assert.ok(challenge.attributes.includes("Secure"));
    assert.ok(!challenge.attributes.some((attribute) => attribute.startsWith("Domain=")));

    const verified = await harness.call("/two-factor/verify-totp", {
      body: { code: await harness.totpCode(admin.rawSecret) },
      cookie: `${challenge.name}=${challenge.value}`,
    });

    assert.equal(verified.status, 200);
    assert.ok(setCookie(verified, SECURE_SESSION_COOKIE), "the second factor sets the session");
  });

  it("hides a pending administrator's __Host- session from endpoints outside enrollment", async () => {
    const harness = createHarness(SECURE_ORIGIN);
    const admin = await harness.seedAdministrator();
    const cookie = setCookie(
      (await harness.signInAdministrator(admin)).response,
      SECURE_SESSION_COOKIE,
    );
    assert.ok(cookie);
    const header = `${cookie.name}=${cookie.value}`;

    const anonymous = await harness.call("/list-sessions");
    const hidden = await harness.call("/list-sessions", { cookie: header });

    assert.deepEqual(
      { status: hidden.status, body: await hidden.text() },
      { status: anonymous.status, body: await anonymous.text() },
    );
    const read = await harness.call("/get-session", { cookie: header });
    assert.equal(((await read.json()) as { user: { id: string } }).user.id, admin.id);
  });

  it("accepts a signed __Host- cookie for a stored session", async () => {
    const harness = createHarness(SECURE_ORIGIN);
    const { id } = await harness.signInCustomer();
    const token = String(harness.onlySessionOf(id).token);

    const read = await harness.call("/get-session", {
      cookie: harness.signedCookie(SECURE_SESSION_COOKIE, token),
    });

    assert.equal(((await read.json()) as { user: { id: string } }).user.id, id);
  });
});
