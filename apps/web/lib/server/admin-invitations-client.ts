import { isCatalogId } from "./admin-catalog-validators.ts";
import { PAYMENT_STATUSES, type PaymentStatus } from "./admin-payments-client.ts";
import {
  ApiClientError,
  type ApiClientOptions,
  sendApiRequest,
  sessionCookieHeader,
} from "./api-client.ts";

/**
 * The web server's client of the administrator invitations API (M9 T3, T8; S1, S4, S6, L3–L5). The status view is
 * admin-only and read-only, the unpublish is admin-only and audited, and the browser is never the guard, so every call
 * runs here, on the web server, with the session cookie and the shared secret, like `admin-payments-client.ts`, whose
 * request primitive and outcome shape this client reuses. The API authorizes every call (`@AdminOnly()`), validates its
 * own input, and answers only the fields the pages may show: never the invitation content, an owner display name,
 * guests, or a provider payload.
 *
 * Outcomes the pages handle come back as an `InvitationsResult` value. A body that fails its validator fails closed
 * with an `ApiClientError` (`invalid-response`) that never carries the response, and so does an unexpected status or
 * code (`rejected`); neither the cookie nor a body is logged or kept. An outage is an outcome too (`unavailable`), so
 * the page can show its retry notice without catching anything.
 *
 * The contracts mirror `GET /admin/invitations`, `GET /admin/invitations/:invitationId`, and
 * `POST /admin/invitations/:invitationId/unpublish` of the S1 and S4 designs (`AdminInvitationSummary`,
 * `AdminInvitationDetail`) in `odd/tasks/m9-admin-operations.md`; the web never imports API code, so they are kept equal
 * by hand.
 */

/** The stored invitation states; the filter offers these three and nothing else. */
export const ADMIN_INVITATION_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type AdminInvitationStatus = (typeof ADMIN_INVITATION_STATUSES)[number];

/**
 * The reasons an administrator may give for a support action (M9 T8; S6, L9): the API's closed set
 * (`AdminActionReason` in `apps/api/src/admin/domain/admin-action.ts`), mirrored by hand because the web never imports
 * API code. `OTHER` is the one value whose note the API requires.
 */
export const ADMIN_ACTION_REASONS = ["ABUSE", "OWNER_REQUEST", "PAYMENT_ERROR", "OTHER"] as const;
export type AdminActionReason = (typeof ADMIN_ACTION_REASONS)[number];

/** The widest note the API stores (`AdminAction.note`, a `VARCHAR(500)` with a matching CHECK). */
export const ADMIN_ACTION_NOTE_MAX_LENGTH = 500;

/** The page size the list asks for: the API's own default, so a page needs more only by asking again. */
export const ADMIN_INVITATION_LIST_LIMIT = 20;

/**
 * The opaque key-set cursor (base64url of `createdAt` and `id`). Only a plausible token is ever put in a query or a
 * link: anything else could not be the API's own cursor, so the page shows it as no filter instead.
 */
const CURSOR = /^[A-Za-z0-9_-]{1,200}$/;

/** Whether the text could be the API's key-set cursor. */
export function isInvitationCursor(value: unknown): value is string {
  return typeof value === "string" && CURSOR.test(value);
}

/** Whether the value is one of the reasons the API accepts. */
export function isAdminActionReason(value: unknown): value is AdminActionReason {
  return typeof value === "string" && ADMIN_ACTION_REASONS.some((reason) => reason === value);
}

/**
 * The smallest shape of a slug the API stores (`Invitation_slug_format`, a `VARCHAR(60)`), which is also the shape the
 * public page accepts; a summary with another slug is outside the contract.
 */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 60;
/** A stored address is text the page shows as text; this is only its plausible length. */
const MAX_EMAIL_LENGTH = 320;
/** The largest amount the API stores (`MAX_PRICE_AMOUNT_MINOR`, a PostgreSQL `INTEGER`). */
const MAX_AMOUNT_MINOR = 2_147_483_647;

export interface AdminInvitationPaymentSnapshot {
  readonly status: PaymentStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly paidAt: string | null;
}

/** How many photos one invitation has; the status view shows counts, never an image (S1). */
export interface AdminInvitationMedia {
  readonly mainPhoto: boolean;
  readonly galleryCount: number;
}

/** One row of `GET /admin/invitations` (S1): the invitation, its owner's email, its payment, and its photos. */
export interface AdminInvitationSummary {
  readonly invitationId: string;
  readonly slug: string;
  readonly status: AdminInvitationStatus;
  /**
   * The only owner field the list shows (L3). The API answers `null` when no stored owner answers for the invitation,
   * which the owner reference prevents in practice; the page then says so instead of inventing an address.
   */
  readonly ownerEmail: string | null;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly firstPublishedAt: string | null;
  readonly archivedAt: string | null;
  readonly refundRequestedAt: string | null;
  readonly latestPayment: AdminInvitationPaymentSnapshot | null;
  readonly media: AdminInvitationMedia;
}

/** One payment of the detail's bounded list, newest first, at most 20 (S1). */
export interface AdminInvitationPayment {
  readonly paymentId: string;
  readonly status: PaymentStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly createdAt: string;
  readonly paidAt: string | null;
}

/** `GET /admin/invitations/:invitationId`: the summary plus its owner, package, template version, and payments. */
export interface AdminInvitationDetail extends AdminInvitationSummary {
  /**
   * The owner's id: the additive reference T8 adds so a support action can address the owner's account (S4). It is an
   * identifier, never the display name the status view does not answer.
   */
  readonly ownerId: string;
  readonly packageId: string;
  readonly templateVersionId: string;
  readonly payments: readonly AdminInvitationPayment[];
}

/** One page of the search: the rows and the cursor of the next page, or `null` on the last one. */
export interface AdminInvitationPage {
  readonly items: readonly AdminInvitationSummary[];
  readonly nextCursor: string | null;
}

/** The query of the search; every field is optional, and the client adds its own bounded limit. */
export interface AdminInvitationQuery {
  /** A case-insensitive prefix of the slug, already validated by the page (at most 60 characters). */
  readonly slug?: string;
  readonly status?: AdminInvitationStatus;
  /** The cursor of the page being continued. */
  readonly cursor?: string;
}

/** One command of the administrator's unpublish (T8; S4, S6): why the invitation is unpublished, and the note. */
export interface AdminUnpublishCommand {
  readonly reason: AdminActionReason;
  /**
   * The optional note, at most 500 characters. The API trims it, and requires one — non-blank — while the reason is
   * `OTHER`; the command module repeats that rule before a request is sent, so the page explains it before the API does.
   */
  readonly note: string | null;
}

/**
 * - `signed-out`: 401, or no session cookie, so nothing was sent;
 * - `forbidden`: 403, the stored role is not ADMIN;
 * - `validation`: 400, the API refused the query or the unpublish body;
 * - `not-found`: 404 `INVITATION_NOT_FOUND`, or an id that is not a UUID, so nothing was sent;
 * - `not-published`: 409 `INVITATION_NOT_PUBLISHED`, the invitation was never published (T8);
 * - `already-archived`: 409 `INVITATION_ALREADY_ARCHIVED`, archiving is terminal (T8, A2);
 * - `unavailable`: the API failed (5xx) or could not be reached.
 */
export type InvitationsFailure =
  | "signed-out"
  | "forbidden"
  | "validation"
  | "not-found"
  | "not-published"
  | "already-archived"
  | "unavailable";

export type InvitationsResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: InvitationsFailure };

const NOT_FOUND: InvitationsResult<never> = { ok: false, failure: "not-found" };
const SIGNED_OUT: InvitationsResult<never> = { ok: false, failure: "signed-out" };
const UNAVAILABLE: InvitationsResult<never> = { ok: false, failure: "unavailable" };

/**
 * The refusal codes the API answers, each with the outcome the page handles. An unknown code is no outcome here, so
 * the caller classifies the status itself and an unexpected 409 stays an `ApiClientError`.
 */
const CODE_FAILURES: Readonly<Record<string, InvitationsFailure>> = {
  INVITATION_NOT_FOUND: "not-found",
  INVITATION_NOT_PUBLISHED: "not-published",
  INVITATION_ALREADY_ARCHIVED: "already-archived",
};

/** The statuses whose body the client reads: the successes and the refusals it maps. */
const REFUSAL_STATUSES: readonly number[] = [400, 401, 403, 404, 409];

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function isTimestampOrNull(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

function isNonEmptyText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isAmountMinor(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_AMOUNT_MINOR
  );
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isInvitationStatus(value: unknown): value is AdminInvitationStatus {
  return ADMIN_INVITATION_STATUSES.some((status) => status === value);
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return PAYMENT_STATUSES.some((status) => status === value);
}

function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_SLUG_LENGTH && SLUG.test(value);
}

function parseSnapshot(value: unknown): AdminInvitationPaymentSnapshot | undefined {
  const payment = record(value);

  if (
    payment === undefined ||
    !isPaymentStatus(payment.status) ||
    !isAmountMinor(payment.amountMinor) ||
    !isNonEmptyText(payment.currency, 10) ||
    !isTimestampOrNull(payment.paidAt)
  ) {
    return undefined;
  }

  return {
    status: payment.status,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    paidAt: payment.paidAt,
  };
}

function parseMedia(value: unknown): AdminInvitationMedia | undefined {
  const media = record(value);

  return media !== undefined && typeof media.mainPhoto === "boolean" && isCount(media.galleryCount)
    ? { mainPhoto: media.mainPhoto, galleryCount: media.galleryCount }
    : undefined;
}

/**
 * One summary, or nothing when any field is outside the contract. Only the fields the pages render are kept, so a
 * response that carries something the administrator must not see (content, a display name, guests) never reaches a
 * page even when a future API adds it by accident.
 */
export function parseAdminInvitationSummary(value: unknown): AdminInvitationSummary | undefined {
  const summary = record(value);

  if (
    summary === undefined ||
    !isCatalogId(summary.invitationId) ||
    !isSlug(summary.slug) ||
    !isInvitationStatus(summary.status) ||
    !(summary.ownerEmail === null || isNonEmptyText(summary.ownerEmail, MAX_EMAIL_LENGTH)) ||
    !isTimestamp(summary.createdAt) ||
    !isTimestampOrNull(summary.publishedAt) ||
    !isTimestampOrNull(summary.firstPublishedAt) ||
    !isTimestampOrNull(summary.archivedAt) ||
    !isTimestampOrNull(summary.refundRequestedAt) ||
    !Object.hasOwn(summary, "latestPayment")
  ) {
    return undefined;
  }

  const latestPayment =
    summary.latestPayment === null ? null : parseSnapshot(summary.latestPayment);
  const media = parseMedia(summary.media);

  if (latestPayment === undefined || media === undefined) {
    return undefined;
  }

  return {
    invitationId: summary.invitationId,
    slug: summary.slug,
    status: summary.status,
    ownerEmail: summary.ownerEmail,
    createdAt: summary.createdAt,
    publishedAt: summary.publishedAt,
    firstPublishedAt: summary.firstPublishedAt,
    archivedAt: summary.archivedAt,
    refundRequestedAt: summary.refundRequestedAt,
    latestPayment,
    media,
  };
}

function parsePayment(value: unknown): AdminInvitationPayment | undefined {
  const payment = record(value);

  if (
    payment === undefined ||
    !isCatalogId(payment.paymentId) ||
    !isPaymentStatus(payment.status) ||
    !isAmountMinor(payment.amountMinor) ||
    !isNonEmptyText(payment.currency, 10) ||
    !isTimestamp(payment.createdAt) ||
    !isTimestampOrNull(payment.paidAt)
  ) {
    return undefined;
  }

  return {
    paymentId: payment.paymentId,
    status: payment.status,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt,
  };
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

/** The page of the search, refused whole when a row or the cursor is outside the contract. */
export function parseAdminInvitationPage(value: unknown): AdminInvitationPage | undefined {
  const page = record(value);

  if (page === undefined || !Object.hasOwn(page, "nextCursor")) {
    return undefined;
  }

  const items = mapAll(page.items, parseAdminInvitationSummary);
  const nextCursor = page.nextCursor;

  if (items === undefined || !(nextCursor === null || isInvitationCursor(nextCursor))) {
    return undefined;
  }

  return { items, nextCursor };
}

/** One invitation's status detail, refused whole when a field or a payment is outside the contract. */
export function parseAdminInvitationDetail(value: unknown): AdminInvitationDetail | undefined {
  const summary = parseAdminInvitationSummary(value);
  const detail = record(value);

  if (summary === undefined || detail === undefined) {
    return undefined;
  }

  const payments = mapAll(detail.payments, parsePayment);

  if (
    !isCatalogId(detail.ownerId) ||
    !isCatalogId(detail.packageId) ||
    !isCatalogId(detail.templateVersionId) ||
    payments === undefined
  ) {
    return undefined;
  }

  return {
    ...summary,
    ownerId: detail.ownerId,
    packageId: detail.packageId,
    templateVersionId: detail.templateVersionId,
    payments,
  };
}

/**
 * The search path, in the API's own order: the slug prefix, the status, the bounded limit, and the cursor. Every value
 * is percent-encoded, so a slug the administrator typed can never add or replace a query parameter.
 */
export function adminInvitationsPath(query: AdminInvitationQuery): string {
  const parameters = new URLSearchParams();

  if (query.slug !== undefined && query.slug !== "") {
    parameters.set("slug", query.slug);
  }
  if (query.status !== undefined) {
    parameters.set("status", query.status);
  }
  parameters.set("limit", String(ADMIN_INVITATION_LIST_LIMIT));
  if (query.cursor !== undefined) {
    parameters.set("cursor", query.cursor);
  }

  return `/admin/invitations?${parameters.toString()}`;
}

/** The client reads a body for a success (to parse it) and for the statuses that can carry a refusal. */
const readsBody = (status: number): boolean =>
  (status >= 200 && status < 300) || REFUSAL_STATUSES.includes(status);

/**
 * The refusal of one call: only a `code` from the fixed set is read, so a message the API wrote can never reach a page,
 * and a code this client does not know is no outcome — the caller then classifies the status itself.
 */
function failureOf(text: string | undefined): InvitationsResult<never> | undefined {
  try {
    const body = JSON.parse(text ?? "") as { code?: unknown } | null;
    const code = body?.code;

    return typeof code === "string" && Object.hasOwn(CODE_FAILURES, code)
      ? { ok: false, failure: CODE_FAILURES[code] as InvitationsFailure }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `readCookieHeader` supplies the current request's `Cookie` header at each call; the client keeps nothing between
 * calls. Only Better Auth's cookies are forwarded (`sessionCookieHeader`).
 */
export function createAdminInvitationsClient(
  options: ApiClientOptions,
  readCookieHeader: () => Promise<string | null | undefined>,
) {
  async function call<T>(
    method: "GET" | "POST",
    path: string,
    parse: (value: unknown) => T | undefined,
    body?: unknown,
  ): Promise<InvitationsResult<T>> {
    const cookie = sessionCookieHeader(await readCookieHeader());

    if (cookie === undefined) {
      return SIGNED_OUT;
    }

    let status: number;
    let text: string | undefined;

    try {
      ({ status, text } = await sendApiRequest(
        options,
        body === undefined ? { cookie, method, path } : { cookie, method, path, body },
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

      const value = parse(payload);
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

    const failure = failureOf(text);
    if (failure !== undefined) {
      return failure;
    }
    if (status === 404) {
      return NOT_FOUND;
    }
    if (status === 400) {
      return { ok: false, failure: "validation" };
    }
    if (status >= 500) {
      return UNAVAILABLE;
    }

    throw new ApiClientError("rejected", status);
  }

  return {
    /**
     * `GET /admin/invitations?slug=<prefix>&status=<status>&limit=<limit>&cursor=<opaque>`: the newest invitations first,
     * with the cursor of the next page (S1). Without filters it asks for the first page.
     */
    list: (query: AdminInvitationQuery = {}): Promise<InvitationsResult<AdminInvitationPage>> =>
      call("GET", adminInvitationsPath(query), parseAdminInvitationPage),
    /**
     * `GET /admin/invitations/:invitationId`: the lifecycle dates, the owner's email and id, the bounded payments list,
     * and the photo counts of one invitation (S1, S4). An id that is not a UUID names nothing, so no request is sent.
     */
    detail: (invitationId: string): Promise<InvitationsResult<AdminInvitationDetail>> =>
      isCatalogId(invitationId)
        ? call("GET", `/admin/invitations/${invitationId}`, parseAdminInvitationDetail)
        : Promise.resolve(NOT_FOUND),
    /**
     * `POST /admin/invitations/:invitationId/unpublish`: PUBLISHED → DRAFT for any owner, with the audit row the API
     * writes in the same transaction (T8; S4, S6). The answer is the same detail the read route serves, so the page
     * renders the new state from the API's own answer. An id that is not a UUID names nothing, so no request is sent.
     */
    unpublish: (
      invitationId: string,
      command: AdminUnpublishCommand,
    ): Promise<InvitationsResult<AdminInvitationDetail>> =>
      isCatalogId(invitationId)
        ? call(
            "POST",
            `/admin/invitations/${invitationId}/unpublish`,
            parseAdminInvitationDetail,
            // The note is only sent when the administrator wrote one: the API's DTO treats an absent note as none.
            command.note === null || command.note === ""
              ? { reason: command.reason }
              : { reason: command.reason, note: command.note },
          )
        : Promise.resolve(NOT_FOUND),
  };
}

export type AdminInvitationsClient = ReturnType<typeof createAdminInvitationsClient>;
