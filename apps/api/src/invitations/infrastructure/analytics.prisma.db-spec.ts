import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaInvitationFunnelReader } from "../../payments/infrastructure/prisma-invitation-funnel-reader";
import { resolveAnalyticsWindow } from "../domain/analytics-window";
import type { AdminAnalyticsRepository } from "../application/admin-analytics";
import { ANALYTICS_TOP_INVITATIONS_LIMIT } from "../application/admin-analytics";
import { PurgeInvitationViewsUseCase } from "../application/invitation-view-retention";
import { GetRsvpResponsesUseCase } from "../application/invitation-rsvp.use-cases";
import { PrismaAdminAnalyticsRepository } from "./prisma-admin-analytics.repository";
import { PrismaInvitationRepository } from "./prisma-invitation.repository";
import { PrismaInvitationViewRepository } from "./prisma-invitation-view.repository";
import { PrismaRsvpRepository } from "./prisma-rsvp.repository";

// View counting, the analytics reads, and the retention command on real PostgreSQL (M9 T11; S2, S3, S7, L12): the
// counted upsert under a retry and across the Ciudad de México midnight, the composite key and the RESTRICT reference,
// the funnel buckets of both modules' timestamps at the same boundary, the RSVP aggregate against the owner read's own
// totals, the top-invitations order, and the retention cutoff. Every instant is explicit, so no assertion depends on
// the wall clock. Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL. The database is
// shared with parallel suites: every row here carries a key made from this run's id, cleanup removes exactly those
// rows, and `InvitationView` rows are deleted before their invitation because the reference is ON DELETE RESTRICT.

/** 2026-11-29 02:00 UTC is 2026-11-28 in Ciudad de México, so retention keeps days from 2026-08-30 on. */
const NOW = new Date("2026-11-29T02:00:00.000Z");
const RENDERER = "birthday-poster-01";

describe("invitation analytics on real PostgreSQL (M9 T11; S2, S3, S7)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const views = new PrismaInvitationViewRepository(prisma);
  const analytics = new PrismaAdminAnalyticsRepository(prisma);
  const paymentFunnel = new PrismaInvitationFunnelReader(prisma);
  const invitations = new PrismaInvitationRepository(prisma);
  const rsvp = new PrismaRsvpRepository(prisma);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const versionIds: string[] = [];
  const packageIds: string[] = [];
  const invitationIds: string[] = [];
  const paymentIds: string[] = [];
  let sequence = 0;
  let ownerId = "";
  let versionId = "";
  let packageId = "";

  before(async () => {
    sequence += 1;
    ownerId = (
      await prisma.user.create({
        data: { email: `m9-analytics-owner-${runId}@example.test` },
      })
    ).id;
    userIds.push(ownerId);
    const category = await prisma.category.create({
      data: { key: `m9-analytics-category-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m9-analytics-template-${runId}`,
        name: "Plantilla",
        status: "PUBLISHED",
      },
    });
    templateIds.push(template.id);
    const version = await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        status: "PUBLISHED",
        componentKey: RENDERER,
        schema: { type: "object", required: [], properties: {} },
        configuration: { componentKey: RENDERER },
      },
    });
    versionIds.push(version.id);
    versionId = version.id;
    const createdPackage = await prisma.package.create({
      data: { key: `m9-analytics-package-${runId}`, name: "Paquete", status: "ACTIVE" },
    });
    packageIds.push(createdPackage.id);
    packageId = createdPackage.id;
  });

  after(async () => {
    try {
      // The references are all ON DELETE RESTRICT, so the dependents go before the rows they name.
      await prisma.invitationView.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.rsvpResponse.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.paymentEvent.deleteMany({
        where: { payment: { invitationId: { in: invitationIds } } },
      });
      await prisma.payment.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.invitationFeatureSettings.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.templateVersion.deleteMany({ where: { id: { in: versionIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  /** A stored invitation with the two timestamps the funnel buckets, both set explicitly. */
  async function newInvitation(options: {
    slug: string;
    createdAt: Date;
    firstPublishedAt?: Date | null;
  }): Promise<string> {
    sequence += 1;
    const created = await prisma.invitation.create({
      data: {
        ownerId,
        templateVersionId: versionId,
        packageId,
        slug: `${options.slug}-${sequence}-${runId}`,
        content: {},
        createdAt: options.createdAt,
        updatedAt: options.createdAt,
        firstPublishedAt: options.firstPublishedAt ?? null,
        // A row that was published once keeps the published marker too; only four columns feed the funnel.
        status:
          options.firstPublishedAt === undefined || options.firstPublishedAt === null
            ? "DRAFT"
            : "PUBLISHED",
        publishedAt:
          options.firstPublishedAt === undefined || options.firstPublishedAt === null
            ? null
            : options.firstPublishedAt,
      },
    });
    invitationIds.push(created.id);
    return created.id;
  }

  /** A stored payment with explicit checkouts and approval instants. */
  async function newPayment(options: {
    invitationId: string;
    createdAt: Date;
    paidAt: Date | null;
  }): Promise<string> {
    sequence += 1;
    const created = await prisma.payment.create({
      data: {
        invitationId: options.invitationId,
        packageId,
        amountMinor: 25_000,
        currency: "MXN",
        status: options.paidAt === null ? "pending" : "paid",
        provider: "simulated",
        idempotencyKey: `m9-analytics-key-${sequence}-${runId}`,
        createdAt: options.createdAt,
        updatedAt: options.createdAt,
        paidAt: options.paidAt,
      },
    });
    paymentIds.push(created.id);
    return created.id;
  }

  /** The stored rows of one invitation, keyed by `YYYY-MM-DD` and source, with the count each one holds. */
  async function storedViews(invitationId: string) {
    const rows = await prisma.$queryRaw<Array<{ day: string; source: string; count: number }>>(
      Prisma.sql`
        SELECT to_char("day", 'YYYY-MM-DD') AS "day", "source"::text AS "source", "count"
        FROM "InvitationView"
        WHERE "invitationId" = ${invitationId}::uuid
        ORDER BY "day", "source"
      `,
    );

    return rows.map((row) => [row.day, row.source, row.count]);
  }

  describe("the counted upsert", () => {
    it("counts two openings of one link as the same row of two, and keeps the two links apart", async () => {
      const invitationId = await newInvitation({
        slug: "m9-analytics-upsert",
        createdAt: new Date("2026-11-28T12:00:00.000Z"),
      });
      const at = new Date("2026-11-29T05:30:00.000Z"); // 2026-11-28 23:30 in Ciudad de México.

      await views.increment(invitationId, "PUBLIC", at);
      await views.increment(invitationId, "PUBLIC", at);
      await views.increment(invitationId, "GUEST", at);

      assert.deepEqual(await storedViews(invitationId), [
        ["2026-11-28", "GUEST", 1],
        ["2026-11-28", "PUBLIC", 2],
      ]);
    });

    it("cuts the day at Ciudad de México midnight, not at UTC midnight", async () => {
      const invitationId = await newInvitation({
        slug: "m9-analytics-midnight",
        createdAt: new Date("2026-11-28T12:00:00.000Z"),
      });

      // 05:59:59.999 UTC is still the previous day in the zone; one millisecond later the zone's day has changed.
      await views.increment(invitationId, "PUBLIC", new Date("2026-11-29T05:59:59.999Z"));
      await views.increment(invitationId, "PUBLIC", new Date("2026-11-29T06:00:00.000Z"));

      assert.deepEqual(await storedViews(invitationId), [
        ["2026-11-28", "PUBLIC", 1],
        ["2026-11-29", "PUBLIC", 1],
      ]);
    });

    it("refuses a negative count and refuses to delete an invitation that has counted views", async () => {
      const invitationId = await newInvitation({
        slug: "m9-analytics-refuse",
        createdAt: new Date("2026-11-28T12:00:00.000Z"),
      });
      await views.increment(invitationId, "PUBLIC", new Date("2026-11-28T12:00:00.000Z"));

      await assert.rejects(
        prisma.invitationView.update({
          where: {
            invitationId_day_source: {
              invitationId,
              day: new Date("2026-11-28T00:00:00.000Z"),
              source: "PUBLIC",
            },
          },
          data: { count: -1 },
        }),
        /InvitationView_count_non_negative/,
      );
      await assert.rejects(
        prisma.invitation.delete({ where: { id: invitationId } }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
      );
      assert.deepEqual(await storedViews(invitationId), [["2026-11-28", "PUBLIC", 1]]);
    });
  });

  describe("the funnel buckets", () => {
    it("buckets both modules' timestamps by the Ciudad de México day, on either side of midnight", async () => {
      const before = await newInvitation({
        slug: "m9-analytics-funnel-before",
        createdAt: new Date("2026-11-29T05:59:59.999Z"), // 2026-11-28 in the zone.
        firstPublishedAt: new Date("2026-11-29T05:59:59.999Z"),
      });
      const after = await newInvitation({
        slug: "m9-analytics-funnel-after",
        createdAt: new Date("2026-11-29T06:00:00.000Z"), // 2026-11-29 in the zone.
        firstPublishedAt: new Date("2026-11-29T06:00:00.000Z"),
      });
      // A checkout that starts on one zone day and is approved on the next: each step lands in its own day.
      await newPayment({
        invitationId: before,
        createdAt: new Date("2026-11-29T05:00:00.000Z"),
        paidAt: new Date("2026-11-29T06:30:00.000Z"),
      });
      await newPayment({
        invitationId: after,
        createdAt: new Date("2026-11-29T07:00:00.000Z"),
        paidAt: null,
      });

      const window = resolveAnalyticsWindow({ from: "2026-11-28", to: "2026-11-29" }, NOW);
      const invitationSteps = await analytics.invitationFunnelByDay(window);
      const paymentSteps = await paymentFunnel.funnelByDay(window);

      // The suite shares its database, so it asserts its own invitations' contribution to each day instead of a total.
      const draftsOn = (day: string) => invitationSteps.get(day)?.draftsCreated ?? 0;
      const publicationsOn = (day: string) => invitationSteps.get(day)?.firstPublications ?? 0;
      assert.ok(
        draftsOn("2026-11-28") >= 1,
        "the invitation created before zone midnight is a 28th draft",
      );
      assert.ok(
        draftsOn("2026-11-29") >= 1,
        "the invitation created after zone midnight is a 29th draft",
      );
      assert.ok(publicationsOn("2026-11-28") >= 1);
      assert.ok(publicationsOn("2026-11-29") >= 1);

      const approvedOn = (day: string) => paymentSteps.get(day)?.paymentsApproved ?? 0;
      const checkoutsOn = (day: string) => paymentSteps.get(day)?.checkoutsStarted ?? 0;
      // The approval instant is the one that decides the approved day, and the creation instant the checkout day.
      assert.ok(
        approvedOn("2026-11-29") >= 1,
        "the approval after zone midnight is a 29th payment",
      );
      assert.ok(
        checkoutsOn("2026-11-28") >= 1,
        "the checkout before zone midnight is a 28th checkout",
      );
    });

    it("leaves a pending payment out of the approved count", async () => {
      const invitationId = await newInvitation({
        slug: "m9-analytics-pending",
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
      });
      await newPayment({
        invitationId,
        createdAt: new Date("2026-06-02T12:00:00.000Z"),
        paidAt: null,
      });

      // A window outside every other fixture's instants, so this assertion owns the whole map.
      const window = resolveAnalyticsWindow({ from: "2026-06-01", to: "2026-06-03" }, NOW);
      const paymentSteps = await paymentFunnel.funnelByDay(window);

      assert.deepEqual(paymentSteps.get("2026-06-02"), {
        checkoutsStarted: 1,
        paymentsApproved: 0,
      });
      assert.equal(
        paymentSteps.get("2026-06-01"),
        undefined,
        "a day with nothing is absent, not zero",
      );
    });
  });

  describe("the RSVP aggregate", () => {
    it("answers the owner read's own totals for the same responses", async () => {
      const invitationId = await newInvitation({
        slug: "m9-analytics-rsvp",
        createdAt: new Date("2026-11-20T12:00:00.000Z"),
        // The upsert repeats the publication rule in its own statement, so the fixture is a published invitation.
        firstPublishedAt: new Date("2026-11-20T12:00:00.000Z"),
      });
      const at = new Date("2026-11-21T12:00:00.000Z");
      const write = (name: string, dedupeKey: string, attending: boolean, partySize: number) => ({
        name,
        dedupeKey,
        attending,
        partySize,
        phone: null,
        message: null,
      });

      assert.equal(
        await rsvp.upsertResponse(invitationId, write("Ana", `ana|${runId}`, true, 2), at),
        true,
      );
      assert.equal(
        await rsvp.upsertResponse(invitationId, write("Beto", `beto|${runId}`, true, 1), at),
        true,
      );
      assert.equal(
        await rsvp.upsertResponse(invitationId, write("Carla", `carla|${runId}`, false, 0), at),
        true,
      );

      // The owner's own read: the same rows, with the totals the owner's screen shows.
      const owner = await new GetRsvpResponsesUseCase(invitations, rsvp).execute(
        ownerId,
        invitationId,
      );
      assert.ok(owner);
      const window = resolveAnalyticsWindow({ from: "2026-11-20", to: "2026-11-21" }, NOW);
      const detail = await analytics.invitationAnalytics(invitationId, window);

      assert.deepEqual(detail.rsvpTotals, {
        attendingPeople: owner.totals.attendingPeople,
        declined: owner.totals.declinedCount,
        responses: owner.totals.responses,
      });
      assert.deepEqual(detail.rsvpTotals, {
        attendingPeople: 3,
        declined: 1,
        responses: 3,
      });
      // Nothing was counted as a view, and the aggregate still answers zeros instead of a missing value.
      assert.deepEqual(detail.views, { public: 0, guest: 0 });
    });
  });

  describe("the reads", () => {
    it("sums the two links per day and orders the top invitations by total, then slug", async () => {
      const at = new Date("2026-07-10T12:00:00.000Z");
      const first = await newInvitation({
        slug: "m9-analytics-top-a",
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
      });
      const second = await newInvitation({
        slug: "m9-analytics-top-b",
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
      });
      const third = await newInvitation({
        slug: "m9-analytics-top-c",
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
      });
      // Two invitations tie at three openings; the slug decides their order. The third has fewer.
      for (let index = 0; index < 2; index += 1) {
        await views.increment(first, "PUBLIC", at);
        await views.increment(second, "PUBLIC", at);
      }
      await views.increment(first, "GUEST", at);
      await views.increment(second, "GUEST", at);
      await views.increment(third, "PUBLIC", at);

      const window = resolveAnalyticsWindow({ from: "2026-07-10", to: "2026-07-10" }, NOW);
      const byDay = await analytics.viewsByDay(window);
      const top = await analytics.topInvitationViews(window, ANALYTICS_TOP_INVITATIONS_LIMIT);

      const slugs = top.map((row) => row.slug);
      const mine = slugs.filter((slug) => slug.startsWith("m9-analytics-top-"));
      const firstRow = top.find((row) => row.invitationId === first);
      const thirdRow = top.find((row) => row.invitationId === third);

      // `viewsByDay` groups every suite's rows of the day, so the day is present with at least this suite's openings.
      assert.ok((byDay.get("2026-07-10")?.public ?? 0) >= 5);
      assert.ok((byDay.get("2026-07-10")?.guest ?? 0) >= 2);
      assert.deepEqual(firstRow, {
        invitationId: first,
        slug: firstRow?.slug ?? "",
        public: 2,
        guest: 1,
      });
      assert.equal(thirdRow?.public, 1);
      assert.equal(thirdRow?.guest, 0);
      // Ordered by the total of both links descending; the tie between the first two is broken by the slug.
      const firstIndex = slugs.indexOf(firstRow?.slug ?? "");
      const thirdIndex = slugs.indexOf(thirdRow?.slug ?? "");
      assert.ok(firstIndex >= 0 && thirdIndex >= 0);
      assert.ok(firstIndex < thirdIndex, "three openings come before one");
      assert.ok(mine.length >= 3);
      assert.ok(top.length <= ANALYTICS_TOP_INVITATIONS_LIMIT);
    });

    it("applies the three funnel indexes the migration adds", async () => {
      const rows = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
        SELECT "indexname", "indexdef" FROM "pg_indexes"
        WHERE ("tablename" = 'Payment' AND "indexname" IN ('Payment_createdAt_idx', 'Payment_paidAt_idx'))
           OR ("tablename" = 'Invitation' AND "indexname" = 'Invitation_firstPublishedAt_idx')
      `;

      assert.deepEqual(rows.map((row) => row.indexname).sort(), [
        "Invitation_firstPublishedAt_idx",
        "Payment_createdAt_idx",
        "Payment_paidAt_idx",
      ]);
      for (const row of rows) {
        assert.match(row.indexdef, /^CREATE INDEX/);
      }
      // A completed build leaves no INVALID index behind, which is what a plain build inside the migration's
      // transaction guarantees.
      const invalid = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS "count" FROM "pg_index" AS "index"
        JOIN "pg_class" AS "relation" ON "relation"."oid" = "index"."indexrelid"
        WHERE "relation"."relname" IN (
          'Payment_createdAt_idx', 'Payment_paidAt_idx', 'Invitation_firstPublishedAt_idx'
        ) AND NOT "index"."indisvalid"
      `;
      assert.equal(invalid[0]?.count, 0);
    });
  });

  describe("the retention command", () => {
    it("deletes a row of ninety-one days, keeps one of exactly ninety, and a dry run deletes nothing", async () => {
      const invitationId = await newInvitation({
        slug: "m9-analytics-retention",
        createdAt: new Date("2026-11-20T12:00:00.000Z"),
      });
      // 2026-08-29 is ninety-one days before 2026-11-28; 2026-08-30 is exactly ninety; 2026-11-28 is today.
      await views.increment(invitationId, "PUBLIC", new Date("2026-08-29T12:00:00.000Z"));
      await views.increment(invitationId, "PUBLIC", new Date("2026-08-30T12:00:00.000Z"));
      await views.increment(invitationId, "PUBLIC", new Date("2026-11-28T12:00:00.000Z"));
      const purge = new PurgeInvitationViewsUseCase(views, () => NOW);
      // The command deletes everything older than the cutoff, whatever invitation it belongs to, so the suite reads the
      // count of those rows instead of assuming they belong to it: other cases of this same run are still stored.
      const olderThanCutoff = async () => {
        const rows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT count(*)::int AS "count" FROM "InvitationView" WHERE "day" < '2026-08-30'::date
        `);

        return rows[0]?.count ?? 0;
      };
      const before = await olderThanCutoff();
      assert.ok(before >= 1, "this invitation's ninety-one-day row is older than the cutoff");

      assert.deepEqual(await purge.execute({ dryRun: true }), {
        dryRun: true,
        deletedViews: before,
      });
      assert.deepEqual(
        await storedViews(invitationId),
        [
          ["2026-08-29", "PUBLIC", 1],
          ["2026-08-30", "PUBLIC", 1],
          ["2026-11-28", "PUBLIC", 1],
        ],
        "a dry run deletes nothing",
      );
      assert.equal(await olderThanCutoff(), before);

      assert.deepEqual(await purge.execute({ dryRun: false }), {
        dryRun: false,
        deletedViews: before,
      });
      // The exactly-ninety-day row and today's row stay: the delete is `day < cutoff`, so the cutoff day is kept.
      assert.deepEqual(await storedViews(invitationId), [
        ["2026-08-30", "PUBLIC", 1],
        ["2026-11-28", "PUBLIC", 1],
      ]);
      assert.equal(await olderThanCutoff(), 0);

      // Idempotent: the same command on the same day deletes nothing the second time.
      assert.deepEqual(await purge.execute({ dryRun: false }), { dryRun: false, deletedViews: 0 });
      assert.deepEqual(await storedViews(invitationId), [
        ["2026-08-30", "PUBLIC", 1],
        ["2026-11-28", "PUBLIC", 1],
      ]);
    });
  });

  it("declares the analytics repository the module binds", () => {
    // The reads are exercised above; this keeps the port's type in the suite that proves its SQL.
    const repository: AdminAnalyticsRepository = analytics;
    assert.equal(typeof repository.viewsByDay, "function");
  });
});
