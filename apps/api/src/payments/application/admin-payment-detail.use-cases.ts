import { PaymentNotFoundError } from "./payment.errors";
import type { AdminPaymentDetail, AdminPaymentDetailReader } from "./payment.repository";

// The administrator's payment detail (M9 T7; S4, S6). «Ver el detalle de un pago» is a read: it changes no payment,
// writes no audit row (L9 says payment views are not audited), and only ever answers the fields the support page
// shows — the payment's snapshot, its invitation's slug, and the normalized events the verified intake stored. The
// provider reference, the idempotency key, the payload digest, and any payer datum stay out of the port itself, so
// this use case could not return them even if it wanted to.
//
// An unknown payment is `PaymentNotFoundError` (404 `PAYMENT_NOT_FOUND`), the same answer the other administrator
// payment routes give, and it leaks nothing about whether some other payment exists.

/** Reads one payment and its newest events for the administrator (M9 T7; S4). */
export class GetAdminPaymentDetailUseCase {
  constructor(private readonly payments: AdminPaymentDetailReader) {}

  async execute(input: { paymentId: string }): Promise<AdminPaymentDetail> {
    const detail = await this.payments.findForAdmin(input.paymentId);
    if (detail === null) {
      throw new PaymentNotFoundError();
    }

    return detail;
  }
}
