import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  InvitationFunnelPaymentReader,
  PaymentFunnelDay,
} from "../../invitations/application/admin-analytics";
import {
  type AnalyticsDay,
  type AnalyticsWindow,
  ANALYTICS_TIME_ZONE,
} from "../../invitations/domain/analytics-window";

// The payment steps of the administrator's purchase funnel (M9 T11; S2, S7), on PostgreSQL. The invitations module
// declares the port and this adapter implements it, exactly like `INVITATION_PAYMENT_READER`, so the funnel read never
// touches a payment table through another module's internals.
//
// One statement answers the whole window: checkouts started are the payments of `createdAt`, and approved payments are
// the `paid` payments of `paidAt` — each side its own range scan of its own index (migration
// 20261128130000_add_analytics_indexes), unioned and grouped by the Ciudad de México day PostgreSQL computes. The steps
// are counted per action, not per distinct invitation, so a second checkout of the same invitation is a second
// checkout; the design reads «checkouts iniciados» and «pagos aprobados» as events, not as rows of a funnel per
// invitation.

/** One row of the grouped read. */
interface FunnelRow {
  day: string;
  checkoutsStarted: number;
  paymentsApproved: number;
}

export class PrismaInvitationFunnelReader implements InvitationFunnelPaymentReader {
  constructor(private readonly prisma: PrismaClient) {}

  async funnelByDay(window: AnalyticsWindow): Promise<Map<AnalyticsDay, PaymentFunnelDay>> {
    const rows = await this.prisma.$queryRaw<FunnelRow[]>(Prisma.sql`
      SELECT
        to_char("steps"."day", 'YYYY-MM-DD') AS "day",
        SUM("steps"."checkoutsStarted")::int AS "checkoutsStarted",
        SUM("steps"."paymentsApproved")::int AS "paymentsApproved"
      FROM (
        SELECT
          ("createdAt" AT TIME ZONE ${ANALYTICS_TIME_ZONE})::date AS "day",
          1 AS "checkoutsStarted",
          0 AS "paymentsApproved"
        FROM "Payment"
        WHERE "createdAt" >= (${window.from}::date::timestamp AT TIME ZONE ${ANALYTICS_TIME_ZONE})
          AND "createdAt" < ((${window.to}::date + 1)::timestamp AT TIME ZONE ${ANALYTICS_TIME_ZONE})
        UNION ALL
        SELECT
          ("paidAt" AT TIME ZONE ${ANALYTICS_TIME_ZONE})::date AS "day",
          0 AS "checkoutsStarted",
          1 AS "paymentsApproved"
        FROM "Payment"
        WHERE "status"::text = 'paid'
          AND "paidAt" >= (${window.from}::date::timestamp AT TIME ZONE ${ANALYTICS_TIME_ZONE})
          AND "paidAt" < ((${window.to}::date + 1)::timestamp AT TIME ZONE ${ANALYTICS_TIME_ZONE})
      ) AS "steps"
      GROUP BY "steps"."day"
      ORDER BY "steps"."day" ASC
    `);

    return new Map(
      rows.map((row) => [
        row.day,
        { checkoutsStarted: row.checkoutsStarted, paymentsApproved: row.paymentsApproved },
      ]),
    );
  }
}
