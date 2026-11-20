import { publicInvitationPath } from "../../public/invitation-page.ts";
import type {
  AdminInvitationDetail,
  AdminInvitationMedia,
  AdminInvitationPayment,
  AdminInvitationPaymentSnapshot,
  AdminInvitationSummary,
} from "../../server/admin-invitations-client.ts";
import { formatInstant } from "../catalog/format.ts";
import { formatMxn } from "../catalog/price.ts";
import { PAYMENTS_STATUS_LABELS } from "../payments/copy.ts";
import {
  INVITATION_DETAIL_COPY,
  INVITATIONS_COPY,
  INVITATION_STATUS_LABELS,
  invitationDetailPath,
} from "./copy.ts";

/**
 * What the invitation status pages render (M9 T3; S1, L3–L5): the stored facts the API answered, and nothing else. The
 * owner is «solo el correo» (L3), so no display name; the content is never sent, so no preview; a payment shows its
 * state and amount, never a provider payload; photos are counts, never an image.
 */

/** The amount and its currency, such as `$1,500.00 MXN`, or "" when the snapshot cannot be formatted. */
export function formatAmount(amountMinor: number, currency: string): string {
  try {
    return `${formatMxn(amountMinor, currency)} ${currency}`;
  } catch {
    // `Intl` refuses an unknown currency code with a `RangeError`; these pages print no amount they could not read.
    return "";
  }
}

/** The payment column: its state and, when it can be formatted, its amount; «Sin pago» when it has none. */
function paymentText(payment: AdminInvitationPaymentSnapshot | null): string {
  return payment === null
    ? INVITATIONS_COPY.noPayment
    : INVITATIONS_COPY.payment(
        PAYMENTS_STATUS_LABELS[payment.status],
        formatAmount(payment.amountMinor, payment.currency),
      );
}

/** The photos column: the main photo, the gallery, or neither, from the counts the API answered. */
function photosText(media: AdminInvitationMedia): string {
  if (media.galleryCount > 0) {
    return media.mainPhoto
      ? INVITATIONS_COPY.photosWithGallery(media.galleryCount)
      : INVITATIONS_COPY.galleryCount(media.galleryCount);
  }
  return media.mainPhoto ? INVITATIONS_COPY.mainPhoto : INVITATIONS_COPY.noPhotos;
}

export interface InvitationRowView {
  readonly invitationId: string;
  /** The detail page of this row. */
  readonly href: string;
  readonly slug: string;
  readonly statusLabel: string;
  /** The owner's stored address, or the sentence that says the API answered none (L3). */
  readonly ownerEmail: string;
  readonly payment: string;
  readonly photos: string;
  readonly created: string;
}

/** One row of the search: the invitation, its state, its owner's email, its payment, its photos, and its date. */
export function invitationRowView(summary: AdminInvitationSummary): InvitationRowView {
  return {
    invitationId: summary.invitationId,
    href: invitationDetailPath(summary.invitationId),
    slug: summary.slug,
    statusLabel: INVITATION_STATUS_LABELS[summary.status],
    ownerEmail: summary.ownerEmail ?? INVITATIONS_COPY.noOwnerEmail,
    payment: paymentText(summary.latestPayment),
    photos: photosText(summary.media),
    created: formatInstant(summary.createdAt),
  };
}

/** One lifecycle date: its label, the formatted text, and the instant itself for the `<time>` element. */
export interface InvitationDateView {
  readonly label: string;
  readonly value: string;
  /** The stored instant, or undefined when the invitation never reached this state. */
  readonly at: string | undefined;
}

/** One payment of the detail's list. */
export interface InvitationPaymentView {
  readonly paymentId: string;
  readonly statusLabel: string;
  readonly amount: string;
  readonly created: string;
  /** The paid instant, or "" while the payment is not paid. */
  readonly paid: string;
}

export interface InvitationDetailView {
  readonly slug: string;
  readonly statusLabel: string;
  /** The owner's stored address, or the sentence that says the API answered none (L3). */
  readonly ownerEmail: string;
  /** Created, published, first published, archived, and refund requested: the dates the lifecycle stores. */
  readonly dates: readonly InvitationDateView[];
  /** Newest first, as the API answered them. */
  readonly payments: readonly InvitationPaymentView[];
  readonly photos: { readonly main: string; readonly gallery: string };
  /** `/i/<slug>` only while the invitation is published (S1, S5); undefined otherwise. */
  readonly publicHref: string | undefined;
}

function dateView(label: string, at: string | null): InvitationDateView {
  return at === null
    ? { label, value: INVITATION_DETAIL_COPY.noDate, at: undefined }
    : { label, value: formatInstant(at), at };
}

function paymentView(payment: AdminInvitationPayment): InvitationPaymentView {
  return {
    paymentId: payment.paymentId,
    statusLabel: PAYMENTS_STATUS_LABELS[payment.status],
    amount: formatAmount(payment.amountMinor, payment.currency),
    created: formatInstant(payment.createdAt),
    paid: payment.paidAt === null ? "" : formatInstant(payment.paidAt),
  };
}

/** One invitation's status page: the lifecycle dates, the payments, the photo counts, and the public link. */
export function invitationDetailView(detail: AdminInvitationDetail): InvitationDetailView {
  const copy = INVITATION_DETAIL_COPY;

  return {
    slug: detail.slug,
    statusLabel: INVITATION_STATUS_LABELS[detail.status],
    ownerEmail: detail.ownerEmail ?? INVITATIONS_COPY.noOwnerEmail,
    dates: [
      dateView(copy.createdAtLabel, detail.createdAt),
      dateView(copy.publishedAtLabel, detail.publishedAt),
      dateView(copy.firstPublishedAtLabel, detail.firstPublishedAt),
      dateView(copy.archivedAtLabel, detail.archivedAt),
      dateView(copy.refundRequestedAtLabel, detail.refundRequestedAt),
    ],
    payments: detail.payments.map(paymentView),
    photos: {
      main: detail.media.mainPhoto ? copy.photosYes : copy.photosNo,
      gallery:
        detail.media.galleryCount === 0
          ? copy.noPhotos
          : INVITATIONS_COPY.galleryCount(detail.media.galleryCount),
    },
    // The public page exists only while the invitation is published; the slug is already a validated slug.
    publicHref: detail.status === "PUBLISHED" ? publicInvitationPath(detail.slug) : undefined,
  };
}
