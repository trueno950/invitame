import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  ANALYTICS_DEFAULT_WINDOW_DAYS,
  ANALYTICS_MAX_WINDOW_DAYS,
  ANALYTICS_TOP_INVITATIONS_LIMIT,
  adminAnalyticsFunnelPath,
  adminAnalyticsViewsPath,
  createAdminAnalyticsClient,
  isAnalyticsDay,
  isAnalyticsWindow,
} from "./admin-analytics-client.ts";
import { ApiClientError } from "./api-client.ts";

// The web server's client of the administrator analytics API (M9 T12; S2, S3, S7). A real local HTTP server stands in
// for the API: the client forwards only Better Auth's cookies and the proxy secret, asks for one bounded window of
// aperturas and of the purchase funnel, reads only the documented fields, maps each documented refusal to a typed
// outcome, and fails closed on anything else without keeping a response body. The contract mirrors
// `GET /admin/analytics/views?from&to` and `GET /admin/analytics/funnel?from&to` of
// `odd/tasks/m9-admin-operations.md`, Design (S2, S3, S7).

const PROXY_SECRET = randomBytes(32).toString("base64url");
const SESSION_COOKIE = "better-auth.session_token=signed.value";
const INVITATION_ID = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";
const FROM = "2026-11-01";
const TO = "2026-11-30";

const VIEWS = {
  days: [
    { day: "2026-11-10", public: 12, guest: 3 },
    { day: "2026-11-11", public: 20, guest: 0 },
  ],
  topInvitations: [{ invitationId: INVITATION_ID, slug: "ana-y-daniel", public: 9, guest: 2 }],
};

const FUNNEL = {
  days: [
    {
      day: "2026-11-10",
      draftsCreated: 3,
      checkoutsStarted: 2,
      paymentsApproved: 1,
      firstPublications: 1,
    },
  ],
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

function answer(status: number, body: unknown) {
  respond = (_request, response) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  };
}

beforeEach(() => {
  received = [];
  answer(200, VIEWS);
});

function client(
  cookie: string | null = `theme=dark; ${SESSION_COOKIE}; _ga=GA1`,
  origin: string = apiOrigin,
) {
  return createAdminAnalyticsClient(
    {
      config: {
        apiOrigin: origin,
        proxySecret: PROXY_SECRET,
        clientIpHeader: "x-invitame-client-ip",
        edgeClientIpHeader: "x-real-ip",
      },
    },
    async () => cookie,
  );
}

describe("requests", () => {
  it("reads the views of one window with the session cookie and the secret", async () => {
    assert.deepEqual(await client().views(FROM, TO), { ok: true, value: VIEWS });

    const request = received[0];
    assert.equal(received.length, 1);
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, `/admin/analytics/views?from=${FROM}&to=${TO}`);
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
  });

  it("reads the funnel of the same window", async () => {
    answer(200, FUNNEL);

    assert.deepEqual(await client().funnel(FROM, TO), { ok: true, value: FUNNEL });

    const request = received[0];
    assert.equal(received.length, 1);
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, `/admin/analytics/funnel?from=${FROM}&to=${TO}`);
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
  });

  it("builds the two paths from the window, encoded as query parameters", () => {
    assert.equal(
      adminAnalyticsViewsPath({ from: FROM, to: TO }),
      `/admin/analytics/views?from=${FROM}&to=${TO}`,
    );
    assert.equal(
      adminAnalyticsFunnelPath({ from: FROM, to: TO }),
      `/admin/analytics/funnel?from=${FROM}&to=${TO}`,
    );
  });

  it("keeps the API's own bounds: 30 days by default, 90 at most, and 20 top invitations", () => {
    assert.equal(ANALYTICS_DEFAULT_WINDOW_DAYS, 30);
    assert.equal(ANALYTICS_MAX_WINDOW_DAYS, 90);
    assert.equal(ANALYTICS_TOP_INVITATIONS_LIMIT, 20);
  });

  it("accepts an empty window of activity", async () => {
    answer(200, { days: [], topInvitations: [] });
    assert.deepEqual(await client().views(FROM, TO), {
      ok: true,
      value: { days: [], topInvitations: [] },
    });

    answer(200, { days: [] });
    assert.deepEqual(await client().funnel(FROM, TO), { ok: true, value: { days: [] } });
  });

  it("accepts a window of exactly 90 days", async () => {
    // 2026-01-01 to 2026-03-31 is 31 + 28 + 31 = 90 days, the widest window the API serves (S3).
    answer(200, { days: [{ day: "2026-01-01", public: 1, guest: 0 }], topInvitations: [] });

    const result = await client().views("2026-01-01", "2026-03-31");
    assert.equal(result.ok, true);
    assert.equal(received[0]?.url, "/admin/analytics/views?from=2026-01-01&to=2026-03-31");
  });

  it("answers validation without calling the API for a window outside the contract", async () => {
    const windows: Array<[string, string]> = [
      ["", ""],
      ["2026-11-01", ""],
      ["2026-11-01", "2026-11-30T00:00:00Z"],
      ["2026-11-30", "2026-11-01"],
      ["2026-11-01", "2026-11-01 "],
      ["2026-13-01", "2026-12-01"],
      ["2026-02-30", "2026-03-01"],
      ["2026-1-1", "2026-01-31"],
      // 2026-01-01 to 2026-04-01 is 91 days, one more than the API serves (S3).
      ["2026-01-01", "2026-04-01"],
    ];

    for (const [from, to] of windows) {
      const api = client();
      assert.deepEqual(
        await api.views(from, to),
        { ok: false, failure: "validation" },
        `${from}/${to}`,
      );
      assert.deepEqual(
        await api.funnel(from, to),
        { ok: false, failure: "validation" },
        `${from}/${to}`,
      );
    }
    assert.equal(received.length, 0);
  });

  it("answers signed out without calling the API when there is no session cookie", async () => {
    for (const cookie of [null, "", "theme=dark"]) {
      const api = client(cookie);
      assert.deepEqual(await api.views(FROM, TO), { ok: false, failure: "signed-out" });
      assert.deepEqual(await api.funnel(FROM, TO), { ok: false, failure: "signed-out" });
    }
    assert.equal(received.length, 0);
  });
});

describe("the outcomes the page handles", () => {
  it("maps 401, 403, and 400", async () => {
    const cases: Array<[number, string]> = [
      [401, "signed-out"],
      [403, "forbidden"],
      [400, "validation"],
    ];

    for (const [status, failure] of cases) {
      answer(status, { message: "detail", statusCode: status });
      assert.deepEqual(await client().views(FROM, TO), { ok: false, failure }, String(status));
      assert.deepEqual(await client().funnel(FROM, TO), { ok: false, failure }, String(status));
    }
  });

  it("answers unavailable on a 5xx without reading the refusal body", async () => {
    for (const status of [500, 502, 503]) {
      answer(status, { code: "INTERNAL_ERROR", detail: "no debe leerse" });
      assert.deepEqual(await client().views(FROM, TO), { ok: false, failure: "unavailable" });
      assert.deepEqual(await client().funnel(FROM, TO), { ok: false, failure: "unavailable" });
    }
  });

  it("answers unavailable when the API cannot be reached", async () => {
    const api = client(undefined, "http://127.0.0.1:1");
    assert.deepEqual(await api.views(FROM, TO), { ok: false, failure: "unavailable" });
    assert.deepEqual(await api.funnel(FROM, TO), { ok: false, failure: "unavailable" });
  });

  it("treats another 4xx and a redirect as rejected", async () => {
    for (const status of [404, 409, 422, 302]) {
      answer(status, { message: "unexpected" });
      await assert.rejects(
        client().views(FROM, TO),
        (error: unknown) => error instanceof ApiClientError && error.kind === "rejected",
        String(status),
      );
    }
  });
});

describe("failing closed on a body outside the contract", () => {
  it("refuses the whole views body when a day, a count, or a top invitation is malformed", async () => {
    const bodies: unknown[] = [
      [],
      { days: VIEWS.days },
      { days: VIEWS.days, topInvitations: "ninguna" },
      { days: [{ ...VIEWS.days[0], day: "10/11/2026" }], topInvitations: [] },
      { days: [{ ...VIEWS.days[0], day: "2026-02-30" }], topInvitations: [] },
      { days: [{ ...VIEWS.days[0], day: "2026-12-01" }], topInvitations: [] },
      { days: [{ ...VIEWS.days[0], public: -1 }], topInvitations: [] },
      { days: [{ ...VIEWS.days[0], guest: 1.5 }], topInvitations: [] },
      { days: [{ ...VIEWS.days[0], guest: "3" }], topInvitations: [] },
      { days: [{ day: "2026-11-10", public: 1 }], topInvitations: [] },
      { days: [VIEWS.days[0], VIEWS.days[0]], topInvitations: [] },
      {
        days: [],
        topInvitations: [{ ...VIEWS.topInvitations[0], invitationId: "no-es-un-uuid" }],
      },
      { days: [], topInvitations: [{ ...VIEWS.topInvitations[0], slug: "" }] },
      { days: [], topInvitations: [{ ...VIEWS.topInvitations[0], slug: "Ana y Daniel" }] },
      { days: [], topInvitations: [{ ...VIEWS.topInvitations[0], public: -1 }] },
      { days: [], topInvitations: [{ slug: "ana-y-daniel", public: 1, guest: 0 }] },
      {
        days: [],
        topInvitations: Array.from({ length: ANALYTICS_TOP_INVITATIONS_LIMIT + 1 }, () => ({
          ...VIEWS.topInvitations[0],
        })),
      },
    ];

    for (const body of bodies) {
      answer(200, body);
      await assert.rejects(
        client().views(FROM, TO),
        (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
        JSON.stringify(body),
      );
    }
  });

  it("refuses the whole funnel body when a step is malformed", async () => {
    const bodies: unknown[] = [
      [],
      { days: {} },
      { days: [{ ...FUNNEL.days[0], day: "ayer" }] },
      { days: [{ ...FUNNEL.days[0], draftsCreated: -1 }] },
      { days: [{ ...FUNNEL.days[0], checkoutsStarted: 0.5 }] },
      { days: [{ ...FUNNEL.days[0], paymentsApproved: "1" }] },
      { days: [{ ...FUNNEL.days[0], firstPublications: undefined }] },
      { days: [{ ...FUNNEL.days[0], firstPublications: Number.POSITIVE_INFINITY }] },
    ];

    for (const body of bodies) {
      answer(200, body);
      await assert.rejects(
        client().funnel(FROM, TO),
        (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
        JSON.stringify(body),
      );
    }
  });

  it("fails closed on a body that is not JSON", async () => {
    answer(200, "<html>not json</html>");
    await assert.rejects(
      client().views(FROM, TO),
      (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
    );
  });
});

describe("isAnalyticsDay and isAnalyticsWindow", () => {
  it("accepts only a real calendar day written as YYYY-MM-DD", () => {
    for (const value of ["2026-11-10", "2026-01-01", "2024-02-29", "2026-12-31"]) {
      assert.equal(isAnalyticsDay(value), true, value);
    }

    for (const value of [
      "",
      "2026-02-30",
      "2025-02-29",
      "2026-13-01",
      "2026-00-10",
      "2026-11-00",
      "2026-1-1",
      "26-11-10",
      "2026-11-10T00:00:00Z",
      "2026-11-10 ",
      20261110,
      null,
      undefined,
    ]) {
      assert.equal(isAnalyticsDay(value), false, String(value));
    }
  });

  it("accepts a bounded window in order and refuses anything else", () => {
    assert.equal(isAnalyticsWindow(FROM, TO), true);
    assert.equal(isAnalyticsWindow("2026-01-01", "2026-03-31"), true);
    assert.equal(isAnalyticsWindow(TO, FROM), false);
    assert.equal(isAnalyticsWindow("2026-01-01", "2026-04-01"), false);
    assert.equal(isAnalyticsWindow("2026-02-30", "2026-03-01"), false);
    assert.equal(isAnalyticsWindow("2026-01-01", "2026-04-01"), false);
  });
});
