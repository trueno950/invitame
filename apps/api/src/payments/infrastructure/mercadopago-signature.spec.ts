import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import {
  MERCADOPAGO_SIGNATURE_TOLERANCE_SECONDS,
  type MercadoPagoFailure,
  MercadoPagoPaymentProvider,
} from "./mercadopago-payment-provider";

// The Mercado Pago webhook signature (T1, S4). The provider signs `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
// with the webhook secret and sends the digest in `x-signature`. These vectors prove one rule each, against an
// injected `fetch`: a valid delivery is re-read from the provider, and every forged, stale, or incomplete one is
// refused before any request leaves the API. Nothing here reaches a network.

const API_BASE_URL = "https://api.mercadopago.test";
const ACCESS_TOKEN = "test-access-token-not-a-real-credential";
const WEBHOOK_SECRET = "test-webhook-secret-not-a-real-credential";
const PAYMENT_ID = "123456";
const REQUEST_ID = "request-1";
const PAYMENT_REFERENCE = "8a1b2c3d-1111-4111-8111-111111111111";
const RECEIVED_AT = new Date("2026-11-21T16:00:00.000Z");
const RECEIVED_SECONDS = Math.floor(RECEIVED_AT.getTime() / 1000);

const PAYMENT = {
  id: Number(PAYMENT_ID),
  status: "approved",
  external_reference: PAYMENT_REFERENCE,
  transaction_amount: 250,
  currency_id: "MXN",
  date_approved: "2026-11-21T11:59:00.000-04:00",
  date_last_updated: "2026-11-21T11:59:30.000-04:00",
  // Never read, never stored, and never logged: payer data stays with the provider.
  payer: { email: "payer@example.test", first_name: "Ada" },
};

interface CapturedRequest {
  url: string;
  init: RequestInit;
}

function signatureOf(input: {
  dataId: string;
  requestId: string;
  ts: string;
  secret?: string;
}): string {
  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${input.ts};`;
  const digest = createHmac("sha256", input.secret ?? WEBHOOK_SECRET)
    .update(manifest, "utf8")
    .digest("hex");

  return `ts=${input.ts},v1=${digest}`;
}

function harness(options: { payment?: unknown; status?: number; secret?: string } = {}) {
  const requests: CapturedRequest[] = [];
  const failures: MercadoPagoFailure[] = [];
  const provider = new MercadoPagoPaymentProvider({
    accessToken: ACCESS_TOKEN,
    webhookSecret: WEBHOOK_SECRET,
    returnBaseUrl: "https://app.example.test",
    webhookBaseUrl: "https://api.example.test",
    apiBaseUrl: API_BASE_URL,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(options.payment ?? PAYMENT), {
        status: options.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
    reportFailure: (failure) => failures.push(failure),
  });

  return { provider, requests, failures };
}

function delivery(
  input: {
    ts?: string;
    dataId?: string;
    requestId?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
    secret?: string;
    receivedAt?: Date;
  } = {},
) {
  const dataId = input.dataId ?? PAYMENT_ID;
  const requestId = input.requestId ?? REQUEST_ID;
  const ts = input.ts ?? String(RECEIVED_SECONDS);

  return {
    rawBody: JSON.stringify(
      input.body ?? { type: "payment", action: "payment.updated", data: { id: dataId } },
    ),
    headers: {
      "x-signature": signatureOf({
        dataId,
        requestId,
        ts,
        ...(input.secret ? { secret: input.secret } : {}),
      }),
      "x-request-id": requestId,
      ...input.headers,
    },
    query: input.query ?? { "data.id": dataId },
    receivedAt: input.receivedAt ?? RECEIVED_AT,
  };
}

describe("Mercado Pago webhook signature (T1, S4)", () => {
  it("accepts a well-formed signature and re-reads the payment from the provider", async () => {
    const { provider, requests } = harness();

    const verification = await provider.verifyWebhook(delivery());

    assert.equal(verification.ok, true);
    assert.deepEqual(verification.ok ? verification.event : null, {
      eventId: `mercadopago-${PAYMENT_ID}-approved`,
      type: "paid",
      providerReference: PAYMENT_REFERENCE,
      amountMinor: 25_000,
      currency: "MXN",
      occurredAt: new Date("2026-11-21T11:59:00.000-04:00"),
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, `${API_BASE_URL}/v1/payments/${PAYMENT_ID}`);
    assert.equal(requests[0]?.init.method, "GET");
    const headers = new Headers(requests[0]?.init.headers);
    assert.equal(headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  });

  it("accepts the two signature fields in either order", async () => {
    const { provider } = harness();
    const request = delivery();
    const [ts, v1] = (request.headers["x-signature"] ?? "").split(",");

    const verification = await provider.verifyWebhook({
      ...request,
      headers: { ...request.headers, "x-signature": `${v1},${ts}` },
    });

    assert.equal(verification.ok, true);
  });

  it("accepts a millisecond timestamp, which Mercado Pago also sends", async () => {
    const { provider } = harness();
    const milliseconds = String(RECEIVED_AT.getTime());

    const verification = await provider.verifyWebhook(delivery({ ts: milliseconds }));

    assert.equal(verification.ok, true);
  });

  it("accepts a timestamp exactly at the edge of the window and refuses the second beyond it", async () => {
    const { provider } = harness();
    const edge = String(RECEIVED_SECONDS - MERCADOPAGO_SIGNATURE_TOLERANCE_SECONDS);
    const beyond = String(RECEIVED_SECONDS - MERCADOPAGO_SIGNATURE_TOLERANCE_SECONDS - 1);

    assert.equal((await provider.verifyWebhook(delivery({ ts: edge }))).ok, true);
    assert.deepEqual(await provider.verifyWebhook(delivery({ ts: beyond })), { ok: false });
  });

  it("refuses a delivery signed with another secret, before asking the provider anything", async () => {
    const { provider, requests } = harness();

    const verification = await provider.verifyWebhook(
      delivery({ secret: "another-webhook-secret-not-a-real-credential" }),
    );

    assert.deepEqual(verification, { ok: false });
    assert.equal(requests.length, 0);
  });

  it("refuses a signature that covers another notification id", async () => {
    const { provider, requests } = harness();
    const request = delivery({ query: { "data.id": "999999" } });

    const verification = await provider.verifyWebhook(request);

    assert.deepEqual(verification, { ok: false });
    assert.equal(requests.length, 0);
  });

  it("refuses a delivery with no signature, no request id, or no notification id", async () => {
    const { provider, requests } = harness();
    const request = delivery();
    const { "x-signature": _signature, ...withoutSignature } = request.headers;
    const { "x-request-id": _requestId, ...withoutRequestId } = request.headers;

    for (const forged of [
      { ...request, headers: withoutSignature },
      { ...request, headers: withoutRequestId },
      { ...request, headers: { ...request.headers, "x-signature": "v1=not-a-digest" } },
      // A signed body that names no notification id, and a query that names none either.
      { ...request, rawBody: JSON.stringify({ type: "payment" }), query: {} },
    ]) {
      assert.deepEqual(await provider.verifyWebhook(forged), { ok: false });
    }
    assert.equal(requests.length, 0);
  });

  it("reads the notification id from the body when the query carries none", async () => {
    const { provider, requests } = harness();

    const verification = await provider.verifyWebhook(
      delivery({ query: {}, body: { type: "payment", data: { id: PAYMENT_ID } } }),
    );

    assert.equal(verification.ok, true);
    assert.equal(requests.length, 1);
  });

  it("lower-cases an alphanumeric notification id, as the provider signs it", async () => {
    const signedLowercase = harness({ payment: { ...PAYMENT, id: "abc123" } });
    const accepted = await signedLowercase.provider.verifyWebhook(
      delivery({ dataId: "abc123", query: { "data.id": "AbC123" } }),
    );

    assert.equal(accepted.ok, true);
    assert.equal(signedLowercase.requests[0]?.url, `${API_BASE_URL}/v1/payments/abc123`);

    // The same delivery signed without lower-casing the id is not the manifest the provider sends.
    const signedAsSent = harness({ payment: { ...PAYMENT, id: "abc123" } });
    const refused = await signedAsSent.provider.verifyWebhook(
      delivery({ dataId: "AbC123", query: { "data.id": "AbC123" } }),
    );

    assert.deepEqual(refused, { ok: false });
    assert.equal(signedAsSent.requests.length, 0);
  });

  it("answers an authentic notification of another topic without asking for a payment", async () => {
    const { provider, requests } = harness();

    const verification = await provider.verifyWebhook(
      delivery({ body: { type: "merchant_order", data: { id: PAYMENT_ID } } }),
    );

    assert.deepEqual(verification, { ok: true, event: null });
    assert.equal(requests.length, 0);
  });

  it("answers an authentic payment whose status maps to nothing as ignored", async () => {
    const { provider } = harness({ payment: { ...PAYMENT, status: "in_process" } });

    assert.deepEqual(await provider.verifyWebhook(delivery()), { ok: true, event: null });
  });
});
