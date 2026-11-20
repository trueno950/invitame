import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  AdminAnalyticsRepository,
  AdminInvitationAnalytics,
  InvitationFunnelDay,
  TopInvitationView,
  ViewsByDay,
} from "../application/admin-analytics";
import {
  type AnalyticsDay,
  type AnalyticsWindow,
  ANALYTICS_TIME_ZONE,
} from "../domain/analytics-window";

// The administrator's analytics reads on PostgreSQL (M9 T11; S2, S7): the daily views, the most-viewed invitations, the
// invitation steps of the funnel, and one invitation's retained views with its RSVP totals. This module owns
// `InvitationView`, `Invitation`, and `RsvpResponse`, so each statement runs here; the payment steps come from the
// payments module through its own port.
//
// The day is always cut by PostgreSQL in `America/Mexico_City`, never by JavaScript, and a window is always a half-open
// range of instants computed in SQL from the two calendar days — so the new `Payment`/`Invitation` indexes are usable
// range scans and the zone's own rules decide where a day begins. Every aggregate casts to `int`, so a count reaches
// the API as a number instead of the string a `bigint` would become.

/** One row of the daily views read. */
interface ViewsByDayRow {
  day: string;
  public: number;
  guest: number;
}

/** One row of the top-invitations read. */
interface TopInvitationRow extends ViewsByDayRow {
  invitationId: string;
  slug: string;
}

/** One row of the invitation-side funnel read. */
interface FunnelRow {
  day: string;
  draftsCreated: number;
  firstPublications: number;
}

/** The one row of the detail analytics read. */
interface InvitationAnalyticsRow {
  public: number;
  guest: number;
  attendingPeople: number;
  declined: number;
  responses: number;
}

export class PrismaAdminAnalyticsRepository implements AdminAnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async viewsByDay(window: AnalyticsWindow): Promise<Map<AnalyticsDay, ViewsByDay>> {
    const rows = await this.prisma.$queryRaw<ViewsByDayRow[]>(Prisma.sql`
      SELECT
        to_char("day", 'YYYY-MM-DD') AS "day",
        COALESCE(SUM("count") FILTER (WHERE "source"::text = 'PUBLIC'), 0)::int AS "public",
        COALESCE(SUM("count") FILTER (WHERE "source"::text = 'GUEST'), 0)::int AS "guest"
      FROM "InvitationView"
      WHERE "day" >= ${window.from}::date AND "day" <= ${window.to}::date
      GROUP BY "day"
      ORDER BY "day" ASC
    `);

    return new Map(rows.map((row) => [row.day, { public: row.public, guest: row.guest }]));
  }

  async topInvitationViews(window: AnalyticsWindow, limit: number): Promise<TopInvitationView[]> {
    const rows = await this.prisma.$queryRaw<TopInvitationRow[]>(Prisma.sql`
      SELECT
        "view"."invitationId" AS "invitationId",
        "invitation"."slug" AS "slug",
        COALESCE(SUM("view"."count") FILTER (WHERE "view"."source"::text = 'PUBLIC'), 0)::int AS "public",
        COALESCE(SUM("view"."count") FILTER (WHERE "view"."source"::text = 'GUEST'), 0)::int AS "guest"
      FROM "InvitationView" AS "view"
      JOIN "Invitation" AS "invitation" ON "invitation"."id" = "view"."invitationId"
      WHERE "view"."day" >= ${window.from}::date AND "view"."day" <= ${window.to}::date
      GROUP BY "view"."invitationId", "invitation"."slug"
      -- The total of both links first, then the slug, so equal totals always answer in the same order (S2).
      ORDER BY SUM("view"."count") DESC, "invitation"."slug" ASC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      invitationId: row.invitationId,
      slug: row.slug,
      public: row.public,
      guest: row.guest,
    }));
  }

  async invitationFunnelByDay(
    window: AnalyticsWindow,
  ): Promise<Map<AnalyticsDay, InvitationFunnelDay>> {
    // Two grouped scans, one per timestamp, joined on the day: the new `Invitation(firstPublishedAt)` index serves the
    // second and `createdAt` already carries its own, so neither side reads the whole table to answer a window.
    const rows = await this.prisma.$queryRaw<FunnelRow[]>(Prisma.sql`
      WITH "drafts" AS (
        SELECT
          ("createdAt" AT TIME ZONE ${ANALYTICS_TIME_ZONE})::date AS "day",
          count(*)::int AS "count"
        FROM "Invitation"
        -- The window as two instants, computed by PostgreSQL: the first instant of "from" and of the day after "to",
        -- so the zone's own offset decides where a day begins and the timestamp indexes can serve the comparison.
        WHERE "createdAt" >= (${window.from}::date::timestamp AT TIME ZONE ${ANALYTICS_TIME_ZONE})
          AND "createdAt" < ((${window.to}::date + 1)::timestamp AT TIME ZONE ${ANALYTICS_TIME_ZONE})
        GROUP BY 1
      ), "publications" AS (
        SELECT
          ("firstPublishedAt" AT TIME ZONE ${ANALYTICS_TIME_ZONE})::date AS "day",
          count(*)::int AS "count"
        FROM "Invitation"
        WHERE "firstPublishedAt" >= (${window.from}::date::timestamp AT TIME ZONE ${ANALYTICS_TIME_ZONE})
          AND "firstPublishedAt" < ((${window.to}::date + 1)::timestamp AT TIME ZONE ${ANALYTICS_TIME_ZONE})
        GROUP BY 1
      )
      SELECT
        to_char(COALESCE("drafts"."day", "publications"."day"), 'YYYY-MM-DD') AS "day",
        COALESCE("drafts"."count", 0)::int AS "draftsCreated",
        COALESCE("publications"."count", 0)::int AS "firstPublications"
      FROM "drafts"
      FULL OUTER JOIN "publications" ON "drafts"."day" = "publications"."day"
      ORDER BY 1 ASC
    `);

    return new Map(
      rows.map((row) => [
        row.day,
        { draftsCreated: row.draftsCreated, firstPublications: row.firstPublications },
      ]),
    );
  }

  async invitationAnalytics(
    invitationId: string,
    window: AnalyticsWindow,
  ): Promise<AdminInvitationAnalytics> {
    // One statement for both facts: the retained view totals of the window and the RSVP aggregate, each on its own
    // table, so the detail costs one round-trip. The RSVP totals use the owner read's own semantics.
    const rows = await this.prisma.$queryRaw<InvitationAnalyticsRow[]>(Prisma.sql`
      WITH "views" AS (
        SELECT
          COALESCE(SUM("count") FILTER (WHERE "source"::text = 'PUBLIC'), 0)::int AS "public",
          COALESCE(SUM("count") FILTER (WHERE "source"::text = 'GUEST'), 0)::int AS "guest"
        FROM "InvitationView"
        WHERE "invitationId" = ${invitationId}::uuid
          AND "day" >= ${window.from}::date AND "day" <= ${window.to}::date
      ), "rsvp" AS (
        SELECT
          COALESCE(SUM("partySize") FILTER (WHERE "attending"), 0)::int AS "attendingPeople",
          COUNT(*) FILTER (WHERE NOT "attending")::int AS "declined",
          COUNT(*)::int AS "responses"
        FROM "RsvpResponse"
        WHERE "invitationId" = ${invitationId}::uuid
      )
      SELECT * FROM "views" CROSS JOIN "rsvp"
    `);
    const row = rows[0] ?? { public: 0, guest: 0, attendingPeople: 0, declined: 0, responses: 0 };

    return {
      views: { public: row.public, guest: row.guest },
      rsvpTotals: {
        attendingPeople: row.attendingPeople,
        declined: row.declined,
        responses: row.responses,
      },
    };
  }
}
