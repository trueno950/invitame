import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  InvitationPaymentReader,
  InvitationPaymentSummary,
} from "../../invitations/application/invitation-payment-summary";
import { INVITATION_PAYMENT_DETAIL_LIMIT } from "../../invitations/application/invitation-payment-summary";
import type { PaymentStatus } from "../domain/payment";

// The administrator's payment facet of the invitation status view (M9 T2; S1), on PostgreSQL. The invitations module
// declares the port and this adapter implements it, so the invitation read never touches a payment table through
// another module's internals.
//
// A whole page's newest payments are one `DISTINCT ON` read, never one query per row: the order inside each
// invitation is the same `(createdAt desc, id desc)` the product uses everywhere, and `DISTINCT ON` keeps exactly the
// first row of each group. The summary carries the payment's own snapshot only — no provider name, no provider
// reference, no idempotency key, and no event payload — so nothing a payer or a provider wrote can reach the view.

/** One row of the batched read. */
interface LatestPaymentSqlRow {
  invitationId: string;
  id: string;
  status: PaymentStatus;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
}

const SUMMARY_COLUMNS = {
  id: true,
  status: true,
  amountMinor: true,
  currency: true,
  createdAt: true,
  paidAt: true,
} satisfies Prisma.PaymentSelect;

function toSummary(row: {
  id: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
}): InvitationPaymentSummary {
  return {
    paymentId: row.id,
    status: row.status as PaymentStatus,
    amountMinor: row.amountMinor,
    currency: row.currency,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
  };
}

export class PrismaInvitationPaymentReader implements InvitationPaymentReader {
  constructor(private readonly prisma: PrismaClient) {}

  async latestFor(
    invitationIds: readonly string[],
  ): Promise<Map<string, InvitationPaymentSummary>> {
    if (invitationIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<LatestPaymentSqlRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("invitationId")
        "invitationId", "id", "status", "amountMinor", "currency", "createdAt", "paidAt"
      FROM "Payment"
      WHERE "invitationId" IN (${Prisma.join(
        invitationIds.map((invitationId) => Prisma.sql`${invitationId}::uuid`),
      )})
      ORDER BY "invitationId", "createdAt" DESC, "id" DESC
    `);

    return new Map(rows.map((row) => [row.invitationId, toSummary(row)]));
  }

  async listForInvitation(
    invitationId: string,
    limit: number,
  ): Promise<InvitationPaymentSummary[]> {
    const rows = await this.prisma.payment.findMany({
      where: { invitationId },
      select: SUMMARY_COLUMNS,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // The bound is the port's, not the caller's: the detail view shows at most twenty payments, so a larger request
      // is clamped instead of widening the read, and a request for fewer than one row still reads one.
      take: Math.min(Math.max(limit, 1), INVITATION_PAYMENT_DETAIL_LIMIT),
    });

    return rows.map(toSummary);
  }
}
