import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, it, mock } from "node:test";

import { memoryAdapter } from "better-auth/adapters/memory";

import {
  type EmailDeliveryEvent,
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../../email/application/email-delivery.service";
import type { EmailMessage, EmailSender } from "../../email/application/email-sender.port";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { EMAIL_CODE_QUOTA, EMAIL_CODE_QUOTA_KEY_PREFIX, emailCodeQuotaKey } from "../abuse-limits";
import { createAuth } from "../auth.factory";
import { BACKGROUND_TASK_EVENT, BackgroundTasks } from "./background-tasks";
import {
  SIGN_IN_CODE_DELIVERY_TASK,
  SIGN_IN_CODE_STAGE,
  SignInCodeSender,
} from "./sign-in-code-sender";

// Customer sign-in code flow (M2 T5a; S6, S15, S23, S24) through Better Auth's own HTTP handler, with
// the in-memory database adapter and a scripted email sender: no network and no database.

const AUTH_BASE_URL = "http://localhost:3001";
const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_PATH = "/api/auth";
const CODE_PATTERN = /\b(\d{6})\b/;
const CLIENT_IP_HEADER = "x-forwarded-for";

let clientCounter = 0;
/** A fresh client IP per request, so the per-IP limit never hides the behavior under test. */
function nextClientIp(): string {
  clientCounter += 1;
  return `10.${(clientCounter >> 16) & 255}.${(clientCounter >> 8) & 255}.${clientCounter & 255}`;
}

type MemoryDatabase = Record<string, Record<string, unknown>[]>;
type DatabaseAdapter = ReturnType<typeof memoryAdapter>;
type AdapterInstance = ReturnType<DatabaseAdapter>;

/** Replaces `create` for the per-email count rows; every other call reaches the memory adapter. */
function withQuotaCreate(
  adapter: DatabaseAdapter,
  create: (inner: AdapterInstance, query: Parameters<AdapterInstance["create"]>[0]) => unknown,
): DatabaseAdapter {
  return (options) => {
    const inner = adapter(options);
    const wrapped = ((query: Parameters<AdapterInstance["create"]>[0]) =>
      query.model === "rateLimit" && String(query.data.key).startsWith(EMAIL_CODE_QUOTA_KEY_PREFIX)
        ? create(inner, query)
        : inner.create(query)) as AdapterInstance["create"];
    return { ...inner, create: wrapped };
  };
}

/** Sender whose next deliveries can be held open or failed by the test. */
class ScriptedEmailSender implements EmailSender {
  readonly attempts: EmailMessage[] = [];
  readonly delivered: EmailMessage[] = [];
  private readonly scripts: Array<() => Promise<void>> = [];

  /** Holds the next send until the returned release function is called. */
  holdNext(): { release: (outcome?: "deliver" | "fail") => void } {
    let release!: (outcome?: "deliver" | "fail") => void;
    const gate = new Promise<"deliver" | "fail">((resolve) => {
      release = (outcome = "deliver") => resolve(outcome);
    });
    this.scripts.push(async () => {
      if ((await gate) === "fail") {
        throw new Error("held delivery failed");
      }
    });
    return { release };
  }

  async send(message: EmailMessage): Promise<void> {
    this.attempts.push(message);
    const script = this.scripts.shift();

    if (script) {
      await script();
    }

    this.delivered.push(message);
  }
}

function createHarness(
  sender: EmailSender = new InMemoryEmailSender(),
  wrapAdapter: (adapter: DatabaseAdapter) => DatabaseAdapter = (adapter) => adapter,
) {
  const database: MemoryDatabase = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  const deliveryEvents: EmailDeliveryEvent[] = [];
  const taskEvents: unknown[] = [];
  const runtime: EmailDeliveryRuntime = {
    now: () => Date.now(),
    sleep: async () => {},
    warn: (event) => deliveryEvents.push(event),
    error: (event) => deliveryEvents.push(event),
  };
  const tasks = new BackgroundTasks((event) => taskEvents.push(event));
  const signInCodes = new SignInCodeSender(new EmailDeliveryService(sender, runtime), tasks);
  const auth = createAuth({
    secret: randomBytes(32).toString("base64url"),
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [TRUSTED_ORIGIN],
    database: wrapAdapter(memoryAdapter(database)),
    signInCodes,
    clientIp: { header: CLIENT_IP_HEADER, trustedProxies: [] },
    requireClientIp: false,
    log: () => {},
  });

  function post(path: string, body: unknown, clientIp = nextClientIp()): Promise<Response> {
    return auth.handler(
      new Request(`${AUTH_BASE_URL}${AUTH_PATH}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: TRUSTED_ORIGIN,
          [CLIENT_IP_HEADER]: clientIp,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  function requestCode(email: string, clientIp?: string): Promise<Response> {
    return post("/email-otp/send-verification-otp", { email, type: "sign-in" }, clientIp);
  }

  function rateLimitRows(): Record<string, unknown>[] {
    return database.rateLimit ?? [];
  }

  function signIn(email: string, otp: string, extra: Record<string, unknown> = {}) {
    return post("/sign-in/email-otp", { email, otp, ...extra });
  }

  function verificationRows(email: string): Record<string, unknown>[] {
    return (database.verification ?? []).filter((row) => row.identifier === `sign-in-otp-${email}`);
  }

  function users(email: string): Record<string, unknown>[] {
    return (database.user ?? []).filter((row) => row.email === email);
  }

  async function createAdministrator(email: string): Promise<void> {
    const context = await auth.$context;
    await context.internalAdapter.createUser(
      { email, name: "Administrador", emailVerified: true, role: "ADMIN" },
      { method: "admin" },
    );
  }

  return {
    auth,
    tasks,
    database,
    deliveryEvents,
    taskEvents,
    post,
    requestCode,
    rateLimitRows,
    signIn,
    verificationRows,
    users,
    createAdministrator,
  };
}

function codeFrom(message: EmailMessage | undefined): string {
  assert.ok(message, "a message was delivered");
  const match = CODE_PATTERN.exec(message.text);
  assert.ok(match?.[1], "the message carries a 6-digit code");
  return match[1];
}

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

async function errorCode(response: Response): Promise<string | undefined> {
  return ((await response.json()) as { code?: string }).code;
}

let emailCounter = 0;
function newEmail(label: string): string {
  emailCounter += 1;
  return `t5a-${label}-${emailCounter}@example.test`;
}

afterEach(() => {
  mock.timers.reset();
});

describe("sign-in code request (S24)", () => {
  it("returns the same immediate 200 body for unknown, existing-customer, and administrator emails", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const customer = newEmail("customer");
    const administrator = newEmail("admin");
    const unknown = newEmail("unknown");

    await harness.requestCode(customer);
    await harness.tasks.drain();
    assert.equal((await harness.signIn(customer, codeFrom(sender.delivered[0]))).status, 200);
    await harness.createAdministrator(administrator);
    sender.clear();

    const responses = [];
    for (const email of [unknown, customer, administrator]) {
      const response = await harness.requestCode(email);
      responses.push({
        status: response.status,
        body: await response.text(),
        setCookie: response.headers.getSetCookie(),
      });
    }

    for (const response of responses) {
      assert.deepEqual(response, { status: 200, body: '{"success":true}', setCookie: [] });
    }

    await harness.tasks.drain();
    assert.deepEqual(
      sender.delivered.map((message) => message.to),
      [unknown, customer],
    );
    assert.equal(harness.verificationRows(administrator).length, 0, "the admin code row is gone");
    assert.equal(harness.verificationRows(unknown).length, 1);
    assert.equal(harness.verificationRows(customer).length, 1);
  });

  it("sends an administrator no code and removes the code they were issued", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const administrator = newEmail("admin");
    await harness.createAdministrator(administrator);

    assert.equal((await harness.requestCode(administrator)).status, 200);
    await harness.tasks.drain();

    assert.equal(sender.attempts.length, 0);
    assert.equal(harness.verificationRows(administrator).length, 0);
  });

  it("sends no code for the non-sign-in OTP types, whether or not the account exists", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const customer = newEmail("customer");
    await harness.requestCode(customer);
    await harness.tasks.drain();
    await harness.signIn(customer, codeFrom(sender.delivered[0]));
    sender.clear();

    for (const type of ["email-verification", "forget-password"]) {
      for (const email of [customer, newEmail("unknown")]) {
        const response = await harness.post("/email-otp/send-verification-otp", { email, type });
        assert.equal(response.status, 200);
        assert.equal(await response.text(), '{"success":true}');
      }
    }

    await harness.tasks.drain();
    assert.equal(sender.attempts.length, 0);
    assert.equal(
      (harness.database.verification ?? []).filter(
        (row) => !String(row.identifier).startsWith("sign-in-otp-"),
      ).length,
      0,
    );
  });
});

describe("background delivery of a sign-in code (S23, S24)", () => {
  it("responds before a held delivery completes, then delivers the code with its validity", async () => {
    const sender = new ScriptedEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("held");
    const held = sender.holdNext();

    const response = await harness.requestCode(email);

    assert.equal(response.status, 200);
    assert.equal(sender.delivered.length, 0, "the response did not wait for delivery");

    held.release();
    await harness.tasks.drain();

    const [message] = sender.delivered;
    assert.ok(message);
    assert.equal(message.to, email);
    assert.match(message.subject, /código de acceso/i);
    assert.match(message.text, /5 minutos/);
    assert.match(message.html ?? "", /5 minutos/);
    assert.match(codeFrom(message), /^\d{6}$/);
    assert.equal((await harness.signIn(email, codeFrom(message))).status, 200);
  });

  it("uses a random idempotency key per send, never derived from the code or the address", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("keys");

    await harness.requestCode(email);
    await harness.requestCode(email);
    await harness.tasks.drain();

    const keys = sender.delivered.map((message) => message.idempotencyKey);
    assert.equal(keys.length, 2);
    assert.notEqual(keys[0], keys[1]);

    for (const [index, key] of keys.entries()) {
      const code = codeFrom(sender.delivered[index]);
      assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      assert.ok(!key.includes(code));
      assert.ok(!key.includes(email));
      assert.ok(!key.includes(sha256Base64Url(code)));
    }
  });

  it("invalidates a code whose delivery fails after the retries, without logging the code or the address", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("failed");
    sender.failNext(3, { transient: true });

    assert.equal((await harness.requestCode(email)).status, 200);
    await harness.tasks.drain();

    assert.equal(sender.attempts.length, 3, "bounded retries reused the same message");
    assert.equal(new Set(sender.attempts.map((message) => message.idempotencyKey)).size, 1);
    const failedCode = codeFrom(sender.attempts[0]);
    assert.equal(harness.verificationRows(email).length, 0, "the undelivered code was removed");

    const rejected = await harness.signIn(email, failedCode);
    assert.equal(rejected.status, 400);
    assert.equal(await errorCode(rejected), "INVALID_OTP");

    await harness.requestCode(email);
    await harness.tasks.drain();
    const [delivered] = sender.delivered;
    const accepted = await harness.signIn(email, codeFrom(delivered));
    assert.equal(accepted.status, 200, "a newer code still works");

    const logged = JSON.stringify([...harness.deliveryEvents, ...harness.taskEvents]);
    assert.ok(harness.deliveryEvents.length > 0);
    assert.ok(!logged.includes(email));
    assert.ok(!logged.includes(failedCode));
  });

  it("invalidates only the failed code, never a newer code requested meanwhile", async () => {
    const sender = new ScriptedEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("race");
    const first = sender.holdNext();

    await harness.requestCode(email);
    await harness.requestCode(email);
    // Let the second, unheld delivery finish while the first is still pending.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.verificationRows(email).length, 2);

    first.release("fail");
    await harness.tasks.drain();

    const failedCode = codeFrom(sender.attempts[0]);
    const newerCode = codeFrom(sender.delivered[0]);
    assert.notEqual(failedCode, newerCode);
    assert.equal(harness.verificationRows(email).length, 1);

    const accepted = await harness.signIn(email, newerCode);
    assert.equal(accepted.status, 200);
  });
});

describe("sign-in code values (S15)", () => {
  it("stores the code hashed, never in plain text", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("hashed");

    await harness.requestCode(email);
    await harness.tasks.drain();

    const code = codeFrom(sender.delivered[0]);
    const [row] = harness.verificationRows(email);
    assert.ok(row);
    assert.ok(!String(row.value).includes(code));
    assert.equal(row.value, `${sha256Base64Url(code)}:0`);
  });

  it("accepts a code until 300 seconds and rejects it as expired after", async () => {
    mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-04T12:00:00Z") });
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const early = newEmail("early");
    const late = newEmail("late");

    await harness.requestCode(early);
    await harness.requestCode(late);
    await harness.tasks.drain();
    const [earlyMessage, lateMessage] = sender.delivered;

    mock.timers.tick(299_000);
    assert.equal((await harness.signIn(early, codeFrom(earlyMessage))).status, 200);

    mock.timers.tick(2_000);
    const expired = await harness.signIn(late, codeFrom(lateMessage));
    assert.equal(expired.status, 400);
    assert.equal(await errorCode(expired), "OTP_EXPIRED");
  });

  it("rejects the 4th attempt with TOO_MANY_ATTEMPTS after 3 wrong codes, even with the right code", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("attempts");

    await harness.requestCode(email);
    await harness.tasks.drain();
    const code = codeFrom(sender.delivered[0]);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await harness.signIn(email, wrong);
      assert.equal(response.status, 400);
      assert.equal(await errorCode(response), "INVALID_OTP");
    }

    const fourth = await harness.signIn(email, code);
    assert.equal(fourth.status, 403);
    assert.equal(await errorCode(fourth), "TOO_MANY_ATTEMPTS");
    assert.equal(harness.users(email).length, 0);
  });
});

describe("per-email code cap (S25, L24)", () => {
  async function snapshot(response: Response) {
    return {
      status: response.status,
      body: await response.text(),
      setCookie: response.headers.getSetCookie(),
    };
  }

  it("answers the 6th request within an hour with the identical 200, sends nothing, and removes its code", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("capped");
    const other = newEmail("other");
    const allowed = [];

    for (let request = 1; request <= EMAIL_CODE_QUOTA.max; request += 1) {
      allowed.push(await snapshot(await harness.requestCode(email)));
    }
    await harness.tasks.drain();
    const rowsBefore = harness.verificationRows(email).map((row) => row.id);
    assert.equal(sender.delivered.length, 5);

    const capped = await snapshot(await harness.requestCode(email));
    await harness.tasks.drain();

    for (const response of allowed) {
      assert.deepEqual(capped, response, "the capped response is identical");
    }
    assert.equal(sender.attempts.length, 5, "no 6th delivery was attempted");
    assert.deepEqual(
      harness.verificationRows(email).map((row) => row.id),
      rowsBefore,
      "the 6th code row is gone",
    );

    await harness.requestCode(other);
    await harness.tasks.drain();
    assert.equal(sender.delivered.at(-1)?.to, other, "another address is unaffected");

    const keys = harness.rateLimitRows().map((row) => String(row.key));
    assert.ok(keys.every((key) => !key.toLowerCase().includes(email.split("@")[0] ?? email)));
    const row = harness.rateLimitRows().find((entry) => entry.key === emailCodeQuotaKey(email));
    assert.ok(row, "the per-email count is stored under the hashed key");
    assert.match(String(row.key), /^sign-in-code-email\|[0-9a-f]{64}$/);
    assert.equal(row.count, 5);
  });

  it("counts requests whose delivery failed, and the address case does not matter", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("failing");
    sender.failNext(EMAIL_CODE_QUOTA.max, { transient: false });

    for (let request = 1; request <= EMAIL_CODE_QUOTA.max; request += 1) {
      await harness.requestCode(email);
    }
    await harness.tasks.drain();
    assert.equal(sender.attempts.length, 5);
    assert.equal(sender.delivered.length, 0);

    assert.equal((await harness.requestCode(email.toUpperCase())).status, 200);
    await harness.tasks.drain();
    assert.equal(sender.attempts.length, 5, "the 6th request sent nothing");
    assert.equal(harness.verificationRows(email).length, 0);
  });

  it("keeps the per-email count when Better Auth prunes expired client IP rows", async () => {
    mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-04T12:00:00Z") });
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("pruned");
    const client = nextClientIp();

    await harness.requestCode(email, client);
    for (let request = 2; request <= EMAIL_CODE_QUOTA.max; request += 1) {
      await harness.requestCode(email);
    }
    await harness.tasks.drain();
    assert.equal(sender.delivered.length, 5);

    // The client's 60-second window has passed, so this request resets it and Better Auth prunes
    // rows whose last request is older than its longest configured window.
    mock.timers.tick(61_000);
    assert.equal((await harness.requestCode(email, client)).status, 200);
    await harness.tasks.drain();

    assert.equal(sender.attempts.length, 5, "the per-email cap still holds");
    assert.ok(harness.rateLimitRows().some((row) => row.key === emailCodeQuotaKey(email)));
  });

  it("allows codes for the address again once the hour has passed", async () => {
    mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-04T12:00:00Z") });
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("hourly");

    for (let request = 1; request <= EMAIL_CODE_QUOTA.max + 1; request += 1) {
      await harness.requestCode(email);
    }
    await harness.tasks.drain();
    assert.equal(sender.delivered.length, 5);

    mock.timers.tick(EMAIL_CODE_QUOTA.window * 1000);
    await harness.requestCode(email);
    await harness.tasks.drain();
    assert.equal(sender.delivered.length, 6);
  });
});

describe("fixed per-email code window (S25, L25)", () => {
  const MINUTE = 60_000;
  const START = Date.parse("2026-11-04T12:00:00Z");

  /** Five codes at minutes 0, 12.5, 25, 37.5, and 50, the first from `firstClient`. */
  async function fiveCodesOverFiftyMinutes(
    harness: ReturnType<typeof createHarness>,
    email: string,
    firstClient: string,
  ): Promise<void> {
    for (let request = 0; request < EMAIL_CODE_QUOTA.max; request += 1) {
      mock.timers.setTime(START + request * 12.5 * MINUTE);
      await harness.requestCode(email, request === 0 ? firstClient : undefined);
      await harness.tasks.drain();
    }
  }

  it("refuses a 6th code 59 minutes after the first, even after Better Auth prunes old rows", async () => {
    mock.timers.enable({ apis: ["Date"], now: START });
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("window-59");
    const firstClient = nextClientIp();

    await fiveCodesOverFiftyMinutes(harness, email, firstClient);
    assert.equal(sender.delivered.length, 5);

    // The first client's 60-second window restarts here, so Better Auth prunes RateLimit rows
    // whose last request is older than its longest window (one hour) before the code is counted.
    mock.timers.setTime(START + 59 * MINUTE);
    assert.equal((await harness.requestCode(email, firstClient)).status, 200);
    await harness.tasks.drain();

    assert.equal(sender.attempts.length, 5, "no 6th delivery within the hour of the first code");
    const row = harness.rateLimitRows().find((entry) => entry.key === emailCodeQuotaKey(email));
    assert.ok(row, "the count was not pruned before its window ended");
    assert.equal(row.count, 5);
    assert.equal(Number(row.lastRequest), START, "the window start never moved");
  });

  it("allows a 6th code 61 minutes after the first, although the 5th was 11 minutes earlier", async () => {
    mock.timers.enable({ apis: ["Date"], now: START });
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("window-61");

    await fiveCodesOverFiftyMinutes(harness, email, nextClientIp());
    assert.equal(sender.delivered.length, 5);

    mock.timers.setTime(START + 61 * MINUTE);
    assert.equal((await harness.requestCode(email)).status, 200);
    await harness.tasks.drain();

    assert.equal(sender.delivered.length, 6, "a new window starts with the 6th code");
    const row = harness.rateLimitRows().find((entry) => entry.key === emailCodeQuotaKey(email));
    assert.ok(row);
    assert.equal(row.count, 1);
    assert.equal(Number(row.lastRequest), START + 61 * MINUTE);
  });
});

describe("per-email count storage errors (S23, L25)", () => {
  it("surfaces a create error that is not a key conflict: the code is removed and the quota stage logged", async () => {
    class QuotaStoreUnavailableError extends Error {
      override name = "QuotaStoreUnavailableError";
    }
    let creates = 0;
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender, (adapter) =>
      withQuotaCreate(adapter, async () => {
        creates += 1;
        throw new QuotaStoreUnavailableError("connection refused for sign-in-code-email|...");
      }),
    );
    const email = newEmail("quota-store-down");

    const response = await harness.requestCode(email);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    await harness.tasks.drain();

    assert.equal(creates, 1, "a storage error is not retried as a concurrent create");
    assert.equal(sender.attempts.length, 0);
    assert.equal(harness.verificationRows(email).length, 0, "the undelivered code was removed");
    assert.deepEqual(harness.taskEvents, [
      {
        event: BACKGROUND_TASK_EVENT.FAILED,
        task: SIGN_IN_CODE_DELIVERY_TASK,
        stage: SIGN_IN_CODE_STAGE.QUOTA,
        error: "QuotaStoreUnavailableError",
      },
    ]);
  });

  it("counts against the row a concurrent request created when the create hits the key conflict", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender, (adapter) =>
      withQuotaCreate(adapter, async (inner, query) => {
        // A concurrent request wins the race and stores the row first; this create then conflicts.
        await inner.create(query);
        throw new Error("Unique constraint failed on the fields: (`key`)");
      }),
    );
    const email = newEmail("quota-race");

    await harness.requestCode(email);
    await harness.tasks.drain();

    assert.equal(sender.delivered.length, 1);
    assert.deepEqual(harness.taskEvents, []);
    const rows = harness.rateLimitRows().filter((row) => row.key === emailCodeQuotaKey(email));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.count, 2, "both the concurrent and this request are counted");
  });
});

describe("client profile fields at sign-up (L16)", () => {
  it("ignores a client-supplied name and image when a code creates the account", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const email = newEmail("profile");

    await harness.requestCode(email);
    await harness.tasks.drain();
    const response = await harness.signIn(email, codeFrom(sender.delivered[0]), {
      name: "x".repeat(10_000),
      image: "https://tracker.example.test/pixel.png",
      role: "ADMIN",
    });
    assert.equal(response.status, 200);

    const [user] = harness.users(email);
    assert.ok(user);
    assert.equal(user.displayName ?? user.name, "");
    assert.equal(user.image ?? null, null);
    assert.equal(user.role, "CUSTOMER");
  });
});

describe("account status and role at sign-in (S6, S9, S18, S22; L24, L26)", () => {
  /** Issues a delivered code to a new customer, then applies the change before it is used. */
  async function codeThenChange(
    harness: ReturnType<typeof createHarness>,
    sender: InMemoryEmailSender,
    change: Record<string, unknown>,
  ): Promise<{ email: string; code: string }> {
    const email = newEmail("changed");
    await harness.requestCode(email);
    await harness.tasks.drain();
    const code = codeFrom(sender.delivered.at(-1));
    assert.equal((await harness.signIn(email, code)).status, 200, "the account now exists");
    harness.database.session = [];

    await harness.requestCode(email);
    await harness.tasks.drain();
    const second = codeFrom(sender.delivered.at(-1));
    const [user] = harness.users(email);
    assert.ok(user);
    Object.assign(user, change);
    return { email, code: second };
  }

  async function invalidCodeResponse(harness: ReturnType<typeof createHarness>) {
    const email = newEmail("wrong");
    await harness.requestCode(email);
    await harness.tasks.drain();
    const response = await harness.signIn(email, "000000");
    return { status: response.status, body: await response.text() };
  }

  it("sends a DISABLED user no code and removes the issued one, with the identical response", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const { email } = await codeThenChange(harness, sender, { status: "DISABLED" });
    // Drop the code the helper issued while the account was still active.
    harness.database.verification = [];
    sender.clear();

    const response = await harness.requestCode(email);
    assert.deepEqual(
      { status: response.status, body: await response.text() },
      { status: 200, body: '{"success":true}' },
    );
    await harness.tasks.drain();

    assert.equal(sender.attempts.length, 0);
    assert.equal(harness.verificationRows(email).length, 0);
  });

  for (const [label, change] of [
    ["a DISABLED customer", { status: "DISABLED" }],
    ["an administrator", { role: "ADMIN" }],
  ] as const) {
    it(`refuses an email-code session to ${label}, exactly like an invalid code`, async () => {
      const sender = new InMemoryEmailSender();
      const harness = createHarness(sender);
      const { email, code } = await codeThenChange(harness, sender, change);
      const expected = await invalidCodeResponse(harness);

      const response = await harness.signIn(email, code);

      assert.deepEqual({ status: response.status, body: await response.text() }, expected);
      assert.equal(expected.status, 400);
      assert.deepEqual(response.headers.getSetCookie(), []);
      assert.equal(harness.database.session?.length, 0, "no session row was created");
    });
  }

  it("refuses session creation for a DISABLED user on every path, server-side included", async () => {
    const sender = new InMemoryEmailSender();
    const harness = createHarness(sender);
    const { email } = await codeThenChange(harness, sender, { status: "DISABLED" });
    const [user] = harness.users(email);
    const context = await harness.auth.$context;

    await assert.rejects(context.internalAdapter.createSession(String(user?.id)));
    assert.equal(harness.database.session?.length, 0);
  });
});
