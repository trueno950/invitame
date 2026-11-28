import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { type INestApplication, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { MemoryPaymentCatalog, MemoryPaymentRepository } from "../../../test/memory-payments";
import { createApp } from "../../app.setup";
import { AccessControlModule } from "../../auth/access-control/access-control.module";
import { INVITATION_ACCESS_RESOLVER } from "../../collaborators/application/invitation-access";
import { createAuth } from "../../auth/auth.factory";
import { BackgroundTasks } from "../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../../config/config.module";
import { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../email/infrastructure/system-email-delivery-runtime";
import { PAYMENT_REPOSITORY } from "../application/payment.repository";
import {
  EmitSimulatedPaymentUseCase,
  GetInvitationPaymentUseCase,
  StartCheckoutUseCase,
} from "../application/payment.use-cases";
import { PAYMENT_CATALOG } from "../application/payment-catalog";
import { PAYMENT_PROVIDER } from "../application/payment-provider.port";
import { HandlePaymentWebhookUseCase } from "../application/payment-webhook.use-case";
import { PAYMENTS_MODE_TOKEN } from "../application/payments-mode";
import { PAYMENT_STATUS, type PaymentEventOutcome } from "../domain/payment";
import { DisabledPaymentProvider } from "../infrastructure/disabled-payment-provider";
import { SimulatedPaymentProvider } from "../infrastructure/simulated-payment-provider";
import { InvitationPaymentsController } from "./invitation-payments.controller";
import { PaymentsController } from "./payments.controller";

// The payment REST contract (M7 S1, S4) through the shared `createApp` boundary, the project-owned guard, and Better
// Auth on the in-memory adapter, with the real simulated provider and in-memory persistence. What this suite owns is
// the HTTP behavior the specification names: the owner session is the only source of the owner, checkout resumes one
// pending payment and answers its snapshot, the webhook is public but refuses anything the signature does not prove
// with one 400 and no detail, a duplicate answers 200 and changes nothing, an out-of-order event is recorded and
// ignored, and the development emit is refused outside a simulated deployment. PostgreSQL behavior (the unique
// indexes, the transaction) is proved in the `*.db-spec.ts` suite.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const SECRET = "local-simulated-payments-secret-of-32-chars";
const SIGNATURE_HEADER = "x-invitame-signature";
const OWNER = "11111111-1111-4111-8111-111111111111";
const _OTHER_OWNER = "22222222-2222-4222-8222-222222222222";
const INVITATION = "33333333-3333-4333-8333-333333333333";
const PACKAGE = "44444444-4444-4444-8444-444444444444";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const PRICE = { amountMinor: 25_000, currency: "MXN" };

type Row = Record<string, unknown>;

/** One signed simulated delivery, built exactly as the adapter builds it. */
function signedWebhook(
  event: Record<string, unknown>,
  options: { secret?: string; timestamp?: number; rawBody?: string } = {},
): { body: string; headers: Record<string, string> } {
  const body = options.rawBody ?? JSON.stringify(event);
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", options.secret ?? SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return {
    body,
    headers: {
      "content-type": "application/json",
      [SIGNATURE_HEADER]: `t=${timestamp},v1=${digest}`,
    },
  };
}

function eventOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: "evt-1",
    type: "paid",
    providerReference: `simulated-${UNKNOWN_ID}`,
    amountMinor: PRICE.amountMinor,
    currency: PRICE.currency,
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

interface Harness {
  app: INestApplication;
  baseUrl: string;
  repository: MemoryPaymentRepository;
  catalog: MemoryPaymentCatalog;
  cookies: Map<string, string>;
  signIn(label: string): Promise<{ userId: string; cookie: string }>;
  /** Makes this suite's invitation belong to the given signed-in customer. */
  ownInvitation(userId: string): void;
  send(
    method: string,
    path: string,
    options?: { cookie?: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<Response>;
}

async function startHarness(paymentsEnvironment: Record<string, unknown>): Promise<Harness> {
  const database: Record<string, Row[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  const secret = randomBytes(32).toString("base64url");
  const auth = createAuth({
    secret,
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [TRUSTED_ORIGIN],
    database: memoryAdapter(database),
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });

  const repository = new MemoryPaymentRepository();
  repository.invitations.splice(0, repository.invitations.length, {
    id: INVITATION,
    ownerId: OWNER,
    packageId: PACKAGE,
    status: "DRAFT",
  });
  const catalog = new MemoryPaymentCatalog();
  // The harness's invitations live under its own ids, so the price table is keyed by this suite's package.
  catalog.prices.clear();
  catalog.prices.set(PACKAGE, PRICE);
  const mode = paymentsEnvironment.PAYMENTS_MODE as "free" | "simulated";
  // The same adapter choice the module makes, so a free deployment is exercised with the adapter it binds.
  const provider =
    mode === "free"
      ? new DisabledPaymentProvider()
      : new SimulatedPaymentProvider({ secret: SECRET, returnBaseUrl: TRUSTED_ORIGIN });
  const webhook = new HandlePaymentWebhookUseCase(repository, provider);

  @Module({
    imports: [
      createConfigModule({
        NODE_ENV: "development",
        CORS_ORIGIN: TRUSTED_ORIGIN,
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
        BETTER_AUTH_SECRET: secret,
        AUTH_BASE_URL,
        ...paymentsEnvironment,
      }),
      AuthModule.forRoot({
        auth,
        disableTrustedOriginsCors: true,
        disableGlobalAuthGuard: true,
        // The webhook route reads the exact bytes the provider signed (M7 S4).
        bodyParser: { rawBody: true },
      }),
      AccessControlModule,
    ],
    controllers: [InvitationPaymentsController, PaymentsController],
    providers: [
      // The invitation routes declare `InvitationAccessGuard` (F12; L17.4); this suite exercises the payment rules, so
      // the resolver answers the session user as the owner of whatever id the path names and the repository fake decides
      // what a foreign or missing one is, exactly as before.
      {
        provide: INVITATION_ACCESS_RESOLVER,
        useValue: {
          resolve: async (userId: string, invitationId: string) => ({
            invitationId,
            ownerId: userId,
            role: "OWNER" as const,
            permissions: [],
          }),
        },
      },
      { provide: PAYMENTS_MODE_TOKEN, useValue: mode },
      { provide: PAYMENT_PROVIDER, useValue: provider },
      { provide: PAYMENT_REPOSITORY, useValue: repository },
      { provide: PAYMENT_CATALOG, useValue: catalog },
      { provide: HandlePaymentWebhookUseCase, useValue: webhook },
      {
        provide: StartCheckoutUseCase,
        useValue: new StartCheckoutUseCase(repository, catalog, provider, mode, () => randomUUID()),
      },
      {
        provide: GetInvitationPaymentUseCase,
        useValue: new GetInvitationPaymentUseCase(repository, catalog, mode),
      },
      {
        provide: EmitSimulatedPaymentUseCase,
        useValue: new EmitSimulatedPaymentUseCase(repository, provider, mode, webhook),
      },
    ],
  })
  class PaymentsTestModule {}

  const app = await createApp(PaymentsTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  const cookies = new Map<string, string>();

  return {
    app,
    baseUrl,
    repository,
    catalog,
    cookies,
    async signIn(label: string): Promise<{ userId: string; cookie: string }> {
      const context = await auth.$context;
      const created = await context.internalAdapter.createUser(
        {
          email: `m7-${label}-${randomUUID()}@example.test`,
          name: "",
          emailVerified: true,
        },
        { method: "email-otp" },
      );
      const session = await context.internalAdapter.createSession(created.id);
      const signature = createHmac("sha256", secret).update(session.token).digest("base64");
      const cookie = `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`;
      cookies.set(created.id, cookie);

      return { userId: created.id, cookie };
    },
    ownInvitation(userId: string): void {
      repository.invitations[0]!.ownerId = userId;
    },
    send(method, path, options = {}) {
      return fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(options.cookie ? { cookie: options.cookie } : {}),
          ...options.headers,
        },
        ...(options.body === undefined
          ? {}
          : {
              body: typeof options.body === "string" ? options.body : JSON.stringify(options.body),
            }),
      });
    },
  };
}

describe("payments controller webhook request mapping (T1, S4)", () => {
  function controllerWith() {
    const received: Array<Record<string, unknown>> = [];
    const webhook = {
      execute: async (input: Record<string, unknown>) => {
        received.push(input);
        return { outcome: "ignored" as const };
      },
    };
    const emit = { execute: async () => ({ outcome: "processed" as const }) };

    return {
      controller: new PaymentsController(
        webhook as unknown as HandlePaymentWebhookUseCase,
        emit as unknown as EmitSimulatedPaymentUseCase,
      ),
      received,
    };
  }

  it("passes the parsed query, the raw body, and the headers of one delivery", async () => {
    const { controller, received } = controllerWith();
    const headers = { "x-signature": "ts=1,v1=abc", "x-request-id": "req-1" };

    const response = await controller.receiveWebhook("mercadopago", {
      headers,
      rawBody: Buffer.from('{"type":"payment"}'),
      // Express hands repeated query parameters over as an array; the adapter signs one value per key.
      query: { "data.id": "123456", type: ["payment", "merchant_order"], empty: "" },
    } as unknown as never);

    assert.deepEqual(response, { outcome: "ignored" });
    const [input] = received;
    assert.ok(input);
    assert.equal(input.provider, "mercadopago");
    assert.equal(input.rawBody, '{"type":"payment"}');
    assert.deepEqual(input.headers, headers);
    assert.deepEqual(input.query, { "data.id": "123456", type: "payment", empty: "" });
    assert.ok(input.receivedAt instanceof Date);
  });

  it("passes an empty query when the request carries none", async () => {
    const { controller, received } = controllerWith();

    const response = await controller.receiveWebhook("mercadopago", {
      headers: {},
      rawBody: "",
    } as unknown as never);

    assert.deepEqual(response, { outcome: "ignored" });
    assert.deepEqual(received[0]?.query, {});
  });
});

describe("payments routes with a simulated deployment (M7 S1, S4)", () => {
  let harness: Harness;
  let ownerCookie: string;

  before(async () => {
    harness = await startHarness({
      PAYMENTS_MODE: "simulated",
      PAYMENTS_SIMULATED_SECRET: SECRET,
    });
    const owner = await harness.signIn("owner");
    harness.ownInvitation(owner.userId);
    ownerCookie = owner.cookie;
  });

  after(async () => {
    await harness?.app.close();
  });

  describe("access control", () => {
    it("answers 401 on the owner routes without a session and stores nothing", async () => {
      for (const [method, path] of [
        ["POST", `/invitations/${INVITATION}/checkout`],
        ["GET", `/invitations/${INVITATION}/payment`],
        ["POST", `/payments/simulated/${UNKNOWN_ID}/emit`],
      ] as const) {
        const response = await harness.send(method, path, {
          ...(method === "POST" && path.includes("/emit") ? { body: { outcome: "paid" } } : {}),
        });

        assert.equal(response.status, 401, `${method} ${path}`);
      }
      assert.equal(harness.repository.payments.length, 0);
    });

    it("answers 404 when the payment id is not a UUID, before reaching a port", async () => {
      const response = await harness.send("POST", "/payments/simulated/not-a-uuid/emit", {
        cookie: ownerCookie,
        body: { outcome: "paid" },
      });

      assert.equal(response.status, 400);
    });
  });

  describe("checkout and payment read", () => {
    it("creates one pending payment with the price snapshot and answers its redirect", async () => {
      const response = await harness.send("POST", `/invitations/${INVITATION}/checkout`, {
        cookie: ownerCookie,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), [
        "amountMinor",
        "currency",
        "paymentId",
        "redirectUrl",
      ]);
      assert.equal(body.amountMinor, PRICE.amountMinor);
      assert.equal(body.currency, PRICE.currency);
      assert.equal(
        body.redirectUrl,
        `${TRUSTED_ORIGIN}/cuenta/invitaciones/${INVITATION}/pago/simulado/${body.paymentId}`,
      );

      const read = await harness.send("GET", `/invitations/${INVITATION}/payment`, {
        cookie: ownerCookie,
      });
      assert.equal(read.status, 200);
      assert.deepEqual(await read.json(), {
        paymentRequired: true,
        status: "pending",
        amountMinor: PRICE.amountMinor,
        currency: PRICE.currency,
        paidAt: null,
      });
    });

    it("resumes the same pending payment and keeps its snapshot after the catalog price changes", async () => {
      const first = (await (
        await harness.send("POST", `/invitations/${INVITATION}/checkout`, { cookie: ownerCookie })
      ).json()) as Row;
      harness.catalog.prices.set(PACKAGE, { amountMinor: 90_000, currency: "MXN" });

      const second = await harness.send("POST", `/invitations/${INVITATION}/checkout`, {
        cookie: ownerCookie,
      });
      const body = (await second.json()) as Row;

      assert.equal(second.status, 200);
      assert.equal(body.paymentId, first.paymentId);
      assert.equal(body.amountMinor, PRICE.amountMinor);
      assert.equal(harness.repository.payments.length, 1);
    });

    it("answers 404 for another customer's invitation, like an unknown one", async () => {
      const strangerCookie = (await harness.signIn("stranger")).cookie;

      for (const [method, path] of [
        ["POST", `/invitations/${INVITATION}/checkout`],
        ["GET", `/invitations/${INVITATION}/payment`],
      ] as const) {
        const response = await harness.send(method, path, { cookie: strangerCookie });
        assert.equal(response.status, 404, `${method} ${path}`);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
    });

    it("answers 409 for an archived invitation", async () => {
      harness.repository.invitations[0]!.status = "ARCHIVED";

      try {
        const response = await harness.send("POST", `/invitations/${INVITATION}/checkout`, {
          cookie: ownerCookie,
        });
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
      } finally {
        harness.repository.invitations[0]!.status = "DRAFT";
      }
    });

    it("answers 409 PAYMENT_NOT_REQUIRED when the package's current price is zero", async () => {
      harness.catalog.prices.set(PACKAGE, { amountMinor: 0, currency: "MXN" });

      try {
        const response = await harness.send("POST", `/invitations/${INVITATION}/checkout`, {
          cookie: ownerCookie,
        });
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { code: "PAYMENT_NOT_REQUIRED" });
      } finally {
        harness.catalog.prices.set(PACKAGE, PRICE);
      }
    });

    it("answers 409 PAYMENT_PRICE_UNAVAILABLE when the catalog cannot price the package", async () => {
      harness.catalog.prices.set(PACKAGE, null);

      try {
        const response = await harness.send("POST", `/invitations/${INVITATION}/checkout`, {
          cookie: ownerCookie,
        });
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { code: "PAYMENT_PRICE_UNAVAILABLE" });
      } finally {
        harness.catalog.prices.set(PACKAGE, PRICE);
      }
    });
  });

  describe("simulated emit", () => {
    it("requires the owner session and refuses another customer's payment with 404", async () => {
      const strangerCookie = (await harness.signIn("stranger")).cookie;
      const payment = harness.repository.payments[0]!;

      const response = await harness.send("POST", `/payments/simulated/${payment.id}/emit`, {
        cookie: strangerCookie,
        body: { outcome: "paid" },
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "PAYMENT_NOT_FOUND" });
      assert.equal(payment.status, "pending");
    });

    it("refuses an outcome outside paid and failed", async () => {
      const payment = harness.repository.payments[0]!;
      const response = await harness.send("POST", `/payments/simulated/${payment.id}/emit`, {
        cookie: ownerCookie,
        body: { outcome: "refunded" },
      });

      assert.equal(response.status, 400);
    });

    it("signs an event through the public intake and marks the payment paid", async () => {
      const payment = harness.repository.payments[0]!;
      const response = await harness.send("POST", `/payments/simulated/${payment.id}/emit`, {
        cookie: ownerCookie,
        body: { outcome: "paid" },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { outcome: "processed" });
      const read = await harness.send("GET", `/invitations/${INVITATION}/payment`, {
        cookie: ownerCookie,
      });
      const body = (await read.json()) as Row;
      assert.equal(body.status, "paid");
      assert.equal(body.paymentRequired, false);
      assert.equal(typeof body.paidAt, "string");
    });

    it("answers a repeated emit as a duplicate and keeps the payment where it is", async () => {
      const payment = harness.repository.payments[0]!;
      const response = await harness.send("POST", `/payments/simulated/${payment.id}/emit`, {
        cookie: ownerCookie,
        body: { outcome: "paid" },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { outcome: "duplicate" });
      assert.equal(harness.repository.payments[0]?.status, "paid");
    });

    it("refuses a second checkout once the invitation is paid", async () => {
      const response = await harness.send("POST", `/invitations/${INVITATION}/checkout`, {
        cookie: ownerCookie,
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "PAYMENT_ALREADY_PAID" });
    });
  });

  describe("public webhook", () => {
    it("refuses an unsigned delivery with one 400 and changes nothing", async () => {
      const before = harness.repository.events.length;
      const response = await harness.send("POST", "/payments/webhooks/simulated", {
        body: eventOf(),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: "PAYMENT_WEBHOOK_REJECTED" });
      assert.equal(harness.repository.events.length, before);
    });

    it("refuses a delivery signed with another secret", async () => {
      const signed = signedWebhook(eventOf(), {
        secret: "another-local-simulated-secret-of-32-chars",
      });
      const response = await harness.send("POST", "/payments/webhooks/simulated", {
        body: signed.body,
        headers: signed.headers,
      });

      assert.equal(response.status, 400);
    });

    it("refuses a stale timestamp and a tampered body", async () => {
      const stale = signedWebhook(eventOf(), {
        timestamp: Math.floor(Date.now() / 1000) - 301,
      });
      const staleResponse = await harness.send("POST", "/payments/webhooks/simulated", {
        body: stale.body,
        headers: stale.headers,
      });
      assert.equal(staleResponse.status, 400);

      const tampered = signedWebhook(eventOf());
      const tamperedResponse = await harness.send("POST", "/payments/webhooks/simulated", {
        body: tampered.body.replace(String(PRICE.amountMinor), "1"),
        headers: tampered.headers,
      });
      assert.equal(tamperedResponse.status, 400);
    });

    it("refuses a signed but malformed body", async () => {
      const signed = signedWebhook({}, { rawBody: "not-json" });
      const response = await harness.send("POST", "/payments/webhooks/simulated", {
        body: signed.body,
        headers: signed.headers,
      });

      assert.equal(response.status, 400);
    });

    it("answers 404 for a provider this deployment does not configure", async () => {
      const signed = signedWebhook(eventOf());
      const response = await harness.send("POST", "/payments/webhooks/mercadopago", {
        body: signed.body,
        headers: signed.headers,
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "PAYMENT_PROVIDER_NOT_FOUND" });
    });

    it("applies a verified event for a known reference and answers a duplicate as a no-op", async () => {
      const payment = harness.repository.seedPayment({ providerReference: `ref-${randomUUID()}` });
      const event = eventOf({
        eventId: `evt-${randomUUID()}`,
        providerReference: payment.providerReference,
      });
      const signed = signedWebhook(event);

      const first = await harness.send("POST", "/payments/webhooks/simulated", {
        body: signed.body,
        headers: signed.headers,
      });
      assert.equal(first.status, 200);
      assert.deepEqual(await first.json(), { outcome: "processed" });
      assert.equal(
        harness.repository.payments.find((stored) => stored.id === payment.id)?.status,
        "paid",
      );

      const duplicate = await harness.send("POST", "/payments/webhooks/simulated", {
        body: signed.body,
        headers: signed.headers,
      });
      assert.equal(duplicate.status, 200);
      assert.deepEqual(await duplicate.json(), { outcome: "duplicate" });
    });

    it("records an out-of-order failure as ignored and keeps the payment paid", async () => {
      const payment = harness.repository.seedPayment({ providerReference: `ref-${randomUUID()}` });
      const paid = signedWebhook(
        eventOf({ eventId: `evt-${randomUUID()}`, providerReference: payment.providerReference }),
      );
      await harness.send("POST", "/payments/webhooks/simulated", {
        body: paid.body,
        headers: paid.headers,
      });

      const failed = signedWebhook(
        eventOf({
          eventId: `evt-${randomUUID()}`,
          type: "failed",
          providerReference: payment.providerReference,
        }),
      );
      const response = await harness.send("POST", "/payments/webhooks/simulated", {
        body: failed.body,
        headers: failed.headers,
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { outcome: "processed" });
      const stored = harness.repository.payments.find((candidate) => candidate.id === payment.id);
      assert.equal(stored?.status, "paid");
      const outcomes = harness.repository.events
        .filter((event) => event.paymentId === payment.id)
        .map((event) => event.outcome as PaymentEventOutcome);
      assert.deepEqual(outcomes, ["applied", "ignored_transition"]);
    });

    it("takes no session: an unauthenticated delivery is verified by the signature alone", async () => {
      const payment = harness.repository.seedPayment({
        status: PAYMENT_STATUS.PENDING,
        providerReference: `ref-${randomUUID()}`,
      });
      const signed = signedWebhook(
        eventOf({ eventId: `evt-${randomUUID()}`, providerReference: payment.providerReference }),
      );

      const response = await harness.send("POST", "/payments/webhooks/simulated", {
        body: signed.body,
        headers: signed.headers,
      });

      assert.equal(response.status, 200);
    });
  });
});

describe("payments routes with a free deployment (M7 S4)", () => {
  let harness: Harness;
  let ownerCookie: string;

  before(async () => {
    harness = await startHarness({ PAYMENTS_MODE: "free" });
    const owner = await harness.signIn("owner");
    harness.ownInvitation(owner.userId);
    ownerCookie = owner.cookie;
  });

  after(async () => {
    await harness?.app.close();
  });

  it("sells nothing: checkout is refused and the payment read needs no payment", async () => {
    const checkout = await harness.send("POST", `/invitations/${INVITATION}/checkout`, {
      cookie: ownerCookie,
    });
    assert.equal(checkout.status, 409);
    assert.deepEqual(await checkout.json(), { code: "PAYMENTS_DISABLED" });

    const read = await harness.send("GET", `/invitations/${INVITATION}/payment`, {
      cookie: ownerCookie,
    });
    assert.deepEqual(await read.json(), {
      paymentRequired: false,
      status: null,
      amountMinor: null,
      currency: null,
      paidAt: null,
    });
  });

  it("refuses the simulated emit and every webhook delivery", async () => {
    const payment = harness.repository.seedPayment();
    const emit = await harness.send("POST", `/payments/simulated/${payment.id}/emit`, {
      cookie: ownerCookie,
      body: { outcome: "paid" },
    });
    assert.equal(emit.status, 409);
    assert.deepEqual(await emit.json(), { code: "PAYMENT_SIMULATED_DISABLED" });

    const signed = signedWebhook(eventOf());
    const webhook = await harness.send("POST", "/payments/webhooks/simulated", {
      body: signed.body,
      headers: signed.headers,
    });
    assert.equal(webhook.status, 404);
    assert.equal(harness.repository.payments[0]?.status, "pending");
  });
});
