// The calendar rules of the administrator's analytics (M9 T11; S2, S3, S7, L12). The owner chose «Ciudad de México» as
// the day cut, a default window of thirty days, at most ninety days per request, and ninety days of retention, so this
// module owns those numbers and the one definition of a "day" the API reads and writes.
//
// A day is a plain `YYYY-MM-DD` string in `America/Mexico_City`, never an instant: the funnel, the views, and the
// retention command all compare calendar days, and a string compares and serializes without a time zone of its own.
// Mexico abolished daylight saving time in 2022, so the zone is UTC-6 all year; every conversion here still goes
// through the platform's own zone database, so a historical instant cannot be read with a hand-written offset.

/** The zone every analytics day is cut in (S7, L12: «Ciudad de México»). */
export const ANALYTICS_TIME_ZONE = "America/Mexico_City";

/**
 * The window a request that names neither bound reads while no administrator has changed the panel: the last thirty
 * days ending today (S2). The live value is the settings row's `analyticsDefaultWindowDays`, read through
 * `OPERATIONAL_SETTINGS_READER` when a read runs (M9 T13; S5, S8); the ninety-day maximum and the ninety-day retention
 * stay fixed, because they are the product's bound and not a preference.
 */
export const ANALYTICS_DEFAULT_WINDOW_DAYS = 30;

/** The widest window one request may read: ninety days (S2, S3). A wider one is a malformed request. */
export const ANALYTICS_MAX_WINDOW_DAYS = 90;

/** How many days of views are kept: ninety (S3). Older rows are deleted by the retention command. */
export const ANALYTICS_RETENTION_DAYS = 90;

/** One calendar day in `America/Mexico_City`, written `YYYY-MM-DD`. */
export type AnalyticsDay = string;

/** A resolved window: both bounds and every day between them, ascending and both ends included. */
export interface AnalyticsWindow {
  from: AnalyticsDay;
  to: AnalyticsDay;
  days: AnalyticsDay[];
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * A window the request asked for cannot be read: a day that is not a real calendar day, a reversed window, or a window
 * wider than `ANALYTICS_MAX_WINDOW_DAYS`. Presentation answers it as a 400, before any query.
 */
export class InvalidAnalyticsWindowError extends Error {
  constructor(readonly reason: "day" | "order" | "width") {
    super("The analytics window is malformed.");
    this.name = "InvalidAnalyticsWindowError";
  }
}

/** The UTC midnight of a day, which is how this module does day arithmetic without a zone of its own. */
function dayEpoch(day: AnalyticsDay): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/**
 * Whether a value is a real calendar day written `YYYY-MM-DD`. A day that does not exist — `2026-02-29`, `2026-04-31`,
 * month 13 — is refused here, so no invalid date ever reaches a `::date` cast.
 */
export function isAnalyticsDay(value: unknown): value is AnalyticsDay {
  if (typeof value !== "string") {
    return false;
  }
  const match = DAY_PATTERN.exec(value);
  if (match === null) {
    return false;
  }
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const instant = new Date(Date.UTC(year, month - 1, day));

  // The calendar answers the same fields only for a day that exists; `Date.UTC` rolls an impossible one forward.
  return (
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day
  );
}

/**
 * The calendar day an instant falls on in the analytics zone. The formatter is asked for the zone's own date parts, so
 * the host's zone never takes part in the answer.
 */
export function analyticsDayOf(
  instant: Date,
  timeZone: string = ANALYTICS_TIME_ZONE,
): AnalyticsDay {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: "year" | "month" | "day"): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Today's calendar day in the analytics zone, which is the default window's upper bound (S2). */
export function todayInAnalyticsZone(
  now: Date,
  timeZone: string = ANALYTICS_TIME_ZONE,
): AnalyticsDay {
  return analyticsDayOf(now, timeZone);
}

/** A day moved by whole calendar days, which is safe because every day is handled at UTC midnight. */
export function addAnalyticsDays(day: AnalyticsDay, delta: number): AnalyticsDay {
  return new Date(dayEpoch(day) + delta * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
}

/** Every day of a window, ascending and both ends included; an empty list for a reversed window. */
export function analyticsDaysBetween(from: AnalyticsDay, to: AnalyticsDay): AnalyticsDay[] {
  const days: AnalyticsDay[] = [];
  for (let day = from; day <= to; day = addAnalyticsDays(day, 1)) {
    days.push(day);
  }

  return days;
}

/** The last day retention keeps: a row of this day is `ANALYTICS_RETENTION_DAYS` old and stays (S3). */
export function retentionCutoffDay(
  today: AnalyticsDay,
  retentionDays: number = ANALYTICS_RETENTION_DAYS,
): AnalyticsDay {
  return addAnalyticsDays(today, -retentionDays);
}

/**
 * The window the invitation detail sums (S2): the retained days, so the reader sums exactly what retention keeps — the
 * last ninety days and today, both ends included — and never a day the nightly command has already deleted.
 */
export function retainedAnalyticsWindow(
  now: Date,
  retentionDays: number = ANALYTICS_RETENTION_DAYS,
): AnalyticsWindow {
  const to = todayInAnalyticsZone(now);
  const from = retentionCutoffDay(to, retentionDays);

  return { from, to, days: analyticsDaysBetween(from, to) };
}

/**
 * The window a request reads, or `InvalidAnalyticsWindowError`. A missing `to` is today in the analytics zone and a
 * missing `from` is `defaultWindowDays` ending at `to`, so a request that names neither reads the configured default
 * window (S2, S5) — thirty days unless an administrator saved another one. The bounds are inclusive, the window may not
 * be reversed, and it may hold at most `ANALYTICS_MAX_WINDOW_DAYS` days; anything else is a 400.
 */
export function resolveAnalyticsWindow(
  query: { from: string | null; to: string | null },
  now: Date,
  defaultWindowDays: number = ANALYTICS_DEFAULT_WINDOW_DAYS,
): AnalyticsWindow {
  const to = query.to ?? todayInAnalyticsZone(now);
  if (!isAnalyticsDay(to)) {
    throw new InvalidAnalyticsWindowError("day");
  }

  const from = query.from ?? addAnalyticsDays(to, -(defaultWindowDays - 1));
  if (!isAnalyticsDay(from)) {
    throw new InvalidAnalyticsWindowError("day");
  }
  if (from > to) {
    throw new InvalidAnalyticsWindowError("order");
  }

  const days = analyticsDaysBetween(from, to);
  if (days.length > ANALYTICS_MAX_WINDOW_DAYS) {
    throw new InvalidAnalyticsWindowError("width");
  }

  return { from, to, days };
}
