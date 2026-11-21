import { Prisma, type PrismaClient } from "@prisma/client";

import type { InvitationViewRetentionRepository } from "../application/invitation-view-retention";
import type {
  InvitationViewRepository,
  InvitationViewSource,
} from "../application/invitation-views";
import { type AnalyticsDay, ANALYTICS_TIME_ZONE } from "../domain/analytics-window";

// The `InvitationView` table on PostgreSQL (M9 T11; S2, S3, S7, L12): the one counted upsert of an opening and the two
// bounded statements of the retention command. This adapter is the only writer of the table, so the counting rule and
// the retention rule each have one implementation.
//
// The day is computed in SQL, never in JavaScript: `at AT TIME ZONE 'America/Mexico_City'` asks PostgreSQL's own zone
// database for the calendar day, so the same request counts in the same row whatever zone the API process runs in. The
// instant comes from the use case's clock instead of `now()` only so a suite can observe the zone's midnight exactly;
// in production it is the request's own instant.

export class PrismaInvitationViewRepository
  implements InvitationViewRepository, InvitationViewRetentionRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * One opening: insert the pair with a count of one, or increment the row that already exists. The primary key is the
   * conflict target, so a retry and two concurrent requests both add one and never duplicate a row (S7).
   */
  async increment(invitationId: string, source: InvitationViewSource, at: Date): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "InvitationView" ("invitationId", "day", "source", "count")
      VALUES (
        ${invitationId}::uuid,
        (${at}::timestamptz AT TIME ZONE ${ANALYTICS_TIME_ZONE})::date,
        ${source}::"InvitationViewSource",
        1
      )
      ON CONFLICT ("invitationId", "day", "source")
      DO UPDATE SET "count" = "InvitationView"."count" + 1
    `);
  }

  /** How many rows the retention cutoff would delete; a dry run stops here. */
  async countOlderThan(day: AnalyticsDay): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT count(*)::int AS "count"
      FROM "InvitationView"
      WHERE "day" < ${day}::date
    `);

    return rows[0]?.count ?? 0;
  }

  /** Deletes the rows older than the cutoff and answers how many it deleted, in one statement (S3). */
  async deleteOlderThan(day: AnalyticsDay): Promise<number> {
    return this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "InvitationView"
      WHERE "day" < ${day}::date
    `);
  }
}
