import type { InvitationStatus } from "../../invitations/domain/invitation-lifecycle";
import type { PaymentEventOutcome, PaymentEventType, PaymentStatus } from "../domain/payment";

// Persistence of payments (M7 S1, S4). The port is deliberately one object rather than two: a checkout, an owner
// read, the publication gate, and the webhook intake all read and write the same rows, and the webhook intake needs
// one transaction that inserts the event and applies the transition together. Nothing here is a Prisma type, so the
// application cannot depend on the ORM.

/** One stored payment. `amountMinor` and `currency` are the snapshot taken when the row was created (S4). */
export interface PaymentRecord {
  id: string;
  invitationId: string;
  packageId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  /** The adapter key, never a credential. */
  provider: string;
  /** The provider's own checkout reference; null until the adapter created the checkout. */
  providerReference: string | null;
  /** The server-generated key of the intent, passed to the provider so a retried checkout is the same session. */
  idempotencyKey: string;
  createdAt: Date;
  /** The API's own receipt instant of the verified `paid` event; set while paid and kept when refunded. */
  paidAt: Date | null;
  updatedAt: Date;
}

/**
 * What a checkout needs from the invitation it pays for. The repository reads it with the owner in the query, so a
 * foreign invitation answers exactly like an id that names nothing (A4, S9).
 */
export interface PaymentTarget {
  id: string;
  packageId: string;
  status: InvitationStatus;
}

/** What a checkout stores: the price snapshot, the adapter key, and the server-generated idempotency key (S4). */
export interface NewPendingPayment {
  invitationId: string;
  packageId: string;
  amountMinor: number;
  currency: string;
  provider: string;
  idempotencyKey: string;
}

/** One event to record. The raw payload is never part of it: `payloadSha256` is its digest (S4). */
export interface NewPaymentEvent {
  /** Null for a signed event about a reference this API does not know. */
  paymentId: string | null;
  provider: string;
  providerEventId: string;
  type: PaymentEventType;
  receivedAt: Date;
  payloadSha256: string;
  /** The decision this delivery takes, written with the row and corrected if the guarded update loses. */
  outcome: PaymentEventOutcome;
}

/** Whether the event was new. A duplicate has already been recorded and must change nothing (S4). */
export type InsertEventResult =
  | { readonly created: false }
  | { readonly created: true; eventId: string };

/**
 * The statements of one webhook transaction (S4). The intake inserts the event, decides, applies the transition, and
 * completes the event row; either all of that is stored or none of it is, so a retried delivery is safe.
 */
export interface PaymentEventTransaction {
  /** The payment this provider reference names, or null when the API does not know it. */
  findPaymentByProviderReference(
    provider: string,
    providerReference: string,
  ): Promise<PaymentRecord | null>;

  /** Inserts the normalized event, or answers `created: false` when `(provider, eventId)` is already stored. */
  insertEvent(event: NewPaymentEvent): Promise<InsertEventResult>;

  /**
   * Applies one transition guarded by the status it was decided from: `false` means a concurrent delivery already
   * moved the payment, so this event decided nothing. `paidAt` is written with the API's receipt instant.
   */
  transition(input: {
    paymentId: string;
    from: PaymentStatus;
    to: PaymentStatus;
    at: Date;
  }): Promise<boolean>;

  /** What one event decided, written on the event row after the transition attempt (S4). */
  completeEvent(input: {
    eventId: string;
    paymentId: string | null;
    outcome: PaymentEventOutcome;
    processedAt: Date;
  }): Promise<void>;
}

/** Payment persistence. Ownership is never checked outside the query that reads the row (A4, S9). */
export interface PaymentRepository {
  /** The invitation while this owner has it; null when no row has this id or another owner has it. */
  findOwnedInvitation(ownerId: string, invitationId: string): Promise<PaymentTarget | null>;

  /** One payment of an invitation this owner has; null for a foreign or unknown payment (A4). */
  findOwnedPayment(ownerId: string, paymentId: string): Promise<PaymentRecord | null>;

  /** Every payment of one invitation, newest first: the gate and the owner read pick from it. */
  listForInvitation(invitationId: string): Promise<PaymentRecord[]>;

  /**
   * Creates the one `pending` payment of an invitation, or answers the one that already exists — including when two
   * checkouts race, because the partial unique index `Payment_one_pending_key` makes the second insert lose and
   * re-read (S4). It never overwrites the snapshot of an existing row.
   */
  createOrReusePending(input: NewPendingPayment): Promise<PaymentRecord>;

  /**
   * Stores the provider's reference on a payment that has none yet, so a retried checkout keeps the first reference
   * and its own idempotency key. Answers null when the row is gone.
   */
  attachProviderReference(
    paymentId: string,
    provider: string,
    providerReference: string,
  ): Promise<PaymentRecord | null>;

  /** Runs the webhook statements in one transaction, committing or rolling back all of them (S4). */
  transaction<T>(work: (transaction: PaymentEventTransaction) => Promise<T>): Promise<T>;
}

export const PAYMENT_REPOSITORY = Symbol("PaymentRepository");
