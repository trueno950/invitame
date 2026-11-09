import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { createAdminCatalogClient } from "./admin-catalog-client.ts";
import {
  ADMIN_CATALOG_FAILED_EVENT,
  adminCatalogFailureLine,
  logAdminCatalogFailure,
} from "./admin-catalog-log.ts";
import { ApiClientError } from "./api-client.ts";

// The web server's client of the administrator catalog API (M3 T8a; S1, S9, L8). A real local HTTP
// server stands in for the API: the client forwards only Better Auth's cookies and the proxy secret,
// maps each documented status to a typed outcome, and fails closed on anything else without keeping a
// response body.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const SESSION_COOKIE = "better-auth.session_token=signed.value";
const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const FEATURE = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";
const AT = "2026-11-09T12:00:00.000Z";

const ENTRY = {
  id: ID,
  key: "birthday",
  name: "Cumpleaños",
  description: null,
  isActive: true,
  createdAt: AT,
  updatedAt: AT,
};
const PACKAGE = {
  id: ID,
  key: "basic",
  name: "Básico",
  description: null,
  status: "DRAFT",
  createdAt: AT,
  updatedAt: AT,
  features: [],
  currentPrices: [],
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
  answer(200, ENTRY);
});

function client(
  cookie: string | null = `theme=dark; ${SESSION_COOKIE}; _ga=GA1`,
  timeoutMs?: number,
) {
  return createAdminCatalogClient(
    {
      config: {
        apiOrigin,
        proxySecret: PROXY_SECRET,
        clientIpHeader: "x-invitame-client-ip",
        edgeClientIpHeader: "x-real-ip",
      },
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    },
    async () => cookie,
  );
}

describe("requests", () => {
  it("sends each endpoint's method, path, and JSON body with only the session cookie and the secret", async () => {
    const api = client();
    const calls: Array<[() => Promise<unknown>, string, string, unknown, unknown]> = [
      [() => api.categories.list(), "GET", "/admin/catalog/categories", undefined, [ENTRY]],
      [
        () => api.categories.create({ key: "birthday", name: "Cumpleaños", description: null }),
        "POST",
        "/admin/catalog/categories",
        { key: "birthday", name: "Cumpleaños", description: null },
        ENTRY,
      ],
      [
        () => api.categories.update(ID, { name: "X", isActive: false }),
        "PATCH",
        `/admin/catalog/categories/${ID}`,
        { name: "X", isActive: false },
        ENTRY,
      ],
      [() => api.features.list(), "GET", "/admin/catalog/features", undefined, [ENTRY]],
      [
        () => api.features.update(ID, { description: null }),
        "PATCH",
        `/admin/catalog/features/${ID}`,
        { description: null },
        ENTRY,
      ],
      [() => api.packages.list(), "GET", "/admin/catalog/packages", undefined, [PACKAGE]],
      [
        () => api.packages.update(ID, { status: "ACTIVE" }),
        "PATCH",
        `/admin/catalog/packages/${ID}`,
        { status: "ACTIVE" },
        PACKAGE,
      ],
      [
        () => api.packages.setFeatures(ID, [FEATURE]),
        "PUT",
        `/admin/catalog/packages/${ID}/features`,
        { featureIds: [FEATURE] },
        PACKAGE,
      ],
      [
        () => api.packages.setPrice(ID, 150050),
        "PUT",
        `/admin/catalog/packages/${ID}/price`,
        { currency: "MXN", amountMinor: 150050 },
        PACKAGE,
      ],
      [
        () => api.packages.priceHistory(ID),
        "GET",
        `/admin/catalog/packages/${ID}/prices`,
        undefined,
        [{ currency: "MXN", amountMinor: 1, createdAt: AT, retiredAt: null }],
      ],
    ];

    for (const [call, method, path, body, response] of calls) {
      received = [];
      answer(200, response);
      const result = await call();

      assert.deepEqual(result, { ok: true, value: response }, `${method} ${path}`);
      assert.equal(received.length, 1);
      const request = received[0];
      assert.equal(request?.method, method);
      assert.equal(request?.url, path);
      assert.equal(request?.headers.cookie, SESSION_COOKIE);
      assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
      assert.equal(request?.body, body === undefined ? "" : JSON.stringify(body));
      assert.equal(
        request?.headers["content-type"],
        body === undefined ? undefined : "application/json",
      );
    }
  });

  it("creates a package with a 201", async () => {
    answer(201, PACKAGE);
    assert.deepEqual(
      await client().packages.create({ key: "basic", name: "Básico", description: null }),
      { ok: true, value: PACKAGE },
    );
  });

  it("answers signed out without calling the API when there is no session cookie", async () => {
    for (const cookie of [null, "", "theme=dark"]) {
      const api = client(cookie);
      assert.deepEqual(await api.categories.list(), { ok: false, failure: "signed-out" });
      assert.deepEqual(await api.packages.setPrice(ID, 1), { ok: false, failure: "signed-out" });
    }
    assert.equal(received.length, 0);
  });

  it("answers not found without calling the API when the id is not a UUID", async () => {
    const api = client();
    for (const id of ["", "x", "../packages", `${ID}/features`, `${ID}?a=1`]) {
      for (const call of [
        () => api.categories.update(id, { name: "A" }),
        () => api.features.update(id, { name: "A" }),
        () => api.packages.update(id, { name: "A" }),
        () => api.packages.setFeatures(id, []),
        () => api.packages.setPrice(id, 1),
        () => api.packages.priceHistory(id),
      ]) {
        assert.deepEqual(await call(), { ok: false, failure: "not-found" }, id);
      }
    }
    assert.equal(received.length, 0);
  });
});

describe("outcomes the pages handle", () => {
  it("maps 401, 403, and 404", async () => {
    const cases: Array<[number, string]> = [
      [401, "signed-out"],
      [403, "forbidden"],
      [404, "not-found"],
    ];
    for (const [status, failure] of cases) {
      answer(status, { message: "detail", statusCode: status });
      assert.deepEqual(await client().packages.list(), { ok: false, failure }, String(status));
    }
  });

  it("maps a 400 without a known code to validation", async () => {
    answer(400, {
      message: ["name must be 1 to 120 characters"],
      error: "Bad Request",
      statusCode: 400,
    });
    assert.deepEqual(await client().categories.create({ key: "a", name: "", description: null }), {
      ok: false,
      failure: "validation",
    });
    answer(400, "not json");
    assert.deepEqual(await client().categories.list(), { ok: false, failure: "validation" });
  });

  it("maps the API's error codes", async () => {
    const cases: Array<[number, string, string]> = [
      [409, "CATALOG_KEY_TAKEN", "key-taken"],
      [409, "CATALOG_CONCURRENT_UPDATE", "concurrent-update"],
      [400, "CATALOG_FEATURE_NOT_FOUND", "feature-not-found"],
      [409, "CATALOG_FEATURE_NOT_FOUND", "feature-not-found"],
    ];
    for (const [status, code, failure] of cases) {
      answer(status, { code });
      assert.deepEqual(
        await client().packages.setFeatures(ID, [FEATURE]),
        { ok: false, failure },
        code,
      );
    }
  });
});

describe("fails closed", () => {
  async function failure(call: () => Promise<unknown>): Promise<ApiClientError> {
    try {
      await call();
    } catch (error) {
      assert.ok(error instanceof ApiClientError, String(error));
      return error;
    }
    assert.fail("expected an ApiClientError");
  }

  it("treats a 409 without a known code, other 4xx, and redirects as rejected", async () => {
    const cases: Array<[number, unknown]> = [
      [409, { code: "SOMETHING_ELSE" }],
      [409, "not json"],
      [409, { code: ["CATALOG_KEY_TAKEN"] }],
      [409, { code: "toString" }],
      [409, { code: "__proto__" }],
      [405, {}],
      [422, {}],
      [429, {}],
      [302, {}],
    ];
    for (const [status, body] of cases) {
      answer(status, body);
      const error = await failure(() => client().categories.list());
      assert.equal(error.kind, "rejected", `${status} ${JSON.stringify(body)}`);
      assert.equal(error.status, status);
    }
  });

  it("treats a 5xx as unavailable without the response body", async () => {
    answer(500, "select * from Package failed for persona@example.test");
    const error = await failure(() => client().packages.list());
    assert.equal(error.kind, "unavailable");
    assert.equal(error.status, 500);
    assert.ok(!error.message.includes("persona@example.test"));
    assert.ok(!error.message.includes("select"));
  });

  it("treats a success body that fails its validator as invalid-response", async () => {
    const cases: Array<[() => Promise<unknown>, unknown]> = [
      [() => client().categories.list(), ENTRY],
      [() => client().categories.list(), [{ ...ENTRY, isActive: "yes" }]],
      [() => client().categories.create({ key: "a", name: "A", description: null }), [ENTRY]],
      [() => client().packages.list(), [{ ...PACKAGE, status: "WEIRD" }]],
      [
        () => client().packages.setPrice(ID, 1),
        { ...PACKAGE, currentPrices: [{ currency: "MXN" }] },
      ],
      [() => client().packages.priceHistory(ID), [{ currency: "MXN", amountMinor: 1 }]],
      [() => client().packages.list(), "not json"],
      [() => client().packages.list(), ""],
      [() => client().packages.list(), "null"],
    ];
    for (const [call, body] of cases) {
      answer(200, body);
      const error = await failure(call);
      assert.equal(error.kind, "invalid-response", JSON.stringify(body));
      assert.equal(error.status, 200);
    }
  });

  it("treats an unreachable API and a timeout as unavailable", async () => {
    const unreachable = createAdminCatalogClient(
      {
        config: {
          apiOrigin: "http://127.0.0.1:1",
          proxySecret: PROXY_SECRET,
          clientIpHeader: "x-invitame-client-ip",
          edgeClientIpHeader: "x-real-ip",
        },
      },
      async () => SESSION_COOKIE,
    );
    assert.equal((await failure(() => unreachable.categories.list())).kind, "unavailable");

    respond = () => {
      // Never answers.
    };
    assert.equal(
      (await failure(() => client(SESSION_COOKIE, 50).categories.list())).kind,
      "unavailable",
    );
  });
});

describe("admin catalog failure log", () => {
  it("writes the event, classes, and kind, and never a message, cookie, or body", () => {
    const error = new ApiClientError("unavailable", 503, {
      cause: new TypeError(`fetch failed ${SESSION_COOKIE} persona@example.test`),
    });
    const line = adminCatalogFailureLine(error);

    assert.deepEqual(JSON.parse(line), {
      event: ADMIN_CATALOG_FAILED_EVENT,
      error: "ApiClientError",
      kind: "unavailable",
      cause: "TypeError",
    });
    assert.ok(!line.includes("persona@example.test"));
    assert.ok(!line.includes("signed.value"));
    assert.deepEqual(JSON.parse(adminCatalogFailureLine("boom")), {
      event: ADMIN_CATALOG_FAILED_EVENT,
      error: "unknown",
    });
  });

  it("never throws when the sink fails", () => {
    assert.doesNotThrow(() =>
      logAdminCatalogFailure(new Error("x"), () => {
        throw new Error("sink down");
      }),
    );
  });
});
