import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { createAdminUsersClient, isAccountId } from "./admin-users-client.ts";
import { ApiClientError } from "./api-client.ts";

// The web server's client of the administrator account support API (M9 T9; S4, S6, L9). A real local HTTP server
// stands in for the API: the client forwards only Better Auth's cookies and the proxy secret, posts the administrator's
// reason and note to the account's own route, reads the three documented answers, maps each refusal to a typed
// outcome, and fails closed on anything else without keeping a response body. The contract mirrors
// `POST /admin/users/:userId/disable`, `/reactivate`, and `/sign-in-code` of `odd/tasks/m9-admin-operations.md`.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const SESSION_COOKIE = "better-auth.session_token=signed.value";
const USER_ID = "9b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e19";

const DISABLED = { status: "DISABLED", revokedSessions: 2 };
const REACTIVATED = { status: "ACTIVE" };
const REQUESTED = { outcome: "requested" };

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

function answer(status: number, body: unknown) {
  respond = (_request, response) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  };
}

beforeEach(() => {
  received = [];
  answer(200, DISABLED);
});

function client(
  cookie: string | null = `theme=dark; ${SESSION_COOKIE}; _ga=GA1`,
  origin: string = apiOrigin,
) {
  return createAdminUsersClient(
    {
      config: {
        apiOrigin: origin,
        proxySecret: PROXY_SECRET,
      } as never,
    },
    async () => cookie,
  );
}

const COMMAND = { reason: "OWNER_REQUEST", note: "  Lo pidió por correo.  " } as const;

describe("requests", () => {
  it("posts the disable with the session cookie, the secret, the reason, and the note", async () => {
    const result = await client().disable(USER_ID, COMMAND);

    assert.deepEqual(result, { ok: true, value: DISABLED });
    assert.equal(received.length, 1);
    const sent = received[0];
    assert.ok(sent);
    assert.equal(sent.method, "POST");
    assert.equal(sent.url, `/admin/users/${USER_ID}/disable`);
    assert.equal(sent.headers.cookie, SESSION_COOKIE, "only Better Auth's cookie is forwarded");
    assert.equal(sent.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.deepEqual(JSON.parse(sent.body), {
      reason: "OWNER_REQUEST",
      note: "  Lo pidió por correo.  ",
    });
  });

  it("leaves the note out when the administrator wrote none", async () => {
    answer(200, REACTIVATED);

    await client().reactivate(USER_ID, { reason: "PAYMENT_ERROR", note: null });

    assert.deepEqual(JSON.parse(received[0]?.body ?? ""), { reason: "PAYMENT_ERROR" });
    assert.equal(received[0]?.url, `/admin/users/${USER_ID}/reactivate`);
  });

  it("asks for a sign-in code and reads the requested outcome", async () => {
    answer(202, REQUESTED);

    const result = await client().resendSignInCode(USER_ID, {
      reason: "OWNER_REQUEST",
      note: null,
    });

    assert.deepEqual(result, { ok: true, value: { outcome: "requested" } });
    assert.equal(received[0]?.url, `/admin/users/${USER_ID}/sign-in-code`);
  });
});

describe("the outcomes the page handles", () => {
  it("maps every refusal code to its own outcome", async () => {
    const cases: Array<[number, string, string]> = [
      [404, "USER_NOT_FOUND", "not-found"],
      [409, "ADMIN_ACCOUNT_PROTECTED", "admin-protected"],
      [409, "ACCOUNT_ALREADY_DISABLED", "already-disabled"],
      [409, "ACCOUNT_ALREADY_ACTIVE", "already-active"],
      [409, "USER_CANNOT_SIGN_IN_BY_CODE", "cannot-sign-in-by-code"],
    ];

    for (const [status, code, failure] of cases) {
      answer(status, { code });
      assert.deepEqual(await client().disable(USER_ID, COMMAND), { ok: false, failure }, code);
    }
  });

  it("maps 401, 403, a bare 404, and a 400 the API answers without a code", async () => {
    answer(401, { code: "UNAUTHORIZED" });
    assert.deepEqual(await client().disable(USER_ID, COMMAND), {
      ok: false,
      failure: "signed-out",
    });

    answer(403, { code: "FORBIDDEN" });
    assert.deepEqual(await client().disable(USER_ID, COMMAND), { ok: false, failure: "forbidden" });

    answer(404, {});
    assert.deepEqual(await client().disable(USER_ID, COMMAND), { ok: false, failure: "not-found" });

    answer(400, { message: ["reason must be one of ABUSE"] });
    assert.deepEqual(await client().disable(USER_ID, COMMAND), {
      ok: false,
      failure: "validation",
    });
  });

  it("answers signed out without calling the API when there is no session cookie", async () => {
    assert.deepEqual(await client(null).disable(USER_ID, COMMAND), {
      ok: false,
      failure: "signed-out",
    });
    assert.deepEqual(await client("theme=dark").reactivate(USER_ID, COMMAND), {
      ok: false,
      failure: "signed-out",
    });
    assert.equal(received.length, 0);

    // The proxy's short circuit is the same outcome: the page shows its retry notice.
    const shortCircuited = createAdminUsersClient(
      { config: { apiOrigin: apiOrigin, proxySecret: PROXY_SECRET } as never },
      async () => {
        throw new ApiClientError("short-circuited");
      },
    );
    await assert.rejects(shortCircuited.disable(USER_ID, COMMAND), ApiClientError);
  });

  it("answers not found without calling the API when the account id is not a UUID", async () => {
    for (const id of ["", "not-a-uuid", "1111", `${USER_ID}-x`]) {
      assert.deepEqual(
        await client().disable(id, COMMAND),
        { ok: false, failure: "not-found" },
        id,
      );
      assert.deepEqual(await client().reactivate(id, COMMAND), { ok: false, failure: "not-found" });
      assert.deepEqual(await client().resendSignInCode(id, COMMAND), {
        ok: false,
        failure: "not-found",
      });
    }
    assert.equal(received.length, 0, "a malformed id costs no request");
  });

  it("answers unavailable on a 5xx without reading the refusal body", async () => {
    answer(503, { code: "SERVICE_UNAVAILABLE" });

    assert.deepEqual(await client().resendSignInCode(USER_ID, COMMAND), {
      ok: false,
      failure: "unavailable",
    });
  });

  it("answers unavailable when the API cannot be reached", async () => {
    const unreachable = client(undefined, "http://127.0.0.1:1");

    assert.deepEqual(await unreachable.disable(USER_ID, COMMAND), {
      ok: false,
      failure: "unavailable",
    });
  });

  it("treats an unknown refusal code, another 4xx, and a redirect as rejected", async () => {
    // A 400 is the API's validation refusal even without a code, so it is its own outcome; these are not outcomes.
    for (const status of [409, 418, 302]) {
      answer(status, { code: "SOMETHING_ELSE" });

      await assert.rejects(
        client().disable(USER_ID, COMMAND),
        (error: unknown) => error instanceof ApiClientError && error.kind === "rejected",
        String(status),
      );
    }
  });
});

describe("the answers the client refuses", () => {
  it("fails closed on a success whose body is not the contract", async () => {
    const bodies: unknown[] = [
      {},
      { status: "ACTIVE" },
      { status: "DISABLED" },
      { status: "DISABLED", revokedSessions: -1 },
      { status: "DISABLED", revokedSessions: 1.5 },
      { status: "SUSPENDED", revokedSessions: 0 },
      "not json",
    ];

    for (const body of bodies) {
      answer(200, body);
      await assert.rejects(
        client().disable(USER_ID, COMMAND),
        (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
        JSON.stringify(body),
      );
    }

    answer(200, { status: "DISABLED" });
    await assert.rejects(
      client().reactivate(USER_ID, COMMAND),
      (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
    );

    answer(202, { outcome: "delivered" });
    await assert.rejects(
      client().resendSignInCode(USER_ID, COMMAND),
      (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
      "the API never says a code was delivered",
    );
  });

  it("never keeps a message the API wrote", async () => {
    answer(409, { code: "ACCOUNT_ALREADY_DISABLED", message: "duena@example.test" });

    const result = await client().disable(USER_ID, COMMAND);

    assert.deepEqual(result, { ok: false, failure: "already-disabled" });
    assert.ok(!JSON.stringify(result).includes("duena@example.test"));
  });
});

describe("isAccountId", () => {
  it("accepts a UUID and refuses anything else", () => {
    for (const value of [USER_ID, USER_ID.toUpperCase()]) {
      assert.equal(isAccountId(value), true, value);
    }
    for (const value of ["", "1111", "not-a-uuid", 42, null, undefined]) {
      assert.equal(isAccountId(value), false, String(value));
    }
  });
});
