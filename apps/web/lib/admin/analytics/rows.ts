import {
  type AnalyticsFunnelDay,
  type AnalyticsTopInvitation,
  type AnalyticsViewsDay,
  isAnalyticsDay,
} from "../../server/admin-analytics-client.ts";
import type {
  AdminInvitationRsvpTotals,
  AdminInvitationViews,
} from "../../server/admin-invitations-client.ts";
import { invitationDetailPath } from "../invitations/copy.ts";
import { INVITATION_ANALYTICS_COPY } from "./copy.ts";

/**
 * What `/admin/analitica` and the aperturas card of one invitation render (M9 T12; S2, S7): the days the API answered
 * with their numbers formatted for reading, the totals of the whole window, and the top invitations linked to their
 * detail. Every number here is a count of aperturas, never of people: the API identifies no visitor, so the copy has no
 * word for one (S7, L12).
 */

const COUNTS = new Intl.NumberFormat("es-MX");

/** A count as the tables read it: `1,234`. */
export function formatAnalyticsCount(value: number): string {
  return COUNTS.format(value);
}

const DAY = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeZone: "UTC" });

/**
 * A stored API day as `10 nov 2026`; empty when it is not a real day, so no table shows a rolled-over date as if it were
 * the day the API answered (`Date.parse` alone turns `2026-02-30` into March).
 */
export function formatAnalyticsDay(day: string): string {
  if (!isAnalyticsDay(day)) {
    return "";
  }

  return DAY.format(Date.parse(`${day}T00:00:00Z`));
}

/** The days of a window in the order the table reads them: oldest first, whatever order the API answered. */
function oldestFirst<T extends { readonly day: string }>(days: readonly T[]): T[] {
  return [...days].sort((left, right) =>
    left.day < right.day ? -1 : left.day > right.day ? 1 : 0,
  );
}

/** The totals of one window of aperturas: the two link kinds together and separately (S7). */
export interface AnalyticsViewsTotals {
  readonly public: number;
  readonly guest: number;
  readonly total: number;
}

/** One row of the daily aperturas table, every number already formatted. */
export interface AnalyticsViewsDayRow {
  /** The API's own day, so the row keeps its machine-readable value. */
  readonly day: string;
  readonly label: string;
  readonly public: string;
  readonly guest: string;
  readonly total: string;
}

/** The totals of the window, counted from the days the API answered. */
export function viewsTotals(days: readonly AnalyticsViewsDay[]): AnalyticsViewsTotals {
  let publicViews = 0;
  let guestViews = 0;

  for (const day of days) {
    publicViews += day.public;
    guestViews += day.guest;
  }

  return { public: publicViews, guest: guestViews, total: publicViews + guestViews };
}

/** One row per day of aperturas, oldest first; the totals row is `viewsTotals` of the same days. */
export function viewsDayRows(days: readonly AnalyticsViewsDay[]): readonly AnalyticsViewsDayRow[] {
  return oldestFirst(days).map((day) => ({
    day: day.day,
    label: formatAnalyticsDay(day.day),
    public: formatAnalyticsCount(day.public),
    guest: formatAnalyticsCount(day.guest),
    total: formatAnalyticsCount(day.public + day.guest),
  }));
}

/** One row of the top invitations table, its slug linked to the invitation's status page. */
export interface AnalyticsTopInvitationRow {
  readonly invitationId: string;
  readonly href: string;
  readonly slug: string;
  readonly public: string;
  readonly guest: string;
  readonly total: string;
}

/** The bounded top invitations, in the order the API answered them (most aperturas first). */
export function topInvitationRows(
  items: readonly AnalyticsTopInvitation[],
): readonly AnalyticsTopInvitationRow[] {
  return items.map((item) => ({
    invitationId: item.invitationId,
    href: invitationDetailPath(item.invitationId),
    slug: item.slug,
    public: formatAnalyticsCount(item.public),
    guest: formatAnalyticsCount(item.guest),
    total: formatAnalyticsCount(item.public + item.guest),
  }));
}

/** The totals of every step of the funnel over one window. */
export interface AnalyticsFunnelTotals {
  readonly draftsCreated: number;
  readonly checkoutsStarted: number;
  readonly paymentsApproved: number;
  readonly firstPublications: number;
}

/** One row of the daily funnel table, every number already formatted. */
export interface AnalyticsFunnelDayRow {
  readonly day: string;
  readonly label: string;
  readonly draftsCreated: string;
  readonly checkoutsStarted: string;
  readonly paymentsApproved: string;
  readonly firstPublications: string;
}

/** The totals of the window, counted from the days the API answered. */
export function funnelTotals(days: readonly AnalyticsFunnelDay[]): AnalyticsFunnelTotals {
  const totals = {
    draftsCreated: 0,
    checkoutsStarted: 0,
    paymentsApproved: 0,
    firstPublications: 0,
  };

  for (const day of days) {
    totals.draftsCreated += day.draftsCreated;
    totals.checkoutsStarted += day.checkoutsStarted;
    totals.paymentsApproved += day.paymentsApproved;
    totals.firstPublications += day.firstPublications;
  }

  return totals;
}

/** One row per day of the funnel, oldest first; the totals row is `funnelTotals` of the same days. */
export function funnelDayRows(
  days: readonly AnalyticsFunnelDay[],
): readonly AnalyticsFunnelDayRow[] {
  return oldestFirst(days).map((day) => ({
    day: day.day,
    label: formatAnalyticsDay(day.day),
    draftsCreated: formatAnalyticsCount(day.draftsCreated),
    checkoutsStarted: formatAnalyticsCount(day.checkoutsStarted),
    paymentsApproved: formatAnalyticsCount(day.paymentsApproved),
    firstPublications: formatAnalyticsCount(day.firstPublications),
  }));
}

/** One labelled count of a card, already formatted. */
export interface AnalyticsCountRow {
  readonly label: string;
  readonly value: string;
}

/** The aperturas and RSVP totals of one invitation, as the detail card states them. */
export interface InvitationActivityView {
  readonly views: readonly AnalyticsCountRow[];
  readonly rsvp: readonly AnalyticsCountRow[];
}

/** The aperturas of the last 90 days (S3) and the RSVP totals the API answered for one invitation. */
export function invitationActivityView(
  views: AdminInvitationViews,
  rsvpTotals: AdminInvitationRsvpTotals,
): InvitationActivityView {
  const copy = INVITATION_ANALYTICS_COPY;

  return {
    views: [
      { label: copy.publicLabel, value: formatAnalyticsCount(views.public) },
      { label: copy.guestLabel, value: formatAnalyticsCount(views.guest) },
    ],
    rsvp: [
      { label: copy.attendingLabel, value: formatAnalyticsCount(rsvpTotals.attendingPeople) },
      { label: copy.declinedLabel, value: formatAnalyticsCount(rsvpTotals.declined) },
      { label: copy.responsesLabel, value: formatAnalyticsCount(rsvpTotals.responses) },
    ],
  };
}
