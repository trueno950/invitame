import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  ApiClientError,
  createApiClient,
  sendApiRequest,
  sessionCookieHeader,
} from "./api-client.ts";
import type { WebServerConfig } from "./config.ts";

// The web server's API client (M2 T8b; S1, S7, S14, L29, L33): it calls the API with only Better
// Auth's cookies and the proxy secret, and maps the answers without leaking response bodies. A real
// local HTTP server stands in for the API.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const PROFILE = {
  id: "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10",
  email: "persona@example.test",
  displayName: "Persona",
  role: "CUSTOMER",
};

interface Received {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
}

let apiOrigin = "";
let received: Received[] = [];
let respond: (request: Received, response: ServerResponse) => void = () => {};
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
    response.end(JSON.stringify(PROFILE));
  };
});

function client(overrides: Partial<WebServerConfig> = {}, timeoutMs?: number) {
  return createApiClient({
    config: {
      apiOrigin,
      proxySecret: PROXY_SECRET,
      clientIpHeader: "x-invitame-client-ip",
      edgeClientIpHeader: "x-real-ip",
      ...overrides,
    },
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

const SESSION_COOKIE = "better-auth.session_token=signed.value";

describe("sessionCookieHeader", () => {
  it("keeps only Better Auth's cookies, local and __Host- prefixed", () => {
    assert.equal(
      sessionCookieHeader(
        "theme=dark; better-auth.session_token=a.b; _ga=GA1; __Host-better-auth.session_token=c.d; " +
          "__Host-better-auth.two_factor=e; better-authx=f; __Secure-better-auth.session_token=g",
      ),
      "better-auth.session_token=a.b; __Host-better-auth.session_token=c.d; __Host-better-auth.two_factor=e",
    );
  });

  it("drops a pair without '=', whatever its text (R3-cookie-name-parse-without-equals)", () => {
    for (const header of [
      "better-auth.session_tokenX",
      "__Host-better-auth.ab",
      "better-auth.xy ",
    ]) {
      assert.equal(sessionCookieHeader(header), undefined, header);
    }
    assert.equal(
      sessionCookieHeader("better-auth.session_tokenX; better-auth.session_token=a.b"),
      "better-auth.session_token=a.b",
    );
  });

  it("returns undefined when there is no Better Auth cookie", () => {
    for (const header of [undefined, null, "", "theme=dark; _ga=GA1", "   "]) {
      assert.equal(sessionCookieHeader(header), undefined);
    }
  });
});

describe("getOwnProfile", () => {
  it("calls GET /me with only Better Auth's cookies and the proxy secret", async () => {
    const result = await client().getOwnProfile(`theme=dark; ${SESSION_COOKIE}; _ga=GA1`);

    assert.deepEqual(result, { signedIn: true, value: PROFILE });
    assert.equal(received.length, 1);
    const request = received[0];
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, "/me");
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(request?.headers.accept, "application/json");
  });

  it("sends no secret header when none is configured", async () => {
    await client({ proxySecret: undefined }).getOwnProfile(SESSION_COOKIE);

    assert.equal(received[0]?.headers["x-invitame-proxy-secret"], undefined);
  });

  it("answers not signed in without calling the API when there is no session cookie", async () => {
    assert.deepEqual(await client().getOwnProfile("theme=dark"), { signedIn: false });
    assert.deepEqual(await client().getOwnProfile(undefined), { signedIn: false });
    assert.equal(received.length, 0);
  });

  it("maps 401 to not signed in", async () => {
    respond = (_request, response) => {
      response.writeHead(401, { "content-type": "application/json" });
      response.end('{"message":"Unauthorized","statusCode":401}');
    };

    assert.deepEqual(await client().getOwnProfile(SESSION_COOKIE), { signedIn: false });
  });

  it("maps other failures to a typed error without the response body", async () => {
    const cases: Array<[number, string, ApiClientError["kind"]]> = [
      [403, '{"message":"Forbidden detail persona@example.test"}', "rejected"],
      [500, '{"message":"select * from User failed"}', "unavailable"],
      [503, '{"code":"SERVICE_UNAVAILABLE"}', "unavailable"],
      [200, '{"id":42}', "invalid-response"],
      [200, "not json", "invalid-response"],
    ];

    for (const [status, body, kind] of cases) {
      respond = (_request, response) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(body);
      };

      await assert.rejects(client().getOwnProfile(SESSION_COOKIE), (error: unknown) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.kind, kind, `${status} ${body}`);
        assert.equal(error.status, status);
        assert.ok(!error.message.includes("persona@example.test"));
        assert.ok(!error.message.includes("select"));
        return true;
      });
    }
  });

  it("maps a redirect to rejected without following it", async () => {
    respond = (_request, response) => {
      response.writeHead(302, { location: "/me" });
      response.end();
    };

    await assert.rejects(client().getOwnProfile(SESSION_COOKIE), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      assert.equal(error.status, 302);
      return true;
    });
    assert.equal(received.length, 1);
  });

  it("maps an unreachable API and a timeout to unavailable", async () => {
    await assert.rejects(
      client({ apiOrigin: "http://127.0.0.1:1" }).getOwnProfile(SESSION_COOKIE),
      {
        name: "ApiClientError",
        kind: "unavailable",
      },
    );

    respond = () => {
      // Never answers.
    };
    await assert.rejects(client({}, 50).getOwnProfile(SESSION_COOKIE), {
      name: "ApiClientError",
      kind: "unavailable",
    });
  });
});

describe("getOwnProfile failures while the body arrives", () => {
  it("maps a body that stalls past the deadline or breaks off to unavailable, not invalid-response", async () => {
    respond = (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"id":');
      // Never ends: the client's single deadline must cover the body too.
    };
    await assert.rejects(client({}, 100).getOwnProfile(SESSION_COOKIE), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "unavailable");
      assert.equal((error.cause as Error | undefined)?.name, "TimeoutError");
      return true;
    });

    respond = (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"id":');
      setTimeout(() => response.socket?.destroy(), 20);
    };
    await assert.rejects(client().getOwnProfile(SESSION_COOKIE), {
      name: "ApiClientError",
      kind: "unavailable",
    });
  });

  it("keeps the original error as the cause of an unavailable failure", async () => {
    await assert.rejects(
      client({ apiOrigin: "http://127.0.0.1:1" }).getOwnProfile(SESSION_COOKIE),
      (error: unknown) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.kind, "unavailable");
        assert.equal((error.cause as Error | undefined)?.name, "TypeError");
        return true;
      },
    );

    respond = () => {
      // Never answers.
    };
    await assert.rejects(client({}, 50).getOwnProfile(SESSION_COOKIE), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal((error.cause as Error | undefined)?.name, "TimeoutError");
      return true;
    });
  });
});

describe("updateOwnProfile", () => {
  it("calls PATCH /me with the display name as JSON (L29)", async () => {
    respond = (request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ...PROFILE, ...JSON.parse(request.body) }));
    };

    const result = await client().updateOwnProfile(SESSION_COOKIE, { displayName: "Otra" });

    assert.deepEqual(result, { signedIn: true, value: { ...PROFILE, displayName: "Otra" } });
    const request = received[0];
    assert.equal(request?.method, "PATCH");
    assert.equal(request?.url, "/me");
    assert.equal(request?.headers["content-type"], "application/json");
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.deepEqual(JSON.parse(request?.body ?? ""), { displayName: "Otra" });
  });

  it("accepts null to clear the name", async () => {
    respond = (_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ...PROFILE, displayName: null }));
    };

    const result = await client().updateOwnProfile(SESSION_COOKIE, { displayName: null });

    assert.deepEqual(result, { signedIn: true, value: { ...PROFILE, displayName: null } });
    assert.deepEqual(JSON.parse(received[0]?.body ?? ""), { displayName: null });
  });

  it("maps 401 to not signed in and 400 to a rejected error", async () => {
    respond = (_request, response) => {
      response.writeHead(401);
      response.end();
    };
    assert.deepEqual(await client().updateOwnProfile(SESSION_COOKIE, { displayName: "x" }), {
      signedIn: false,
    });

    respond = (_request, response) => {
      response.writeHead(400, { "content-type": "application/json" });
      response.end('{"message":["displayName must be shorter"]}');
    };
    await assert.rejects(client().updateOwnProfile(SESSION_COOKIE, { displayName: "x" }), {
      name: "ApiClientError",
      kind: "rejected",
      status: 400,
    });
  });
});

describe("sendApiRequest without a cookie", () => {
  it("sends no cookie header at all, and keeps the proxy secret (M5 T5; S5, A3)", async () => {
    respond = (_request, response) => {
      response.writeHead(404, { "content-type": "application/json" });
      response.end('{"code":"PUBLIC_INVITATION_NOT_FOUND"}');
    };

    const response = await sendApiRequest(
      {
        config: {
          apiOrigin,
          proxySecret: PROXY_SECRET,
          clientIpHeader: "x-invitame-client-ip",
          edgeClientIpHeader: "x-real-ip",
        },
      },
      { method: "GET", path: "/public/invitations/invitacion-k7m2qx" },
      (status) => status === 404,
    );

    // The headers travel with the body, so a route handler can pass a download's own headers through.
    assert.equal(response.status, 404);
    assert.equal(response.text, '{"code":"PUBLIC_INVITATION_NOT_FOUND"}');
    assert.equal(response.headers.get("content-type"), "application/json");
    assert.equal(received[0]?.headers.cookie, undefined);
    assert.equal(received[0]?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
  });
});
