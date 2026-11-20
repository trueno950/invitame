import { PAYMENT_STATUS } from "../domain/payment";
import {
  PaymentInvitationAlreadyPublishedError,
  PaymentNotFoundError,
  PaymentNotRefundableError,
  PaymentProviderUnavailableError,
} from "./payment.errors";
import type { AdminPaymentRow, PaymentRefundRepository } from "./payment.repository";
import type { PaymentProvider } from "./payment-provider.port";

// The refund rule (T2, S3, S4). «Sin reembolso tras publicar»: an administrator may ask for a full refund only while
// the payment is `paid` and its invitation was never published. The rule reads history the lifecycle keeps apart:
// `publishedAt` is cleared on unpublish and archive, so the never-published test reads `firstPublishedAt`, which the
// first publish sets and nothing clears. The command only asks the provider: the payment becomes `refunded` from the
// verified notification that follows, never from the administrator's click, so no request can invent a payment state.
//
// A publish racing a refund is left to the existing guards instead of a lock: publishing asks the payment gate, which
// counts `refunded` as unpaid, so a publish that loses the race to a completed refund is refused by the gate. A
// publish that wins before the refund is answered by the never-published rule the next refund reads, and the
// provider's own idempotency key keeps the command itself single. This is a documented ordering, not a guarantee
// that a refund and a publish cannot both start; the gate is what makes the sequence safe.

/** What an accepted refund command answers: it asked the provider and changed no payment state (S3). */
export interface RefundRequested {
  outcome: "requested";
}

/**
 * The stable idempotency key of one payment's refund. It is derived from the payment and nothing else, so a double
 * click, a retry, and two simultaneous requests all ask the provider for the same refund instead of two (S3, S4).
 */
export function refundIdempotencyKey(paymentId: string): string {
  return `refund-${paymentId}`;
}

/**
 * Asks the provider for a full refund of one paid, never-published payment (T2, S3). Every refusal is typed and
 * stable: an unknown payment is `PaymentNotFoundError` (404), a payment that is not `paid` or has no provider
 * reference is `PaymentNotRefundableError` (409), and an invitation that was ever published is
 * `PaymentInvitationAlreadyPublishedError` (409). A provider that refuses or cannot be reached is
 * `PaymentProviderUnavailableError` (503), the same answer a checkout gives, and nothing is written either way.
 */
export class RefundPaymentUseCase {
  constructor(
    private readonly payments: PaymentRefundRepository,
    private readonly provider: PaymentProvider,
  ) {}

  async execute(input: { paymentId: string }): Promise<RefundRequested> {
    const target = await this.payments.findRefundTarget(input.paymentId);
    if (target === null) {
      throw new PaymentNotFoundError();
    }

    // The state rule comes first: a refunded or pending payment has nothing to refund, whatever its invitation is.
    if (target.status !== PAYMENT_STATUS.PAID || target.providerReference === null) {
      throw new PaymentNotRefundableError();
    }

    // «Sin reembolso tras publicar» (S3): publishing, unpublishing, and archiving all keep this timestamp.
    if (target.firstPublishedAt !== null) {
      throw new PaymentInvitationAlreadyPublishedError();
    }

    let result: Awaited<ReturnType<PaymentProvider["refund"]>>;
    try {
      result = await this.provider.refund(
        target.providerReference,
        refundIdempotencyKey(target.paymentId),
      );
    } catch {
      // The provider's message is never echoed: it can name an account, a card, or a token.
      throw new PaymentProviderUnavailableError();
    }
    if (!result.ok) {
      throw new PaymentProviderUnavailableError();
    }

    return { outcome: "requested" };
  }
}

/** One row of the administrator's read: the stored facts plus the rule's own answer (T2, S3). */
export interface AdminPaymentSummary {
  paymentId: string;
  invitationId: string;
  invitationSlug: string;
  status: AdminPaymentRow["status"];
  amountMinor: number;
  currency: string;
  paidAt: Date | null;
  /** Whether the refund rule would accept a refund now: paid and never published. */
  refundable: boolean;
}

/**
 * The administrator's bounded read (T2, S3): the newest `paid` payments, at most the given limit, with the invitation
 * slug and whether each one is still refundable. It carries no payer datum and no provider payload — the invitation
 * slug is the same non-personal reference the admin catalog pages already show.
 */
export class ListAdminPaymentsUseCase {
  constructor(private readonly payments: PaymentRefundRepository) {}

  async execute(input: { limit: number }): Promise<AdminPaymentSummary[]> {
    const rows = await this.payments.listPaidForAdmin(input.limit);

    return rows.map((row) => ({
      paymentId: row.paymentId,
      invitationId: row.invitationId,
      invitationSlug: row.invitationSlug,
      status: row.status,
      amountMinor: row.amountMinor,
      currency: row.currency,
      paidAt: row.paidAt,
      refundable: row.status === PAYMENT_STATUS.PAID && row.firstPublishedAt === null,
    }));
  }
}
