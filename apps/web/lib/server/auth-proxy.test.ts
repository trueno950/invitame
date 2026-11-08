import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { type AuthProxyEvent, proxyAuthRequest } from "./auth-proxy.ts";
import type { WebServerConfig } from "./config.ts";

// The web proxy for `/api/auth` (M2 T8b; S7, S14, L33, L34, L36), tested against a real local HTTP
// server that stands in for the API: no API process, no database. The secret is generated per run.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const WEB_ORIGIN = "http://localhost:3000";
const CLIENT_IP_HEADER = "x-invitame-client-ip";
const EDGE_HEADER = "x-real-ip";
const SECRET_HEADER = "x-invitame-proxy-secret";
const GENERIC_ERROR = {
  code: "SERVICE_UNAVAILABLE",
  message: "Service temporarily unavailable. Try again later.",
};

interface Received {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
}

type Responder = (request: Received, response: ServerResponse) => void;

let apiOrigin = "";
let received: Received[] = [];
let respond: Responder = (_request, response) => response.end();
const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    const entry: Received = {
      method: request.method ?? "",
      url: request.url ?? "",
      headers: request.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    };
    received.push(entry);
    respond(entry, response);
  });
});

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  apiOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received = [];
  respond = (_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end('{"ok":true}');
  };
});

function config(overrides: Partial<WebServerConfig> = {}): WebServerConfig {
  return {
    apiOrigin,
    proxySecret: PROXY_SECRET,
    clientIpHeader: CLIENT_IP_HEADER,
    edgeClientIpHeader: EDGE_HEADER,
    ...overrides,
  };
}

function browserRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`${WEB_ORIGIN}${path}`, init);
}

function proxy(
  request: Request,
  options: { config?: WebServerConfig; timeoutMs?: number; events?: AuthProxyEvent[] } = {},
): Promise<Response> {
  const events = options.events ?? [];
  return proxyAuthRequest(request, {
    config: options.config ?? config(),
    log: (event) => events.push(event),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
}

describe("forwarding to the API", () => {
  it("forwards the path and query to the API's /api/auth and returns its status and body", async () => {
    respond = (_request, response) => {
      response.writeHead(201, { "content-type": "application/json", "x-upstream": "yes" });
      response.end('{"created":true}');
    };

    const response = await proxy(browserRequest("/api/auth/two-factor/enable?x=1&y=two"));

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { created: true });
    assert.equal(response.headers.get("x-upstream"), "yes");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(received.length, 1);
    assert.equal(received[0]?.method, "GET");
    assert.equal(received[0]?.url, "/api/auth/two-factor/enable?x=1&y=two");
  });

  it("forwards a POST body unchanged", async () => {
    const body = JSON.stringify({ email: "persona@example.test", type: "sign-in" });

    await proxy(
      browserRequest("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "content-type": "application/json", origin: WEB_ORIGIN },
        body,
      }),
    );

    assert.equal(received[0]?.method, "POST");
    assert.equal(received[0]?.body, body);
    assert.equal(received[0]?.headers["content-type"], "application/json");
  });

  it("forwards only allow-listed request headers, never host or hop-by-hop headers", async () => {
    await proxy(
      browserRequest("/api/auth/get-session", {
        headers: {
          accept: "application/json",
          "accept-language": "es-MX",
          cookie: "better-auth.session_token=abc; other=1",
          origin: WEB_ORIGIN,
          "user-agent": "Browser/1.0",
          authorization: "Bearer not-forwarded",
          connection: "keep-alive, x-hop",
          "keep-alive": "timeout=5",
          "proxy-authorization": "Basic eA==",
          "x-hop": "1",
          "x-forwarded-host": "evil.example.test",
          "x-custom": "dropped",
          referer: `${WEB_ORIGIN}/private?token=1`,
        },
      }),
    );

    const headers = received[0]?.headers ?? {};
    assert.equal(headers.accept, "application/json");
    assert.equal(headers["accept-language"], "es-MX");
    assert.equal(headers.cookie, "better-auth.session_token=abc; other=1");
    assert.equal(headers.origin, WEB_ORIGIN);
    assert.equal(headers["user-agent"], "Browser/1.0");
    assert.equal(headers.host, new URL(apiOrigin).host, "the API sees its own host");
    for (const name of [
      "authorization",
      "keep-alive",
      "proxy-authorization",
      "x-hop",
      "x-forwarded-host",
      "x-custom",
      "referer",
    ]) {
      assert.equal(headers[name], undefined, `${name} is not forwarded`);
    }
  });

  it("refuses paths outside /api/auth without calling the API", async () => {
    for (const path of ["/api/me", "/api/auth", "/api/authx/ok", "/api/auth/%2e%2e/%2e%2e/me"]) {
      const response = await proxy(browserRequest(path));
      assert.equal(response.status, 404, path);
    }
    assert.equal(received.length, 0);
  });
});

describe("client IP and proxy secret (L36)", () => {
  it("sets its own secret and the client IP from the edge header, replacing browser copies", async () => {
    await proxy(
      browserRequest("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: {
          [EDGE_HEADER]: "203.0.113.7",
          [CLIENT_IP_HEADER]: "198.51.100.1",
          [SECRET_HEADER]: "browser-guess",
          "x-forwarded-for": "198.51.100.2",
        },
        body: "{}",
      }),
    );

    const headers = received[0]?.headers ?? {};
    assert.equal(headers[CLIENT_IP_HEADER], "203.0.113.7");
    assert.equal(headers[SECRET_HEADER], PROXY_SECRET);
    assert.equal(headers["x-forwarded-for"], undefined);
    assert.equal(headers[EDGE_HEADER], undefined);
  });

  it("never passes a browser-supplied client IP or secret when the edge gives no usable IP", async () => {
    for (const edgeValue of [undefined, "not-an-ip", "203.0.113.8, 198.51.100.3"]) {
      received = [];
      const headers: Record<string, string> = {
        [CLIENT_IP_HEADER]: "198.51.100.4",
        [SECRET_HEADER]: "browser-guess",
      };
      if (edgeValue !== undefined) {
        headers[EDGE_HEADER] = edgeValue;
      }

      await proxy(browserRequest("/api/auth/get-session", { headers }));

      assert.equal(received[0]?.headers[CLIENT_IP_HEADER], undefined, String(edgeValue));
      assert.equal(received[0]?.headers[SECRET_HEADER], PROXY_SECRET);
    }
  });

  it("sends no secret when none is configured, and drops a browser copy", async () => {
    await proxy(
      browserRequest("/api/auth/get-session", { headers: { [SECRET_HEADER]: "browser-guess" } }),
      { config: config({ proxySecret: undefined }) },
    );

    assert.equal(received[0]?.headers[SECRET_HEADER], undefined);
  });

  it("can read the client IP from the same header name it sets", async () => {
    await proxy(browserRequest("/api/auth/get-session", { headers: { "x-real-ip": "::1" } }), {
      config: config({ clientIpHeader: "x-real-ip", edgeClientIpHeader: "x-real-ip" }),
    });

    assert.equal(received[0]?.headers["x-real-ip"], "::1");
  });
});

describe("responses", () => {
  it("passes every Set-Cookie unchanged, so a refreshed session reaches the browser (L34)", async () => {
    const cookies = [
      "__Host-better-auth.session_token=new.signed; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax",
      "__Host-better-auth.session_data=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
      "__Host-better-auth.dont_remember=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    ];
    respond = (_request, response) => {
      response.setHeader("set-cookie", cookies);
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"session":{},"user":{}}');
    };

    const response = await proxy(
      browserRequest("/api/auth/get-session", {
        headers: { cookie: "__Host-better-auth.session_token=old.signed" },
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.headers.getSetCookie(), cookies);
    assert.equal(received[0]?.headers.cookie, "__Host-better-auth.session_token=old.signed");
  });

  it("returns a redirect as is instead of following it", async () => {
    respond = (_request, response) => {
      response.writeHead(302, { location: `${WEB_ORIGIN}/cuenta`, "set-cookie": "a=1; Path=/" });
      response.end();
    };

    const response = await proxy(browserRequest("/api/auth/callback"));

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), `${WEB_ORIGIN}/cuenta`);
    assert.deepEqual(response.headers.getSetCookie(), ["a=1; Path=/"]);
    assert.equal(received.length, 1);
  });

  it("drops hop-by-hop response headers and overrides caching", async () => {
    respond = (_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "public, max-age=600",
        connection: "x-hop-response",
        "x-hop-response": "1",
        "proxy-authenticate": "Basic",
        upgrade: "h2c",
      });
      response.end("{}");
    };

    const response = await proxy(browserRequest("/api/auth/ok"));

    assert.equal(response.headers.get("cache-control"), "no-store");
    for (const name of ["connection", "x-hop-response", "proxy-authenticate", "upgrade"]) {
      assert.equal(response.headers.get(name), null, name);
    }
    assert.equal(response.headers.get("content-type"), "application/json");
  });

  it("passes 4xx answers through, such as a rate limit", async () => {
    respond = (_request, response) => {
      response.writeHead(429, { "content-type": "application/json", "x-retry-after": "60" });
      response.end('{"message":"Too many requests. Please try again later."}');
    };

    const response = await proxy(browserRequest("/api/auth/sign-in/email-otp", { method: "POST" }));

    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), {
      message: "Too many requests. Please try again later.",
    });
    assert.equal(response.headers.get("x-retry-after"), "60");
  });
});

describe("bounds and failures", () => {
  it("serves only GET and POST", async () => {
    for (const method of ["PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      const response = await proxy(browserRequest("/api/auth/get-session", { method }));
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get("allow"), "GET, POST");
    }
    assert.equal(received.length, 0);
  });

  it("answers 413 for a body over 16 KiB without calling the API", async () => {
    const declared = await proxy(
      browserRequest("/api/auth/sign-in/email", {
        method: "POST",
        body: "x".repeat(16 * 1024 + 1),
      }),
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let chunk = 0; chunk < 20; chunk += 1) {
          controller.enqueue(new Uint8Array(1024).fill(120));
        }
        controller.close();
      },
    });
    const streamed = await proxy(
      new Request(`${WEB_ORIGIN}/api/auth/sign-in/email`, {
        method: "POST",
        body: stream,
        duplex: "half",
      } as RequestInit),
    );

    for (const response of [declared, streamed]) {
      assert.equal(response.status, 413);
      assert.deepEqual(await response.json(), {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body too large.",
      });
    }
    assert.equal(received.length, 0);

    const exact = await proxy(
      browserRequest("/api/auth/sign-in/email", { method: "POST", body: "x".repeat(16 * 1024) }),
    );
    assert.equal(exact.status, 200);
    assert.equal(received[0]?.body.length, 16 * 1024);
  });

  it("answers a generic 504 when the API does not answer in time", async () => {
    respond = () => {
      // Never answers; the proxy's own timeout must end the request.
    };
    const events: AuthProxyEvent[] = [];

    const response = await proxy(browserRequest("/api/auth/get-session"), {
      timeoutMs: 50,
      events,
    });

    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), GENERIC_ERROR);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(events, [
      { event: "auth_proxy_upstream_failed", path: "/api/auth/get-session", reason: "timeout" },
    ]);
  });

  it("answers a generic 502 when the API is unreachable", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const events: AuthProxyEvent[] = [];

    const response = await proxy(browserRequest("/api/auth/get-session?token=secret-value"), {
      config: config({ apiOrigin: origin }),
      events,
    });

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), GENERIC_ERROR);
    assert.deepEqual(events, [
      { event: "auth_proxy_upstream_failed", path: "/api/auth/get-session", reason: "unreachable" },
    ]);
  });

  it("replaces a failing API's body and cookies with the generic error", async () => {
    respond = (_request, response) => {
      response.writeHead(500, {
        "content-type": "application/json",
        "set-cookie": "a=1; Path=/",
      });
      response.end('{"message":"select * from \\"User\\" failed"}');
    };
    const events: AuthProxyEvent[] = [];

    const response = await proxy(browserRequest("/api/auth/get-session"), { events });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), GENERIC_ERROR);
    assert.deepEqual(response.headers.getSetCookie(), []);
    assert.deepEqual(events, [
      {
        event: "auth_proxy_upstream_failed",
        path: "/api/auth/get-session",
        reason: "status",
        status: 500,
      },
    ]);
  });

  // Bounded well below the proxy's own 5-second timeout, so a regression fails in about 2 seconds
  // instead of waiting on the API or hanging the suite (R3-abort-test-hangs-on-regression).
  it("stops the API call when the browser goes away, and logs no upstream failure", {
    timeout: 2_000,
  }, async () => {
    let upstreamClosed: () => void = () => {};
    const closed = new Promise<void>((resolve) => {
      upstreamClosed = resolve;
    });
    respond = (_request, response) => {
      // Never answers; the web hop must close this request once the browser has gone.
      response.on("close", () => upstreamClosed());
    };
    const browser = new AbortController();
    const events: AuthProxyEvent[] = [];
    const startedAt = Date.now();

    const answer = proxy(browserRequest("/api/auth/get-session", { signal: browser.signal }), {
      timeoutMs: 5_000,
      events,
    });
    while (received.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    browser.abort();
    await closed;
    const response = await answer;

    assert.ok(Date.now() - startedAt < 2_000, "the API call ends with the browser's request");
    // 499 is the client-closed-request status: server error metrics do not count a cancellation (S51).
    assert.equal(response.status, 499);
    assert.deepEqual(await response.json(), GENERIC_ERROR);
    assert.deepEqual(events, []);
  });

  it("never logs cookies, bodies, query strings, or the secret", async () => {
    respond = (_request, response) => {
      response.writeHead(503, { "content-type": "application/json" });
      response.end('{"code":"SERVICE_UNAVAILABLE"}');
    };
    const events: AuthProxyEvent[] = [];

    await proxy(
      browserRequest("/api/auth/sign-in/email-otp?code=123456", {
        method: "POST",
        headers: { cookie: "better-auth.session_token=cookie-value" },
        body: '{"email":"persona@example.test","otp":"654321"}',
      }),
      { events },
    );

    const logged = JSON.stringify(events);
    for (const fragment of [
      "cookie-value",
      "persona@example.test",
      "654321",
      "123456",
      PROXY_SECRET,
    ]) {
      assert.ok(!logged.includes(fragment), fragment);
    }
  });
});
