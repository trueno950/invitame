import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import { proxyAuthRequest } from "./auth-proxy.ts";
import type { WebServerConfig } from "./config.ts";
import {
  API_UNAVAILABLE_HEADER,
  appendSetCookies,
  callUnlessApiUnavailable,
  isSessionPagePath,
  pageRequestHeaders,
  refreshSessionCookies,
  shouldRefreshSession,
} from "./session-refresh.ts";

// Rolling customer sessions through the web (M2 T8c; S7, L34, L37, L38). Before a signed-in page
// renders, the web runs `GET /api/auth/get-session` through its own proxy and returns every
// `Set-Cookie` to the browser. Order matters: the render's `GET /me` also refreshes the stored
// session, after which `get-session` would see a fresh session and send no cookie.

const WEB_ORIGIN = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token=token.signature";
const PROXY_SECRET = randomBytes(32).toString("base64url");
const REFRESHED_COOKIES = [
  "better-auth.session_token=token.signature; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax",
  "better-auth.session_data=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
];

function page(path: string, init: RequestInit = {}): Request {
  return new Request(`${WEB_ORIGIN}${path}`, {
    ...init,
    headers: { cookie: `theme=light; ${SESSION_COOKIE}`, ...(init.headers ?? {}) },
  });
}

describe("isSessionPagePath", () => {
  it("matches every page whose render reads the session: /ingresar, /cuenta, and paths under /cuenta", () => {
    for (const path of ["/ingresar", "/cuenta", "/cuenta/", "/cuenta/datos"]) {
      assert.equal(isSessionPagePath(path), true, path);
    }
  });

  it("does not match other paths", () => {
    for (const path of ["/", "/ingresar/x", "/cuentas", "/api/auth/get-session", "/x/cuenta"]) {
      assert.equal(isSessionPagePath(path), false, path);
    }
  });
});

describe("shouldRefreshSession", () => {
  it("refreshes a page GET of /cuenta or /ingresar that carries a Better Auth cookie", () => {
    assert.equal(shouldRefreshSession(page("/cuenta")), true);
    assert.equal(shouldRefreshSession(page("/ingresar")), true);
  });

  it("refreshes a server action's POST, whose render also reads the session", () => {
    assert.equal(shouldRefreshSession(page("/cuenta", { method: "POST" })), true);
  });

  it("skips other methods", () => {
    for (const method of ["HEAD", "PUT"]) {
      assert.equal(shouldRefreshSession(page("/cuenta", { method })), false, method);
    }
  });

  it("skips a visitor without a Better Auth cookie and other paths", () => {
    assert.equal(
      shouldRefreshSession(new Request(`${WEB_ORIGIN}/cuenta`, { headers: { cookie: "a=b" } })),
      false,
    );
    assert.equal(shouldRefreshSession(new Request(`${WEB_ORIGIN}/cuenta`)), false);
    assert.equal(shouldRefreshSession(page("/")), false);
  });
});

describe("refreshSessionCookies with a fake proxy", () => {
  it("sends one bodiless GET /api/auth/get-session with the page request's headers", async () => {
    const requests: Request[] = [];
    const { cookies } = await refreshSessionCookies(
      page("/cuenta?tab=1", { headers: { "x-real-ip": "203.0.113.7" } }),
      async (request) => {
        requests.push(request);
        return new Response(null, { status: 200 });
      },
    );

    assert.deepEqual(cookies, []);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.method, "GET");
    assert.equal(requests[0]?.url, `${WEB_ORIGIN}/api/auth/get-session`);
    assert.equal(requests[0]?.body, null);
    assert.equal(requests[0]?.headers.get("cookie"), `theme=light; ${SESSION_COOKIE}`);
    assert.equal(requests[0]?.headers.get("x-real-ip"), "203.0.113.7");
  });

  it("returns every Set-Cookie separately and unchanged, also on a 401 that clears cookies", async () => {
    for (const status of [200, 401]) {
      const headers = new Headers();
      for (const cookie of REFRESHED_COOKIES) {
        headers.append("set-cookie", cookie);
      }

      const refresh = await refreshSessionCookies(page("/cuenta"), async () => {
        return new Response("{}", { status, headers });
      });

      assert.deepEqual(
        refresh,
        { cookies: REFRESHED_COOKIES, apiUnavailable: false },
        String(status),
      );
    }
  });

  it("never throws and returns no cookie when the proxy fails", async () => {
    assert.deepEqual(
      await refreshSessionCookies(page("/cuenta"), async () => {
        throw new Error("misconfigured");
      }),
      { cookies: [], apiUnavailable: true },
    );
  });

  it("reports the API unavailable on a 5xx from the proxy, and available otherwise", async () => {
    for (const [status, apiUnavailable] of [
      [200, false],
      [401, false],
      [429, false],
      [500, true],
      [502, true],
      [504, true],
    ] as const) {
      const refresh = await refreshSessionCookies(page("/cuenta"), async () => {
        return new Response(null, { status });
      });
      assert.equal(refresh.apiUnavailable, apiUnavailable, String(status));
    }
  });
});

describe("the outage notice for the page (R4-cuenta-outage-latency-serialized)", () => {
  it("never lets a browser's own copy of the header reach the page", () => {
    const request = page("/cuenta", { headers: { [API_UNAVAILABLE_HEADER]: "1" } });

    assert.equal(pageRequestHeaders(request, false).has(API_UNAVAILABLE_HEADER), false);
    assert.equal(pageRequestHeaders(request, true).get(API_UNAVAILABLE_HEADER), "1");
    assert.equal(
      pageRequestHeaders(request, false).get("cookie"),
      `theme=light; ${SESSION_COOKIE}`,
    );
  });

  it("answers unavailable at once, without the API read, after a failed refresh", async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return "profile";
    };

    await assert.rejects(
      callUnlessApiUnavailable(new Headers({ [API_UNAVAILABLE_HEADER]: "1" }), read),
      (error: unknown) => error instanceof ApiClientError && error.kind === "unavailable",
    );
    assert.equal(reads, 0);
    assert.equal(await callUnlessApiUnavailable(new Headers(), read), "profile");
    assert.equal(reads, 1);
  });
});

describe("appendSetCookies", () => {
  it("appends each cookie as its own header and keeps existing ones", () => {
    const headers = new Headers({ "set-cookie": "existing=1; Path=/" });
    appendSetCookies(headers, REFRESHED_COOKIES);

    assert.deepEqual(headers.getSetCookie(), ["existing=1; Path=/", ...REFRESHED_COOKIES]);
  });
});

describe("refreshSessionCookies through the real proxy", () => {
  interface Received {
    method: string;
    url: string;
    headers: IncomingMessage["headers"];
  }

  let apiOrigin = "";
  let received: Received[] = [];
  let respond: (response: ServerResponse) => void = (response) => response.end();
  const server = createServer((request, response) => {
    received.push({
      method: request.method ?? "",
      url: request.url ?? "",
      headers: request.headers,
    });
    respond(response);
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
  });

  function config(): WebServerConfig {
    return {
      apiOrigin,
      proxySecret: PROXY_SECRET,
      clientIpHeader: "x-invitame-client-ip",
      edgeClientIpHeader: "x-real-ip",
    };
  }

  it("brings the API's refreshed session cookies back for the browser", async () => {
    respond = (response) => {
      response.setHeader("content-type", "application/json");
      response.setHeader("set-cookie", REFRESHED_COOKIES);
      response.end('{"session":{},"user":{}}');
    };

    const refresh = await refreshSessionCookies(
      page("/cuenta", { headers: { "x-real-ip": "203.0.113.7" } }),
      (request) => proxyAuthRequest(request, { config: config(), log: () => {} }),
    );

    assert.deepEqual(refresh, { cookies: REFRESHED_COOKIES, apiUnavailable: false });
    assert.equal(received.length, 1);
    assert.equal(received[0]?.method, "GET");
    assert.equal(received[0]?.url, "/api/auth/get-session");
    assert.equal(received[0]?.headers.cookie, `theme=light; ${SESSION_COOKIE}`);
    assert.equal(received[0]?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(received[0]?.headers["x-invitame-client-ip"], "203.0.113.7");
  });

  it("returns no cookie, without throwing, when the API does not answer in time", async () => {
    respond = () => {};

    const startedAt = Date.now();
    const refresh = await refreshSessionCookies(page("/cuenta"), (request) =>
      proxyAuthRequest(request, { config: config(), timeoutMs: 50, log: () => {} }),
    );

    assert.deepEqual(refresh, { cookies: [], apiUnavailable: true });
    assert.ok(Date.now() - startedAt < 2_000, "the page is not held beyond the timeout");
  });
});
