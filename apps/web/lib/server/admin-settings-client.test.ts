import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  ADMIN_SETTINGS_PATH,
  createAdminSettingsClient,
  type OperationalSettings,
  parseSettingsView,
  SETTINGS_FIELDS,
  SETTINGS_NOTE_MAX_LENGTH,
} from "./admin-settings-client.ts";
import { ApiClientError } from "./api-client.ts";

// The web server's client of the administrator settings API (M9 T14; S5, S8, L15). A real local HTTP server stands in
// for the API: the client forwards only Better Auth's cookies and the proxy secret, reads the settings, the bounds, and
// the last update instant, sends all seven fields plus the optional note, maps each documented refusal to a typed
// outcome (the validation one carries the API's own `issues`), and fails closed on anything else without keeping a
// response body. The contract mirrors `GET /admin/settings` and `PUT /admin/settings` of the S5/S8 design in
// `odd/tasks/m9-admin-operations.md`.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const SESSION_COOKIE = "better-auth.session_token=signed.value";
const UPDATED_AT = "2026-11-20T16:30:00.000Z";

const SETTINGS: OperationalSettings = {
  rsvpDefaultPartyLimit: 4,
  rsvpMaxPartyLimit: 10,
  galleryPhotoLimit: 12,
  storedAssetLimit: 40,
  maxUploadMegabytes: 10,
  placeSearchResultLimit: 5,
  analyticsDefaultWindowDays: 30,
};

const BOUNDS = {
  rsvpDefaultPartyLimit: { min: 1, max: 10 },
  rsvpMaxPartyLimit: { min: 1, max: 10 },
  galleryPhotoLimit: { min: 1, max: 24 },
  storedAssetLimit: { min: 1, max: 80 },
  maxUploadMegabytes: { min: 1, max: 15 },
  placeSearchResultLimit: { min: 1, max: 10 },
  analyticsDefaultWindowDays: { min: 7, max: 90 },
};

const VIEW = { settings: SETTINGS, bounds: BOUNDS, updatedAt: UPDATED_AT };

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
  answer(200, VIEW);
});

function client(
  cookie: string | null = `theme=dark; ${SESSION_COOKIE}; _ga=GA1`,
  origin: string = apiOrigin,
) {
  return createAdminSettingsClient(
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

/** The API's refusal of a save (S5): every issue names one field and the rule it broke. */
const ISSUES = [
  { field: "rsvpDefaultPartyLimit", rule: "min" },
  { field: "storedAssetLimit", rule: "cross-field" },
];

describe("the seven settings", () => {
  it("names the seven fields of the contract, in the order of the design", () => {
    assert.deepEqual(SETTINGS_FIELDS, [
      "rsvpDefaultPartyLimit",
      "rsvpMaxPartyLimit",
      "galleryPhotoLimit",
      "storedAssetLimit",
      "maxUploadMegabytes",
      "placeSearchResultLimit",
      "analyticsDefaultWindowDays",
    ]);
  });

  it("keeps the API's own note bound of 200 characters", () => {
    assert.equal(SETTINGS_NOTE_MAX_LENGTH, 200);
  });

  it("reads and writes one path", () => {
    assert.equal(ADMIN_SETTINGS_PATH, "/admin/settings");
  });
});

describe("requests", () => {
  it("reads the settings, the bounds, and the last update with the session cookie and the secret", async () => {
    assert.deepEqual(await client().read(), { ok: true, value: VIEW });

    const request = received[0];
    assert.equal(received.length, 1);
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, ADMIN_SETTINGS_PATH);
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(request?.body, "");
  });

  it("saves all seven fields plus the note in one PUT", async () => {
    const next = { ...SETTINGS, rsvpDefaultPartyLimit: 3 };
    answer(200, { ...VIEW, settings: next });

    const result = await client().update(next, "Subimos el mínimo de fotos");
    assert.deepEqual(result, { ok: true, value: { ...VIEW, settings: next } });

    const request = received[0];
    assert.equal(received.length, 1);
    assert.equal(request?.method, "PUT");
    assert.equal(request?.url, ADMIN_SETTINGS_PATH);
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(request?.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(request?.body ?? ""), {
      rsvpDefaultPartyLimit: 3,
      rsvpMaxPartyLimit: 10,
      galleryPhotoLimit: 12,
      storedAssetLimit: 40,
      maxUploadMegabytes: 10,
      placeSearchResultLimit: 5,
      analyticsDefaultWindowDays: 30,
      note: "Subimos el mínimo de fotos",
    });
  });

  it("sends no note field when there is none", async () => {
    await client().update(SETTINGS);

    const body = JSON.parse(received[0]?.body ?? "") as Record<string, unknown>;
    assert.deepEqual(Object.keys(body), [...SETTINGS_FIELDS]);
  });

  it("answers signed out without calling the API when there is no session cookie", async () => {
    for (const cookie of [null, "", "theme=dark"]) {
      const api = client(cookie);
      assert.deepEqual(await api.read(), { ok: false, failure: "signed-out" });
      assert.deepEqual(await api.update(SETTINGS), { ok: false, failure: "signed-out" });
    }
    assert.equal(received.length, 0);
  });
});

describe("local validation", () => {
  it("refuses a save whose values are not seven integers, without calling the API", async () => {
    const broken: unknown[] = [
      { ...SETTINGS, rsvpMaxPartyLimit: 10.5 },
      { ...SETTINGS, galleryPhotoLimit: "12" },
      { ...SETTINGS, storedAssetLimit: Number.NaN },
      { ...SETTINGS, placeSearchResultLimit: -1 },
      { ...SETTINGS, analyticsDefaultWindowDays: Number.MAX_SAFE_INTEGER + 1 },
      Object.fromEntries(SETTINGS_FIELDS.slice(1).map((field) => [field, SETTINGS[field]])),
    ];

    for (const settings of broken) {
      const api = client();
      assert.deepEqual(
        await api.update(settings as OperationalSettings),
        { ok: false, failure: "validation", issues: [] },
        JSON.stringify(settings),
      );
    }
    assert.equal(received.length, 0);
  });

  it("refuses a note longer than 200 characters, without calling the API", async () => {
    const api = client();

    assert.deepEqual(await api.update(SETTINGS, "x".repeat(SETTINGS_NOTE_MAX_LENGTH + 1)), {
      ok: false,
      failure: "validation",
      issues: [],
    });
    assert.equal(received.length, 0);

    // Exactly the bound is accepted and sent.
    answer(200, VIEW);
    assert.deepEqual(await api.update(SETTINGS, "x".repeat(SETTINGS_NOTE_MAX_LENGTH)), {
      ok: true,
      value: VIEW,
    });
    assert.equal(received.length, 1);
  });
});

describe("the outcomes the page handles", () => {
  it("maps 401, 403, and 5xx for both calls", async () => {
    const cases: Array<[number, string]> = [
      [401, "signed-out"],
      [403, "forbidden"],
      [500, "unavailable"],
      [503, "unavailable"],
    ];

    for (const [status, failure] of cases) {
      answer(status, {});
      const read = client();
      assert.deepEqual(await read.read(), { ok: false, failure }, `read ${status}`);

      const write = client();
      assert.deepEqual(await write.update(SETTINGS), { ok: false, failure }, `update ${status}`);
    }
  });

  it("maps an unreachable API to unavailable", async () => {
    const api = client(undefined, "http://127.0.0.1:1");

    assert.deepEqual(await api.read(), { ok: false, failure: "unavailable" });
    assert.deepEqual(await api.update(SETTINGS), { ok: false, failure: "unavailable" });
  });

  it("carries the API's own issues of a refused save", async () => {
    answer(400, { code: "INVALID_SETTINGS", issues: ISSUES });

    assert.deepEqual(await client().update(SETTINGS), {
      ok: false,
      failure: "validation",
      issues: ISSUES,
    });
  });

  it("still answers validation for a 400 whose issues cannot be read", async () => {
    for (const body of [
      "",
      "not json",
      { code: "INVALID_SETTINGS" },
      { code: "INVALID_SETTINGS", issues: "nope" },
      { code: "INVALID_SETTINGS", issues: [{ field: "rsvpMaxPartyLimit" }] },
      { code: "INVALID_SETTINGS", issues: [{ field: "colour", rule: "min" }] },
      { code: "INVALID_SETTINGS", issues: [{ field: "rsvpMaxPartyLimit", rule: 4 }] },
    ]) {
      answer(400, typeof body === "string" ? body : JSON.stringify(body));
      assert.deepEqual(
        await client().update(SETTINGS),
        { ok: false, failure: "validation", issues: [] },
        JSON.stringify(body),
      );
    }
  });

  it("fails closed on any other status without keeping the body", async () => {
    for (const status of [404, 409, 422]) {
      answer(status, { code: "SOMETHING_ELSE" });
      const api = client();
      await assert.rejects(
        () => api.read(),
        (error: unknown) => error instanceof ApiClientError && error.kind === "rejected",
        `read ${status}`,
      );
      await assert.rejects(
        () => api.update(SETTINGS),
        (error: unknown) => error instanceof ApiClientError && error.kind === "rejected",
        `update ${status}`,
      );
    }
  });
});

describe("the response validator", () => {
  it("keeps exactly the seven settings, the seven bounds, and the instant", () => {
    assert.deepEqual(parseSettingsView(VIEW), VIEW);

    // An extra field the API may add later is ignored, not rejected.
    assert.deepEqual(
      parseSettingsView({ ...VIEW, settings: { ...SETTINGS, extra: 1 }, extra: true }),
      VIEW,
    );
  });

  it("refuses a body outside the contract", () => {
    const broken: unknown[] = [
      undefined,
      null,
      "settings",
      [],
      {},
      { settings: SETTINGS, bounds: BOUNDS },
      { settings: SETTINGS, updatedAt: UPDATED_AT },
      { bounds: BOUNDS, updatedAt: UPDATED_AT },
      // One setting missing, one not an integer, one negative, one a string, one infinite.
      { ...VIEW, settings: { ...SETTINGS, rsvpMaxPartyLimit: undefined } },
      { ...VIEW, settings: { ...SETTINGS, galleryPhotoLimit: 12.5 } },
      { ...VIEW, settings: { ...SETTINGS, storedAssetLimit: -1 } },
      { ...VIEW, settings: { ...SETTINGS, maxUploadMegabytes: "10" } },
      { ...VIEW, settings: { ...SETTINGS, placeSearchResultLimit: Number.POSITIVE_INFINITY } },
      // A bound missing for one field, an extra bound, and a min above its max.
      { ...VIEW, bounds: { ...BOUNDS, rsvpMaxPartyLimit: undefined } },
      { ...VIEW, bounds: { ...BOUNDS, extra: { min: 1, max: 2 } } },
      { ...VIEW, bounds: { ...BOUNDS, galleryPhotoLimit: { min: 24, max: 1 } } },
      { ...VIEW, bounds: { ...BOUNDS, storedAssetLimit: { min: 1 } } },
      { ...VIEW, bounds: { ...BOUNDS, storedAssetLimit: { min: 1, max: "80" } } },
      // An instant that is not ISO-8601.
      { ...VIEW, updatedAt: "20/11/2026" },
      { ...VIEW, updatedAt: "2026-11-20" },
      { ...VIEW, updatedAt: 1_700_000_000 },
    ];

    for (const value of broken) {
      assert.equal(parseSettingsView(value), undefined, JSON.stringify(value));
    }
  });

  it("fails a success whose body is outside the contract, for both calls", async () => {
    answer(200, {
      settings: { ...SETTINGS, galleryPhotoLimit: 12.5 },
      bounds: BOUNDS,
      updatedAt: UPDATED_AT,
    });
    await assert.rejects(
      () => client().read(),
      (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
    );
    await assert.rejects(
      () => client().update(SETTINGS),
      (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
    );
  });

  it("accepts the API's instant with an offset, still an ISO-8601 instant", () => {
    assert.deepEqual(parseSettingsView({ ...VIEW, updatedAt: "2026-11-20T10:30:00-06:00" }), {
      ...VIEW,
      updatedAt: "2026-11-20T10:30:00-06:00",
    });
  });
});
