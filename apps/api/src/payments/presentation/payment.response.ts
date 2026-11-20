// The stable REST shapes of the payment routes (M7 S4) and the mapping from every payment error to its status and
// code. Nothing here carries a provider payload, a signature, a secret, a reference the browser could forge, or an
// amount the response did not read from the backend state.

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import { InvitationNotEditableError } from "../../invitations/domain/invitation.errors";
import {
  InvitationPackageLockedByPaymentError,
  PaymentAlreadyPaidError,
  PaymentInvitationAlreadyPublishedError,
  PaymentNotFoundError,
  PaymentNotRefundableError,
  PaymentNotRequiredError,
  PaymentPriceUnavailableError,
  PaymentProviderNotFoundError,
  PaymentProviderUnavailableError,
  PaymentsDisabledError,
  PaymentsSimulationDisabledError,
  PaymentWebhookRejectedError,
} from "../application/payment.errors";
import type { CheckoutResult, InvitationPaymentStatus } from "../application/payment.use-cases";
import type { PaymentWebhookResult } from "../application/payment-webhook.use-case";
import type { AdminPaymentSummary, RefundRequested } from "../application/refund.use-cases";
import type { PaymentStatus } from "../domain/payment";

/** `POST /invitations/:id/checkout`: the payment, the provider's redirect, and the snapshot the owner will pay. */
export interface CheckoutResponse {
  paymentId: string;
  redirectUrl: string;
  amountMinor: number;
  currency: string;
}

/** `GET /invitations/:id/payment`: what the panel and the return page render (S4). */
export interface InvitationPaymentResponse {
  paymentRequired: boolean;
  status: PaymentStatus | null;
  amountMinor: number | null;
  currency: string | null;
  paidAt: string | null;
}

/** `POST /payments/webhooks/:provider` and the simulated emit: `processed` or `duplicate` (S4). */
export interface PaymentWebhookResponse {
  outcome: PaymentWebhookResult["outcome"];
}

/** `POST /admin/payments/:paymentId/refund`: the provider was asked and no payment state changed (T2, S3). */
export interface RefundPaymentResponse {
  outcome: RefundRequested["outcome"];
}

/** `GET /admin/payments`: one paid payment of the administrator's bounded read (T2, S3). */
export interface AdminPaymentResponse {
  paymentId: string;
  invitationId: string;
  invitationSlug: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  paidAt: string | null;
  refundable: boolean;
}

export function toCheckoutResponse(result: CheckoutResult): CheckoutResponse {
  return {
    paymentId: result.paymentId,
    redirectUrl: result.redirectUrl,
    amountMinor: result.amountMinor,
    currency: result.currency,
  };
}

export function toInvitationPaymentResponse(
  status: InvitationPaymentStatus,
): InvitationPaymentResponse {
  return {
    paymentRequired: status.paymentRequired,
    status: status.status,
    amountMinor: status.amountMinor,
    currency: status.currency,
    paidAt: status.paidAt?.toISOString() ?? null,
  };
}

export function toRefundPaymentResponse(result: RefundRequested): RefundPaymentResponse {
  return { outcome: result.outcome };
}

export function toAdminPaymentResponse(payment: AdminPaymentSummary): AdminPaymentResponse {
  return {
    paymentId: payment.paymentId,
    invitationId: payment.invitationId,
    invitationSlug: payment.invitationSlug,
    status: payment.status,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    paidAt: payment.paidAt?.toISOString() ?? null,
    refundable: payment.refundable,
  };
}

/**
 * Maps a payment error to its HTTP outcome; any other error is rethrown unchanged. The webhook refusal is one 400
 * with no detail, so an unsigned, stale, forged, or malformed delivery cannot be told apart from outside (S4). An
 * invisible invitation or payment is the same 404 the rest of the owner routes answer (A4).
 */
export function mapPaymentError(error: unknown): never {
  if (error instanceof PaymentWebhookRejectedError) {
    throw new BadRequestException({ code: "PAYMENT_WEBHOOK_REJECTED" });
  }
  if (error instanceof PaymentProviderNotFoundError) {
    throw new NotFoundException({ code: "PAYMENT_PROVIDER_NOT_FOUND" });
  }
  if (error instanceof PaymentNotFoundError) {
    throw new NotFoundException({ code: "PAYMENT_NOT_FOUND" });
  }
  if (error instanceof PaymentsDisabledError) {
    throw new ConflictException({ code: "PAYMENTS_DISABLED" });
  }
  if (error instanceof PaymentsSimulationDisabledError) {
    throw new ConflictException({ code: "PAYMENT_SIMULATED_DISABLED" });
  }
  if (error instanceof PaymentNotRequiredError) {
    throw new ConflictException({ code: "PAYMENT_NOT_REQUIRED" });
  }
  if (error instanceof PaymentPriceUnavailableError) {
    throw new ConflictException({ code: "PAYMENT_PRICE_UNAVAILABLE" });
  }
  if (error instanceof PaymentAlreadyPaidError) {
    throw new ConflictException({ code: "PAYMENT_ALREADY_PAID" });
  }
  if (error instanceof PaymentNotRefundableError) {
    throw new ConflictException({ code: "PAYMENT_NOT_REFUNDABLE" });
  }
  if (error instanceof PaymentInvitationAlreadyPublishedError) {
    throw new ConflictException({ code: "INVITATION_ALREADY_PUBLISHED" });
  }
  if (error instanceof InvitationPackageLockedByPaymentError) {
    throw new ConflictException({ code: "INVITATION_PACKAGE_LOCKED_BY_PAYMENT" });
  }
  if (error instanceof PaymentProviderUnavailableError) {
    throw new ServiceUnavailableException({ code: "PAYMENT_PROVIDER_UNAVAILABLE" });
  }
  if (error instanceof InvitationNotEditableError) {
    throw new ConflictException({ code: "INVITATION_NOT_EDITABLE" });
  }
  throw error;
}

/** The 404 the owner payment routes answer for an invitation that is missing or belongs to another customer (A4). */
export function paymentInvitationNotFound(): never {
  throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
}
