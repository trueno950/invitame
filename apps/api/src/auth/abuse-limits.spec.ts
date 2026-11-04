import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, describe, it, mock } from "node:test";

import { memoryAdapter } from "better-auth/adapters/memory";

import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { EMAIL_CODE_SIGN_IN_PATH, SIGN_IN_CODE_REQUEST_PATH } from "./abuse-limits";
import { createAuth } from "./auth.factory";
import { AUTH_REQUEST_EVENT, type AuthRequestEvent } from "./auth-request-guard";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// Abuse limits through Better Auth's own HTTP handler (M2 T5b; S10, S19, S25, L16, L24), with the
// in-memory database adapter as the rate-limit store: no network and no database.

const AUTH_BASE_URL = "http://localhost:3001";
const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_PATH = "/api/auth";
const CLIENT_IP_HEADER = "x-real-ip";
const RATE_LIMITED = {
  status: 429,
  body: { message: "Too many requests. Please try again later." },
};
const UNAVAILABLE = {
  status: 503,
  body: {
    code: "SERVICE_UNAVAILABLE",
    message: "Service temporarily unavailable. Try again later.",
  },
};

type MemoryDatabase = Record<string, Record<string, unknown>[]>;
type DatabaseAdapter = ReturnType<typeof memoryAdapter>;

interface HarnessOptions {
  requireClientIp?: boolean;
  trustedProxies?: string[];
  /** Makes every rate-limit store read fail with this message. */
  rateLimitStoreFailure?: string;
}

function failingRateLimitStore(adapter: DatabaseAdapter, message: string): DatabaseAdapter {
  return (options) => {
    const inner = adapter(options);
    const findMany = ((query: Parameters<typeof inner.findMany>[0]) =>
      query.model === "rateLimit"
        ? Promise.reject(new Error(message))
        : inner.findMany(query)) as typeof inner.findMany;
    return { ...inner, findMany };
  };
}

function createHarness(options: HarnessOptions = {}) {
  const database: MemoryDatabase = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  const sender = new InMemoryEmailSender();
  const events: AuthRequestEvent[] = [];
  const runtime: EmailDeliveryRuntime = {
    now: () => Date.now(),
    sleep: async () => {},
    warn: () => {},
    error: () => {},
  };
  const tasks = new BackgroundTasks(() => {});
  const adapter = memoryAdapter(database);
  const auth = createAuth({
    secret: randomBytes(32).toString("base64url"),
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [TRUSTED_ORIGIN],
    database: options.rateLimitStoreFailure
      ? failingRateLimitStore(adapter, options.rateLimitStoreFailure)
      : adapter,
    signInCodes: new SignInCodeSender(new EmailDeliveryService(sender, runtime), tasks),
    clientIp: { header: CLIENT_IP_HEADER, trustedProxies: options.trustedProxies ?? [] },
    requireClientIp: options.requireClientIp ?? false,
    log: (event) => events.push(event),
  });

  function post(path: string, body: unknown, headers: Record<string, string>): Promise<Response> {
    return auth.handler(
      new Request(`${AUTH_BASE_URL}${AUTH_PATH}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: TRUSTED_ORIGIN, ...headers },
        body: JSON.stringify(body),
      }),
    );
  }

  return { auth, database, sender, tasks, events, post };
}

async function outcome(response: Response): Promise<{ status: number; body: unknown }> {
  return { status: response.status, body: await response.json() };
}

let emailCounter = 0;
function newEmail(label: string): string {
  emailCounter += 1;
  return `t5b-${label}-${emailCounter}@example.test`;
}

const LIMITED_PATHS = [
  { path: SIGN_IN_CODE_REQUEST_PATH, body: () => ({ email: newEmail("ip"), type: "sign-in" }) },
  { path: EMAIL_CODE_SIGN_IN_PATH, body: () => ({ email: newEmail("ip"), otp: "000000" }) },
];

afterEach(() => {
  mock.timers.reset();
});

describe("client IP rate limits (S10, S25)", () => {
  for (const { path, body } of LIMITED_PATHS) {
    it(`answers the 4th ${path} request from one client IP within 60 seconds with 429`, async () => {
      mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-04T12:00:00Z") });
      const harness = createHarness();
      const client = { [CLIENT_IP_HEADER]: "203.0.113.10" };

      for (let request = 1; request <= 3; request += 1) {
        assert.notEqual((await harness.post(path, body(), client)).status, 429);
      }

      // A forged default header does not move the client into another bucket.
      const forged = { ...client, "x-forwarded-for": "198.51.100.99" };
      assert.deepEqual(await outcome(await harness.post(path, body(), forged)), RATE_LIMITED);

      const other = { [CLIENT_IP_HEADER]: "203.0.113.11" };
      assert.notEqual((await harness.post(path, body(), other)).status, 429);

      // The window is 60 seconds, not Better Auth's 10-second default for /sign-in paths.
      mock.timers.tick(11_000);
      assert.equal((await harness.post(path, body(), client)).status, 429);
      mock.timers.tick(49_000);
      assert.notEqual((await harness.post(path, body(), client)).status, 429);

      const keys = (harness.database.rateLimit ?? []).map((row) => row.key);
      assert.ok(keys.includes(`203.0.113.10|${path}`), "the store holds the client IP bucket");
      await harness.tasks.drain();
    });
  }
});

describe("rate-limit store failure (S19)", () => {
  it("rejects code requests and code sign-ins with a generic 503 before the endpoint runs", async () => {
    const storeError = 'select * from "RateLimit" where key = $1 -- connection refused';
    const harness = createHarness({ rateLimitStoreFailure: storeError });
    const email = newEmail("store-down");
    const client = { [CLIENT_IP_HEADER]: "203.0.113.20" };

    const requested = await harness.post(
      SIGN_IN_CODE_REQUEST_PATH,
      { email, type: "sign-in" },
      client,
    );
    const signedIn = await harness.post(EMAIL_CODE_SIGN_IN_PATH, { email, otp: "000000" }, client);
    await harness.tasks.drain();

    for (const response of [requested, signedIn]) {
      const text = await response.text();
      assert.equal(response.status, UNAVAILABLE.status);
      assert.deepEqual(JSON.parse(text), UNAVAILABLE.body);
      assert.ok(!text.includes("RateLimit") && !text.includes(email) && !text.includes("at "));
      assert.deepEqual(response.headers.getSetCookie(), []);
    }

    assert.equal(harness.database.verification?.length, 0, "no code row was written");
    assert.equal(harness.database.user?.length, 0);
    assert.equal(harness.database.session?.length, 0);
    assert.equal(harness.sender.attempts.length, 0, "no email was sent");
    assert.deepEqual(harness.events, [
      {
        event: AUTH_REQUEST_EVENT.UNAVAILABLE,
        path: `${AUTH_PATH}${SIGN_IN_CODE_REQUEST_PATH}`,
        error: "Error",
      },
      {
        event: AUTH_REQUEST_EVENT.UNAVAILABLE,
        path: `${AUTH_PATH}${EMAIL_CODE_SIGN_IN_PATH}`,
        error: "Error",
      },
    ]);
    const logged = JSON.stringify(harness.events);
    assert.ok(!logged.includes(email) && !logged.includes("RateLimit"));
  });
});

describe("client IP in production (L16, L24)", () => {
  it("rejects a request whose client IP cannot be resolved instead of sharing one bucket", async () => {
    const harness = createHarness({ requireClientIp: true });
    const email = newEmail("no-ip");
    const unresolvable = [
      {},
      { [CLIENT_IP_HEADER]: "not-an-ip" },
      // Without trusted proxies only a single address is accepted.
      { [CLIENT_IP_HEADER]: "198.51.100.7, 203.0.113.30" },
      { "x-forwarded-for": "198.51.100.8" },
    ];

    for (const headers of unresolvable) {
      const response = await harness.post(
        SIGN_IN_CODE_REQUEST_PATH,
        { email, type: "sign-in" },
        headers,
      );
      assert.deepEqual(await outcome(response), UNAVAILABLE);
    }
    await harness.tasks.drain();

    assert.deepEqual(
      harness.events,
      unresolvable.map(() => ({
        event: AUTH_REQUEST_EVENT.CLIENT_IP_UNRESOLVED,
        path: `${AUTH_PATH}${SIGN_IN_CODE_REQUEST_PATH}`,
      })),
    );
    assert.deepEqual(harness.database.rateLimit, [], "no shared no-trusted-ip bucket");
    assert.equal(harness.database.verification?.length, 0);
    assert.equal(harness.sender.attempts.length, 0);

    const resolved = await harness.post(
      SIGN_IN_CODE_REQUEST_PATH,
      { email, type: "sign-in" },
      { [CLIENT_IP_HEADER]: "198.51.100.7" },
    );
    assert.equal(resolved.status, 200);
    await harness.tasks.drain();
  });

  it("resolves the client behind configured trusted proxies", async () => {
    const harness = createHarness({ requireClientIp: true, trustedProxies: ["10.0.0.0/8"] });
    const response = await harness.post(
      SIGN_IN_CODE_REQUEST_PATH,
      { email: newEmail("proxied"), type: "sign-in" },
      { [CLIENT_IP_HEADER]: "198.51.100.40, 10.1.2.3" },
    );
    await harness.tasks.drain();

    assert.equal(response.status, 200);
    const clientKeys = (harness.database.rateLimit ?? [])
      .map((row) => String(row.key))
      .filter((key) => key.endsWith(`|${SIGN_IN_CODE_REQUEST_PATH}`));
    assert.deepEqual(clientKeys, [`198.51.100.40|${SIGN_IN_CODE_REQUEST_PATH}`]);
  });

  it("refuses to build when Better Auth would fall back to a localhost client IP", () => {
    const previous = process.env.TEST;
    // Better Auth reads TEST at call time and then resolves every unknown client to 127.0.0.1.
    process.env.TEST = "true";

    try {
      assert.throws(() => createHarness({ requireClientIp: true }), {
        message:
          "Better Auth would treat unresolved clients as 127.0.0.1; run production with NODE_ENV=production and without TEST.",
      });
      assert.doesNotThrow(() => createHarness({ requireClientIp: false }));
    } finally {
      if (previous === undefined) {
        delete process.env.TEST;
      } else {
        process.env.TEST = previous;
      }
    }
  });
});
