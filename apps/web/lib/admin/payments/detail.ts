import type { AdminPaymentDetail, AdminPaymentEvent } from "../../server/admin-payments-client.ts";
import { formatInstant } from "../catalog/format.ts";
import { invitationDetailPath } from "../invitations/copy.ts";
import { formatAmount } from "../invitations/rows.ts";
import {
  PAYMENT_DETAIL_COPY,
  PAYMENTS_COPY,
  PAYMENTS_PATHS,
  PAYMENTS_STATUS_LABELS,
  paymentDetailPath,
  paymentEventOutcomeLabel,
  paymentEventTypeLabel,
} from "./copy.ts";

/**
 * What `/admin/pagos/<id>` renders (M9 T7; S4): the stored facts and the events the verified intake kept, and nothing
 * else. The amount is formatted like the refund list (`formatMxn` plus its currency), so the same payment reads the
 * same on both pages. No payer datum, provider reference, or payload digest is in the contract, so no view can show
 * one — and a value outside the closed event vocabulary still renders, with a neutral label, instead of failing a
 * support read.
 */

/** One event row: its labels, its formatted instants, and the instants themselves for the `<time>` elements. */
export interface PaymentDetailEventView {
  /** Stable within the page: the received instant and the position, since two deliveries can share an instant. */
  readonly key: string;
  readonly typeLabel: string;
  readonly outcomeLabel: string;
  readonly received: string;
  readonly receivedAt: string;
  /** «Sin procesar» for an event the intake never completed; never an invented instant. */
  readonly processed: string;
  /** The stored processed instant, or undefined when there is none. */
  readonly processedAt: string | undefined;
}

export interface PaymentDetailView {
  readonly paymentId: string;
  /** The invitation's public slug, the same non-personal reference the list shows. */
  readonly slug: string;
  readonly statusLabel: string;
  /** The amount in Mexican Spanish, or "" when the API's snapshot cannot be formatted. */
  readonly amount: string;
  /** The adapter key the API stored, such as `mercadopago`; never a credential. */
  readonly provider: string;
  readonly created: string;
  /** «Pagado el 12 nov 2026, 10:00», or "" when the payment has no paid instant. */
  readonly paid: string;
  /** `/admin/invitaciones/<id>`: the invitation this payment belongs to. */
  readonly invitationHref: string;
  /** Newest first, as the API answered them. */
  readonly events: readonly PaymentDetailEventView[];
}

function eventView(event: AdminPaymentEvent, index: number): PaymentDetailEventView {
  return {
    key: `${event.receivedAt}-${index}`,
    typeLabel: paymentEventTypeLabel(event.type),
    outcomeLabel: paymentEventOutcomeLabel(event.outcome),
    received: formatInstant(event.receivedAt),
    receivedAt: event.receivedAt,
    processed:
      event.processedAt === null
        ? PAYMENT_DETAIL_COPY.notProcessed
        : formatInstant(event.processedAt),
    processedAt: event.processedAt ?? undefined,
  };
}

/** The two links of the detail page's notices: the retry of this detail, and the way back to the list. */
export interface PaymentDetailNoticeLinks {
  /** `/admin/pagos/<id>`: the same page, reloaded. */
  readonly retryHref: string;
  readonly listHref: string;
}

/**
 * The links a notice of `/admin/pagos/<id>` offers (M9 T10; R3-001): «Volver a intentar» reloads the same detail,
 * because a failed read of one payment is not a reason to leave it, and the list stays a separate way back.
 */
export function paymentDetailNoticeLinks(paymentId: string): PaymentDetailNoticeLinks {
  return { retryHref: paymentDetailPath(paymentId), listHref: PAYMENTS_PATHS.index };
}

/** One payment's detail page: its summary, the link to its invitation, and its events newest first. */
export function paymentDetailView(detail: AdminPaymentDetail): PaymentDetailView {
  return {
    paymentId: detail.paymentId,
    slug: detail.invitationSlug,
    statusLabel: PAYMENTS_STATUS_LABELS[detail.status],
    amount: formatAmount(detail.amountMinor, detail.currency),
    provider: detail.provider,
    created: formatInstant(detail.createdAt),
    paid: detail.paidAt === null ? "" : PAYMENTS_COPY.paidOn(formatInstant(detail.paidAt)),
    invitationHref: invitationDetailPath(detail.invitationId),
    events: detail.events.map(eventView),
  };
}
