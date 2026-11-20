import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { databaseErrorCode } from "../../users/domain/database-error-code";
import {
  ADMIN_PAYMENT_EVENT_LIMIT,
  type AdminPaymentDetail,
  type AdminPaymentDetailReader,
  type AdminPaymentEventRecord,
  type AdminPaymentRow,
  type InsertEventResult,
  type NewPendingPayment,
  type PaymentEventTransaction,
  type PaymentRecord,
  type PaymentRefundRepository,
  type PaymentRepository,
  type PaymentTarget,
  type RefundTarget,
} from "../application/payment.repository";
import {
  PaymentInvitationAlreadyPublishedError,
  PaymentNotRefundableError,
} from "../application/payment.errors";
import type { PaymentEventOutcome, PaymentEventType, PaymentStatus } from "../domain/payment";

// The payments repository on PostgreSQL (M7 S1, S4). Two statements are the whole concurrency story of this
// milestone, and both are the database's: the partial unique index `Payment_one_pending_key` makes the second of two
// simultaneous checkouts lose its insert, and the unique index on `(provider, providerEventId)` makes the second of
// two identical deliveries insert nothing (`createMany({ skipDuplicates: true })` is `ON CONFLICT DO NOTHING`). The
// status transition is guarded by the status it was decided from, so a concurrent event cannot overwrite another
// one's decision. The raw provider payload is never written: the intake passes its digest.

const PAYMENT_SELECT = {
  id: true,
  invitationId: true,
  packageId: true,
  amountMinor: true,
  currency: true,
  status: true,
  provider: true,
  providerReference: true,
  idempotencyKey: true,
  createdAt: true,
  paidAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

const TARGET_SELECT = {
  id: true,
  packageId: true,
  status: true,
} satisfies Prisma.InvitationSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

function toRecord(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    invitationId: row.invitationId,
    packageId: row.packageId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    status: row.status as PaymentStatus,
    provider: row.provider,
    providerReference: row.providerReference,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
    updatedAt: row.updatedAt,
  };
}

/** The statements of one intake transaction, bound to the transaction client Prisma hands to the callback. */
class PrismaPaymentEventTransaction implements PaymentEventTransaction {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async findPaymentByProviderReference(
    provider: string,
    providerReference: string,
  ): Promise<PaymentRecord | null> {
    const row = await this.tx.payment.findFirst({
      where: { provider, providerReference },
      select: PAYMENT_SELECT,
    });

    return row === null ? null : toRecord(row);
  }

  async insertEvent(
    event: Parameters<PaymentEventTransaction["insertEvent"]>[0],
  ): Promise<InsertEventResult> {
    // The id is generated here, so the row that wins the unique index is known without a second read.
    const id = randomUUID();
    const { count } = await this.tx.paymentEvent.createMany({
      data: [
        {
          id,
          paymentId: event.paymentId,
          provider: event.provider,
          providerEventId: event.providerEventId,
          type: event.type,
          receivedAt: event.receivedAt,
          payloadSha256: event.payloadSha256,
          // The decision taken from the row read in this same transaction; `completeEvent` corrects it to
          // `ignored_transition` when a concurrent delivery wins the guarded update.
          outcome: event.outcome,
        },
      ],
      skipDuplicates: true,
    });

    return count === 0 ? { created: false } : { created: true, eventId: id };
  }

  async transition(input: {
    paymentId: string;
    from: PaymentStatus;
    to: PaymentStatus;
    at: Date;
  }): Promise<boolean> {
    const { count } = await this.tx.payment.updateMany({
      where: { id: input.paymentId, status: input.from },
      data: {
        status: input.to,
        // `paidAt` is written by the transition that makes the payment paid, and kept when it is refunded.
        ...(input.to === "paid" ? { paidAt: input.at } : {}),
      },
    });

    return count === 1;
  }

  async completeEvent(input: {
    eventId: string;
    paymentId: string | null;
    outcome: Parameters<PaymentEventTransaction["completeEvent"]>[0]["outcome"];
    processedAt: Date;
  }): Promise<void> {
    await this.tx.paymentEvent.update({
      where: { id: input.eventId },
      data: {
        paymentId: input.paymentId,
        outcome: input.outcome,
        processedAt: input.processedAt,
      },
    });
  }
}

export class PrismaPaymentRepository
  implements PaymentRepository, PaymentRefundRepository, AdminPaymentDetailReader
{
  constructor(private readonly prisma: PrismaClient) {}

  async findOwnedInvitation(ownerId: string, invitationId: string): Promise<PaymentTarget | null> {
    // The owner is in the query, never checked afterwards: a foreign id answers exactly like an unknown one (A4).
    const row = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ownerId },
      select: TARGET_SELECT,
    });

    return row === null ? null : { id: row.id, packageId: row.packageId, status: row.status };
  }

  async findOwnedPayment(ownerId: string, paymentId: string): Promise<PaymentRecord | null> {
    const row = await this.prisma.payment.findFirst({
      where: { id: paymentId, invitation: { ownerId } },
      select: PAYMENT_SELECT,
    });

    return row === null ? null : toRecord(row);
  }

  async listForInvitation(invitationId: string): Promise<PaymentRecord[]> {
    const rows = await this.prisma.payment.findMany({
      where: { invitationId },
      select: PAYMENT_SELECT,
      orderBy: { createdAt: "desc" },
    });

    return rows.map(toRecord);
  }

  async createOrReusePending(input: NewPendingPayment): Promise<PaymentRecord> {
    const pending = await this.findPending(input.invitationId);
    if (pending !== null) {
      return pending;
    }

    try {
      return toRecord(
        await this.prisma.payment.create({
          data: {
            invitationId: input.invitationId,
            packageId: input.packageId,
            amountMinor: input.amountMinor,
            currency: input.currency,
            status: "pending",
            provider: input.provider,
            idempotencyKey: input.idempotencyKey,
          },
          select: PAYMENT_SELECT,
        }),
      );
    } catch (error) {
      // The partial unique index refused the second of two simultaneous checkouts: the row the winner created is
      // the answer, and this request never overwrites its snapshot (S4).
      if (databaseErrorCode(error) !== "P2002") {
        throw error;
      }
      const raced = await this.findPending(input.invitationId);
      if (raced === null) {
        throw error;
      }

      return raced;
    }
  }

  async attachProviderReference(
    paymentId: string,
    provider: string,
    providerReference: string,
  ): Promise<PaymentRecord | null> {
    // Only a payment that has no reference is written, so a retried checkout keeps the first one.
    await this.prisma.payment.updateMany({
      where: { id: paymentId, providerReference: null },
      data: { provider, providerReference },
    });

    const row = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: PAYMENT_SELECT,
    });

    return row === null ? null : toRecord(row);
  }

  async transaction<T>(work: (transaction: PaymentEventTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(new PrismaPaymentEventTransaction(tx)));
  }

  async findRefundTarget(paymentId: string): Promise<RefundTarget | null> {
    // One query reads the payment and the invitation history the refund rule needs, so the decision is never taken
    // from two reads that could disagree (T2, S3).
    const row = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        invitationId: true,
        provider: true,
        providerReference: true,
        status: true,
        invitation: { select: { firstPublishedAt: true } },
      },
    });

    return row === null
      ? null
      : {
          paymentId: row.id,
          invitationId: row.invitationId,
          provider: row.provider,
          providerReference: row.providerReference,
          status: row.status as PaymentStatus,
          firstPublishedAt: row.invitation.firstPublishedAt,
        };
  }

  async claimRefund(paymentId: string, at: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { invitationId: true, status: true, providerReference: true },
      });
      if (payment === null || payment.status !== "paid" || payment.providerReference === null) {
        throw new PaymentNotRefundableError();
      }

      const { count } = await tx.invitation.updateMany({
        // `firstPublishedAt: null` is "never published" (the CHECK constraint pairs both columns), and the claim is
        // written only when it is not stored yet, so a retry keeps the first instant.
        where: { id: payment.invitationId, firstPublishedAt: null, refundRequestedAt: null },
        data: { refundRequestedAt: at },
      });
      if (count === 0) {
        // A stored claim stays (the retry re-sends the same refund); any other miss means it was published.
        const invitation = await tx.invitation.findUniqueOrThrow({
          where: { id: payment.invitationId },
          select: { refundRequestedAt: true },
        });
        if (invitation.refundRequestedAt === null) {
          throw new PaymentInvitationAlreadyPublishedError();
        }
      }
    });
  }

  async listPaidForAdmin(limit: number): Promise<AdminPaymentRow[]> {
    const rows = await this.prisma.payment.findMany({
      where: { status: "paid" },
      select: {
        id: true,
        invitationId: true,
        amountMinor: true,
        currency: true,
        status: true,
        paidAt: true,
        invitation: { select: { slug: true, firstPublishedAt: true, refundRequestedAt: true } },
      },
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
      take: limit,
    });

    return rows.map((row) => ({
      paymentId: row.id,
      invitationId: row.invitationId,
      invitationSlug: row.invitation.slug,
      status: row.status as PaymentStatus,
      amountMinor: row.amountMinor,
      currency: row.currency,
      paidAt: row.paidAt,
      firstPublishedAt: row.invitation.firstPublishedAt,
      refundRequestedAt: row.invitation.refundRequestedAt,
    }));
  }

  async findForAdmin(paymentId: string): Promise<AdminPaymentDetail | null> {
    // One query reads the payment, its invitation's slug, and the newest events the intake kept. The digest and the
    // provider's event id are not selected at all, so they cannot become part of a response by accident (M9 T7; S4).
    const row = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        invitationId: true,
        amountMinor: true,
        currency: true,
        status: true,
        provider: true,
        createdAt: true,
        paidAt: true,
        invitation: { select: { slug: true } },
        events: {
          select: { type: true, outcome: true, receivedAt: true, processedAt: true },
          // Newest first; the id breaks a tie between two deliveries of the same instant deterministically.
          orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
          take: ADMIN_PAYMENT_EVENT_LIMIT,
        },
      },
    });

    return row === null
      ? null
      : {
          paymentId: row.id,
          invitationId: row.invitationId,
          invitationSlug: row.invitation.slug,
          status: row.status as PaymentStatus,
          amountMinor: row.amountMinor,
          currency: row.currency,
          provider: row.provider,
          createdAt: row.createdAt,
          paidAt: row.paidAt,
          events: row.events.map(
            (event): AdminPaymentEventRecord => ({
              type: event.type as PaymentEventType,
              outcome: event.outcome as PaymentEventOutcome,
              receivedAt: event.receivedAt,
              processedAt: event.processedAt,
            }),
          ),
        };
  }

  private async findPending(invitationId: string): Promise<PaymentRecord | null> {
    const row = await this.prisma.payment.findFirst({
      where: { invitationId, status: "pending" },
      select: PAYMENT_SELECT,
      orderBy: { createdAt: "asc" },
    });

    return row === null ? null : toRecord(row);
  }
}
