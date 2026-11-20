import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryPaymentRepository } from "../../../test/memory-payments";
import type { PaymentStatus } from "../domain/payment";
import {
  PaymentInvitationAlreadyPublishedError,
  PaymentNotFoundError,
  PaymentNotRefundableError,
  PaymentProviderUnavailableError,
} from "./payment.errors";
import type { AdminPaymentRow, PaymentRefundRepository, RefundTarget } from "./payment.repository";
import type {
  CheckoutIntent,
  CheckoutSession,
  PaymentProvider,
  RefundResult,
  WebhookVerification,
} from "./payment-provider.port";
import {
  ListAdminPaymentsUseCase,
  RefundPaymentUseCase,
  refundIdempotencyKey,
} from "./refund.use-cases";

// The refund rule (T2, S3, S4) with in-memory ports: an administrator may ask for a full refund only while the
// payment is `paid` and its invitation was never published. The suite asserts the refusals the specification names,
// that the provider receives the stable idempotency key of the payment (so a double click cannot refund twice), that
// the command changes no payment state by itself — `refunded` arrives only from the verified notification — and that
// a provider that refuses or is unreachable answers the same 503 a checkout answers. The admin read is asserted for
// its newest-first order, its bound, and its `refundable` flag. Real PostgreSQL behavior is proved in the
// `*.db-spec.ts` suite.

const FIRST_PUBLISHED = new Date("2026-11-24T10:00:00.000Z");
const PAID_AT = new Date("2026-11-23T09:00:00.000Z");

/** The refund persistence port over the same in-memory payments the other suites use. */
class RefundRepository extends MemoryPaymentRepository implements PaymentRefundRepository {
  private readonly firstPublishedAt = new Map<string, Date>();
  private readonly slugs = new Map<string, string>();

  setSlug(invitationId: string, slug: string): void {
    this.slugs.set(invitationId, slug);
  }

  markPublished(invitationId: string, at: Date = FIRST_PUBLISHED): void {
    this.firstPublishedAt.set(invitationId, at);
  }

  async findRefundTarget(paymentId: string): Promise<RefundTarget | null> {
    const payment = this.payments.find((stored) => stored.id === paymentId);
    if (payment === undefined) {
      return null;
    }

    return {
      paymentId: payment.id,
      invitationId: payment.invitationId,
      provider: payment.provider,
      providerReference: payment.providerReference,
      status: payment.status,
      firstPublishedAt: this.firstPublishedAt.get(payment.invitationId) ?? null,
    };
  }

  async listPaidForAdmin(limit: number): Promise<AdminPaymentRow[]> {
    return this.payments
      .filter((payment) => payment.status === "paid")
      .sort((left, right) => (right.paidAt?.getTime() ?? 0) - (left.paidAt?.getTime() ?? 0))
      .slice(0, limit)
      .map((payment) => ({
        paymentId: payment.id,
        invitationId: payment.invitationId,
        invitationSlug: this.slugs.get(payment.invitationId) ?? "",
        status: payment.status,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paidAt: payment.paidAt,
        firstPublishedAt: this.firstPublishedAt.get(payment.invitationId) ?? null,
      }));
  }
}

/** A provider whose refund answer the test sets, so the use case's own rules are what is observed. */
class FakeRefundProvider implements PaymentProvider {
  readonly key = "mercadopago";
  readonly refunds: Array<{ providerReference: string; idempotencyKey: string }> = [];
  result: RefundResult = { ok: true };
  failure: Error | null = null;

  async createCheckout(intent: CheckoutIntent): Promise<CheckoutSession> {
    throw new Error(`createCheckout is not this suite's boundary (${intent.paymentId})`);
  }

  async verifyWebhook(): Promise<WebhookVerification> {
    return { ok: false };
  }

  async refund(providerReference: string, idempotencyKey: string): Promise<RefundResult> {
    this.refunds.push({ providerReference, idempotencyKey });
    if (this.failure !== null) {
      throw this.failure;
    }

    return this.result;
  }
}

interface Seeded {
  repository: RefundRepository;
  paymentId: string;
  invitationId: string;
  provider: FakeRefundProvider;
}

/** One stored invitation and its payment, in the state the test names. */
function seed(
  options: {
    status?: PaymentStatus;
    published?: boolean;
    providerReference?: string | null;
    slug?: string;
    paidAt?: Date;
  } = {},
): Seeded {
  const repository = new RefundRepository();
  const invitation = repository.seedInvitation();
  repository.setSlug(invitation.id, options.slug ?? "cumple-ana");
  if (options.published === true) {
    repository.markPublished(invitation.id);
  }
  const status = options.status ?? "paid";
  const payment = repository.seedPayment({
    invitationId: invitation.id,
    packageId: invitation.packageId,
    status,
    providerReference:
      options.providerReference === undefined ? `ref-${invitation.id}` : options.providerReference,
    paidAt: status === "paid" || status === "refunded" ? (options.paidAt ?? PAID_AT) : null,
    provider: "mercadopago",
  });

  return {
    repository,
    paymentId: payment.id,
    invitationId: invitation.id,
    provider: new FakeRefundProvider(),
  };
}

describe("refund use cases (T2, S3, S4)", () => {
  describe("RefundPaymentUseCase", () => {
    it("answers PAYMENT_NOT_FOUND and never reaches the provider for an unknown payment", async () => {
      const { repository, provider } = seed();
      const useCase = new RefundPaymentUseCase(repository, provider);

      await assert.rejects(useCase.execute({ paymentId: "00000000-0000-4000-8000-000000000000" }), {
        name: PaymentNotFoundError.name,
      });
      assert.deepEqual(provider.refunds, []);
    });

    it("answers PAYMENT_NOT_REFUNDABLE unless the payment is paid", async () => {
      for (const status of ["pending", "failed", "expired", "refunded"] as const) {
        const { repository, paymentId, provider } = seed({ status });
        const useCase = new RefundPaymentUseCase(repository, provider);

        await assert.rejects(useCase.execute({ paymentId }), {
          name: PaymentNotRefundableError.name,
        });
        assert.deepEqual(provider.refunds, [], status);
        assert.equal(repository.payments[0]?.status, status);
      }
    });

    it("answers INVITATION_ALREADY_PUBLISHED for a paid invitation that was ever published", async () => {
      const { repository, paymentId, provider } = seed({ published: true });
      const useCase = new RefundPaymentUseCase(repository, provider);

      await assert.rejects(useCase.execute({ paymentId }), {
        name: PaymentInvitationAlreadyPublishedError.name,
      });
      assert.deepEqual(provider.refunds, []);
      assert.equal(repository.payments[0]?.status, "paid");
    });

    it("asks the provider for a full refund with the payment's stable key and changes no state", async () => {
      const { repository, paymentId, invitationId, provider } = seed();
      const useCase = new RefundPaymentUseCase(repository, provider);

      const result = await useCase.execute({ paymentId });

      assert.deepEqual(result, { outcome: "requested" });
      assert.deepEqual(provider.refunds, [
        {
          providerReference: `ref-${invitationId}`,
          idempotencyKey: refundIdempotencyKey(paymentId),
        },
      ]);
      // The command asks; only the verified notification moves the payment (S3, S4).
      assert.equal(repository.payments[0]?.status, "paid");
      assert.deepEqual(repository.payments[0]?.paidAt, PAID_AT);
      assert.equal(repository.events.length, 0);
      assert.equal(repository.transactions, 0);
    });

    it("sends the same idempotency key on a doubled click, so the provider sees one refund", async () => {
      const { repository, paymentId, provider } = seed();
      const useCase = new RefundPaymentUseCase(repository, provider);

      await useCase.execute({ paymentId });
      await useCase.execute({ paymentId });

      assert.equal(provider.refunds.length, 2);
      assert.equal(provider.refunds[0]?.idempotencyKey, provider.refunds[1]?.idempotencyKey);
      assert.equal(provider.refunds[0]?.idempotencyKey, `refund-${paymentId}`);
      assert.equal(repository.payments[0]?.status, "paid");
    });

    it("answers the provider-unavailable error and keeps the payment paid when the provider refuses", async () => {
      const { repository, paymentId, provider } = seed();
      provider.result = { ok: false };
      const useCase = new RefundPaymentUseCase(repository, provider);

      await assert.rejects(useCase.execute({ paymentId }), {
        name: PaymentProviderUnavailableError.name,
      });
      assert.equal(repository.payments[0]?.status, "paid");
      assert.equal(repository.events.length, 0);
    });

    it("answers the provider-unavailable error and keeps the payment paid when the provider throws", async () => {
      const { repository, paymentId, provider } = seed();
      provider.failure = new Error("the provider echoed a token");
      const useCase = new RefundPaymentUseCase(repository, provider);

      await assert.rejects(useCase.execute({ paymentId }), {
        name: PaymentProviderUnavailableError.name,
      });
      assert.equal(repository.payments[0]?.status, "paid");
    });

    it("answers PAYMENT_NOT_REFUNDABLE for a paid payment without a provider reference", async () => {
      const { repository, paymentId, provider } = seed({ providerReference: null });
      const useCase = new RefundPaymentUseCase(repository, provider);

      await assert.rejects(useCase.execute({ paymentId }), {
        name: PaymentNotRefundableError.name,
      });
      assert.deepEqual(provider.refunds, []);
    });
  });

  describe("ListAdminPaymentsUseCase", () => {
    it("lists only paid payments, newest first, with the refundable flag of each", async () => {
      const repository = new RefundRepository();
      const refundable = repository.seedInvitation();
      repository.setSlug(refundable.id, "cumple-refundable");
      const published = repository.seedInvitation();
      repository.setSlug(published.id, "cumple-publicada");
      repository.markPublished(published.id);
      const pending = repository.seedInvitation();
      repository.setSlug(pending.id, "cumple-pendiente");

      const older = repository.seedPayment({
        invitationId: refundable.id,
        packageId: refundable.packageId,
        status: "paid",
        paidAt: new Date("2026-11-22T09:00:00.000Z"),
      });
      const newer = repository.seedPayment({
        invitationId: published.id,
        packageId: published.packageId,
        status: "paid",
        paidAt: new Date("2026-11-23T09:00:00.000Z"),
      });
      repository.seedPayment({
        invitationId: pending.id,
        packageId: pending.packageId,
        status: "pending",
        paidAt: null,
      });

      const rows = await new ListAdminPaymentsUseCase(repository).execute({ limit: 50 });

      assert.deepEqual(
        rows.map((row) => row.paymentId),
        [newer.id, older.id],
      );
      assert.deepEqual(rows[0], {
        paymentId: newer.id,
        invitationId: published.id,
        invitationSlug: "cumple-publicada",
        status: "paid",
        amountMinor: newer.amountMinor,
        currency: "MXN",
        paidAt: new Date("2026-11-23T09:00:00.000Z"),
        refundable: false,
      });
      assert.equal(rows[1]?.refundable, true);
    });

    it("answers at most the requested bound", async () => {
      const repository = new RefundRepository();
      const invitation = repository.seedInvitation();
      repository.setSlug(invitation.id, "cumple-bounded");
      for (const paidAt of [
        new Date("2026-11-20T09:00:00.000Z"),
        new Date("2026-11-21T09:00:00.000Z"),
        new Date("2026-11-22T09:00:00.000Z"),
      ]) {
        repository.seedPayment({
          invitationId: invitation.id,
          packageId: invitation.packageId,
          status: "paid",
          paidAt,
        });
      }

      const rows = await new ListAdminPaymentsUseCase(repository).execute({ limit: 2 });

      assert.equal(rows.length, 2);
      assert.deepEqual(
        rows.map((row) => row.paidAt),
        [new Date("2026-11-22T09:00:00.000Z"), new Date("2026-11-21T09:00:00.000Z")],
      );
    });
  });
});
