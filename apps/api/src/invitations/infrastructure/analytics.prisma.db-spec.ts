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
// the wall clock. Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL.
//
// What this suite deletes: only rows whose invitation carries this run's id, and only for its own fixtures — cleanup
// removes exactly those, `InvitationView` rows before their invitation because the reference is ON DELETE RESTRICT. The
// database is shared with parallel suites, so the suite never deletes anything table-wide: the retention command, whose
// real `DELETE` is by day and ignores the invitation, runs inside a transaction that is rolled back, so it removes
// another suite's row from no committed state. Reads that aggregate across every suite (`viewsByDay`,
// `topInvitationViews`, both funnel reads) are asserted either as this run's own contribution or on a window whose days
// only this run writes, never as a global total of a day another fixture also uses.

/** 2026-11-29 02:00 UTC is 2026-11-28 in Ciudad de México, so retention keeps days from 2026-08-30 on. */
const NOW = new Date("2026-11-29T02:00:00.000Z");
const RENDERER = "birthday-poster-01";

/**
 * What a case throws to roll its transaction back: the retention case runs the real, table-wide purge inside one, so the
 * delete is observed without removing any row a sibling suite or another case of this run stores.
 */
class RolledBackPurge extends Error {}

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

  /**
   * The slug a fixture was stored with, so a case can state the order a read answers instead of assuming the run's own
   * suffix. The slug is the tie-break the top-invitations read orders by (S2).
   */
  async function slugOf(invitationId: string): Promise<string> {
    const row = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitationId },
      select: { slug: true },
    });

    return row.slug;
  }

  /**
   * The stored rows of one invitation, keyed by `YYYY-MM-DD` and source, with the count each one holds. `client` is the
   * transaction a case is observing, so a delete this case rolls back can still be read as it happens.
   */
  async function storedViews(invitationId: string, client: PrismaClient = prisma) {
    const rows = await client.$queryRaw<Array<{ day: string; source: string; count: number }>>(
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
      // A window far from every other fixture of this suite (which uses 2026 and 2032 days), so the map this read
      // answers holds only this run's day: a sibling suite's checkout on another window cannot join it.
      const invitationId = await newInvitation({
        slug: "m9-analytics-pending",
        createdAt: new Date("2031-03-13T13:00:00.000Z"),
      });
      await newPayment({
        invitationId,
        createdAt: new Date("2031-03-14T12:00:00.000Z"), // 2031-03-14 in Ciudad de México.
        paidAt: null,
      });

      const window = resolveAnalyticsWindow({ from: "2031-03-13", to: "2031-03-15" }, NOW);
      const paymentSteps = await paymentFunnel.funnelByDay(window);

      // The whole window, not a share of it: the pending checkout is counted as started and never as approved, and a
      // day with nothing is absent, not zero.
      assert.deepEqual(
        [...paymentSteps],
        [["2031-03-14", { checkoutsStarted: 1, paymentsApproved: 0 }]],
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
        companions: Array.from({ length: partySize - 1 }, () => ({ name: "", child: false })),
        dietaryNotes: null,
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
    it("sums both links per day and orders the top invitations by total, then by slug", async () => {
      // A day no other fixture of this suite or of a sibling suite counts a view on, so both reads answer exactly this
      // run's three invitations and the tie between the first two is decided by the slug alone.
      const at = new Date("2032-05-20T12:00:00.000Z"); // 2032-05-20 in Ciudad de México.
      // Created b before a, the opposite of their slug order: insertion order can never produce the order asserted below.
      const second = await newInvitation({
        slug: "m9-analytics-top-b",
        createdAt: new Date("2032-05-01T12:00:00.000Z"),
      });
      const first = await newInvitation({
        slug: "m9-analytics-top-a",
        createdAt: new Date("2032-05-01T12:00:00.000Z"),
      });
      const third = await newInvitation({
        slug: "m9-analytics-top-c",
        createdAt: new Date("2032-05-01T12:00:00.000Z"),
      });
      // Two invitations tie at three openings; the slug decides their order. The third has fewer.
      for (let index = 0; index < 2; index += 1) {
        await views.increment(first, "PUBLIC", at);
        await views.increment(second, "PUBLIC", at);
      }
      await views.increment(first, "GUEST", at);
      await views.increment(second, "GUEST", at);
      await views.increment(third, "PUBLIC", at);

      const window = resolveAnalyticsWindow({ from: "2032-05-20", to: "2032-05-20" }, NOW);
      const byDay = await analytics.viewsByDay(window);
      const top = await analytics.topInvitationViews(window, ANALYTICS_TOP_INVITATIONS_LIMIT);
      const firstSlug = await slugOf(first);
      const secondSlug = await slugOf(second);
      const thirdSlug = await slugOf(third);

      // The whole day, not a share of it: the two links of each invitation, summed.
      assert.deepEqual([...byDay], [["2032-05-20", { public: 5, guest: 2 }]]);
      // Ordered by the total of both links descending, and the two three-opening rows by slug ascending (S2), which is
      // the opposite order to their insertion.
      assert.ok(firstSlug < secondSlug, "the tied pair's slugs say a before b");
      assert.deepEqual(top, [
        { invitationId: first, slug: firstSlug, public: 2, guest: 1 },
        { invitationId: second, slug: secondSlug, public: 2, guest: 1 },
        { invitationId: third, slug: thirdSlug, public: 1, guest: 0 },
      ]);
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
    it("deletes a row of ninety-one days, keeps one of exactly ninety, and rolls the table-wide run back", async () => {
      const invitationId = await newInvitation({
        slug: "m9-analytics-retention",
        createdAt: new Date("2026-11-20T12:00:00.000Z"),
      });
      // 2026-08-29 is ninety-one days before 2026-11-28; 2026-08-30 is exactly ninety; 2026-11-28 is today.
      await views.increment(invitationId, "PUBLIC", new Date("2026-08-29T12:00:00.000Z"));
      await views.increment(invitationId, "PUBLIC", new Date("2026-08-30T12:00:00.000Z"));
      await views.increment(invitationId, "PUBLIC", new Date("2026-11-28T12:00:00.000Z"));
      // A second invitation stands for a concurrently running run's row: the real command deletes by day, whatever
      // invitation a row belongs to, so this row goes inside the transaction and has to survive its rollback.
      const otherRun = await newInvitation({
        slug: "m9-analytics-retention-other",
        createdAt: new Date("2026-11-20T12:00:00.000Z"),
      });
      await views.increment(otherRun, "PUBLIC", new Date("2026-08-29T12:00:00.000Z"));

      const allThree = [
        ["2026-08-29", "PUBLIC", 1],
        ["2026-08-30", "PUBLIC", 1],
        ["2026-11-28", "PUBLIC", 1],
      ];
      const kept = [
        ["2026-08-30", "PUBLIC", 1],
        ["2026-11-28", "PUBLIC", 1],
      ];
      assert.deepEqual(await storedViews(invitationId), allThree);

      // The command deletes every row older than the cutoff, so the real delete runs inside a transaction this case
      // rolls back: no sibling suite's row and no other case's row can be removed from the shared database, and the
      // count the command reports can still be compared exactly against the table it deleted from.
      await assert.rejects(
        prisma.$transaction(async (transaction) => {
          // The adapter only issues statements, so the transaction client stands in for the pooled one.
          const inTransaction = transaction as unknown as PrismaClient;
          const purge = new PurgeInvitationViewsUseCase(
            new PrismaInvitationViewRepository(inTransaction),
            () => NOW,
          );
          /** Every suite's rows older than the cutoff, read in the transaction that is about to delete them. */
          const olderThanCutoff = async () => {
            const rows = await inTransaction.$queryRaw<Array<{ count: number }>>(Prisma.sql`
              SELECT count(*)::int AS "count" FROM "InvitationView" WHERE "day" < '2026-08-30'::date
            `);

            return rows[0]?.count ?? 0;
          };

          const before = await olderThanCutoff();
          assert.ok(before >= 2, "both ninety-one-day rows are older than the cutoff");

          assert.deepEqual(await purge.execute({ dryRun: true }), {
            dryRun: true,
            deletedViews: before,
          });
          assert.deepEqual(
            await storedViews(invitationId, inTransaction),
            allThree,
            "a dry run deletes nothing",
          );
          assert.equal(await olderThanCutoff(), before);

          assert.deepEqual(await purge.execute({ dryRun: false }), {
            dryRun: false,
            deletedViews: before,
          });
          // The exactly-ninety-day row and today's row stay: the delete is `day < cutoff`, so the cutoff day is kept.
          assert.deepEqual(await storedViews(invitationId, inTransaction), kept);
          // The delete is by day, not by invitation: the other run's row went with this run's older one.
          assert.deepEqual(await storedViews(otherRun, inTransaction), []);
          assert.equal(await olderThanCutoff(), 0);

          // Idempotent: the same command on the same day deletes nothing the second time, not even this run's rows.
          assert.deepEqual(await purge.execute({ dryRun: false }), {
            dryRun: false,
            deletedViews: 0,
          });
          assert.deepEqual(await storedViews(invitationId, inTransaction), kept);

          throw new RolledBackPurge();
        }),
        RolledBackPurge,
      );

      // Rolled back: the table holds exactly what this case seeded, so it proved the table-wide command without
      // deleting a row of any other suite — nor of this run's own other cases.
      assert.deepEqual(await storedViews(invitationId), allThree);
      assert.deepEqual(await storedViews(otherRun), [["2026-08-29", "PUBLIC", 1]]);
    });
  });

  it("declares the analytics repository the module binds", () => {
    // The reads are exercised above; this keeps the port's type in the suite that proves its SQL.
    const repository: AdminAnalyticsRepository = analytics;
    assert.equal(typeof repository.viewsByDay, "function");
  });
});
