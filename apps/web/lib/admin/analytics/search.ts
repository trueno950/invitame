import {
  ANALYTICS_DEFAULT_WINDOW_DAYS,
  isAnalyticsDay,
  isAnalyticsWindow,
  shiftAnalyticsDay,
} from "../../server/admin-analytics-client.ts";

/**
 * The period of `/admin/analitica` (M9 T12; S2, S3, S7). The page validates its own query before anything reaches the
 * API: `desde` and `hasta` are real calendar days, in order, and at most 90 days apart. Anything else — a missing half,
 * a repeated parameter, an impossible date, a window of 91 days — falls back to the default window of the last 30 days,
 * and only the fallback is ever sent, so a forged or mistyped query can never make the API answer 400.
 *
 * The window is made of calendar days in `America/Mexico_City`, because that is the day the API cuts its rows in (S7,
 * L12): «today» is today in Mexico City, not in UTC, so the default window never slides by a day in the evening.
 */

/** The query of a page as Next.js hands it to a server component. */
type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

/** The window the page is showing, and whether its query named it or it is the fallback. */
export interface AnalyticsPeriod {
  readonly from: string;
  readonly to: string;
  /** Whether the query named no usable window, so the page shows the default one. */
  readonly isDefault: boolean;
}

/** The local day in `America/Mexico_City`, always `YYYY-MM-DD`, whatever the host's own time zone is. */
const MEXICO_CITY_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar day `now` falls on in Mexico City, as the API names a day. */
export function mexicoCityDay(now: Date): string {
  const parts = MEXICO_CITY_DAY.formatToParts(now);
  const value = (type: "day" | "month" | "year"): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * The window the API serves when a caller names none: the last 30 days, ending on today in Mexico City. The first day
 * is part of the window, so the span is exactly the API's default.
 */
export function defaultAnalyticsPeriod(now: Date): AnalyticsPeriod {
  const to = mexicoCityDay(now);
  const from = shiftAnalyticsDay(to, -(ANALYTICS_DEFAULT_WINDOW_DAYS - 1));

  // A day the host clock cannot produce has no default window; the two ends then name the same day, which the API serves.
  return { from: from ?? to, to, isDefault: true };
}

/**
 * The one value of a query parameter, or none: Next.js answers a repeated parameter as an array, and a repeated day is
 * not a period the page offered.
 */
function single(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return Array.isArray(value) && value.length === 1 ? value[0] : undefined;
}

/** The period the page shows: the query's own window when it is one the API serves, and the default window otherwise. */
export function parseAnalyticsPeriod(
  parameters: SearchParameters,
  now: Date = new Date(),
): AnalyticsPeriod {
  const from = single(parameters.desde);
  const to = single(parameters.hasta);

  if (
    from === undefined ||
    to === undefined ||
    !isAnalyticsDay(from) ||
    !isAnalyticsDay(to) ||
    !isAnalyticsWindow(from, to)
  ) {
    return defaultAnalyticsPeriod(now);
  }

  return { from, to, isDefault: false };
}
