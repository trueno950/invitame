import { type AnalyticsWindow, resolveAnalyticsWindow } from "../domain/analytics-window";
import {
  type AdminAnalyticsRepository,
  type AnalyticsClock,
  ANALYTICS_TOP_INVITATIONS_LIMIT,
  type InvitationFunnelPaymentReader,
  type TopInvitationView,
} from "./admin-analytics";

// The administrator's analytics (M9 T11; S2, S3, S7, L12): views per invitation and the purchase funnel, read on
// demand and bounded to a window of calendar days in `America/Mexico_City`. Only views need a table; the funnel is
// computed from the columns the invitation and payment rows already carry, so no aggregate is stored and no second
// writer can drift from the truth.
//
// Each use case resolves the window first, so a malformed, reversed, or over-wide request costs no query; then it asks
// every source once for the whole window and fills the days with nothing counted, so the REST shape carries exactly
// the window the caller asked for, ascending and complete — a chart drawn from it never has a gap to guess.

/** The views read: every day of the window and the most-viewed invitations inside it (S2). */
export interface AdminViewsAnalytics {
  days: Array<{ day: string; public: number; guest: number }>;
  topInvitations: TopInvitationView[];
}

/** The funnel read: every day of the window with its four steps (S2). */
export interface AdminFunnelAnalytics {
  days: Array<{
    day: string;
    draftsCreated: number;
    checkoutsStarted: number;
    paymentsApproved: number;
    firstPublications: number;
  }>;
}

/** One request's window, as the query string carried it: both bounds optional, both untrusted. */
export interface AdminAnalyticsQuery {
  from: string | null;
  to: string | null;
}

/**
 * `GET /admin/analytics/views`: the daily openings of the public link and of the guest links, counted separately and
 * together (S7), plus the invitations with the most openings inside the same window. A day with no opening answers a
 * zero, so the table always shows the whole window.
 */
export class GetAdminViewsAnalyticsUseCase {
  constructor(
    private readonly analytics: AdminAnalyticsRepository,
    private readonly now: AnalyticsClock = () => new Date(),
  ) {}

  async execute(query: AdminAnalyticsQuery): Promise<AdminViewsAnalytics> {
    const window = resolveAnalyticsWindow(query, this.now());
    const [byDay, topInvitations] = await Promise.all([
      this.analytics.viewsByDay(window),
      this.analytics.topInvitationViews(window, ANALYTICS_TOP_INVITATIONS_LIMIT),
    ]);

    return {
      days: window.days.map((day) => ({
        day,
        public: byDay.get(day)?.public ?? 0,
        guest: byDay.get(day)?.guest ?? 0,
      })),
      // The port is asked for the bound and the answer is bounded again here, so a wider adapter can never widen the
      // contract the web page parses.
      topInvitations: topInvitations.slice(0, ANALYTICS_TOP_INVITATIONS_LIMIT),
    };
  }
}

/**
 * `GET /admin/analytics/funnel`: drafts created, checkouts started, approved payments, and first publications of every
 * day of the window (S2). The invitation steps come from this module's own table and the payment steps from the
 * payments module through its port; both are read once for the whole window.
 */
export class GetAdminFunnelAnalyticsUseCase {
  constructor(
    private readonly analytics: AdminAnalyticsRepository,
    private readonly payments: InvitationFunnelPaymentReader,
    private readonly now: AnalyticsClock = () => new Date(),
  ) {}

  async execute(query: AdminAnalyticsQuery): Promise<AdminFunnelAnalytics> {
    const window: AnalyticsWindow = resolveAnalyticsWindow(query, this.now());
    const [invitations, payments] = await Promise.all([
      this.analytics.invitationFunnelByDay(window),
      this.payments.funnelByDay(window),
    ]);

    return {
      days: window.days.map((day) => ({
        day,
        draftsCreated: invitations.get(day)?.draftsCreated ?? 0,
        checkoutsStarted: payments.get(day)?.checkoutsStarted ?? 0,
        paymentsApproved: payments.get(day)?.paymentsApproved ?? 0,
        firstPublications: invitations.get(day)?.firstPublications ?? 0,
      })),
    };
  }
}
