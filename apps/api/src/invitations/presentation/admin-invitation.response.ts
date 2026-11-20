import { BadRequestException, NotFoundException } from "@nestjs/common";

import type {
  AdminInvitationDetail,
  AdminInvitationPage,
  AdminInvitationSummary,
} from "../application/admin-invitation.use-cases";
import { InvalidInvitationCursorError } from "../application/admin-invitation.use-cases";
import type { InvitationPaymentSummary } from "../application/invitation-payment-summary";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import type { PaymentStatus } from "../../payments/domain/payment";

// The stable REST shapes of the administrator's invitation status view (M9 T2; S1, L3). The field set is the whole
// privacy rule: the lifecycle dates, the newest payment's four state fields, the photo counts, and the owner's email.
// No invitation content, no owner display name, no guests, no RSVP answer, no provider payload, and no owner id is
// answered, so a response can never confirm what the status view was not allowed to read.

/** The newest payment as the list shows it: enough to state whether a payment happened, never an identifier. */
export interface AdminInvitationLatestPaymentResponse {
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  paidAt: string | null;
}

/** One payment of the detail view: the same state fields plus its own id and creation instant. */
export interface AdminInvitationPaymentResponse extends AdminInvitationLatestPaymentResponse {
  paymentId: string;
  createdAt: string;
}

/** The stored photo counts: whether a main photo exists and how many gallery photos there are. */
export interface AdminInvitationMediaResponse {
  mainPhoto: boolean;
  galleryCount: number;
}

/** One row of the status view (S1). */
export interface AdminInvitationSummaryResponse {
  invitationId: string;
  slug: string;
  status: InvitationStatus;
  /**
   * The owner's email, the only owner field the view shows (L3). It is null only when no stored owner answers for the
   * invitation, which the reference's ON DELETE RESTRICT prevents in practice.
   */
  ownerEmail: string | null;
  createdAt: string;
  publishedAt: string | null;
  firstPublishedAt: string | null;
  archivedAt: string | null;
  refundRequestedAt: string | null;
  latestPayment: AdminInvitationLatestPaymentResponse | null;
  media: AdminInvitationMediaResponse;
}

/** One invitation's detail: the row's own fields plus the pinned references and the newest payments. */
export interface AdminInvitationDetailResponse extends AdminInvitationSummaryResponse {
  packageId: string;
  templateVersionId: string;
  /** The newest payments, at most 20, newest first. */
  payments: AdminInvitationPaymentResponse[];
}

/** One page of the status view: the rows and the cursor to continue after, or null when the page is the last. */
export interface AdminInvitationListResponse {
  items: AdminInvitationSummaryResponse[];
  nextCursor: string | null;
}

function toLatestPayment(payment: InvitationPaymentSummary): AdminInvitationLatestPaymentResponse {
  return {
    status: payment.status,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    paidAt: payment.paidAt?.toISOString() ?? null,
  };
}

function toPayment(payment: InvitationPaymentSummary): AdminInvitationPaymentResponse {
  return {
    paymentId: payment.paymentId,
    status: payment.status,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    createdAt: payment.createdAt.toISOString(),
    paidAt: payment.paidAt?.toISOString() ?? null,
  };
}

export function toAdminInvitationSummaryResponse(
  stored: AdminInvitationSummary,
): AdminInvitationSummaryResponse {
  return {
    invitationId: stored.invitationId,
    slug: stored.slug,
    status: stored.status,
    ownerEmail: stored.ownerEmail,
    createdAt: stored.createdAt.toISOString(),
    publishedAt: stored.publishedAt?.toISOString() ?? null,
    firstPublishedAt: stored.firstPublishedAt?.toISOString() ?? null,
    archivedAt: stored.archivedAt?.toISOString() ?? null,
    refundRequestedAt: stored.refundRequestedAt?.toISOString() ?? null,
    latestPayment: stored.latestPayment === null ? null : toLatestPayment(stored.latestPayment),
    media: { mainPhoto: stored.media.mainPhoto, galleryCount: stored.media.galleryCount },
  };
}

export function toAdminInvitationDetailResponse(
  stored: AdminInvitationDetail,
): AdminInvitationDetailResponse {
  return {
    ...toAdminInvitationSummaryResponse(stored),
    packageId: stored.packageId,
    templateVersionId: stored.templateVersionId,
    payments: stored.payments.map(toPayment),
  };
}

export function toAdminInvitationListResponse(
  page: AdminInvitationPage,
): AdminInvitationListResponse {
  return {
    items: page.items.map(toAdminInvitationSummaryResponse),
    nextCursor: page.nextCursor,
  };
}

/**
 * The one 404 of the detail route (S1): an id no invitation has. The status view is global, so there is no owner to
 * hide a row from; the code is the invitation code the rest of the API already uses.
 */
export function orAdminInvitationNotFound(
  stored: AdminInvitationDetail | null,
): AdminInvitationDetailResponse {
  if (stored === null) {
    throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
  }

  return toAdminInvitationDetailResponse(stored);
}

/**
 * Maps the status view's own refusal to its HTTP outcome; any other error is rethrown unchanged. A cursor this API did
 * not write is a malformed request: 400 `INVALID_CURSOR`, answered before any read, so a broken link never silently
 * restarts the list.
 */
export function mapAdminInvitationError(error: unknown): never {
  if (error instanceof InvalidInvitationCursorError) {
    throw new BadRequestException({ code: "INVALID_CURSOR" });
  }
  throw error;
}
