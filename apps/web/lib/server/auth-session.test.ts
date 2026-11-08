import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import { AUTH_SESSION_PATH, parseAuthSession, readAuthSession } from "./auth-session.ts";
import { createServerLog, logApiCallFailure, SERVER_LOG_EVENT } from "./server-log.ts";

// The server-side session read of the administrator pages (M2 T8d; S6, S21, L34). It runs
// `GET /api/auth/get-session?disableRefresh=true` through the web's own `/api/auth` proxy, so the
// client IP and the proxy secret reach the API as on a browser request, and the stored session is
// never moved by a render that cannot pass a refreshed cookie to the browser.

const COOKIE = "better-auth.session_token=signed.value";

function headers(init: Record<string, string> = {}): Headers {
  return new Headers({ cookie: COOKIE, "x-edge-client-ip": "203.0.113.7", ...init });
}

function fakeProxy(respond: (request: Request) => Response | Promise<Response>) {
  const requests: Request[] = [];
  const proxy = async (request: Request) => {
    requests.push(request);
    return respond(request);
  };
  return { proxy, requests };
}

const SESSION = {
  session: { id: "s1", expiresAt: "2026-11-06T12:00:00.000Z" },
  user: {
    id: "u1",
    email: "admin@example.test",
    role: "ADMIN",
    status: "ACTIVE",
    twoFactorEnabled: false,
    displayName: null,
  },
};

describe("parseAuthSession", () => {
  it("keeps only the email, the role, and whether two-factor is enabled", () => {
    assert.deepEqual(parseAuthSession(SESSION), {
      email: "admin@example.test",
      role: "ADMIN",
      twoFactorEnabled: false,
    });
  });

  it("reads null as no session", () => {
    assert.equal(parseAuthSession(null), null);
  });

  it("counts two-factor as enabled only for the boolean true", () => {
    for (const value of [undefined, null, "true", 1]) {
      const parsed = parseAuthSession({
        ...SESSION,
        user: { ...SESSION.user, twoFactorEnabled: value },
      });
      assert.equal(parsed?.twoFactorEnabled, false, String(value));
    }
    const enrolled = parseAuthSession({
      ...SESSION,
      user: { ...SESSION.user, twoFactorEnabled: true },
    });
    assert.equal(enrolled?.twoFactorEnabled, true);
  });

  it("refuses a body without a user, an email, or a known role", () => {
    for (const body of [
      {},
      "text",
      { session: {} },
      { user: { ...SESSION.user, email: 7 } },
      { user: { ...SESSION.user, role: "OWNER" } },
      { user: { ...SESSION.user, role: undefined } },
    ]) {
      assert.equal(parseAuthSession(body), undefined, JSON.stringify(body));
    }
  });
});

describe("readAuthSession", () => {
  it("answers signed out without calling the API when no Better Auth cookie is present", async () => {
    const { proxy, requests } = fakeProxy(() => Response.json(SESSION));
    const result = await readAuthSession(new Headers({ cookie: "theme=light" }), proxy);

    assert.deepEqual(result, { signedIn: false });
    assert.equal(requests.length, 0);
  });

  it("asks the proxy for the session without a refresh, with the page request's headers", async () => {
    const { proxy, requests } = fakeProxy(() => Response.json(SESSION));
    const result = await readAuthSession(headers(), proxy);

    assert.deepEqual(result, {
      signedIn: true,
      value: { email: "admin@example.test", role: "ADMIN", twoFactorEnabled: false },
    });
    assert.equal(requests.length, 1);
    const url = new URL(requests[0]?.url ?? "");
    assert.equal(`${url.pathname}${url.search}`, AUTH_SESSION_PATH);
    assert.equal(AUTH_SESSION_PATH, "/api/auth/get-session?disableRefresh=true");
    assert.equal(requests[0]?.method, "GET");
    assert.equal(requests[0]?.headers.get("cookie"), COOKIE);
    assert.equal(requests[0]?.headers.get("x-edge-client-ip"), "203.0.113.7");
  });

  it("answers signed out for a null session and for a 401", async () => {
    for (const response of [Response.json(null), Response.json({ code: "X" }, { status: 401 })]) {
      const { proxy } = fakeProxy(() => response);
      assert.deepEqual(await readAuthSession(headers(), proxy), { signedIn: false });
    }
  });

  it("keeps the proxy's failure as the cause and logs its class only (S50, L71)", async () => {
    const failure = new TypeError(
      "fetch failed for admin@example.test with better-auth.session_token=abc",
    );
    const { proxy } = fakeProxy(() => {
      throw failure;
    });
    const lines: string[] = [];

    await assert.rejects(
      logApiCallFailure(
        SERVER_LOG_EVENT.AUTH_SESSION_READ_FAILED,
        () => readAuthSession(headers(), proxy),
        createServerLog((line) => lines.push(line)),
      ),
      (error: unknown) =>
        error instanceof ApiClientError && error.kind === "unavailable" && error.cause === failure,
    );

    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0] ?? ""), {
      event: "auth_session_read_failed",
      error: "ApiClientError",
      kind: "unavailable",
      cause: "TypeError",
    });
    assert.doesNotMatch(lines[0] ?? "", /admin@example|session_token|abc|fetch failed/);
  });

  it("logs no cause for a failure that is an answer, such as a 503 or a body that fits no contract", async () => {
    for (const response of [
      Response.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 }),
      new Response("<html>", { status: 200 }),
    ]) {
      const { proxy } = fakeProxy(() => response);
      const lines: string[] = [];

      await assert.rejects(
        logApiCallFailure(
          SERVER_LOG_EVENT.AUTH_SESSION_READ_FAILED,
          () => readAuthSession(headers(), proxy),
          createServerLog((line) => lines.push(line)),
        ),
      );

      const logged = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
      assert.deepEqual(Object.keys(logged).sort(), ["error", "event", "kind"]);
    }
  });

  it("throws a typed error, never the body, for every other answer", async () => {
    const cases: Array<[Response, string, number | undefined]> = [
      [Response.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 }), "unavailable", 503],
      [Response.json({ code: "FORBIDDEN" }, { status: 403 }), "rejected", 403],
      [Response.json({ message: "Too many" }, { status: 429 }), "rejected", 429],
      [Response.json({ user: { email: "admin@example.test" } }), "invalid-response", 200],
      [new Response("<html>", { status: 200 }), "invalid-response", 200],
    ];

    for (const [response, kind, status] of cases) {
      const { proxy } = fakeProxy(() => response);
      await assert.rejects(readAuthSession(headers(), proxy), (error: unknown) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.kind, kind);
        assert.equal(error.status, status);
        assert.doesNotMatch(error.message, /admin@example|FORBIDDEN|html/);
        return true;
      });
    }
  });

  it("throws unavailable when the proxy itself throws", async () => {
    const { proxy } = fakeProxy(() => Promise.reject(new TypeError("socket hang up")));
    await assert.rejects(readAuthSession(headers(), proxy), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "unavailable");
      return true;
    });
  });
});
