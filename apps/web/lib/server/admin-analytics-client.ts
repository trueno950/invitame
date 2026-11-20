import { isCatalogId } from "./admin-catalog-validators.ts";
import {
  ApiClientError,
  type ApiClientOptions,
  sendApiRequest,
  sessionCookieHeader,
} from "./api-client.ts";

/**
 * The web server's client of the administrator analytics API (M9 T12; S2, S3, S7, L12). `/admin/analitica` is an
 * admin-only, read-only view, and the browser is never the guard, so every call runs here, on the web server, with the
 * session cookie and the shared secret, like `admin-invitations-client.ts`, whose request primitive and outcome shape
 * this client reuses. The API authorizes every call (`@AdminOnly()`), validates its own window, and answers only
 * aggregates: daily aperturas, the daily purchase funnel, and the top invitations. It stores no IP, user agent,
 * referrer, cookie, session, or slug per view (S7), so there is nothing visitor-specific here to keep.
 *
 * A view is one served opening of an invitation link — a reload and the owner's own visit included — and the pages
 * call it an «apertura», never a person or a unique visitor (S7, L12). The day is the calendar day in
 * `America/Mexico_City`, so a window is always a pair of local days.
 *
 * The window is bounded on both sides: the API serves at most 90 days (S3) and defaults to the last 30. The client
 * applies the same rule before a request, so a window outside it is a `validation` outcome and is never sent.
 *
 * Outcomes the pages handle come back as an `AnalyticsResult` value. A body that fails its validator fails closed with
 * an `ApiClientError` (`invalid-response`) that never carries the response, and so does an unexpected status or code
 * (`rejected`); neither the cookie nor a body is logged or kept. An outage is an outcome too (`unavailable`).
 *
 * The contracts mirror `GET /admin/analytics/views?from&to` and `GET /admin/analytics/funnel?from&to` of the S2 design
 * in `odd/tasks/m9-admin-operations.md`; the web never imports API code, so they are kept equal by hand.
 */

/** The window the API uses when a caller names none: the last 30 days (S2). */
export const ANALYTICS_DEFAULT_WINDOW_DAYS = 30;

/** The widest window the API serves, and the retention of the view rows (`InvitationView`, S3). */
export const ANALYTICS_MAX_WINDOW_DAYS = 90;

/** The API answers at most this many top invitations, and the client refuses a longer list (S2). */
export const ANALYTICS_TOP_INVITATIONS_LIMIT = 20;

/** The bound of a stored slug (`Invitation_slug_format`, a `VARCHAR(60)`). */
const MAX_SLUG_LENGTH = 60;

/** The one shape of a stored slug, so a slug the page links to is the one the API stores. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A calendar day as the API names it: always `YYYY-MM-DD`, never an instant. */
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** One bounded window of days: both ends are calendar days in `America/Mexico_City`. */
export interface AnalyticsWindow {
  readonly from: string;
  readonly to: string;
}

/** One day of aperturas: the public link and the guest links, counted together and separately (S7). */
export interface AnalyticsViewsDay {
  readonly day: string;
  readonly public: number;
  readonly guest: number;
}

/** One invitation of the bounded top list, by the slug the administrator links to its detail. */
export interface AnalyticsTopInvitation {
  readonly invitationId: string;
  readonly slug: string;
  readonly public: number;
  readonly guest: number;
}

/** `GET /admin/analytics/views?from&to`: the daily aperturas and the top invitations of the window (S2, S7). */
export interface AnalyticsViews {
  readonly days: readonly AnalyticsViewsDay[];
  readonly topInvitations: readonly AnalyticsTopInvitation[];
}

/** One day of the purchase funnel: the four steps of the window, as daily totals (S2). */
export interface AnalyticsFunnelDay {
  readonly day: string;
  readonly draftsCreated: number;
  readonly checkoutsStarted: number;
  readonly paymentsApproved: number;
  readonly firstPublications: number;
}

/** `GET /admin/analytics/funnel?from&to`: the daily funnel of the window (S2). */
export interface AnalyticsFunnel {
  readonly days: readonly AnalyticsFunnelDay[];
}

/**
 * - `signed-out`: 401, or no session cookie, so nothing was sent;
 * - `forbidden`: 403, the stored role is not ADMIN;
 * - `validation`: 400, the API refused the window, or a window outside the contract, so nothing was sent;
 * - `unavailable`: the API failed (5xx) or could not be reached.
 *
 * There is no `not-found`: these routes name no record, only a window.
 */
export type AnalyticsFailure = "signed-out" | "forbidden" | "validation" | "unavailable";

export type AnalyticsResult<T> = { ok: true; value: T } | { ok: false; failure: AnalyticsFailure };

const SIGNED_OUT: AnalyticsResult<never> = { ok: false, failure: "signed-out" };
const VALIDATION: AnalyticsResult<never> = { ok: false, failure: "validation" };
const UNAVAILABLE: AnalyticsResult<never> = { ok: false, failure: "unavailable" };

/** The statuses whose body the client reads: the successes and the refusals it maps. */
const REFUSAL_STATUSES: readonly number[] = [400, 401, 403];

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** The epoch day of a `YYYY-MM-DD` calendar day, or undefined when the text is not a real day. */
function dayNumber(value: unknown): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const match = DAY.exec(value);
  if (match === null) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);

  // `Date.UTC` rolls an impossible day over (`2026-02-30` becomes March), so the round trip has to agree.
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? time / DAY_MS
    : undefined;
}

/** Whether the text is a real calendar day written as `YYYY-MM-DD`: the only shape of an API day. */
export function isAnalyticsDay(value: unknown): value is string {
  return dayNumber(value) !== undefined;
}

/** The number of days a window covers, both ends included; undefined when it is not two real days in order. */
export function analyticsWindowDays(from: string, to: string): number | undefined {
  const start = dayNumber(from);
  const end = dayNumber(to);

  if (start === undefined || end === undefined || end < start) {
    return undefined;
  }

  return end - start + 1;
}

/** Whether the two days are a window the API serves: in order and at most 90 days (S3). */
export function isAnalyticsWindow(from: unknown, to: unknown): boolean {
  if (typeof from !== "string" || typeof to !== "string") {
    return false;
  }

  const days = analyticsWindowDays(from, to);

  return days !== undefined && days <= ANALYTICS_MAX_WINDOW_DAYS;
}

/** The calendar day `delta` days after `day`, or undefined when `day` is not a real day. */
export function shiftAnalyticsDay(day: string, delta: number): string | undefined {
  const value = dayNumber(day);

  return value === undefined
    ? undefined
    : new Date((value + delta) * DAY_MS).toISOString().slice(0, 10);
}

/** The API path of the daily aperturas of one window, with both days percent-encoded as query values. */
export function adminAnalyticsViewsPath(window: AnalyticsWindow): string {
  return `/admin/analytics/views${windowQuery(window)}`;
}

/** The API path of the purchase funnel of one window. */
export function adminAnalyticsFunnelPath(window: AnalyticsWindow): string {
  return `/admin/analytics/funnel${windowQuery(window)}`;
}

function windowQuery(window: AnalyticsWindow): string {
  const parameters = new URLSearchParams();
  parameters.set("from", window.from);
  parameters.set("to", window.to);

  return `?${parameters.toString()}`;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_SLUG_LENGTH && SLUG.test(value);
}

/** Whether the day belongs to the window that was asked for: the API answers no other day. */
function inWindow(day: string, window: AnalyticsWindow): boolean {
  return day >= window.from && day <= window.to;
}

/** One day of aperturas, kept only when its day is inside the window and both counts are integers. */
function parseViewsDay(value: unknown, window: AnalyticsWindow): AnalyticsViewsDay | undefined {
  const day = record(value);

  return day !== undefined &&
    isAnalyticsDay(day.day) &&
    inWindow(day.day, window) &&
    isCount(day.public) &&
    isCount(day.guest)
    ? { day: day.day, public: day.public, guest: day.guest }
    : undefined;
}

/** One day of the funnel, kept only when its day is inside the window and every step is an integer. */
function parseFunnelDay(value: unknown, window: AnalyticsWindow): AnalyticsFunnelDay | undefined {
  const day = record(value);

  return day !== undefined &&
    isAnalyticsDay(day.day) &&
    inWindow(day.day, window) &&
    isCount(day.draftsCreated) &&
    isCount(day.checkoutsStarted) &&
    isCount(day.paymentsApproved) &&
    isCount(day.firstPublications)
    ? {
        day: day.day,
        draftsCreated: day.draftsCreated,
        checkoutsStarted: day.checkoutsStarted,
        paymentsApproved: day.paymentsApproved,
        firstPublications: day.firstPublications,
      }
    : undefined;
}

function mapAll<T>(items: unknown, parse: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(items)) {
    return undefined;
  }

  const parsed: T[] = [];
  for (const item of items) {
    const value = parse(item);
    if (value === undefined) {
      return undefined;
    }
    parsed.push(value);
  }

  return parsed;
}

/** Every day of the answer at most once: a repeated day would double the totals of the window. */
function isDistinct(days: readonly { readonly day: string }[]): boolean {
  return new Set(days.map((day) => day.day)).size === days.length;
}

/**
 * The daily aperturas and the top invitations of one window, refused whole when a day, a count, a slug, or an
 * identifier is outside the contract, or when a day is outside the window that was asked for.
 */
export function parseAnalyticsViews(
  value: unknown,
  window: AnalyticsWindow,
): AnalyticsViews | undefined {
  const views = record(value);

  if (views === undefined) {
    return undefined;
  }

  const days = mapAll(views.days, (item) => parseViewsDay(item, window));
  const topInvitations = mapAll(views.topInvitations, (item) => {
    const invitation = record(item);

    return invitation !== undefined &&
      isCatalogId(invitation.invitationId) &&
      isSlug(invitation.slug) &&
      isCount(invitation.public) &&
      isCount(invitation.guest)
      ? {
          invitationId: invitation.invitationId,
          slug: invitation.slug,
          public: invitation.public,
          guest: invitation.guest,
        }
      : undefined;
  });

  if (
    days === undefined ||
    topInvitations === undefined ||
    topInvitations.length > ANALYTICS_TOP_INVITATIONS_LIMIT ||
    !isDistinct(days)
  ) {
    return undefined;
  }

  return { days, topInvitations };
}

/** The daily funnel of one window, refused whole when a day or a step is outside the contract. */
export function parseAnalyticsFunnel(
  value: unknown,
  window: AnalyticsWindow,
): AnalyticsFunnel | undefined {
  const funnel = record(value);

  if (funnel === undefined) {
    return undefined;
  }

  const days = mapAll(funnel.days, (item) => parseFunnelDay(item, window));

  return days === undefined || !isDistinct(days) ? undefined : { days };
}

/** The client reads a body for a success (to parse it) and for the statuses that can carry a refusal. */
const readsBody = (status: number): boolean =>
  (status >= 200 && status < 300) || REFUSAL_STATUSES.includes(status);

/**
 * `readCookieHeader` supplies the current request's `Cookie` header at each call; the client keeps nothing between
 * calls. Only Better Auth's cookies are forwarded (`sessionCookieHeader`).
 */
export function createAdminAnalyticsClient(
  options: ApiClientOptions,
  readCookieHeader: () => Promise<string | null | undefined>,
) {
  async function call<T>(
    path: string,
    parse: (value: unknown, window: AnalyticsWindow) => T | undefined,
    window: AnalyticsWindow,
  ): Promise<AnalyticsResult<T>> {
    const cookie = sessionCookieHeader(await readCookieHeader());

    if (cookie === undefined) {
      return SIGNED_OUT;
    }

    let status: number;
    let text: string | undefined;

    try {
      ({ status, text } = await sendApiRequest(
        options,
        { cookie, method: "GET", path },
        readsBody,
      ));
    } catch (error) {
      // The request never reached a working API: an outage the page handles as a retry, not a contract failure.
      if (error instanceof ApiClientError && error.kind === "unavailable") {
        return UNAVAILABLE;
      }
      throw error;
    }

    if (status >= 200 && status < 300) {
      let payload: unknown;
      try {
        payload = JSON.parse(text ?? "");
      } catch {
        payload = undefined;
      }

      const value = parse(payload, window);
      if (value === undefined) {
        throw new ApiClientError("invalid-response", status);
      }
      return { ok: true, value };
    }

    if (status === 401) {
      return SIGNED_OUT;
    }
    if (status === 403) {
      return { ok: false, failure: "forbidden" };
    }
    if (status === 400) {
      return VALIDATION;
    }
    if (status >= 500) {
      return UNAVAILABLE;
    }

    throw new ApiClientError("rejected", status);
  }

  /** A window outside the contract is never sent, so the API is not asked a question the page cannot show. */
  function views(from: string, to: string): Promise<AnalyticsResult<AnalyticsViews>> {
    return isAnalyticsWindow(from, to)
      ? call(adminAnalyticsViewsPath({ from, to }), parseAnalyticsViews, { from, to })
      : Promise.resolve(VALIDATION);
  }

  function funnel(from: string, to: string): Promise<AnalyticsResult<AnalyticsFunnel>> {
    return isAnalyticsWindow(from, to)
      ? call(adminAnalyticsFunnelPath({ from, to }), parseAnalyticsFunnel, { from, to })
      : Promise.resolve(VALIDATION);
  }

  return {
    /**
     * `GET /admin/analytics/views?from&to`: the daily aperturas, public and guest, and the bounded top invitations of the
     * window (S2, S7).
     */
    views,
    /** `GET /admin/analytics/funnel?from&to`: the daily totals of the four purchase steps (S2). */
    funnel,
  };
}

export type AdminAnalyticsClient = ReturnType<typeof createAdminAnalyticsClient>;
