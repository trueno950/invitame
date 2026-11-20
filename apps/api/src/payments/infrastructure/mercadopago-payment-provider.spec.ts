import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";

import type { CheckoutIntent } from "../application/payment-provider.port";
import {
  MERCADOPAGO_MAX_BODY_BYTES,
  MERCADOPAGO_TIMEOUT_MS,
  type MercadoPagoFailure,
  MercadoPagoPaymentProvider,
} from "./mercadopago-payment-provider";

// The Mercado Pago adapter (T1, S1, S2, S4) against an in-process HTTP server on 127.0.0.1. Every request the adapter
// makes is answered here, so the suite proves the exact preference body, the payment re-read, the refund, and every
// way a provider can fail — status, timeout, oversized answer, invalid JSON — without reaching Mercado Pago. The
// access token and the webhook secret are test values that exist only in this file, and one case proves the reported
// failures never carry them, a payer datum, or a body.

const ACCESS_TOKEN = "test-access-token-not-a-real-credential";
const WEBHOOK_SECRET = "test-webhook-secret-not-a-real-credential";
const RETURN_BASE_URL = "https://app.example.test";
const WEBHOOK_BASE_URL = "https://api.example.test";
const PAYMENT_ID = "8a1b2c3d-1111-4111-8111-111111111111";
const INVITATION_ID = "33333333-3333-4333-8333-333333333333";
const MP_PAYMENT_ID = "123456";
const REQUEST_ID = "request-1";
const RECEIVED_AT = new Date("2026-11-21T16:00:00.000Z");
const TS = String(Math.floor(RECEIVED_AT.getTime() / 1000));
const INIT_POINT = "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=abc";

interface CapturedRequest {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: string;
}

interface Answer {
  status?: number;
  body?: string;
  /** Holds the socket open, so the adapter's own timeout is the only way the request ends. */
  hang?: boolean;
}

type Responder = (request: CapturedRequest) => Answer;

interface FakeServer {
  baseUrl: string;
  requests: CapturedRequest[];
}

async function startServer(respond: Responder): Promise<{
  server: FakeServer;
  stop: () => Promise<void>;
}> {
  const requests: CapturedRequest[] = [];
  const httpServer = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const captured: CapturedRequest = {
        method: request.method ?? "GET",
        url: request.url ?? "/",
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      requests.push(captured);

      const answer = respond(captured);
      if (answer.hang) {
        return;
      }
      response.writeHead(answer.status ?? 200, { "content-type": "application/json" });
      response.end(answer.body ?? "");
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  return {
    server: { baseUrl, requests },
    async stop() {
      httpServer.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

async function withServer(respond: Responder, run: (server: FakeServer) => Promise<void>) {
  const { server, stop } = await startServer(respond);

  try {
    await run(server);
  } finally {
    await stop();
  }
}

function providerFor(
  baseUrl: string,
  options: { timeoutMs?: number } = {},
): { provider: MercadoPagoPaymentProvider; failures: MercadoPagoFailure[] } {
  const failures: MercadoPagoFailure[] = [];
  const provider = new MercadoPagoPaymentProvider({
    accessToken: ACCESS_TOKEN,
    webhookSecret: WEBHOOK_SECRET,
    returnBaseUrl: RETURN_BASE_URL,
    webhookBaseUrl: WEBHOOK_BASE_URL,
    apiBaseUrl: baseUrl,
    timeoutMs: options.timeoutMs ?? MERCADOPAGO_TIMEOUT_MS,
    reportFailure: (failure) => failures.push(failure),
  });

  return { provider, failures };
}

function intentOf(overrides: Partial<CheckoutIntent> = {}): CheckoutIntent {
  return {
    paymentId: PAYMENT_ID,
    invitationId: INVITATION_ID,
    amountMinor: 25_000,
    currency: "MXN",
    idempotencyKey: "idem-1",
    ...overrides,
  };
}

function paymentOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: Number(MP_PAYMENT_ID),
    status: "approved",
    external_reference: PAYMENT_ID,
    transaction_amount: 250,
    currency_id: "MXN",
    date_approved: "2026-11-21T11:59:00.000-04:00",
    date_last_updated: "2026-11-21T11:59:30.000-04:00",
    date_created: "2026-11-21T11:58:00.000-04:00",
    payer: { email: "payer@example.test", first_name: "Ada" },
    ...overrides,
  };
}

/** One signed delivery, exactly as the provider builds it. */
function signedDelivery(overrides: { body?: unknown; query?: Record<string, string> } = {}) {
  const manifest = `id:${MP_PAYMENT_ID};request-id:${REQUEST_ID};ts:${TS};`;

  return {
    rawBody: JSON.stringify(
      overrides.body ?? { type: "payment", action: "payment.updated", data: { id: MP_PAYMENT_ID } },
    ),
    headers: {
      "x-signature": `ts=${TS},v1=${createHmac("sha256", WEBHOOK_SECRET).update(manifest, "utf8").digest("hex")}`,
      "x-request-id": REQUEST_ID,
    },
    query: overrides.query ?? { "data.id": MP_PAYMENT_ID },
    receivedAt: RECEIVED_AT,
  };
}

describe("Mercado Pago checkout (T1, S1)", () => {
  it("creates one preference in MXN and answers the provider's redirect", async () => {
    await withServer(
      () => ({
        body: JSON.stringify({
          id: "pref-1",
          init_point: INIT_POINT,
          sandbox_init_point: "https://sandbox.mercadopago.com/x",
        }),
      }),
      async (server) => {
        const { provider } = providerFor(server.baseUrl);

        const session = await provider.createCheckout(intentOf());

        assert.deepEqual(session, { providerReference: PAYMENT_ID, redirectUrl: INIT_POINT });
        assert.equal(server.requests.length, 1);
        const [request] = server.requests;
        assert.ok(request);
        assert.equal(request.method, "POST");
        assert.equal(request.url, "/checkout/preferences");
        assert.equal(request.headers.authorization, `Bearer ${ACCESS_TOKEN}`);
        assert.equal(request.headers["x-idempotency-key"], "idem-1");
        assert.match(String(request.headers["content-type"]), /application\/json/);
        assert.deepEqual(JSON.parse(request.body), {
          items: [
            {
              title: "Paquete InvitaMe",
              quantity: 1,
              unit_price: 250,
              currency_id: "MXN",
            },
          ],
          external_reference: PAYMENT_ID,
          back_urls: {
            success: `${RETURN_BASE_URL}/cuenta/invitaciones/${INVITATION_ID}/pago`,
            failure: `${RETURN_BASE_URL}/cuenta/invitaciones/${INVITATION_ID}/pago`,
            pending: `${RETURN_BASE_URL}/cuenta/invitaciones/${INVITATION_ID}/pago`,
          },
          auto_return: "approved",
          notification_url: `${WEBHOOK_BASE_URL}/payments/webhooks/mercadopago`,
        });
      },
    );
  });

  it("sends the snapshot amount as a decimal price, to the cent", async () => {
    await withServer(
      () => ({ body: JSON.stringify({ init_point: INIT_POINT }) }),
      async (server) => {
        const { provider } = providerFor(server.baseUrl);

        await provider.createCheckout(intentOf({ amountMinor: 1_999 }));

        const body = JSON.parse(server.requests[0]?.body ?? "{}") as {
          items?: Array<{ unit_price?: unknown }>;
        };
        assert.equal(body.items?.[0]?.unit_price, 19.99);
      },
    );
  });

  it("refuses a currency other than MXN without asking the provider", async () => {
    await withServer(
      () => ({ body: JSON.stringify({ init_point: INIT_POINT }) }),
      async (server) => {
        const { provider } = providerFor(server.baseUrl);

        await assert.rejects(provider.createCheckout(intentOf({ currency: "USD" })));
        assert.equal(server.requests.length, 0);
      },
    );
  });

  it("refuses a redirect that is not an https Mercado Pago or Mercado Libre host", async () => {
    for (const initPoint of [
      "https://evil.example.test/checkout",
      "http://www.mercadopago.com.mx/checkout",
      "https://www.mercadopago.com.mx.evil.test/checkout",
      "https://www.mercadopago.evil.com/checkout",
      "https://mercadolibre.attacker.co/checkout",
      "not-a-url",
    ]) {
      await withServer(
        () => ({ body: JSON.stringify({ init_point: initPoint }) }),
        async (server) => {
          const { provider } = providerFor(server.baseUrl);

          await assert.rejects(provider.createCheckout(intentOf()), initPoint);
        },
      );
    }
  });

  it("fails closed on a provider status, an oversized answer, invalid JSON, or no redirect", async () => {
    const answers: Responder[] = [
      () => ({ status: 500, body: JSON.stringify({ message: "boom" }) }),
      () => ({
        body: JSON.stringify({
          init_point: INIT_POINT,
          padding: "x".repeat(MERCADOPAGO_MAX_BODY_BYTES),
        }),
      }),
      () => ({ body: "not-json" }),
      () => ({ body: JSON.stringify({ id: "pref-1" }) }),
    ];

    for (const respond of answers) {
      await withServer(respond, async (server) => {
        const { provider, failures } = providerFor(server.baseUrl);

        await assert.rejects(provider.createCheckout(intentOf()));
        assert.equal(failures.length, 1);
      });
    }
  });
});

describe("Mercado Pago payment re-read (T1, S2, S4)", () => {
  it("normalizes only the payment fields the domain needs", async () => {
    await withServer(
      () => ({ body: JSON.stringify(paymentOf({ transaction_amount: 1234.56 })) }),
      async (server) => {
        const { provider } = providerFor(server.baseUrl);

        const verification = await provider.verifyWebhook(signedDelivery());

        assert.deepEqual(verification, {
          ok: true,
          event: {
            eventId: `mercadopago-${MP_PAYMENT_ID}-approved`,
            type: "paid",
            providerReference: PAYMENT_ID,
            amountMinor: 123_456,
            currency: "MXN",
            occurredAt: new Date("2026-11-21T11:59:00.000-04:00"),
          },
        });
        assert.equal(server.requests[0]?.method, "GET");
        assert.equal(server.requests[0]?.url, `/v1/payments/${MP_PAYMENT_ID}`);
      },
    );
  });

  it("maps each provider status to one event type, and the rest to ignored", async () => {
    const cases: ReadonlyArray<readonly [string, "paid" | "failed" | "refunded" | null]> = [
      ["approved", "paid"],
      ["rejected", "failed"],
      ["cancelled", "failed"],
      ["refunded", "refunded"],
      ["charged_back", "refunded"],
      ["pending", null],
      ["in_process", null],
      ["in_mediation", null],
    ];

    for (const [status, type] of cases) {
      await withServer(
        () => ({ body: JSON.stringify(paymentOf({ status })) }),
        async (server) => {
          const { provider } = providerFor(server.baseUrl);

          const verification = await provider.verifyWebhook(signedDelivery());

          assert.equal(verification.ok, true, status);
          if (verification.ok) {
            assert.equal(verification.event?.type ?? null, type, status);
            if (verification.event !== null) {
              assert.equal(verification.event.eventId, `mercadopago-${MP_PAYMENT_ID}-${status}`);
            }
          }
        },
      );
    }
  });

  it("keeps the provider's currency, which the intake then compares with the snapshot", async () => {
    await withServer(
      () => ({ body: JSON.stringify(paymentOf({ currency_id: "USD" })) }),
      async (server) => {
        const { provider } = providerFor(server.baseUrl);

        const verification = await provider.verifyWebhook(signedDelivery());

        assert.equal(verification.ok && verification.event?.currency, "USD");
      },
    );
  });

  it("falls back to the last update when the approval instant is absent", async () => {
    await withServer(
      () => ({ body: JSON.stringify(paymentOf({ date_approved: null })) }),
      async (server) => {
        const { provider } = providerFor(server.baseUrl);

        const verification = await provider.verifyWebhook(signedDelivery());

        assert.deepEqual(
          verification.ok ? verification.event?.occurredAt : null,
          new Date("2026-11-21T11:59:30.000-04:00"),
        );
      },
    );
  });

  it("carries the refund or failure instant instead of the approval instant (R3-001)", async () => {
    for (const status of ["refunded", "charged_back", "rejected", "cancelled"]) {
      await withServer(
        () => ({ body: JSON.stringify(paymentOf({ status })) }),
        async (server) => {
          const { provider } = providerFor(server.baseUrl);

          const verification = await provider.verifyWebhook(signedDelivery());

          assert.deepEqual(
            verification.ok ? verification.event?.occurredAt : null,
            new Date("2026-11-21T11:59:30.000-04:00"),
            status,
          );
        },
      );
    }
  });

  it("falls back from the update to the creation instant, and refuses a payment with no instant (R3-001)", async () => {
    const cases: ReadonlyArray<readonly [Record<string, unknown>, Date | null]> = [
      [
        paymentOf({ status: "refunded", date_last_updated: null }),
        new Date("2026-11-21T11:58:00.000-04:00"),
      ],
      [
        paymentOf({ date_approved: null, date_last_updated: null }),
        new Date("2026-11-21T11:58:00.000-04:00"),
      ],
      [
        paymentOf({ status: "refunded", date_last_updated: "not-a-date", date_created: null }),
        null,
      ],
      [paymentOf({ date_approved: null, date_last_updated: null, date_created: null }), null],
    ];

    for (const [payment, expected] of cases) {
      await withServer(
        () => ({ body: JSON.stringify(payment) }),
        async (server) => {
          const { provider } = providerFor(server.baseUrl);

          const verification = await provider.verifyWebhook(signedDelivery());

          if (expected === null) {
            assert.deepEqual(verification, { ok: false });
            return;
          }

          assert.deepEqual(verification.ok ? verification.event?.occurredAt : null, expected);
        },
      );
    }
  });

  it("refuses an amount that is not exact cents, or a payment this API cannot identify", async () => {
    for (const payment of [
      paymentOf({ transaction_amount: 250.005 }),
      paymentOf({ transaction_amount: "250.00" }),
      paymentOf({ external_reference: null }),
      paymentOf({ external_reference: "not a reference" }),
      paymentOf({ currency_id: "pesos" }),
      { id: Number(MP_PAYMENT_ID), status: "approved" },
    ]) {
      await withServer(
        () => ({ body: JSON.stringify(payment) }),
        async (server) => {
          const { provider } = providerFor(server.baseUrl);

          assert.deepEqual(await provider.verifyWebhook(signedDelivery()), { ok: false });
        },
      );
    }
  });

  it("refuses a signed delivery that names no topic, and ignores another known topic (R4-002)", async () => {
    await withServer(
      () => ({ body: JSON.stringify(paymentOf()) }),
      async (server) => {
        const { provider } = providerFor(server.baseUrl);

        // Neither the body nor the query names a topic: a malformed delivery the provider has to send again.
        assert.deepEqual(
          await provider.verifyWebhook(
            signedDelivery({
              body: { action: "payment.updated", data: { id: MP_PAYMENT_ID } },
              query: {},
            }),
          ),
          { ok: false },
        );
        assert.equal(server.requests.length, 0);

        // An authentic delivery of another topic the provider sends still decides nothing.
        assert.deepEqual(
          await provider.verifyWebhook(
            signedDelivery({ body: { type: "merchant_order", data: { id: MP_PAYMENT_ID } } }),
          ),
          { ok: true, event: null },
        );
        assert.equal(server.requests.length, 0);
      },
    );
  });

  it("answers a failure the provider can retry when the re-read fails", async () => {
    const answers: Responder[] = [
      () => ({ status: 500, body: JSON.stringify({ message: "boom" }) }),
      () => ({ status: 404, body: "{}" }),
      () => ({ body: "not-json" }),
      () => ({
        body: JSON.stringify(paymentOf({ padding: "x".repeat(MERCADOPAGO_MAX_BODY_BYTES) })),
      }),
      () => ({ hang: true }),
    ];

    for (const respond of answers) {
      await withServer(respond, async (server) => {
        const { provider, failures } = providerFor(server.baseUrl, { timeoutMs: 100 });

        assert.deepEqual(await provider.verifyWebhook(signedDelivery()), { ok: false });
        assert.equal(failures.length, 1);
      });
    }
  });
});

describe("Mercado Pago refund (T1, S3)", () => {
  it("finds the approved payment of our reference and asks for a full refund", async () => {
    await withServer(
      (request) =>
        request.url.startsWith("/v1/payments/search")
          ? {
              body: JSON.stringify({
                results: [
                  { id: 111, status: "rejected" },
                  { id: 222, status: "approved" },
                ],
              }),
            }
          : { body: JSON.stringify({ id: 9, payment_id: 222, amount: 250 }) },
      async (server) => {
        const { provider } = providerFor(server.baseUrl);

        assert.deepEqual(await provider.refund(PAYMENT_ID, "idem-9"), { ok: true });
        assert.equal(server.requests.length, 2);
        const [search, refund] = server.requests;
        assert.ok(search && refund);
        assert.equal(search.method, "GET");
        assert.equal(search.url, `/v1/payments/search?external_reference=${PAYMENT_ID}`);
        assert.equal(search.headers.authorization, `Bearer ${ACCESS_TOKEN}`);
        assert.equal(refund.method, "POST");
        assert.equal(refund.url, "/v1/payments/222/refunds");
        assert.equal(refund.headers.authorization, `Bearer ${ACCESS_TOKEN}`);
        assert.equal(refund.headers["x-idempotency-key"], "idem-9");
        // No amount: a full refund of the payment.
        assert.deepEqual(JSON.parse(refund.body), {});
      },
    );
  });

  it("answers the refund's success without refunding again when the payment is already refunded (R4-001)", async () => {
    for (const status of ["refunded", "charged_back"]) {
      await withServer(
        () => ({ body: JSON.stringify({ results: [{ id: 222, status }] }) }),
        async (server) => {
          const { provider } = providerFor(server.baseUrl);

          assert.deepEqual(await provider.refund(PAYMENT_ID, "idem-9"), { ok: true }, status);
          assert.equal(server.requests.length, 1, status);
          assert.equal(server.requests[0]?.url.startsWith("/v1/payments/search"), true, status);
        },
      );
    }
  });

  it("still refuses to refund a payment in another status (R4-001)", async () => {
    for (const results of [
      [{ id: 111, status: "pending" }],
      [{ id: 111, status: "in_process" }],
      [{ id: 111, status: "cancelled" }],
      [],
    ]) {
      await withServer(
        () => ({ body: JSON.stringify({ results }) }),
        async (server) => {
          const { provider } = providerFor(server.baseUrl);

          assert.deepEqual(await provider.refund(PAYMENT_ID, "idem-9"), { ok: false });
          assert.equal(server.requests.length, 1);
        },
      );
    }
  });

  it("answers a failure without refunding when no approved payment answers the reference", async () => {
    await withServer(
      () => ({ body: JSON.stringify({ results: [{ id: 111, status: "rejected" }] }) }),
      async (server) => {
        const { provider } = providerFor(server.baseUrl);

        assert.deepEqual(await provider.refund(PAYMENT_ID, "idem-9"), { ok: false });
        assert.equal(server.requests.length, 1);
      },
    );
  });

  it("answers a failure when the search or the refund request fails", async () => {
    const answers: Responder[] = [
      () => ({ status: 500, body: "{}" }),
      (request) =>
        request.url.startsWith("/v1/payments/search")
          ? { body: JSON.stringify({ results: [{ id: 222, status: "approved" }] }) }
          : { status: 402, body: JSON.stringify({ message: "not enough balance" }) },
    ];

    for (const respond of answers) {
      await withServer(respond, async (server) => {
        const { provider } = providerFor(server.baseUrl);

        assert.deepEqual(await provider.refund(PAYMENT_ID, "idem-9"), { ok: false });
      });
    }
  });
});

describe("Mercado Pago failure reporting (T1, S4)", () => {
  it("reports one structured category and never the credential, the secret, a payer datum, or a body", async () => {
    await withServer(
      () => ({
        status: 500,
        body: JSON.stringify({ message: `token ${ACCESS_TOKEN} secret ${WEBHOOK_SECRET}` }),
      }),
      async (server) => {
        const { provider, failures } = providerFor(server.baseUrl);

        await assert.rejects(provider.createCheckout(intentOf()));
        assert.equal((await provider.verifyWebhook(signedDelivery())).ok, false);
        assert.deepEqual(await provider.refund(PAYMENT_ID, "idem-9"), { ok: false });

        assert.ok(failures.length >= 3);
        for (const failure of failures) {
          assert.equal(failure.event, "mercadopago-request-failed");
          assert.equal(typeof failure.category, "string");
          const reported = JSON.stringify(failure);
          for (const forbidden of [ACCESS_TOKEN, WEBHOOK_SECRET, "payer@example.test", "Ada"]) {
            assert.equal(reported.includes(forbidden), false, reported);
          }
        }
      },
    );
  });
});
