import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InvalidAnalyticsWindowError } from "../domain/analytics-window";
import type { AdminInvitationRow } from "./admin-invitation.repository";
import { GetAdminInvitationUseCase } from "./admin-invitation.use-cases";
import type {
  AdminAnalyticsRepository,
  AdminInvitationAnalytics,
  InvitationFunnelDay,
  PaymentFunnelDay,
  TopInvitationView,
} from "./admin-analytics";
import {
  ANALYTICS_TOP_INVITATIONS_LIMIT,
  INVITATION_FUNNEL_PAYMENT_READER,
} from "./admin-analytics";
import type { InvitationFunnelPaymentReader } from "./admin-analytics";
import {
  GetAdminFunnelAnalyticsUseCase,
  GetAdminViewsAnalyticsUseCase,
} from "./admin-analytics.use-cases";

// The administrator's analytics reads (M9 T11; S2, S3, S7). The ports are in-memory fakes, so this suite owns the
// contract: the window the request asked for (defaulted, bounded, and refused the same way everywhere), every day of
// the window answered in ascending order with zeros where nothing happened, the top invitation list bounded to 20, and
// the funnel merging the invitation steps with the payment steps the payments module reports through its port. The
// invitation detail's analytics facet is asserted through the real `GetAdminInvitationUseCase.execute`, so this suite
// never calls a port its production caller does not call.

/** The clock every case judges at: 2026-11-28 in Ciudad de México (06:00 UTC is that zone's midnight). */
const NOW = new Date("2026-11-29T02:00:00.000Z");

class FakeAnalyticsRepository implements AdminAnalyticsRepository {
  readonly views = new Map<string, { public: number; guest: number }>();
  readonly funnel = new Map<string, InvitationFunnelDay>();
  readonly top: TopInvitationView[] = [];
  readonly windows: Array<{ from: string; to: string }> = [];
  readonly limits: number[] = [];
  readonly detailWindows: Array<{ invitationId: string; from: string; to: string }> = [];
  detail: AdminInvitationAnalytics = {
    views: { public: 0, guest: 0 },
    rsvpTotals: { attendingPeople: 0, declined: 0, responses: 0 },
  };

  async viewsByDay(window: { from: string; to: string }) {
    this.windows.push({ from: window.from, to: window.to });
    return new Map(this.views);
  }

  async topInvitationViews(window: { from: string; to: string }, limit: number) {
    this.windows.push({ from: window.from, to: window.to });
    this.limits.push(limit);
    return this.top;
  }

  async invitationFunnelByDay(window: { from: string; to: string }) {
    this.windows.push({ from: window.from, to: window.to });
    return new Map(this.funnel);
  }

  async invitationAnalytics(invitationId: string, window: { from: string; to: string }) {
    this.detailWindows.push({ invitationId, from: window.from, to: window.to });
    return this.detail;
  }
}

class FakePaymentFunnelReader implements InvitationFunnelPaymentReader {
  readonly days = new Map<string, PaymentFunnelDay>();
  readonly windows: Array<{ from: string; to: string }> = [];

  async funnelByDay(window: { from: string; to: string }) {
    this.windows.push({ from: window.from, to: window.to });
    return new Map(this.days);
  }
}

function harness() {
  const analytics = new FakeAnalyticsRepository();
  const payments = new FakePaymentFunnelReader();

  return {
    analytics,
    payments,
    views: new GetAdminViewsAnalyticsUseCase(analytics, () => NOW),
    funnel: new GetAdminFunnelAnalyticsUseCase(analytics, payments, () => NOW),
  };
}

describe("administrator analytics use cases (M9 T11; S2, S3, S7)", () => {
  describe("GET /admin/analytics/views", () => {
    it("answers every day of the window, ascending, with zeros where no view was counted", async () => {
      const { analytics, views } = harness();
      analytics.views.set("2026-11-27", { public: 3, guest: 1 });
      analytics.views.set("2026-11-28", { public: 2, guest: 0 });

      const answer = await views.execute({ from: "2026-11-26", to: "2026-11-28" });

      assert.deepEqual(answer.days, [
        { day: "2026-11-26", public: 0, guest: 0 },
        { day: "2026-11-27", public: 3, guest: 1 },
        { day: "2026-11-28", public: 2, guest: 0 },
      ]);
      // One read per source: the daily totals and the top list, never one read per day.
      assert.deepEqual(analytics.windows, [
        { from: "2026-11-26", to: "2026-11-28" },
        { from: "2026-11-26", to: "2026-11-28" },
      ]);
    });

    it("defaults to the last thirty days ending today in Ciudad de México", async () => {
      const { analytics, views } = harness();

      const answer = await views.execute({ from: null, to: null });

      assert.equal(answer.days.length, 30);
      assert.equal(answer.days.at(0)?.day, "2026-10-30");
      assert.equal(answer.days.at(-1)?.day, "2026-11-28");
      assert.deepEqual(analytics.windows, [
        { from: "2026-10-30", to: "2026-11-28" },
        { from: "2026-10-30", to: "2026-11-28" },
      ]);
    });

    it("answers the top invitations as the port ordered them and asks for at most twenty", async () => {
      const { analytics, views } = harness();
      analytics.top.push(
        {
          invitationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          slug: "boda-ana",
          public: 9,
          guest: 4,
        },
        {
          invitationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          slug: "xv-sofia",
          public: 5,
          guest: 0,
        },
      );

      const answer = await views.execute({ from: "2026-11-01", to: "2026-11-28" });

      assert.deepEqual(answer.topInvitations, analytics.top);
      assert.deepEqual(analytics.limits, [ANALYTICS_TOP_INVITATIONS_LIMIT]);
      assert.equal(ANALYTICS_TOP_INVITATIONS_LIMIT, 20);
    });

    it("never answers more than twenty invitations, even if a port returns more", async () => {
      const { analytics, views } = harness();
      for (let index = 1; index <= ANALYTICS_TOP_INVITATIONS_LIMIT + 5; index += 1) {
        analytics.top.push({
          invitationId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          slug: `invitacion-${index}`,
          public: index,
          guest: 0,
        });
      }

      const answer = await views.execute({ from: "2026-11-01", to: "2026-11-28" });

      assert.equal(answer.topInvitations.length, ANALYTICS_TOP_INVITATIONS_LIMIT);
      assert.equal(answer.topInvitations.at(0)?.slug, "invitacion-1");
    });

    it("refuses a malformed, reversed, or over-wide window before reading any port", async () => {
      const { analytics, views } = harness();

      for (const query of [
        { from: "2026-11-29", to: "2026-11-28" },
        { from: "2026-08-30", to: "2026-11-28" },
        { from: "2026-02-30", to: null },
      ]) {
        await assert.rejects(
          views.execute(query),
          InvalidAnalyticsWindowError,
          JSON.stringify(query),
        );
      }
      assert.deepEqual(analytics.windows, []);
    });
  });

  describe("GET /admin/analytics/funnel", () => {
    it("answers the four funnel steps of every day, ascending, with zeros where nothing happened", async () => {
      const { analytics, payments, funnel } = harness();
      analytics.funnel.set("2026-11-27", { draftsCreated: 4, firstPublications: 2 });
      payments.days.set("2026-11-27", { checkoutsStarted: 3, paymentsApproved: 1 });

      const answer = await funnel.execute({ from: "2026-11-26", to: "2026-11-28" });

      assert.deepEqual(answer.days, [
        {
          day: "2026-11-26",
          draftsCreated: 0,
          checkoutsStarted: 0,
          paymentsApproved: 0,
          firstPublications: 0,
        },
        {
          day: "2026-11-27",
          draftsCreated: 4,
          checkoutsStarted: 3,
          paymentsApproved: 1,
          firstPublications: 2,
        },
        {
          day: "2026-11-28",
          draftsCreated: 0,
          checkoutsStarted: 0,
          paymentsApproved: 0,
          firstPublications: 0,
        },
      ]);
      // One read per source for the whole window, never one per day.
      assert.deepEqual(analytics.windows, [{ from: "2026-11-26", to: "2026-11-28" }]);
      assert.deepEqual(payments.windows, [{ from: "2026-11-26", to: "2026-11-28" }]);
    });

    it("reads the invitation steps and the payment steps for the same window and refuses a bad window first", async () => {
      const { analytics, payments, funnel } = harness();

      await funnel.execute({ from: "2026-10-30", to: null });
      await assert.rejects(
        funnel.execute({ from: "2026-11-29", to: "2026-11-28" }),
        InvalidAnalyticsWindowError,
      );

      assert.deepEqual(analytics.windows, [{ from: "2026-10-30", to: "2026-11-28" }]);
      assert.deepEqual(payments.windows, [{ from: "2026-10-30", to: "2026-11-28" }]);
    });
  });

  describe("the invitation detail analytics", () => {
    it("carries one invitation's views and RSVP totals through the detail use case, over the retained window", async () => {
      const { analytics } = harness();
      const invitationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const row: AdminInvitationRow = {
        invitationId,
        ownerId: "11111111-1111-4111-8111-111111111111",
        packageId: "22222222-2222-4222-8222-222222222222",
        templateVersionId: "33333333-3333-4333-8333-333333333333",
        slug: "boda-ana",
        status: "PUBLISHED",
        createdAt: new Date("2026-11-01T12:00:00.000Z"),
        publishedAt: new Date("2026-11-02T12:00:00.000Z"),
        firstPublishedAt: new Date("2026-11-02T12:00:00.000Z"),
        archivedAt: null,
        refundRequestedAt: null,
      };
      analytics.detail = {
        views: { public: 12, guest: 3 },
        rsvpTotals: { attendingPeople: 7, declined: 2, responses: 4 },
      };
      // The facet this suite owns is the analytics repository; the detail's other facets are proved in
      // `admin-invitation.use-cases.spec.ts`, so these fakes answer the minimum that use case needs to answer.
      const detail = new GetAdminInvitationUseCase(
        {
          listForAdmin: async () => [],
          findForAdmin: async (id: string) => (id === invitationId ? row : null),
          unpublishForAdmin: async () => null,
        },
        { latestFor: async () => new Map(), listForInvitation: async () => [] },
        { countsFor: async () => new Map() },
        { emailsFor: async () => new Map() },
        { statusesFor: async () => new Map() },
        analytics,
        () => NOW,
      );

      const answer = await detail.execute(invitationId);

      assert.deepEqual(answer?.analytics, {
        views: { public: 12, guest: 3 },
        rsvpTotals: { attendingPeople: 7, declined: 2, responses: 4 },
      });
      // The retained window (S2): ninety days ending today in Ciudad de México, read once for this invitation.
      assert.deepEqual(analytics.detailWindows, [
        { invitationId, from: "2026-08-30", to: "2026-11-28" },
      ]);
    });
  });

  it("names the payment funnel port the invitations module declares", () => {
    assert.equal(typeof INVITATION_FUNNEL_PAYMENT_READER, "symbol");
  });
});
