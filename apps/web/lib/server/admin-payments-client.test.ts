import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";

import { createAdminPaymentsClient } from "./admin-payments-client.ts";
import { ApiClientError } from "./api-client.ts";

// The web server's client of the administrator payments API (M7 T3; S1, S3). A real local HTTP server stands in for
// the API: the client forwards only Better Auth's cookies and the proxy secret, asks for the bounded paid read, maps
// each documented refusal to a typed outcome, and fails closed on anything else without keeping a response body.

const PROXY_SECRET = randomBytes(32).toString("base64url");
const SESSION_COOKIE = "better-auth.session_token=signed.value";
const PAYMENT_ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const INVITATION_ID = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";
const AT = "2026-11-12T10:00:00.000Z";

const PAYMENT = {
  paymentId: PAYMENT_ID,
  invitationId: INVITATION_ID,
  invitationSlug: "ana-y-daniel",
  status: "paid",
  amountMinor: 150000,
  currency: "MXN",
  paidAt: AT,
  refundable: true,
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
  answer(200, [PAYMENT]);
});

function client(cookie: string | null = `theme=dark; ${SESSION_COOKIE}; _ga=GA1`) {
  return createAdminPaymentsClient(
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
  it("reads the bounded list of paid payments with only the session cookie and the secret", async () => {
    assert.deepEqual(await client().list(), { ok: true, value: [PAYMENT] });

    const request = received[0];
    assert.equal(received.length, 1);
    assert.equal(request?.method, "GET");
    assert.equal(request?.url, "/admin/payments?status=paid&limit=50");
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
  });

  it("asks for the refund of one payment with a POST and no body", async () => {
    answer(200, { outcome: "requested" });

    assert.deepEqual(await client().refund(PAYMENT_ID), {
      ok: true,
      value: { outcome: "requested" },
    });

    const request = received[0];
    assert.equal(received.length, 1);
    assert.equal(request?.method, "POST");
    assert.equal(request?.url, `/admin/payments/${PAYMENT_ID}/refund`);
    assert.equal(request?.headers.cookie, SESSION_COOKIE);
    assert.equal(request?.headers["x-invitame-proxy-secret"], PROXY_SECRET);
    assert.equal(request?.body, "");
    assert.equal(request?.headers["content-type"], undefined);
  });

  it("ignores fields the pages do not render", async () => {
    answer(200, [
      {
        ...PAYMENT,
        providerReference: "123456789",
        payerEmail: "alguien@ejemplo.com",
        notificationId: "mercadopago-123-approved",
      },
    ]);

    assert.deepEqual(await client().list(), { ok: true, value: [PAYMENT] });
  });

  it("answers signed out without calling the API when there is no session cookie", async () => {
    for (const cookie of [null, "", "theme=dark"]) {
      const api = client(cookie);
      assert.deepEqual(await api.list(), { ok: false, failure: "signed-out" });
      assert.deepEqual(await api.refund(PAYMENT_ID), { ok: false, failure: "signed-out" });
    }
    assert.equal(received.length, 0);
  });

  it("answers not found without calling the API when the payment id is not a UUID", async () => {
    const api = client();
    for (const id of ["", "x", "../payments", `${PAYMENT_ID}/refund`, `${PAYMENT_ID}?a=1`]) {
      assert.deepEqual(await api.refund(id), { ok: false, failure: "not-found" }, id);
    }
    assert.equal(received.length, 0);
  });

  it("fails closed on a row outside the contract", async () => {
    for (const row of [
      { ...PAYMENT, status: "approved" },
      { ...PAYMENT, refundable: "yes" },
      { ...PAYMENT, amountMinor: -1 },
      { ...PAYMENT, amountMinor: 10.5 },
      { ...PAYMENT, paidAt: "ayer" },
      { ...PAYMENT, currency: "" },
      { ...PAYMENT, invitationSlug: "" },
      { ...PAYMENT, paymentId: "no-es-un-uuid" },
    ]) {
      answer(200, [row]);
      await assert.rejects(
        client().list(),
        (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
        JSON.stringify(row),
      );
    }
  });

  it("fails closed on a refund answer that is not the documented one", async () => {
    answer(200, { outcome: "refunded" });
    await assert.rejects(
      client().refund(PAYMENT_ID),
      (error: unknown) => error instanceof ApiClientError && error.kind === "invalid-response",
    );
  });
});

describe("the outcomes the page handles", () => {
  it("maps 401, 403, and 404", async () => {
    const cases: Array<[number, string]> = [
      [401, "signed-out"],
      [403, "forbidden"],
      [404, "not-found"],
    ];
    for (const [status, failure] of cases) {
      answer(status, { message: "detail", statusCode: status });
      assert.deepEqual(await client().refund(PAYMENT_ID), { ok: false, failure }, String(status));
    }
  });

  it("maps a 400 without a known code to validation", async () => {
    answer(400, { message: ["limit must be an integer"], statusCode: 400 });
    assert.deepEqual(await client().list(), { ok: false, failure: "validation" });
  });

  it("maps every refund refusal code to the message the page shows", async () => {
    const cases: Array<[number, string, string]> = [
      [404, "PAYMENT_NOT_FOUND", "not-found"],
      [409, "PAYMENT_NOT_REFUNDABLE", "not-refundable"],
      [409, "INVITATION_ALREADY_PUBLISHED", "already-published"],
      [503, "PAYMENT_PROVIDER_UNAVAILABLE", "provider-unavailable"],
    ];
    for (const [status, code, failure] of cases) {
      answer(status, { code });
      assert.deepEqual(await client().refund(PAYMENT_ID), { ok: false, failure }, code);
    }
  });

  it("treats an unknown refusal code, other 4xx, and redirects as rejected", async () => {
    for (const [status, body] of [
      [409, { code: "PAYMENT_ALREADY_PAID" }],
      [409, { message: "conflict" }],
      [422, { code: "PAYMENT_NOT_REFUNDABLE" }],
      [302, {}],
    ] as Array<[number, unknown]>) {
      answer(status, body);
      await assert.rejects(
        client().refund(PAYMENT_ID),
        (error: unknown) => error instanceof ApiClientError && error.kind === "rejected",
        String(status),
      );
    }
  });

  it("treats a 5xx without the provider code as unavailable without the response body", async () => {
    answer(500, { code: "INTERNAL_ERROR", detail: "no debe leerse" });
    await assert.rejects(
      client().list(),
      (error: unknown) => error instanceof ApiClientError && error.kind === "unavailable",
    );
  });

  it("treats a 503 without the provider code as unavailable", async () => {
    answer(503, { message: "sin código" });
    await assert.rejects(
      client().refund(PAYMENT_ID),
      (error: unknown) => error instanceof ApiClientError && error.kind === "unavailable",
    );
  });
});
