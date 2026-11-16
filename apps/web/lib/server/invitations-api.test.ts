import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import {
  createInvitationsClient,
  isInvitationId,
  parseCreatorPackages,
  parseCreatorTemplates,
  parseInvitationSummaries,
  parseOwnedInvitation,
} from "./invitations-api.ts";

// The web server's client of the invitation API (M4 T5; S1, S6, S7). A real local HTTP server stands in
// for the API: the client forwards only Better Auth's cookies and the proxy secret, maps each documented
// status and code to a typed outcome, and fails closed on anything else without keeping a response body.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const SESSION_COOKIE = "better-auth.session_token=signed.value";
const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const VERSION_ID = "4b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e14";
const PACKAGE_ID = "5b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e15";
const AT = "2026-11-11T12:00:00.000Z";

const SUMMARY = {
  id: ID,
  templateVersionId: VERSION_ID,
  packageId: PACKAGE_ID,
  slug: "invitacion-k7m2qx",
  status: "DRAFT",
  publishedAt: null,
  archivedAt: null,
  createdAt: AT,
  updatedAt: AT,
};

const OWNED = {
  ...SUMMARY,
  content: { celebrantName: "Ana", age: 7 },
  missingRequiredFields: ["date", "time"],
  timeZone: "America/Mexico_City",
  featureSettings: { whatsappPhone: null, playlistUrl: null },
  availableFeatures: ["COUNTDOWN", "MAP", "CALENDAR"],
};

/** The same draft after its feature settings were saved (F3; S4). */
const FEATURED = {
  ...OWNED,
  timeZone: "America/Tijuana",
  featureSettings: {
    whatsappPhone: "+525512345678",
    playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  },
  availableFeatures: ["COUNTDOWN", "MAP", "WHATSAPP", "MUSIC", "GIFT_REGISTRY", "CALENDAR"],
};
/** A published invitation, as `POST /invitations/:id/publish` returns it (M5 T4). */
const PUBLISHED = { ...OWNED, status: "PUBLISHED", publishedAt: AT };

const TEMPLATE = {
  id: ID,
  key: "cumpleanos",
  name: "Cumpleaños",
  description: null,
  category: { key: "cumpleanos", name: "Cumpleaños" },
  publishedVersion: {
    id: VERSION_ID,
    version: 2,
    componentKey: "birthday-poster-01",
    schema: { type: "object", properties: {} },
    configuration: { componentKey: "birthday-poster-01", theme: "dinosaurs" },
  },
};

const PACKAGE = {
  id: PACKAGE_ID,
  key: "basic",
  name: "Basic",
  description: null,
  currentPrice: { amountMinor: 150000, currency: "MXN" },
  includedFeatureKeys: ["COUNTDOWN"],
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
  answer(200, SUMMARY);
});

function client(cookie: string | null = `theme=dark; ${SESSION_COOKIE}; _ga=GA1`) {
  return createInvitationsClient(
    {
      config: {
        apiOrigin,
        proxySecret: PROXY_SECRET,
        clientIpHeader: "x-invitame-client-ip",
        edgeClientIpHeader: "x-real-ip",
      },
    },
    async () => cookie,
  );
}

describe("requests", () => {
  it("sends each endpoint's method, path, and JSON body with only the session cookie and the secret", async () => {
    const api = client();
    const calls: Array<[() => Promise<unknown>, string, string, unknown, unknown]> = [
      [() => api.list(), "GET", "/invitations", undefined, [SUMMARY]],
      [() => api.get(ID), "GET", `/invitations/${ID}`, undefined, OWNED],
      [
        () => api.create({ templateVersionId: VERSION_ID, packageId: PACKAGE_ID }),
        "POST",
        "/invitations",
        { templateVersionId: VERSION_ID, packageId: PACKAGE_ID },
        OWNED,
      ],
      [
        () => api.replaceContent(ID, { celebrantName: "Ana" }),
        "PUT",
        `/invitations/${ID}/content`,
        { content: { celebrantName: "Ana" } },
        OWNED,
      ],
      [
        () =>
          api.updateInvitationFeatures(ID, {
            timeZone: "America/Tijuana",
            whatsappPhone: "+525512345678",
            playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
          }),
        "PUT",
        `/invitations/${ID}/features`,
        {
          timeZone: "America/Tijuana",
          whatsappPhone: "+525512345678",
          playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
        },
        FEATURED,
      ],
      [() => api.archive(ID), "POST", `/invitations/${ID}/archive`, undefined, SUMMARY],
      [() => api.publish(ID), "POST", `/invitations/${ID}/publish`, undefined, PUBLISHED],
      [() => api.unpublish(ID), "POST", `/invitations/${ID}/unpublish`, undefined, SUMMARY],
      [() => api.templates(), "GET", "/catalog/templates", undefined, [TEMPLATE]],
      [() => api.packages(), "GET", "/catalog/packages", undefined, [PACKAGE]],
    ];

    for (const [call, method, path, body, expected] of calls) {
      received = [];
      answer(200, expected);
      const result = await call();

      assert.deepEqual(result, { ok: true, value: expected }, `${method} ${path}`);
      const request = received[0];
      assert.equal(received.length, 1, `${method} ${path}`);
      assert.equal(request?.method, method);
      assert.equal(request?.url, path);
      assert.equal(request?.headers.cookie, SESSION_COOKIE);
      assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
      assert.equal(
        request?.headers["content-type"],
        body === undefined ? undefined : "application/json",
      );
      assert.equal(request?.body, body === undefined ? "" : JSON.stringify(body));
    }
  });

  it("keeps the API's order of the list", async () => {
    answer(200, [
      { ...SUMMARY, id: VERSION_ID },
      { ...SUMMARY, id: PACKAGE_ID },
    ]);

    const result = await client().list();

    assert.deepEqual(result.ok && result.value.map((item) => item.id), [VERSION_ID, PACKAGE_ID]);
  });

  it("makes no request without a session cookie, and makes none for an id that is not a UUID", async () => {
    assert.deepEqual(await client(null).list(), { ok: false, failure: "signed-out" });
    assert.deepEqual(await client("theme=dark").get(ID), { ok: false, failure: "signed-out" });

    const api = client();
    for (const id of ["", "1", "not-a-uuid", `${ID}/../x`]) {
      assert.deepEqual(await api.get(id), { ok: false, failure: "not-found" }, id);
      assert.deepEqual(await api.replaceContent(id, {}), { ok: false, failure: "not-found" }, id);
      assert.deepEqual(
        await api.updateInvitationFeatures(id, {
          timeZone: "America/Tijuana",
          whatsappPhone: null,
          playlistUrl: null,
        }),
        { ok: false, failure: "not-found" },
        id,
      );
      assert.deepEqual(await api.archive(id), { ok: false, failure: "not-found" }, id);
      assert.deepEqual(await api.publish(id), { ok: false, failure: "not-found" }, id);
      assert.deepEqual(await api.unpublish(id), { ok: false, failure: "not-found" }, id);
    }
    assert.deepEqual(received, []);
  });
});

describe("errors", () => {
  it("reports an ended session as signed-out", async () => {
    answer(401, { message: "Unauthorized" });

    assert.deepEqual(await client().list(), { ok: false, failure: "signed-out" });
  });

  it("maps every documented code of a 404, and an unreadable one to not-found", async () => {
    const cases: Array<[string | undefined, string]> = [
      ["INVITATION_NOT_FOUND", "not-found"],
      ["INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED", "version-not-published"],
      ["INVITATION_PACKAGE_NOT_FOUND", "package-not-found"],
      [undefined, "not-found"],
      ["SOMETHING_ELSE", "not-found"],
    ];

    for (const [code, failure] of cases) {
      answer(404, code === undefined ? {} : { code });
      assert.deepEqual(
        await client().create({ templateVersionId: VERSION_ID, packageId: PACKAGE_ID }),
        { ok: false, failure },
        String(code),
      );
    }
  });

  it("maps the 400 codes of a refused draft, and an unknown 400 to a validation failure", async () => {
    const cases: Array<[string | undefined, string]> = [
      ["INVITATION_PACKAGE_DOES_NOT_FIT", "package-does-not-fit"],
      ["INVALID_INVITATION_CONTENT", "content-invalid"],
      [undefined, "validation"],
    ];

    for (const [code, failure] of cases) {
      answer(400, code === undefined ? {} : { code, issues: ["content.age must be an integer"] });
      assert.deepEqual(
        await client().replaceContent(ID, { age: 1.5 }),
        { ok: false, failure },
        String(code),
      );
    }
  });

  it("maps the 400 feature issues the API names, and never trusts an unreadable list", async () => {
    const issues = [
      "timeZone must be one of the supported time zones",
      "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
    ];

    answer(400, { code: "INVALID_INVITATION_FEATURES", issues });
    assert.deepEqual(
      await client().updateInvitationFeatures(ID, {
        timeZone: "Europe/Madrid",
        whatsappPhone: "12",
        playlistUrl: null,
      }),
      { ok: false, failure: "features-invalid", issues },
    );

    answer(400, { code: "INVALID_INVITATION_FEATURES", issues: "timeZone" });
    assert.deepEqual(
      await client().updateInvitationFeatures(ID, {
        timeZone: "Europe/Madrid",
        whatsappPhone: null,
        playlistUrl: null,
      }),
      { ok: false, failure: "features-invalid" },
    );
  });

  it("maps the 409 codes of an archived draft", async () => {
    for (const [code, failure] of [
      ["INVITATION_NOT_EDITABLE", "not-editable"],
      ["INVITATION_ALREADY_ARCHIVED", "already-archived"],
    ] as const) {
      answer(409, { code });
      assert.deepEqual(await client().archive(ID), { ok: false, failure }, code);
    }
  });

  it("maps the 409 codes of a publication, with the readiness issues of a refused publish", async () => {
    answer(409, { code: "INVITATION_ALREADY_PUBLISHED" });
    assert.deepEqual(await client().publish(ID), { ok: false, failure: "already-published" });

    answer(409, { code: "INVITATION_NOT_PUBLISHED" });
    assert.deepEqual(await client().unpublish(ID), { ok: false, failure: "not-published" });

    answer(409, {
      code: "INVITATION_NOT_PUBLISHABLE",
      issues: ["content.date is required to publish", "template version is no longer published"],
    });
    assert.deepEqual(await client().publish(ID), {
      ok: false,
      failure: "not-publishable",
      issues: ["content.date is required to publish", "template version is no longer published"],
    });

    // An issues list that is not an array of strings is not trusted either way.
    answer(409, { code: "INVITATION_NOT_PUBLISHABLE", issues: "content.date" });
    assert.deepEqual(await client().publish(ID), { ok: false, failure: "not-publishable" });
  });

  it("maps the 402 payment gate, and refuses a 402 without its code", async () => {
    answer(402, { code: "INVITATION_PAYMENT_REQUIRED", reason: "PAYMENT_REQUIRED" });
    assert.deepEqual(await client().publish(ID), { ok: false, failure: "payment-required" });

    answer(402, { code: "SOMETHING_ELSE" });
    await assert.rejects(client().publish(ID), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      assert.equal(error.status, 402);
      return true;
    });
  });

  it("fails closed on a 5xx, a redirect, and a success body that breaks the contract", async () => {
    answer(503, { code: "INVITATION_SLUG_UNAVAILABLE" });
    await assert.rejects(
      client().create({ templateVersionId: VERSION_ID, packageId: PACKAGE_ID }),
      {
        name: "ApiClientError",
        kind: "unavailable",
        status: 503,
      },
    );

    answer(302, "");
    await assert.rejects(client().list(), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      assert.equal(error.status, 302);
      return true;
    });

    answer(200, "not json");
    await assert.rejects(client().list(), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });

    answer(200, [{ ...SUMMARY, status: "EXPIRED" }]);
    await assert.rejects(client().list(), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });
  });
});

describe("validators", () => {
  it("accepts the documented shapes and keeps only the fields the pages use", () => {
    assert.deepEqual(parseInvitationSummaries([{ ...SUMMARY, extra: true }]), [SUMMARY]);
    assert.deepEqual(parseOwnedInvitation({ ...OWNED, ownerId: "leak" }), OWNED);
    assert.deepEqual(parseCreatorTemplates([TEMPLATE]), [TEMPLATE]);
    assert.deepEqual(parseCreatorPackages([{ ...PACKAGE, status: "ACTIVE" }]), [PACKAGE]);
  });

  it("refuses a summary with a status, slug, timestamp, or id that breaks the contract", () => {
    const broken = [
      { ...SUMMARY, id: "1" },
      { ...SUMMARY, templateVersionId: null },
      { ...SUMMARY, packageId: 7 },
      { ...SUMMARY, slug: "" },
      { ...SUMMARY, slug: "Inv itacion" },
      { ...SUMMARY, status: "EXPIRED" },
      { ...SUMMARY, publishedAt: "yesterday" },
      { ...SUMMARY, publishedAt: undefined },
      { ...SUMMARY, archivedAt: "yesterday" },
      { ...SUMMARY, createdAt: 0 },
      { ...SUMMARY, updatedAt: null },
    ];

    for (const summary of broken) {
      assert.equal(parseInvitationSummaries([summary]), undefined, JSON.stringify(summary));
    }
    assert.equal(parseInvitationSummaries("[]"), undefined);
    assert.equal(parseInvitationSummaries([SUMMARY, null]), undefined);
  });

  it("refuses content that is not a JSON object of primitive values", () => {
    for (const content of [
      null,
      [],
      "text",
      { nested: { a: 1 } },
      { list: [1] },
      { empty: null },
    ]) {
      assert.equal(parseOwnedInvitation({ ...OWNED, content }), undefined, JSON.stringify(content));
    }
    assert.equal(parseOwnedInvitation({ ...OWNED, missingRequiredFields: "date" }), undefined);
    assert.equal(parseOwnedInvitation({ ...OWNED, missingRequiredFields: [1] }), undefined);
  });

  it("keeps the stored feature data, and refuses a zone or a feature key it does not know (S4)", () => {
    const broken = [
      { ...OWNED, timeZone: undefined },
      { ...OWNED, timeZone: "Europe/Madrid" },
      { ...OWNED, timeZone: "America/mexico_city" },
      { ...OWNED, timeZone: 7 },
      { ...OWNED, featureSettings: undefined },
      { ...OWNED, featureSettings: {} },
      { ...OWNED, featureSettings: { whatsappPhone: 7, playlistUrl: null } },
      // The API stores E.164, so a national number is not a stored phone this client reads.
      { ...OWNED, featureSettings: { whatsappPhone: "5512345678", playlistUrl: null } },
      // The stored link is an https URL of bounded length or null (S7).
      { ...OWNED, featureSettings: { whatsappPhone: null, playlistUrl: 7 } },
      {
        ...OWNED,
        featureSettings: { whatsappPhone: null, playlistUrl: "http://open.spotify.com/x" },
      },
      {
        ...OWNED,
        featureSettings: {
          whatsappPhone: null,
          playlistUrl: `https://open.spotify.com/${"a".repeat(500)}`,
        },
      },
      { ...OWNED, availableFeatures: undefined },
      { ...OWNED, availableFeatures: "CALENDAR" },
      { ...OWNED, availableFeatures: ["CALENDAR", "PLAYLIST"] },
      { ...OWNED, availableFeatures: [7] },
    ];

    for (const value of broken) {
      assert.equal(parseOwnedInvitation(value), undefined, JSON.stringify(value));
    }
    assert.deepEqual(parseOwnedInvitation(FEATURED), FEATURED);
  });

  it("refuses a template or a package that breaks the creator catalog contract", () => {
    assert.equal(parseCreatorTemplates([{ ...TEMPLATE, publishedVersion: null }]), undefined);
    assert.equal(parseCreatorTemplates([{ ...TEMPLATE, category: { key: "k" } }]), undefined);
    assert.equal(
      parseCreatorTemplates([
        { ...TEMPLATE, publishedVersion: { ...TEMPLATE.publishedVersion, version: 0 } },
      ]),
      undefined,
    );
    assert.equal(
      parseCreatorPackages([{ ...PACKAGE, currentPrice: { amountMinor: 1.5 } }]),
      undefined,
    );
    assert.equal(parseCreatorPackages([{ ...PACKAGE, includedFeatureKeys: [1] }]), undefined);
    assert.deepEqual(parseCreatorPackages([{ ...PACKAGE, currentPrice: null }]), [
      { ...PACKAGE, currentPrice: null },
    ]);
  });

  it("keeps the published version's configuration, which the chooser previews (S9)", () => {
    // The configuration is read as stored: the web reads a theme from it and never from a catalog name, and
    // an unreadable snapshot is the renderer's refusal, not a reason to drop the template here.
    const [parsed] =
      parseCreatorTemplates([
        {
          ...TEMPLATE,
          publishedVersion: {
            ...TEMPLATE.publishedVersion,
            configuration: { componentKey: "birthday-map-01", theme: "dinosaurs" },
          },
        },
      ]) ?? [];

    assert.deepEqual(parsed?.publishedVersion.configuration, {
      componentKey: "birthday-map-01",
      theme: "dinosaurs",
    });
  });

  it("recognises the canonical UUID shape the API accepts as an id", () => {
    assert.equal(isInvitationId(ID), true);
    assert.equal(isInvitationId(ID.toUpperCase()), true);
    for (const value of ["", "123", `${ID} `, null, 7]) {
      assert.equal(isInvitationId(value), false, String(value));
    }
  });
});
