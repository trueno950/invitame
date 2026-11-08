import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { memoryAdapter } from "better-auth/adapters/memory";

import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { createAuth } from "./auth.factory";
import { SIGN_IN_CODE_REQUEST_PATH } from "./auth-paths";
import {
  AUTH_PROXY_SECRET_HEADER,
  AUTH_REQUEST_EVENT,
  type AuthRequestEvent,
  guardAuthHandler,
} from "./auth-request-guard";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// The web-to-API hop (M2 T8b; S7, S14, L33, L36): the web proxies `/api/auth` and proves itself with a
// shared secret in one fixed header. In production every auth request must carry it; the client IP
// header is trusted only next to a valid secret; the secret never reaches Better Auth. Better Auth's
// own handler runs with the in-memory database adapter: no network and no database.

const AUTH_BASE_URL = "http://localhost:3000";
const AUTH_PATH = "/api/auth";
const CLIENT_IP_HEADER = "x-invitame-client-ip";
const REFUSED = { status: 403, body: { code: "FORBIDDEN", message: "Forbidden." } };
const REQUIRED_MESSAGE =
  "AUTH_PROXY_SECRET is required to serve authentication requests unless the proxy secret requirement is turned off.";
const UNAVAILABLE = {
  status: 503,
  body: {
    code: "SERVICE_UNAVAILABLE",
    message: "Service temporarily unavailable. Try again later.",
  },
};

type MemoryDatabase = Record<string, Record<string, unknown>[]>;

interface HarnessOptions {
  proxySecret?: string;
  previousProxySecret?: string;
  /** Always explicit: `"omitted"` leaves the option out, to prove the default (S46). */
  requireProxySecret: boolean | "omitted";
  requireClientIp?: boolean;
}

function createHarness(options: HarnessOptions) {
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
  const auth = createAuth({
    secret: randomBytes(32).toString("base64url"),
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [AUTH_BASE_URL],
    database: memoryAdapter(database),
    signInCodes: new SignInCodeSender(new EmailDeliveryService(sender, runtime), tasks),
    clientIp: { header: CLIENT_IP_HEADER, trustedProxies: [] },
    requireClientIp: options.requireClientIp ?? false,
    proxySecret: options.proxySecret,
    previousProxySecret: options.previousProxySecret,
    ...(options.requireProxySecret === "omitted"
      ? {}
      : { requireProxySecret: options.requireProxySecret }),
    log: (event) => events.push(event),
  });

  function requestCode(email: string, headers: Record<string, string>): Promise<Response> {
    return auth.handler(
      new Request(`${AUTH_BASE_URL}${AUTH_PATH}${SIGN_IN_CODE_REQUEST_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: AUTH_BASE_URL, ...headers },
        body: JSON.stringify({ email, type: "sign-in" }),
      }),
    );
  }

  function rateLimitKeys(): string[] {
    return (database.rateLimit ?? []).map((row) => String(row.key));
  }

  return { database, sender, tasks, events, requestCode, rateLimitKeys };
}

async function outcome(response: Response): Promise<{ status: number; body: unknown }> {
  return { status: response.status, body: await response.json() };
}

let emailCounter = 0;
function newEmail(label: string): string {
  emailCounter += 1;
  return `t8b-${label}-${emailCounter}@example.test`;
}

/** A Better Auth stand-in that records each request it receives. */
function recordingHandler() {
  const received: Request[] = [];
  const handler = async (request: Request): Promise<Response> => {
    received.push(request);
    return Response.json({ body: await request.text() });
  };
  return { received, handler };
}

describe("production: every auth request carries the proxy secret (L36)", () => {
  it("refuses a request without the secret or with a wrong one before any endpoint runs", async () => {
    const secret = randomBytes(32).toString("base64url");
    const harness = createHarness({
      proxySecret: secret,
      requireProxySecret: true,
      requireClientIp: true,
    });
    const email = newEmail("refused");
    const attempts: Record<string, string>[] = [
      {},
      { [AUTH_PROXY_SECRET_HEADER]: "" },
      { [AUTH_PROXY_SECRET_HEADER]: randomBytes(32).toString("base64url") },
      { [AUTH_PROXY_SECRET_HEADER]: secret.slice(0, -1) },
      { [AUTH_PROXY_SECRET_HEADER]: `${secret}x` },
      { [AUTH_PROXY_SECRET_HEADER]: secret.toUpperCase() },
    ];

    for (const headers of attempts) {
      const response = await harness.requestCode(email, {
        ...headers,
        [CLIENT_IP_HEADER]: "203.0.113.10",
      });
      const text = await response.text();

      assert.equal(response.status, REFUSED.status);
      assert.deepEqual(JSON.parse(text), REFUSED.body);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(response.headers.getSetCookie(), []);
      assert.ok(!text.includes(secret.slice(0, 8)));
    }
    await harness.tasks.drain();

    assert.deepEqual(harness.database.rateLimit, [], "no rate-limit token was consumed");
    assert.equal(harness.database.verification?.length, 0, "no code was issued");
    assert.equal(harness.sender.attempts.length, 0, "no email was sent");
    assert.deepEqual(
      harness.events,
      attempts.map(() => ({
        event: AUTH_REQUEST_EVENT.PROXY_REJECTED,
        path: `${AUTH_PATH}${SIGN_IN_CODE_REQUEST_PATH}`,
      })),
    );
    assert.ok(!JSON.stringify(harness.events).includes(secret), "the secret is never logged");
  });

  it("serves a request with the secret and keys its rate limit by the forwarded client IP", async () => {
    const secret = randomBytes(32).toString("base64url");
    const harness = createHarness({
      proxySecret: secret,
      requireProxySecret: true,
      requireClientIp: true,
    });

    const response = await harness.requestCode(newEmail("served"), {
      [AUTH_PROXY_SECRET_HEADER]: secret,
      [CLIENT_IP_HEADER]: "203.0.113.11",
    });
    await harness.tasks.drain();

    assert.deepEqual(await outcome(response), { status: 200, body: { success: true } });
    assert.ok(harness.rateLimitKeys().includes(`203.0.113.11|${SIGN_IN_CODE_REQUEST_PATH}`));
    assert.equal(harness.database.verification?.length, 1, "the code was issued");
    assert.deepEqual(harness.events, []);
  });

  it("keeps the generic 503 for a proxied request whose client IP cannot be resolved (S19)", async () => {
    const secret = randomBytes(32).toString("base64url");
    const harness = createHarness({
      proxySecret: secret,
      requireProxySecret: true,
      requireClientIp: true,
    });

    const response = await harness.requestCode(newEmail("no-ip"), {
      [AUTH_PROXY_SECRET_HEADER]: secret,
    });
    await harness.tasks.drain();

    assert.deepEqual(await outcome(response), UNAVAILABLE);
    assert.deepEqual(harness.events, [
      {
        event: AUTH_REQUEST_EVENT.CLIENT_IP_UNRESOLVED,
        path: `${AUTH_PATH}${SIGN_IN_CODE_REQUEST_PATH}`,
      },
    ]);
    assert.equal(harness.database.verification?.length, 0);
  });

  it("refuses to build when production requires the secret and none is configured", () => {
    assert.throws(() => createHarness({ requireProxySecret: true }), {
      message: REQUIRED_MESSAGE,
    });
  });
});

describe("the proxy secret is required unless a caller turns it off (S46, L71)", () => {
  it("refuses a request without the secret when the option is omitted, and serves one with it", async () => {
    const secret = randomBytes(32).toString("base64url");
    const harness = createHarness({ proxySecret: secret, requireProxySecret: "omitted" });
    const path = `${AUTH_PATH}${SIGN_IN_CODE_REQUEST_PATH}`;

    const refused = await harness.requestCode(newEmail("omitted"), {});
    const wrong = await harness.requestCode(newEmail("omitted-wrong"), {
      [AUTH_PROXY_SECRET_HEADER]: randomBytes(32).toString("base64url"),
    });
    const served = await harness.requestCode(newEmail("omitted-ok"), {
      [AUTH_PROXY_SECRET_HEADER]: secret,
    });
    await harness.tasks.drain();

    assert.deepEqual(await outcome(refused), REFUSED);
    assert.deepEqual(await outcome(wrong), REFUSED);
    assert.equal(served.status, 200);
    assert.deepEqual(harness.events, [
      { event: AUTH_REQUEST_EVENT.PROXY_REJECTED, path },
      { event: AUTH_REQUEST_EVENT.PROXY_REJECTED, path },
    ]);
  });

  it("refuses to build when the option is omitted and no secret is configured", () => {
    assert.throws(() => createHarness({ requireProxySecret: "omitted" }), {
      message: REQUIRED_MESSAGE,
    });
  });

  it("still builds and serves without a secret when a caller turns the requirement off explicitly", async () => {
    const harness = createHarness({ requireProxySecret: false });

    const response = await harness.requestCode(newEmail("explicit-off"), {});
    await harness.tasks.drain();

    assert.equal(response.status, 200);
    assert.deepEqual(harness.events, []);
  });
});

describe("a previous secret is accepted while a rotation lasts (S47, L71)", () => {
  it("serves a request with either secret and refuses any other, in production", async () => {
    const current = randomBytes(32).toString("base64url");
    const previous = randomBytes(32).toString("base64url");
    const harness = createHarness({
      proxySecret: current,
      previousProxySecret: previous,
      requireProxySecret: true,
      requireClientIp: true,
    });

    const withCurrent = await harness.requestCode(newEmail("rot-current"), {
      [AUTH_PROXY_SECRET_HEADER]: current,
      [CLIENT_IP_HEADER]: "203.0.113.21",
    });
    const withPrevious = await harness.requestCode(newEmail("rot-previous"), {
      [AUTH_PROXY_SECRET_HEADER]: previous,
      [CLIENT_IP_HEADER]: "203.0.113.22",
    });
    const attempts: Record<string, string>[] = [
      {},
      { [AUTH_PROXY_SECRET_HEADER]: randomBytes(32).toString("base64url") },
      { [AUTH_PROXY_SECRET_HEADER]: previous.slice(0, -1) },
      { [AUTH_PROXY_SECRET_HEADER]: `${current}${previous}` },
    ];
    const refused = [];
    for (const headers of attempts) {
      refused.push(
        await outcome(
          await harness.requestCode(newEmail("rot-refused"), {
            ...headers,
            [CLIENT_IP_HEADER]: "203.0.113.23",
          }),
        ),
      );
    }
    await harness.tasks.drain();

    assert.equal(withCurrent.status, 200);
    assert.equal(withPrevious.status, 200);
    assert.deepEqual(
      refused,
      attempts.map(() => REFUSED),
    );
    const keys = harness.rateLimitKeys();
    assert.ok(keys.includes(`203.0.113.21|${SIGN_IN_CODE_REQUEST_PATH}`));
    assert.ok(keys.includes(`203.0.113.22|${SIGN_IN_CODE_REQUEST_PATH}`));
    assert.ok(!keys.some((key) => key.startsWith("203.0.113.23|")));
    assert.ok(!JSON.stringify(harness.events).includes(previous), "no secret is logged");
  });

  it("trusts the client IP header next to the previous secret only, and never forwards the secret header", async () => {
    const current = randomBytes(32).toString("base64url");
    const previous = randomBytes(32).toString("base64url");
    const { received, handler } = recordingHandler();
    const guarded = guardAuthHandler(handler, {
      log: () => {},
      proxy: {
        secret: current,
        previousSecret: previous,
        required: false,
        clientIpHeader: CLIENT_IP_HEADER,
      },
    });

    for (const [ip, header] of [
      ["198.51.100.80", previous],
      ["198.51.100.81", current],
      ["198.51.100.82", "wrong"],
    ] as const) {
      await guarded(
        new Request(`${AUTH_BASE_URL}${AUTH_PATH}/ok`, {
          headers: { [CLIENT_IP_HEADER]: ip, [AUTH_PROXY_SECRET_HEADER]: header },
        }),
      );
    }

    assert.deepEqual(
      received.map((request) => request.headers.get(CLIENT_IP_HEADER)),
      ["198.51.100.80", "198.51.100.81", null],
    );
    assert.ok(received.every((request) => request.headers.get(AUTH_PROXY_SECRET_HEADER) === null));
  });

  it("refuses a secret that was accepted as the previous one once it is removed from the configuration", async () => {
    const current = randomBytes(32).toString("base64url");
    const rotating = randomBytes(32).toString("base64url");
    const headers = { [AUTH_PROXY_SECRET_HEADER]: rotating, [CLIENT_IP_HEADER]: "203.0.113.24" };
    const during = createHarness({
      proxySecret: current,
      previousProxySecret: rotating,
      requireProxySecret: true,
      requireClientIp: true,
    });
    const after = createHarness({
      proxySecret: current,
      requireProxySecret: true,
      requireClientIp: true,
    });

    const accepted = await during.requestCode(newEmail("rot-during"), headers);
    const refused = await after.requestCode(newEmail("rot-removed"), headers);
    await during.tasks.drain();

    assert.equal(accepted.status, 200, "the value is accepted while it is the previous secret");
    assert.deepEqual(await outcome(refused), REFUSED);
    assert.deepEqual(after.events, [
      {
        event: AUTH_REQUEST_EVENT.PROXY_REJECTED,
        path: `${AUTH_PATH}${SIGN_IN_CODE_REQUEST_PATH}`,
      },
    ]);
  });

  it("refuses to build with a previous secret and no current one, so no client IP is ever trusted", () => {
    const previous = randomBytes(32).toString("base64url");
    const message = "AUTH_PROXY_SECRET_PREVIOUS requires AUTH_PROXY_SECRET.";

    // `required: false` is the case that used to build: the IP header was trusted with no valid secret.
    assert.throws(
      () =>
        guardAuthHandler(async () => Response.json({ ok: true }), {
          log: () => {},
          proxy: {
            secret: undefined,
            previousSecret: previous,
            required: false,
            clientIpHeader: CLIENT_IP_HEADER,
          },
        }),
      { message },
    );
    for (const requireProxySecret of [false, true, "omitted"] as const) {
      assert.throws(
        () => createHarness({ previousProxySecret: previous, requireProxySecret }),
        { message },
        `requireProxySecret: ${requireProxySecret}`,
      );
    }
  });
});

describe("the client IP header is trusted only next to a valid secret (L36)", () => {
  it("ignores a client IP header sent without the secret, so a direct caller cannot pick its bucket", async () => {
    const secret = randomBytes(32).toString("base64url");
    // A configured secret that is not required: local development with the web proxy in front.
    const harness = createHarness({ proxySecret: secret, requireProxySecret: false });

    const forged = await harness.requestCode(newEmail("forged"), {
      [CLIENT_IP_HEADER]: "198.51.100.66",
    });
    const wrong = await harness.requestCode(newEmail("wrong"), {
      [AUTH_PROXY_SECRET_HEADER]: "not-the-secret",
      [CLIENT_IP_HEADER]: "198.51.100.67",
    });
    const proxied = await harness.requestCode(newEmail("proxied"), {
      [AUTH_PROXY_SECRET_HEADER]: secret,
      [CLIENT_IP_HEADER]: "198.51.100.68",
    });
    await harness.tasks.drain();

    for (const response of [forged, wrong, proxied]) {
      assert.equal(response.status, 200);
    }
    const keys = harness.rateLimitKeys();
    assert.ok(!keys.some((key) => key.startsWith("198.51.100.66|")), "forged IP is ignored");
    assert.ok(!keys.some((key) => key.startsWith("198.51.100.67|")), "wrong secret: IP ignored");
    assert.ok(keys.includes(`198.51.100.68|${SIGN_IN_CODE_REQUEST_PATH}`), "proxied IP is used");
  });

  it("removes the client IP header without a valid secret before the handler sees it", async () => {
    const secret = randomBytes(32).toString("base64url");
    const { received, handler } = recordingHandler();
    const guarded = guardAuthHandler(handler, {
      log: () => {},
      proxy: { secret, required: false, clientIpHeader: CLIENT_IP_HEADER },
    });

    await guarded(
      new Request(`${AUTH_BASE_URL}${AUTH_PATH}/ok`, {
        headers: { [CLIENT_IP_HEADER]: "198.51.100.70", [AUTH_PROXY_SECRET_HEADER]: "wrong" },
      }),
    );
    await guarded(
      new Request(`${AUTH_BASE_URL}${AUTH_PATH}/ok`, {
        headers: { [CLIENT_IP_HEADER]: "198.51.100.71", [AUTH_PROXY_SECRET_HEADER]: secret },
      }),
    );

    assert.equal(received.length, 2);
    assert.equal(received[0]?.headers.get(CLIENT_IP_HEADER), null);
    assert.equal(received[1]?.headers.get(CLIENT_IP_HEADER), "198.51.100.71");
  });
});

describe("the secret header never reaches Better Auth (L36)", () => {
  it("removes the secret header and keeps the method, URL, other headers, and body", async () => {
    const secret = randomBytes(32).toString("base64url");
    const { received, handler } = recordingHandler();
    const guarded = guardAuthHandler(handler, {
      log: () => {},
      proxy: { secret, required: true, clientIpHeader: CLIENT_IP_HEADER },
    });
    const url = `${AUTH_BASE_URL}${AUTH_PATH}${SIGN_IN_CODE_REQUEST_PATH}?a=1`;

    const response = await guarded(
      new Request(url, {
        method: "POST",
        headers: {
          [AUTH_PROXY_SECRET_HEADER]: secret,
          [CLIENT_IP_HEADER]: "203.0.113.12",
          "content-type": "application/json",
          cookie: "better-auth.session_token=abc",
        },
        body: '{"email":"a@example.test"}',
      }),
    );

    assert.deepEqual(await response.json(), { body: '{"email":"a@example.test"}' });
    const forwarded = received[0];
    assert.ok(forwarded);
    assert.equal(forwarded.method, "POST");
    assert.equal(forwarded.url, url);
    assert.equal(forwarded.headers.get(AUTH_PROXY_SECRET_HEADER), null);
    assert.equal(forwarded.headers.get(CLIENT_IP_HEADER), "203.0.113.12");
    assert.equal(forwarded.headers.get("content-type"), "application/json");
    assert.equal(forwarded.headers.get("cookie"), "better-auth.session_token=abc");
  });

  it("removes a stray secret header when no secret is configured", async () => {
    const { received, handler } = recordingHandler();
    const guarded = guardAuthHandler(handler, {
      log: () => {},
      proxy: { secret: undefined, required: false, clientIpHeader: CLIENT_IP_HEADER },
    });

    await guarded(
      new Request(`${AUTH_BASE_URL}${AUTH_PATH}/ok`, {
        headers: { [AUTH_PROXY_SECRET_HEADER]: "anything", [CLIENT_IP_HEADER]: "203.0.113.13" },
      }),
    );

    assert.equal(received[0]?.headers.get(AUTH_PROXY_SECRET_HEADER), null);
  });
});

describe("local development without a proxy secret (L36)", () => {
  it("keeps serving requests and trusting the client IP header as before", async () => {
    const harness = createHarness({ requireProxySecret: false });

    const response = await harness.requestCode(newEmail("dev"), {
      [CLIENT_IP_HEADER]: "203.0.113.14",
    });
    await harness.tasks.drain();

    assert.deepEqual(await outcome(response), { status: 200, body: { success: true } });
    assert.ok(harness.rateLimitKeys().includes(`203.0.113.14|${SIGN_IN_CODE_REQUEST_PATH}`));
    assert.deepEqual(harness.events, []);
  });
});

describe("the path in guard events is bounded (N5, L79)", () => {
  const LONG_PATH = `${AUTH_PATH}/${"a".repeat(10_000)}`;
  const QUERY = "token=secret-value&email=a@example.test";

  function longRequest(headers: Record<string, string> = {}): Request {
    return new Request(`${AUTH_BASE_URL}${LONG_PATH}?${QUERY}`, { headers });
  }

  function assertBounded(events: readonly AuthRequestEvent[], event: string): void {
    assert.equal(events.length, 1);
    const [logged] = events;
    assert.equal(logged?.event, event);
    const { path } = logged as { path: string };
    assert.equal(path.length, 128);
    assert.equal(path, LONG_PATH.slice(0, 128));
    assert.ok(!JSON.stringify(logged).includes("token="), "no query string is logged");
    assert.ok(!JSON.stringify(logged).includes("secret-value"));
  }

  it("cuts the path of auth_proxy_rejected at 128 characters and drops the query", async () => {
    const events: AuthRequestEvent[] = [];
    const guarded = guardAuthHandler(async () => Response.json({ ok: true }), {
      log: (event) => events.push(event),
      proxy: { secret: "s".repeat(32), required: true, clientIpHeader: CLIENT_IP_HEADER },
    });

    assert.equal((await guarded(longRequest())).status, 403);
    assertBounded(events, AUTH_REQUEST_EVENT.PROXY_REJECTED);
  });

  it("cuts the path of client_ip_unresolved at 128 characters and drops the query", async () => {
    const events: AuthRequestEvent[] = [];
    const guarded = guardAuthHandler(async () => Response.json({ ok: true }), {
      log: (event) => events.push(event),
      resolveClientIp: () => null,
    });

    assert.equal((await guarded(longRequest())).status, 503);
    assertBounded(events, AUTH_REQUEST_EVENT.CLIENT_IP_UNRESOLVED);
  });

  it("cuts the path of auth_request_unavailable at 128 characters and drops the query", async () => {
    const events: AuthRequestEvent[] = [];
    const guarded = guardAuthHandler(
      async () => {
        throw new Error("store down for a@example.test");
      },
      { log: (event) => events.push(event) },
    );

    assert.equal((await guarded(longRequest())).status, 503);
    assertBounded(events, AUTH_REQUEST_EVENT.UNAVAILABLE);
  });

  it("keeps a short path whole", async () => {
    const events: AuthRequestEvent[] = [];
    const guarded = guardAuthHandler(async () => Response.json({ ok: true }), {
      log: (event) => events.push(event),
      proxy: { secret: "s".repeat(32), required: true, clientIpHeader: CLIENT_IP_HEADER },
    });

    await guarded(new Request(`${AUTH_BASE_URL}${AUTH_PATH}/ok?x=1`));

    assert.deepEqual(events, [
      { event: AUTH_REQUEST_EVENT.PROXY_REJECTED, path: `${AUTH_PATH}/ok` },
    ]);
  });
});
