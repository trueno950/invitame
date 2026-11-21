import type { AnalyticsDay, AnalyticsWindow } from "../domain/analytics-window";

// The administrator's analytics reads (M9 T11; S2, S3, S7, L12). The invitations module owns the routes and therefore
// declares these ports; the adapters that run the SQL live in this module's infrastructure, except the payment steps,
// which the payments module implements exactly like `INVITATION_PAYMENT_READER` — so no module reads another module's
// tables.
//
// Every read is a bounded aggregate over one window of calendar days in `America/Mexico_City`. A day with nothing
// counted is absent from the map an adapter answers; the use cases fill the zeros, so the REST shape always carries
// every day of the window.

/** How many invitations the views read names at most (S2). Ordered by total views descending, then slug. */
export const ANALYTICS_TOP_INVITATIONS_LIMIT = 20;

/** One day of the views read: the public link and the guest links counted separately (S7). */
export interface ViewsByDay {
  public: number;
  guest: number;
}

/** One row of the top-invitations list: the invitation's own views inside the window. */
export interface TopInvitationView {
  invitationId: string;
  slug: string;
  public: number;
  guest: number;
}

/** The two invitation-side funnel steps of one day: drafts created and first publications (S2). */
export interface InvitationFunnelDay {
  draftsCreated: number;
  firstPublications: number;
}

/** The two payment-side funnel steps of one day: checkouts started and approved payments (S2). */
export interface PaymentFunnelDay {
  checkoutsStarted: number;
  paymentsApproved: number;
}

/** What the invitation detail adds: the retained views and the RSVP totals of one invitation (S2). */
export interface AdminInvitationAnalytics {
  /** The sum of the retained window (the last 90 days), public and guest links separately. */
  views: ViewsByDay;
  /**
   * The owner read's own semantics (`rsvpTotalsOf`): attending people is the sum of the attending party sizes,
   * declined counts the declining responses, and responses counts every row.
   */
  rsvpTotals: {
    attendingPeople: number;
    declined: number;
    responses: number;
  };
}

/** The instant an analytics request is resolved at; injectable so a suite never depends on the wall clock. */
export type AnalyticsClock = () => Date;

/** The views of the administrator's analytics, read from the invitations module's own `InvitationView` table. */
export interface AdminAnalyticsRepository {
  /** The counted views of every day the table has inside the window, keyed by day; an empty map when it has none. */
  viewsByDay(window: AnalyticsWindow): Promise<Map<AnalyticsDay, ViewsByDay>>;

  /**
   * The most-viewed invitations inside the window, at most `limit` rows, ordered by the total of public and guest
   * views descending and then by slug ascending, so equal totals always answer in the same order.
   */
  topInvitationViews(window: AnalyticsWindow, limit: number): Promise<TopInvitationView[]>;

  /** The two invitation-side funnel steps of every day inside the window, keyed by day. */
  invitationFunnelByDay(window: AnalyticsWindow): Promise<Map<AnalyticsDay, InvitationFunnelDay>>;

  /** The retained views and the RSVP totals of one invitation, in one query. */
  invitationAnalytics(
    invitationId: string,
    window: AnalyticsWindow,
  ): Promise<AdminInvitationAnalytics>;
}

export const ADMIN_ANALYTICS_REPOSITORY = Symbol("AdminAnalyticsRepository");

/**
 * The payment steps of the funnel, declared by this module and implemented by the payments module (S2): one batched
 * read for the whole window, never one query per day, exactly like the newest-payment port the status view uses.
 */
export interface InvitationFunnelPaymentReader {
  /** The payment steps of every day inside the window, keyed by day; an empty map when no payment falls in it. */
  funnelByDay(window: AnalyticsWindow): Promise<Map<AnalyticsDay, PaymentFunnelDay>>;
}

export const INVITATION_FUNNEL_PAYMENT_READER = Symbol("InvitationFunnelPaymentReader");
