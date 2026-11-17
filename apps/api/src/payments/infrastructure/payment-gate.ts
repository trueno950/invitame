import { PAYMENTS_MODE, type PaymentsMode } from "../../config/environment";
import type { InvitationRecord } from "../../invitations/application/invitation.repository";
import type {
  InvitationPaymentDecision,
  InvitationPaymentGate,
} from "../../invitations/application/invitation-payment-gate";
import type { PaymentRepository } from "../application/payment.repository";
import type { PaymentCatalog } from "../application/payment-catalog";
import { paymentEntitlement } from "../domain/payment-entitlement";

// The publication payment gate (M7 S3, S4). It replaces the Milestone 5 adapter that always answered "no payment
// required", and it is asked once per DRAFT -> PUBLISHED transition with the stored row. In `free` mode it answers
// exactly what Milestone 5 answered, so a deployment that sells nothing behaves as before. In every mode that
// charges, publication is granted only from a verified backend state: a `paid` payment for this invitation and its
// current package, or a package whose current price is 0. A price the catalog cannot answer fails closed, because
// "unknown" must never read as "free" (S1). The decision is a data answer, never a throw: presentation maps
// `required` to the 402 it already documents.

export class PaymentGate implements InvitationPaymentGate {
  constructor(
    private readonly mode: PaymentsMode,
    private readonly catalog: PaymentCatalog,
    private readonly payments: PaymentRepository,
  ) {}

  async publicationPaymentRequired(
    invitation: InvitationRecord,
  ): Promise<InvitationPaymentDecision> {
    // Milestone 5 behavior, unchanged and without a query: nothing is sold here (S4).
    if (this.mode === PAYMENTS_MODE.FREE) {
      return { required: false };
    }

    const [price, payments] = await Promise.all([
      this.catalog.findCurrentPackagePrice(invitation.packageId),
      this.payments.listForInvitation(invitation.id),
    ]);

    const decision = paymentEntitlement({
      price,
      packageId: invitation.packageId,
      payments,
    });

    return decision.paid ? { required: false } : { required: true, reason: decision.reason };
  }
}
