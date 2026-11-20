import type { AdminPayment } from "../../server/admin-payments-client.ts";
import { formatInstant } from "../catalog/format.ts";
import { formatMxn } from "../catalog/price.ts";
import { PAYMENTS_COPY, PAYMENTS_STATUS_LABELS, paymentDetailPath } from "./copy.ts";

/**
 * One row of the refund list, as the page renders it (M7 T3; S3): the stored facts the API answered, plus the refund
 * rule's own answer. The button exists only when the API says the payment is refundable (paid and never published);
 * every other row explains why it has none, because a hidden button is a convenience, never a guard — the API refuses
 * the refund itself. The row also links to its own detail (M9 T7; S4), the read of its stored events.
 */

export interface PaymentRowView {
  readonly paymentId: string;
  /** The invitation's public slug, the same non-personal reference the catalog pages show. */
  readonly slug: string;
  /** `/admin/pagos/<id>`: this payment's read-only detail. */
  readonly href: string;
  /** The amount in Mexican Spanish, or "" when the API's snapshot cannot be formatted. */
  readonly amount: string;
  readonly statusLabel: string;
  /** «Pagado el 12 nov 2026, 10:00», or "" when the API stored no paid instant. */
  readonly paidOn: string;
  /** The refund button's label, or undefined when this payment has no refund (S3). */
  readonly refund: string | undefined;
  /** Why there is no refund button; undefined when there is one. */
  readonly note: string | undefined;
}

/** The amount and its currency, such as `$1,500.00 MXN`, or "" when it cannot be formatted. */
function amountOf(payment: AdminPayment): string {
  try {
    return `${formatMxn(payment.amountMinor, payment.currency)} ${payment.currency}`;
  } catch {
    // `Intl` refuses an unknown currency code with a `RangeError`; this page prints no number it could not read.
    return "";
  }
}

export function paymentRowView(payment: AdminPayment): PaymentRowView {
  return {
    paymentId: payment.paymentId,
    slug: payment.invitationSlug,
    href: paymentDetailPath(payment.paymentId),
    amount: amountOf(payment),
    statusLabel: PAYMENTS_STATUS_LABELS[payment.status],
    paidOn: payment.paidAt === null ? "" : PAYMENTS_COPY.paidOn(formatInstant(payment.paidAt)),
    refund: payment.refundable ? PAYMENTS_COPY.refund : undefined,
    note: payment.refundable ? undefined : PAYMENTS_COPY.notRefundableNote,
  };
}
