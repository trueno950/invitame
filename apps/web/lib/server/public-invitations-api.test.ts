import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import {
  createPublicInvitationsClient,
  type PublicInvitation,
  parsePublicInvitation,
} from "./public-invitations-api.ts";

// The web server's client of the public invitation read (M5 T5; S1, S5, A3, A7). A guest is anonymous:
// the call carries no cookie at all, keeps the web-to-API proxy secret, and maps a 404 to "not found"
// and a 5xx to an outage the page renders as its own unavailable state.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const AT = "2026-11-12T15:30:00.000Z";

const PUBLIC: PublicInvitation = {
  slug: "invitacion-k7m2qx",
  componentKey: "birthday-poster-01",
  configuration: { componentKey: "birthday-poster-01", theme: "dinosaurs" },
  content: {
    celebrantName: "Ana",
    age: 7,
    date: "2026-12-05",
    time: "16:30",
    location: "Jardín Los Pinos",
    address: "Calle Reforma 123",
    mainPhoto: "https://example.com/ana.jpg",
    message: "Ven a celebrar conmigo.",
  },
  publishedAt: AT,
  timeZone: "America/Mexico_City",
  features: {
    countdown: true,
    map: true,
    calendar: true,
    whatsapp: { phone: "+525512345678" },
  },
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
  answer(200, PUBLIC);
});

function client() {
  return createPublicInvitationsClient({
    config: {
      apiOrigin,
      proxySecret: PROXY_SECRET,
      clientIpHeader: "x-invitame-client-ip",
      edgeClientIpHeader: "x-real-ip",
    },
  });
}

describe("public read", () => {
  it("calls GET /public/invitations/:slug with the proxy secret and no cookie", async () => {
    const result = await client().getBySlug(PUBLIC.slug);

    assert.deepEqual(result, { ok: true, value: PUBLIC });
    assert.equal(received.length, 1);
    const request = received[0];
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, `/public/invitations/${PUBLIC.slug}`);
    // A guest has no session: the request carries no cookie, not even an empty one.
    assert.equal(request?.headers.cookie, undefined);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(request?.body, "");
  });

  it("keeps the proxy secret optional, as the API allows outside production", async () => {
    const anonymous = createPublicInvitationsClient({
      config: {
        apiOrigin,
        proxySecret: undefined,
        clientIpHeader: "x-invitame-client-ip",
        edgeClientIpHeader: "x-real-ip",
      },
    });

    assert.deepEqual(await anonymous.getBySlug(PUBLIC.slug), { ok: true, value: PUBLIC });
    assert.equal(received[0]?.headers["x-invitame-proxy-secret"], undefined);
    assert.equal(received[0]?.headers.cookie, undefined);
  });
});

describe("outcomes", () => {
  it("answers not-found for a 404 and never reads its body", async () => {
    answer(404, { code: "PUBLIC_INVITATION_NOT_FOUND" });

    assert.deepEqual(await client().getBySlug(PUBLIC.slug), { ok: false, failure: "not-found" });
    assert.equal(received.length, 1);
  });

  it("makes no request for a slug that cannot be one", async () => {
    const api = client();

    for (const slug of ["", "Invitacion", "a-", "a".repeat(61), "invitacion--doble", "../cuenta"]) {
      assert.deepEqual(await api.getBySlug(slug), { ok: false, failure: "not-found" }, slug);
    }
    assert.deepEqual(received, []);
  });

  it("throws unavailable for a 5xx, rejected for another refusal, and invalid-response for a body that breaks the contract", async () => {
    answer(503, { code: "SOMETHING_ELSE" });
    await assert.rejects(client().getBySlug(PUBLIC.slug), {
      name: "ApiClientError",
      kind: "unavailable",
      status: 503,
    });

    answer(302, "");
    await assert.rejects(client().getBySlug(PUBLIC.slug), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      assert.equal(error.status, 302);
      return true;
    });

    answer(200, "not json");
    await assert.rejects(client().getBySlug(PUBLIC.slug), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });

    answer(200, { ...PUBLIC, content: null });
    await assert.rejects(client().getBySlug(PUBLIC.slug), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "invalid-response");
      return true;
    });
  });
});

describe("parsePublicInvitation", () => {
  it("accepts the documented shape and keeps only the fields the public page uses", () => {
    assert.deepEqual(parsePublicInvitation({ ...PUBLIC, ownerId: "leak", status: "PUBLISHED" }), {
      ...PUBLIC,
    });
    assert.deepEqual(parsePublicInvitation({ ...PUBLIC, publishedAt: null }), {
      ...PUBLIC,
      publishedAt: null,
    });
  });

  it("refuses a slug, componentKey, configuration, content, or publishedAt that breaks the contract", () => {
    const broken: unknown[] = [
      { ...PUBLIC, slug: "" },
      { ...PUBLIC, slug: "Invitacion K7" },
      { ...PUBLIC, slug: "a".repeat(61) },
      { ...PUBLIC, componentKey: "" },
      { ...PUBLIC, componentKey: 7 },
      { ...PUBLIC, configuration: null },
      { ...PUBLIC, configuration: ["sunset"] },
      { ...PUBLIC, content: null },
      { ...PUBLIC, content: "text" },
      { ...PUBLIC, publishedAt: "yesterday" },
      { ...PUBLIC, publishedAt: 0 },
      null,
      [],
      "text",
    ];

    for (const value of broken) {
      assert.equal(parsePublicInvitation(value), undefined, JSON.stringify(value));
    }
  });

  it("reads the stored zone and the gated features, and refuses any other shape (S4)", () => {
    const broken: unknown[] = [
      { ...PUBLIC, timeZone: undefined },
      { ...PUBLIC, timeZone: "Europe/Madrid" },
      { ...PUBLIC, timeZone: 7 },
      { ...PUBLIC, features: undefined },
      { ...PUBLIC, features: null },
      { ...PUBLIC, features: { ...PUBLIC.features, countdown: "yes" } },
      { ...PUBLIC, features: { ...PUBLIC.features, map: 1 } },
      // Add-to-calendar is always available to a guest, so anything but `true` is not this contract.
      { ...PUBLIC, features: { ...PUBLIC.features, calendar: false } },
      { ...PUBLIC, features: { ...PUBLIC.features, calendar: "true" } },
      { ...PUBLIC, features: { ...PUBLIC.features, whatsapp: undefined } },
      { ...PUBLIC, features: { ...PUBLIC.features, whatsapp: {} } },
      { ...PUBLIC, features: { ...PUBLIC.features, whatsapp: "+525512345678" } },
      // A stored phone is E.164: a national number is not one a guest page reads.
      { ...PUBLIC, features: { ...PUBLIC.features, whatsapp: { phone: "5512345678" } } },
      { ...PUBLIC, features: { ...PUBLIC.features, whatsapp: { phone: 7 } } },
    ];

    for (const value of broken) {
      assert.equal(parsePublicInvitation(value), undefined, JSON.stringify(value));
    }
    assert.deepEqual(
      parsePublicInvitation({
        ...PUBLIC,
        features: { countdown: false, map: false, calendar: true, whatsapp: null },
      }),
      {
        ...PUBLIC,
        features: { countdown: false, map: false, calendar: true, whatsapp: null },
      },
    );
  });
});
