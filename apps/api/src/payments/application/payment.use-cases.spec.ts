import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { MemoryPaymentCatalog, MemoryPaymentRepository } from "../../../test/memory-payments";
import { PAYMENT_STATUS } from "../domain/payment";
import { SimulatedPaymentProvider } from "../infrastructure/simulated-payment-provider";
import {
  InvitationPackageLockedByPaymentError,
  PaymentAlreadyPaidError,
  PaymentNotFoundError,
  PaymentNotRequiredError,
  PaymentPriceUnavailableError,
  PaymentProviderNotFoundError,
  PaymentsDisabledError,
  PaymentsSimulationDisabledError,
  PaymentWebhookRejectedError,
} from "./payment.errors";
import {
  EmitSimulatedPaymentUseCase,
  GetInvitationPaymentUseCase,
  StartCheckoutUseCase,
} from "./payment.use-cases";
import type {
  CheckoutIntent,
  CheckoutSession,
  NormalizedPaymentEvent,
  PaymentProvider,
  WebhookVerification,
} from "./payment-provider.port";
import { HandlePaymentWebhookUseCase } from "./payment-webhook.use-case";

// The payment use cases (M7 S1, S3, S4) with in-memory ports: checkout, the owner's payment read, the verified
// webhook intake, and the simulated emit. The suite asserts the rules the specification states — the snapshot never
// follows the catalog, one pending payment is reused, a duplicate delivery changes nothing, an out-of-order event is
// recorded and ignored, a mismatching amount or currency is refused and recorded, and a paid payment for another
// package is refused instead of being thrown away — and never an internal storage shape alone. Real PostgreSQL
// behaviour (the partial unique index, the transaction, the CHECK constraints) is proved in the `*.db-spec.ts`
// suite.

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER = "22222222-2222-4222-8222-222222222222";
const INVITATION = "33333333-3333-4333-8333-333333333333";
const PACKAGE = "44444444-4444-4444-8444-444444444444";
const OTHER_PACKAGE = "55555555-5555-4555-8555-555555555555";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const PRICE = { amountMinor: 25_000, currency: "MXN" };
const NOW = new Date("2026-11-21T12:00:00.000Z");

/** A repository whose only invitation is this suite's. */
function newRepository(): MemoryPaymentRepository {
  const repository = new MemoryPaymentRepository();
  repository.invitations.push({
    id: INVITATION,
    ownerId: OWNER,
    packageId: PACKAGE,
    status: "DRAFT",
  });

  return repository;
}

/** A catalog whose only known price is this suite's package, in force. */
function newCatalog(): MemoryPaymentCatalog {
  const catalog = new MemoryPaymentCatalog();
  catalog.prices.set(PACKAGE, PRICE);

  return catalog;
}

/** A provider whose verification answer the test sets, so the intake's own rules are what is observed. */
class FakePaymentProvider implements PaymentProvider {
  readonly key = "simulated";
  readonly checkouts: CheckoutIntent[] = [];
  verification: WebhookVerification = { ok: false };
  checkoutError: Error | null = null;

  async createCheckout(intent: CheckoutIntent): Promise<CheckoutSession> {
    this.checkouts.push(intent);
    if (this.checkoutError) {
      throw this.checkoutError;
    }

    return {
      providerReference: `ref-${intent.paymentId}`,
      redirectUrl: `http://localhost:3000/pagos/simulado/${intent.paymentId}`,
    };
  }

  verifyWebhook(): WebhookVerification {
    return this.verification;
  }
}

function eventOf(overrides: Partial<NormalizedPaymentEvent> = {}): NormalizedPaymentEvent {
  return {
    eventId: "evt-1",
    type: "paid",
    providerReference: "ref-0",
    amountMinor: PRICE.amountMinor,
    currency: PRICE.currency,
    occurredAt: NOW,
    ...overrides,
  };
}

describe("payment use cases (M7 S1, S3, S4)", () => {
  function composition(
    options: {
      mode?: "free" | "simulated";
      repository?: MemoryPaymentRepository;
      catalog?: MemoryPaymentCatalog;
      provider?: FakePaymentProvider;
    } = {},
  ) {
    const repository = options.repository ?? newRepository();
    const catalog = options.catalog ?? newCatalog();
    const provider = options.provider ?? new FakePaymentProvider();
    const mode = options.mode ?? "simulated";
    let counter = 0;

    const webhook = new HandlePaymentWebhookUseCase(repository, provider);
    const checkout = new StartCheckoutUseCase(
      repository,
      catalog,
      provider,
      mode,
      () => `idem-${++counter}`,
    );
    const read = new GetInvitationPaymentUseCase(repository, catalog, mode);
    const emit = new EmitSimulatedPaymentUseCase(repository, provider, mode, webhook, () => NOW);

    return { repository, catalog, provider, checkout, read, emit, webhook };
  }

  describe("checkout", () => {
    it("refuses a free deployment, so no payment exists where nothing is sold", async () => {
      const { repository, checkout } = composition({ mode: "free" });

      await assert.rejects(checkout.execute({ ownerId: OWNER, invitationId: INVITATION }), {
        name: PaymentsDisabledError.name,
      });
      assert.equal(repository.payments.length, 0);
    });

    it("answers null for an invitation this owner does not have", async () => {
      const { repository, checkout } = composition();

      assert.equal(
        await checkout.execute({ ownerId: OTHER_OWNER, invitationId: INVITATION }),
        null,
      );
      assert.equal(await checkout.execute({ ownerId: OWNER, invitationId: UNKNOWN_ID }), null);
      assert.equal(repository.payments.length, 0);
    });

    it("refuses an archived invitation", async () => {
      const repository = newRepository();
      repository.invitations[0]!.status = "ARCHIVED";
      const { checkout } = composition({ repository });

      await assert.rejects(checkout.execute({ ownerId: OWNER, invitationId: INVITATION }), {
        name: "InvitationNotEditableError",
      });
      assert.equal(repository.payments.length, 0);
    });

    it("refuses a package whose current price is zero", async () => {
      const catalog = newCatalog();
      catalog.prices.set(PACKAGE, { amountMinor: 0, currency: "MXN" });
      const { repository, checkout } = composition({ catalog });

      await assert.rejects(checkout.execute({ ownerId: OWNER, invitationId: INVITATION }), {
        name: PaymentNotRequiredError.name,
      });
      assert.equal(repository.payments.length, 0);
    });

    it("refuses a package the catalog cannot price", async () => {
      const catalog = newCatalog();
      catalog.prices.set(PACKAGE, null);
      const { repository, checkout } = composition({ catalog });

      await assert.rejects(checkout.execute({ ownerId: OWNER, invitationId: INVITATION }), {
        name: PaymentPriceUnavailableError.name,
      });
      assert.equal(repository.payments.length, 0);
    });

    it("creates one pending payment with the price snapshot and a server-generated idempotency key", async () => {
      const { repository, checkout, provider } = composition();

      const result = await checkout.execute({ ownerId: OWNER, invitationId: INVITATION });

      assert.ok(result);
      assert.equal(result.amountMinor, PRICE.amountMinor);
      assert.equal(result.currency, PRICE.currency);
      assert.match(result.paymentId, /^[0-9a-f-]{36}$/);
      assert.equal(result.redirectUrl, `http://localhost:3000/pagos/simulado/${result.paymentId}`);

      const [stored] = repository.payments;
      assert.ok(stored);
      assert.equal(stored.status, "pending");
      assert.equal(stored.providerReference, `ref-${result.paymentId}`);
      assert.match(stored.idempotencyKey, /^idem-\d+$/);
      assert.deepEqual(
        provider.checkouts.map((intent) => intent.paymentId),
        [result.paymentId],
      );
    });

    it("reuses the pending payment on a second checkout, keeping its snapshot after the price changes", async () => {
      const { repository, catalog, checkout, provider } = composition();

      const first = await checkout.execute({ ownerId: OWNER, invitationId: INVITATION });
      // The catalog retires the price and publishes another one; the pending payment keeps what it was created with.
      catalog.prices.set(PACKAGE, { amountMinor: 90_000, currency: "MXN" });
      const second = await checkout.execute({ ownerId: OWNER, invitationId: INVITATION });

      assert.ok(first && second);
      assert.equal(second.paymentId, first.paymentId);
      assert.equal(second.amountMinor, PRICE.amountMinor);
      assert.equal(repository.payments.length, 1);
      // The provider is asked again for the same intent, under the same idempotency key.
      assert.deepEqual(
        provider.checkouts.map((intent) => intent.idempotencyKey),
        [repository.payments[0]?.idempotencyKey, repository.payments[0]?.idempotencyKey],
      );
    });

    it("refuses a checkout when a verified paid payment already covers the invitation", async () => {
      const repository = newRepository();
      repository.seedPayment({ status: PAYMENT_STATUS.PAID, paidAt: NOW });
      const { checkout } = composition({ repository });

      await assert.rejects(checkout.execute({ ownerId: OWNER, invitationId: INVITATION }), {
        name: PaymentAlreadyPaidError.name,
      });
      assert.equal(repository.payments.length, 1);
    });

    it("refuses a checkout over a paid payment made for another package", async () => {
      const repository = newRepository();
      repository.seedPayment({
        status: PAYMENT_STATUS.PAID,
        paidAt: NOW,
        packageId: OTHER_PACKAGE,
      });
      const { checkout } = composition({ repository });

      await assert.rejects(checkout.execute({ ownerId: OWNER, invitationId: INVITATION }), {
        name: InvitationPackageLockedByPaymentError.name,
      });
      assert.equal(repository.payments.length, 1);
      assert.equal(repository.payments[0]?.packageId, OTHER_PACKAGE);
    });
  });

  describe("owner payment read", () => {
    it("answers null for an invitation this owner does not have", async () => {
      const { read } = composition();

      assert.equal(await read.execute({ ownerId: OTHER_OWNER, invitationId: INVITATION }), null);
    });

    it("reports no payment required in a free deployment, and reads no catalog", async () => {
      const catalog = newCatalog();
      catalog.prices.set(PACKAGE, null);
      const { read } = composition({ mode: "free", catalog });

      assert.deepEqual(await read.execute({ ownerId: OWNER, invitationId: INVITATION }), {
        paymentRequired: false,
        status: null,
        amountMinor: null,
        currency: null,
        paidAt: null,
      });
    });

    it("reports the price with no payment yet, and requires one", async () => {
      const { read } = composition();

      assert.deepEqual(await read.execute({ ownerId: OWNER, invitationId: INVITATION }), {
        paymentRequired: true,
        status: null,
        amountMinor: PRICE.amountMinor,
        currency: PRICE.currency,
        paidAt: null,
      });
    });

    it("reports the pending payment and keeps its snapshot after the catalog changes", async () => {
      const { catalog, checkout, read } = composition();
      await checkout.execute({ ownerId: OWNER, invitationId: INVITATION });
      catalog.prices.set(PACKAGE, { amountMinor: 90_000, currency: "MXN" });

      const status = await read.execute({ ownerId: OWNER, invitationId: INVITATION });

      assert.equal(status?.status, "pending");
      assert.equal(status?.amountMinor, PRICE.amountMinor);
      assert.equal(status?.paymentRequired, true);
    });

    it("reports a paid payment as not requiring another one", async () => {
      const repository = newRepository();
      repository.seedPayment({ status: PAYMENT_STATUS.PAID, paidAt: NOW });
      const { read } = composition({ repository });

      assert.deepEqual(await read.execute({ ownerId: OWNER, invitationId: INVITATION }), {
        paymentRequired: false,
        status: "paid",
        amountMinor: PRICE.amountMinor,
        currency: PRICE.currency,
        paidAt: NOW,
      });
    });
  });

  describe("webhook intake", () => {
    function intake(
      overrides: { repository?: MemoryPaymentRepository; provider?: FakePaymentProvider } = {},
    ) {
      const repository = overrides.repository ?? newRepository();
      const provider = overrides.provider ?? new FakePaymentProvider();
      const useCase = new HandlePaymentWebhookUseCase(repository, provider);

      return { repository, provider, useCase };
    }

    it("refuses a provider this deployment does not configure", async () => {
      const { repository, useCase } = intake();

      await assert.rejects(
        useCase.execute({
          provider: "mercadopago",
          rawBody: "{}",
          headers: {},
          receivedAt: NOW,
        }),
        { name: PaymentProviderNotFoundError.name },
      );
      assert.equal(repository.events.length, 0);
    });

    it("refuses an unsigned or forged delivery without changing anything", async () => {
      const { repository, useCase } = intake();
      repository.seedPayment();

      await assert.rejects(
        useCase.execute({ provider: "simulated", rawBody: "{}", headers: {}, receivedAt: NOW }),
        { name: PaymentWebhookRejectedError.name },
      );
      assert.equal(repository.payments[0]?.status, "pending");
      assert.equal(repository.events.length, 0);
      assert.equal(repository.transactions, 0);
    });

    it("applies a verified paid event and records the payload digest, never the payload", async () => {
      const { repository, provider, useCase } = intake();
      const payment = repository.seedPayment();
      provider.verification = { ok: true, event: eventOf() };
      const rawBody = '{"eventId":"evt-1","type":"paid"}';

      const result = await useCase.execute({
        provider: "simulated",
        rawBody,
        headers: {},
        receivedAt: NOW,
      });

      assert.deepEqual(result, { outcome: "processed" });
      assert.equal(repository.payments[0]?.status, "paid");
      assert.deepEqual(repository.payments[0]?.paidAt, NOW);
      const [event] = repository.events;
      assert.ok(event);
      assert.equal(event.paymentId, payment.id);
      assert.equal(event.outcome, "applied");
      assert.equal(event.type, "paid");
      assert.equal(event.processedAt?.getTime(), NOW.getTime());
      assert.equal(event.payloadSha256, createHash("sha256").update(rawBody, "utf8").digest("hex"));
      // The digest is stored; the raw payload is not: no stored value contains the body.
      assert.equal(
        Object.values(event).some((value) => typeof value === "string" && value.includes(rawBody)),
        false,
      );
    });

    it("answers a duplicate delivery as a no-op and changes nothing", async () => {
      const { repository, provider, useCase } = intake();
      repository.seedPayment();
      provider.verification = { ok: true, event: eventOf() };
      const request = { provider: "simulated", rawBody: "{}", headers: {}, receivedAt: NOW };

      assert.deepEqual(await useCase.execute(request), { outcome: "processed" });
      repository.payments[0]!.status = "pending";
      repository.payments[0]!.paidAt = null;

      assert.deepEqual(await useCase.execute(request), { outcome: "duplicate" });
      assert.equal(repository.events.length, 1);
      // The duplicate inserted nothing and applied nothing: the payment is exactly as the test left it.
      assert.equal(repository.payments[0]?.status, "pending");
      assert.equal(repository.events[0]?.outcome, "applied");
    });

    it("records a late failure after a paid event as ignored and keeps the payment paid (out of order)", async () => {
      const { repository, provider, useCase } = intake();
      repository.seedPayment();
      provider.verification = { ok: true, event: eventOf({ eventId: "evt-paid" }) };
      await useCase.execute({ provider: "simulated", rawBody: "{}", headers: {}, receivedAt: NOW });

      provider.verification = {
        ok: true,
        event: eventOf({ eventId: "evt-failed", type: "failed" }),
      };
      const result = await useCase.execute({
        provider: "simulated",
        rawBody: "{}",
        headers: {},
        receivedAt: NOW,
      });

      assert.deepEqual(result, { outcome: "processed" });
      assert.equal(repository.payments[0]?.status, "paid");
      assert.deepEqual(
        repository.events.map((event) => event.outcome),
        ["applied", "ignored_transition"],
      );
    });

    it("refuses an amount that differs from the snapshot and records the refusal", async () => {
      const { repository, provider, useCase } = intake();
      repository.seedPayment();
      provider.verification = {
        ok: true,
        event: eventOf({ amountMinor: PRICE.amountMinor - 1 }),
      };

      await useCase.execute({ provider: "simulated", rawBody: "{}", headers: {}, receivedAt: NOW });

      assert.equal(repository.payments[0]?.status, "pending");
      assert.equal(repository.events[0]?.outcome, "refused_amount");
    });

    it("refuses a currency that differs from the snapshot and records the refusal", async () => {
      const { repository, provider, useCase } = intake();
      repository.seedPayment();
      provider.verification = { ok: true, event: eventOf({ currency: "USD" }) };

      await useCase.execute({ provider: "simulated", rawBody: "{}", headers: {}, receivedAt: NOW });

      assert.equal(repository.payments[0]?.status, "pending");
      assert.equal(repository.events[0]?.outcome, "refused_currency");
    });

    it("records an event about an unknown reference and ignores it", async () => {
      const { repository, provider, useCase } = intake();
      provider.verification = { ok: true, event: eventOf({ providerReference: "ref-unknown" }) };

      const result = await useCase.execute({
        provider: "simulated",
        rawBody: "{}",
        headers: {},
        receivedAt: NOW,
      });

      assert.deepEqual(result, { outcome: "processed" });
      assert.equal(repository.payments.length, 0);
      assert.equal(repository.events[0]?.paymentId, null);
      assert.equal(repository.events[0]?.outcome, "ignored_unknown_payment");
    });
  });

  describe("simulated emit", () => {
    function simulated() {
      const repository = newRepository();
      const provider = new SimulatedPaymentProvider({
        secret: "local-simulated-payments-secret-of-32-chars",
        returnBaseUrl: "http://localhost:3000",
      });
      const webhook = new HandlePaymentWebhookUseCase(repository, provider);
      const emit = new EmitSimulatedPaymentUseCase(
        repository,
        provider,
        "simulated",
        webhook,
        () => NOW,
      );

      return { repository, emit };
    }

    it("refuses to emit unless the simulated provider is enabled", async () => {
      const repository = newRepository();
      const provider = new SimulatedPaymentProvider({
        secret: "local-simulated-payments-secret-of-32-chars",
        returnBaseUrl: "http://localhost:3000",
      });
      const emit = new EmitSimulatedPaymentUseCase(
        repository,
        provider,
        "free",
        new HandlePaymentWebhookUseCase(repository, provider),
        () => NOW,
      );

      await assert.rejects(
        emit.execute({ ownerId: OWNER, paymentId: randomUUID(), outcome: "paid" }),
        { name: PaymentsSimulationDisabledError.name },
      );
    });

    it("answers 404 for a payment this owner does not have", async () => {
      const { repository, emit } = simulated();
      const payment = repository.seedPayment();

      for (const ownerId of [OTHER_OWNER, OWNER]) {
        await assert.rejects(
          emit.execute({
            ownerId,
            paymentId: ownerId === OWNER ? UNKNOWN_ID : payment.id,
            outcome: "paid",
          }),
          { name: PaymentNotFoundError.name },
        );
      }
      assert.equal(repository.payments[0]?.status, "pending");
    });

    it("signs an event and posts it through the same intake, so the payment becomes paid", async () => {
      const { repository, emit } = simulated();
      const payment = repository.seedPayment();

      assert.deepEqual(
        await emit.execute({ ownerId: OWNER, paymentId: payment.id, outcome: "paid" }),
        { outcome: "processed" },
      );
      assert.equal(repository.payments[0]?.status, "paid");
      assert.equal(repository.events[0]?.outcome, "applied");
      assert.match(repository.events[0]?.payloadSha256, /^[0-9a-f]{64}$/);
    });

    it("is idempotent: emitting the same outcome twice is a duplicate and changes nothing", async () => {
      const { repository, emit } = simulated();
      const payment = repository.seedPayment();

      await emit.execute({ ownerId: OWNER, paymentId: payment.id, outcome: "paid" });
      assert.deepEqual(
        await emit.execute({ ownerId: OWNER, paymentId: payment.id, outcome: "paid" }),
        { outcome: "duplicate" },
      );
      assert.equal(repository.events.length, 1);
      assert.equal(repository.payments[0]?.status, "paid");
    });

    it("cannot move a paid payment with a simulated failure", async () => {
      const { repository, emit } = simulated();
      const payment = repository.seedPayment();

      await emit.execute({ ownerId: OWNER, paymentId: payment.id, outcome: "paid" });
      assert.deepEqual(
        await emit.execute({ ownerId: OWNER, paymentId: payment.id, outcome: "failed" }),
        { outcome: "processed" },
      );
      assert.equal(repository.payments[0]?.status, "paid");
      assert.deepEqual(
        repository.events.map((event) => event.outcome),
        ["applied", "ignored_transition"],
      );
    });
  });
});
