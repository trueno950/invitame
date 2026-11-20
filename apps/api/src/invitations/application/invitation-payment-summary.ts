import type { PaymentStatus } from "../../payments/domain/payment";

// The payment facet of the administrator's invitation status view (M9 T2; S1). The invitations module owns what the
// status view shows and therefore declares this port; the payments module implements it, exactly like
// `INVITATION_GALLERY_READER` and `INVITATION_PAYMENT_GATE`, so no module reads another module's tables.
//
// A summary is the payment's own snapshot and nothing else: no provider name, no provider reference, no payer datum,
// and no event payload, so the status view cannot render what it never read.

/** One payment as the status view shows it. */
export interface InvitationPaymentSummary {
  paymentId: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  /** The API's own receipt instant of the verified `paid` event, or null while the payment never was paid. */
  paidAt: Date | null;
}

/**
 * The port's own maximum for one detail read: the newest twenty payments. An adapter clamps every request into
 * `1..INVITATION_PAYMENT_DETAIL_LIMIT`, so no caller can widen the read and none can ask for an empty page.
 */
export const INVITATION_PAYMENT_DETAIL_LIMIT = 20;

/** The payment source of the administrator's status view. */
export interface InvitationPaymentReader {
  /**
   * The newest payment of each of the given invitations, in one batched read: an invitation with no payment is
   * absent from the map. A page of the status view asks once for every row it shows, never once per row.
   */
  latestFor(invitationIds: readonly string[]): Promise<Map<string, InvitationPaymentSummary>>;

  /**
   * The newest payments of one invitation, newest first, for the detail read: at most
   * `INVITATION_PAYMENT_DETAIL_LIMIT`, whatever `limit` asks, and at least one row.
   */
  listForInvitation(invitationId: string, limit: number): Promise<InvitationPaymentSummary[]>;
}

export const INVITATION_PAYMENT_READER = Symbol("InvitationPaymentReader");
