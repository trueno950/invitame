import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import {
  createPublicCatalogClient,
  type PublicCatalogPackage,
  parsePublicCatalogPackages,
} from "./public-catalog-api.ts";

// The web server's client of the landing's public price list (T4; S4). A landing's visitor is anonymous: the call
// carries no cookie at all, keeps the web-to-API proxy secret, and any body that is not the documented contract is
// refused whole, so the landing falls back to «Precio por definir» instead of printing a price nobody confirmed.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const PACKAGES_PATH = "/public/catalog/packages";

/** The three seeded packages as the API answers them: current MXN prices and the included feature keys. */
const PACKAGES: readonly PublicCatalogPackage[] = [
  {
    key: "basic",
    name: "Basic",
    description: "Una selección inicial para empezar a planificar.",
    features: ["COUNTDOWN", "MAP", "WHATSAPP"],
    price: { amountMinor: 19_900, currency: "MXN" },
  },
  {
    key: "premium",
    name: "Premium",
    description: "Más recursos para una experiencia visual completa.",
    features: ["COUNTDOWN", "MUSIC", "GALLERY", "MAP", "RSVP", "WHATSAPP"],
    price: { amountMinor: 39_900, currency: "MXN" },
  },
  // A package the administration has not priced yet: the card says «Precio por definir».
  { key: "deluxe", name: "Deluxe", description: null, features: [], price: null },
];

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
  answer(200, PACKAGES);
});

function client() {
  return createPublicCatalogClient({
    config: {
      apiOrigin,
      proxySecret: PROXY_SECRET,
      clientIpHeader: "x-invitame-client-ip",
      edgeClientIpHeader: "x-real-ip",
    },
  });
}

describe("landing price list read", () => {
  it("calls GET /public/catalog/packages with the proxy secret and no cookie", async () => {
    assert.deepEqual(await client().listPackages(), PACKAGES);

    assert.equal(received.length, 1);
    const request = received[0];
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, PACKAGES_PATH);
    // A landing's visitor has no session: the request carries no cookie, not even an empty one.
    assert.equal(request?.headers.cookie, undefined);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(request?.body, "");
  });

  it("keeps the proxy secret optional, as the API allows outside production", async () => {
    const anonymous = createPublicCatalogClient({
      config: {
        apiOrigin,
        proxySecret: undefined,
        clientIpHeader: "x-invitame-client-ip",
        edgeClientIpHeader: "x-real-ip",
      },
    });

    assert.deepEqual(await anonymous.listPackages(), PACKAGES);
    assert.equal(received[0]?.headers["x-invitame-proxy-secret"], undefined);
    assert.equal(received[0]?.headers.cookie, undefined);
  });

  it("accepts a catalog with no active package, so the landing still renders its own cards", async () => {
    answer(200, []);

    assert.deepEqual(await client().listPackages(), []);
  });
});

describe("landing price list outcomes", () => {
  it("throws unavailable for a 5xx and rejected for any other refusal", async () => {
    answer(503, { code: "SOMETHING_ELSE" });
    await assert.rejects(client().listPackages(), {
      name: "ApiClientError",
      kind: "unavailable",
      status: 503,
    });

    answer(302, "");
    await assert.rejects(client().listPackages(), (error: unknown) => {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.kind, "rejected");
      assert.equal(error.status, 302);
      return true;
    });
  });

  it("throws invalid-response for a body that breaks the contract", async () => {
    for (const body of [
      "not json",
      {},
      [{ ...PACKAGES[0], key: "" }],
      [{ ...PACKAGES[0], name: "" }],
      [{ ...PACKAGES[0], description: 7 }],
      [{ ...PACKAGES[0], features: "COUNTDOWN" }],
      [{ ...PACKAGES[0], features: ["countdown"] }],
      [{ ...PACKAGES[0], price: { amountMinor: 19_900 } }],
      [{ ...PACKAGES[0], price: { amountMinor: 199.5, currency: "MXN" } }],
      [{ ...PACKAGES[0], price: { amountMinor: -1, currency: "MXN" } }],
      // The landing sells in Mexican pesos (S4): another currency is not this contract.
      [{ ...PACKAGES[0], price: { amountMinor: 9_900, currency: "USD" } }],
      // A duplicate key would render two cards under one React key.
      [PACKAGES[0], PACKAGES[0]],
    ]) {
      answer(200, body);
      await assert.rejects(client().listPackages(), (error: unknown) => {
        assert.ok(error instanceof ApiClientError, JSON.stringify(body));
        assert.equal(error.kind, "invalid-response", JSON.stringify(body));
        return true;
      });
    }
  });
});

describe("parsePublicCatalogPackages", () => {
  it("keeps only the fields the landing uses", () => {
    const body = [
      { ...PACKAGES[0], id: "leak", status: "ACTIVE", durationDays: 30, createdAt: "2026-01-01" },
    ];

    assert.deepEqual(parsePublicCatalogPackages(body), [PACKAGES[0]]);
  });

  it("refuses a value that is not a list of packages at all", () => {
    for (const value of [
      undefined,
      null,
      "packages",
      7,
      {},
      [null],
      [{}],
      [{ ...PACKAGES[0], key: "basic-basic-basic".repeat(10) }],
      [{ ...PACKAGES[0], features: ["A".repeat(101)] }],
    ]) {
      assert.equal(
        parsePublicCatalogPackages(value),
        undefined,
        JSON.stringify(value)?.slice(0, 80),
      );
    }
  });
});
