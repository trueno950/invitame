import { isCatalogId } from "./admin-catalog-validators.ts";
import {
  ApiClientError,
  type ApiClientOptions,
  sendApiRequest,
  sessionCookieHeader,
} from "./api-client.ts";

/**
 * The web server's client of the administrator payments API (M7 T3; S1, S3). The browser cannot be the guard and never
 * decides a payment state, so the administrator's refund list and its one command run here, on the web server, with
 * the session cookie and the shared secret, like `admin-catalog-client.ts`, whose request primitive this client reuses.
 * The API authorizes every call (`@AdminOnly()`), applies the refund rule, and only asks the provider: this client maps
 * its answers and invents nothing.
 *
 * Outcomes the pages handle come back as a `PaymentsResult` value. Anything else fails closed with an `ApiClientError`
 * that never carries a response body: a 5xx or an unreachable API is `unavailable`, an unexpected status or code is
 * `rejected`, and a success whose body fails its validator is `invalid-response`. Neither the cookie nor a body is
 * logged or kept.
 *
 * The contracts mirror `apps/api/src/payments/presentation/payment.response.ts`
 * (`AdminPaymentResponse`, `RefundPaymentResponse`) and `admin-payments.controller.ts`; the web never imports API code,
 * so they are kept equal by hand. Nothing here carries a payer, a provider payload, or a reference the browser could
 * forge: the invitation slug is the same non-personal reference the catalog pages already show.
 */

/** The payment states the API stores; the list names only `paid`, but a row is validated against all of them. */
export const PAYMENT_STATUSES = ["pending", "paid", "failed", "expired", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * The event types the verified intake writes (`PAYMENT_EVENT_TYPE` in the API's `payments/domain/payment.ts`), read
 * from the rules that store them. The labels in `lib/admin/payments/copy.ts` cover exactly this set; an event whose
 * type is outside it still reaches the page and renders with a neutral label, because a support read must not fail
 * on a value the API added later.
 */
export const PAYMENT_EVENT_TYPES = ["paid", "failed", "expired", "refunded"] as const;
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

/**
 * What one event decided (`PAYMENT_EVENT_OUTCOME` in the same API file): every delivery the intake recorded, whether
 * it changed the payment or not (S4).
 */
export const PAYMENT_EVENT_OUTCOMES = [
  "applied",
  "ignored_transition",
  "ignored_unknown_payment",
  "refused_amount",
  "refused_currency",
] as const;
export type PaymentEventOutcome = (typeof PAYMENT_EVENT_OUTCOMES)[number];

/** The most events one detail read answers: the API's own bound (`ADMIN_PAYMENT_EVENT_LIMIT`, S4). */
export const ADMIN_PAYMENT_EVENT_LIMIT = 50;

/**
 * The rows one read asks for: the API's own maximum (`ADMIN_PAYMENT_MAX_LIMIT`). The read is bounded even so, and a
 * page that needs more asks again later rather than growing an unbounded list.
 */
export const ADMIN_PAYMENT_LIST_LIMIT = 50;

/** `GET /admin/payments?status=paid&limit=<limit>`: one paid payment and whether the rule still refunds it (S3). */
export interface AdminPayment {
  readonly paymentId: string;
  readonly invitationId: string;
  readonly invitationSlug: string;
  readonly status: PaymentStatus;
  readonly amountMinor: number;
  readonly currency: string;
  readonly paidAt: string | null;
  /** The rule's own answer: paid and never published. Only then does the page offer the button (S3). */
  readonly refundable: boolean;
}

/** `POST /admin/payments/:paymentId/refund`: the provider was asked and no payment state changed (S3). */
export interface RefundRequested {
  readonly outcome: "requested";
}

/**
 * One event of `GET /admin/payments/:paymentId` (M9 T7; S4): what the intake decided and when. `type` and `outcome`
 * are the API's closed sets (`PaymentEventType`, `PaymentEventOutcome`), kept as text so a value this client does not
 * know yet is rendered with a neutral label instead of failing the whole read.
 */
export interface AdminPaymentEvent {
  readonly type: string;
  readonly outcome: string;
  readonly receivedAt: string;
  /** Null only for an event row the intake never completed; the page says so rather than inventing an instant. */
  readonly processedAt: string | null;
}

/**
 * `GET /admin/payments/:paymentId`: one payment, its invitation, and its newest events, newest first (S4). It carries
 * no payer datum, provider reference, idempotency key, or payload digest, and the page renders none.
 */
export interface AdminPaymentDetail {
  readonly paymentId: string;
  readonly invitationId: string;
  readonly invitationSlug: string;
  readonly status: PaymentStatus;
  readonly amountMinor: number;
  readonly currency: string;
  /** The adapter key the API stored, such as `mercadopago`; never a credential. */
  readonly provider: string;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly events: readonly AdminPaymentEvent[];
}

/**
 * - `signed-out`: 401, or no session cookie, so nothing was sent;
 * - `forbidden`: 403, the stored role is not ADMIN;
 * - `not-found`: 404, or an id that is not a UUID, so nothing was sent (`PAYMENT_NOT_FOUND`);
 * - `not-refundable`: 409 `PAYMENT_NOT_REFUNDABLE`, the payment is not `paid`;
 * - `already-published`: 409 `INVITATION_ALREADY_PUBLISHED`, «Sin reembolso tras publicar» (S3);
 * - `provider-unavailable`: 503 `PAYMENT_PROVIDER_UNAVAILABLE`, the provider refused or could not be reached;
 * - `validation`: 400 without a known code, the API refused the query.
 */
export type PaymentsFailure =
  | "signed-out"
  | "forbidden"
  | "not-found"
  | "not-refundable"
  | "already-published"
  | "provider-unavailable"
  | "validation";

export type PaymentsResult<T> = { ok: true; value: T } | { ok: false; failure: PaymentsFailure };

const CODE_FAILURES: Record<string, PaymentsFailure> = {
  PAYMENT_NOT_FOUND: "not-found",
  PAYMENT_NOT_REFUNDABLE: "not-refundable",
  INVITATION_ALREADY_PUBLISHED: "already-published",
  PAYMENT_PROVIDER_UNAVAILABLE: "provider-unavailable",
};

/** The statuses whose body the client reads: the two refusals it maps, and the provider's 503 code. */
const REFUSAL_STATUSES: readonly number[] = [400, 404, 409, 503];

const NOT_FOUND: PaymentsResult<never> = { ok: false, failure: "not-found" };
const SIGNED_OUT: PaymentsResult<never> = { ok: false, failure: "signed-out" };

/** The largest amount the API stores (`MAX_PRICE_AMOUNT_MINOR`, a PostgreSQL `INTEGER`). */
const MAX_AMOUNT_MINOR = 2_147_483_647;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return PAYMENT_STATUSES.some((status) => status === value);
}

/** One row, or nothing when any field is outside the contract: the page never renders an invented payment. */
export function parseAdminPayment(value: unknown): AdminPayment | undefined {
  const payment = record(value);

  if (payment === undefined) {
    return undefined;
  }

  const {
    paymentId,
    invitationId,
    invitationSlug,
    status,
    amountMinor,
    currency,
    paidAt,
    refundable,
  } = payment;

  if (
    !isCatalogId(paymentId) ||
    !isCatalogId(invitationId) ||
    typeof invitationSlug !== "string" ||
    invitationSlug.length === 0 ||
    !isPaymentStatus(status) ||
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    amountMinor > MAX_AMOUNT_MINOR ||
    typeof currency !== "string" ||
    currency.length === 0 ||
    !(paidAt === null || isTimestamp(paidAt)) ||
    typeof refundable !== "boolean"
  ) {
    return undefined;
  }

  return {
    paymentId,
    invitationId,
    invitationSlug,
    status,
    amountMinor,
    currency,
    paidAt,
    refundable,
  };
}

/** The list, refused whole when one row is outside the contract. */
export function parseAdminPayments(value: unknown): AdminPayment[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const payments: AdminPayment[] = [];

  for (const row of value) {
    const payment = parseAdminPayment(row);
    if (payment === undefined) {
      return undefined;
    }
    payments.push(payment);
  }

  return payments;
}

/** The refund's answer: `requested` and nothing else, because the API never reports a new payment state (S3). */
export function parseRefundRequested(value: unknown): RefundRequested | undefined {
  return record(value)?.outcome === "requested" ? { outcome: "requested" } : undefined;
}

/** The stored event vocabulary is `VARCHAR(40)` in both columns, so nothing longer could be one. */
const MAX_EVENT_LABEL_LENGTH = 40;
/** `Payment.provider` is a `VARCHAR(40)` adapter key. */
const MAX_PROVIDER_LENGTH = 40;

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_EVENT_LABEL_LENGTH;
}

function parseAdminPaymentEvent(value: unknown): AdminPaymentEvent | undefined {
  const event = record(value);

  if (
    event === undefined ||
    !isLabel(event.type) ||
    !isLabel(event.outcome) ||
    !isTimestamp(event.receivedAt) ||
    !(event.processedAt === null || isTimestamp(event.processedAt))
  ) {
    return undefined;
  }

  return {
    type: event.type,
    outcome: event.outcome,
    receivedAt: event.receivedAt,
    processedAt: event.processedAt,
  };
}

/**
 * One payment's detail, refused whole when a field or an event is outside the contract. Only the fields the page
 * renders are kept: a response that carried a provider reference, an idempotency key, or a payload digest (it must
 * not) would drop them here, so none of them can reach a component.
 */
export function parseAdminPaymentDetail(value: unknown): AdminPaymentDetail | undefined {
  const detail = record(value);

  if (
    detail === undefined ||
    !isCatalogId(detail.paymentId) ||
    !isCatalogId(detail.invitationId) ||
    typeof detail.invitationSlug !== "string" ||
    detail.invitationSlug.length === 0 ||
    !isPaymentStatus(detail.status) ||
    typeof detail.amountMinor !== "number" ||
    !Number.isSafeInteger(detail.amountMinor) ||
    detail.amountMinor < 0 ||
    detail.amountMinor > MAX_AMOUNT_MINOR ||
    typeof detail.currency !== "string" ||
    detail.currency.length === 0 ||
    typeof detail.provider !== "string" ||
    detail.provider.length === 0 ||
    detail.provider.length > MAX_PROVIDER_LENGTH ||
    !isTimestamp(detail.createdAt) ||
    !(detail.paidAt === null || isTimestamp(detail.paidAt)) ||
    !Array.isArray(detail.events) ||
    detail.events.length > ADMIN_PAYMENT_EVENT_LIMIT
  ) {
    return undefined;
  }

  const events: AdminPaymentEvent[] = [];
  for (const row of detail.events) {
    const event = parseAdminPaymentEvent(row);
    if (event === undefined) {
      return undefined;
    }
    events.push(event);
  }

  return {
    paymentId: detail.paymentId,
    invitationId: detail.invitationId,
    invitationSlug: detail.invitationSlug,
    status: detail.status,
    amountMinor: detail.amountMinor,
    currency: detail.currency,
    provider: detail.provider,
    createdAt: detail.createdAt,
    paidAt: detail.paidAt,
    events,
  };
}

/**
 * The status line of a refusal is never kept: only a `code` from the fixed set is read. An unknown code is no failure
 * here, so the caller can classify the status itself.
 */
function failureOf(text: string | undefined): PaymentsResult<never> | undefined {
  try {
    const body = JSON.parse(text ?? "") as { code?: unknown } | null;
    const code = body?.code;

    return typeof code === "string" && Object.hasOwn(CODE_FAILURES, code)
      ? { ok: false, failure: CODE_FAILURES[code] as PaymentsFailure }
      : undefined;
  } catch {
    return undefined;
  }
}

/** The client reads a body for a success (to parse it) and for the statuses that can carry a refusal code. */
const readsBody = (status: number): boolean =>
  (status >= 200 && status < 300) || REFUSAL_STATUSES.includes(status);

/**
 * `readCookieHeader` supplies the current request's `Cookie` header at each call; the client keeps nothing between
 * calls. Only Better Auth's cookies are forwarded (`sessionCookieHeader`).
 */
export function createAdminPaymentsClient(
  options: ApiClientOptions,
  readCookieHeader: () => Promise<string | null | undefined>,
) {
  async function call<T>(
    method: "GET" | "POST",
    path: string,
    parse: (value: unknown) => T | undefined,
  ): Promise<PaymentsResult<T>> {
    const cookie = sessionCookieHeader(await readCookieHeader());

    if (cookie === undefined) {
      return SIGNED_OUT;
    }

    const { status, text } = await sendApiRequest(options, { cookie, method, path }, readsBody);

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

    if (failure !== undefined && REFUSAL_STATUSES.includes(status)) {
      return failure;
    }
    if (status === 404) {
      return NOT_FOUND;
    }
    if (status === 400) {
      return { ok: false, failure: "validation" };
    }

    throw new ApiClientError(status >= 500 ? "unavailable" : "rejected", status);
  }

  return {
    /**
     * `GET /admin/payments?status=paid&limit=<ADMIN_PAYMENT_LIST_LIMIT>`: the newest paid payments with the invitation's
     * slug and whether the refund rule would accept a refund now (S3). `status` names the one list the route offers.
     */
    list: (): Promise<PaymentsResult<AdminPayment[]>> =>
      call(
        "GET",
        `/admin/payments?status=paid&limit=${ADMIN_PAYMENT_LIST_LIMIT}`,
        parseAdminPayments,
      ),
    /**
     * `POST /admin/payments/:paymentId/refund`: asks the provider for a full refund of one paid, never-published
     * payment (S3). The payment stays `paid` until the verified provider notification says otherwise, so this client
     * reports only that the request was made. An id that is not a UUID names nothing, so no request is sent.
     */
    refund: (paymentId: string): Promise<PaymentsResult<RefundRequested>> =>
      isCatalogId(paymentId)
        ? call("POST", `/admin/payments/${paymentId}/refund`, parseRefundRequested)
        : Promise.resolve(NOT_FOUND),
    /**
     * `GET /admin/payments/:paymentId`: one payment with its invitation slug and its newest fifty events, newest first
     * (S4). Read-only and never audited (S6, L9). An id that is not a UUID names nothing, so no request is sent.
     */
    detail: (paymentId: string): Promise<PaymentsResult<AdminPaymentDetail>> =>
      isCatalogId(paymentId)
        ? call("GET", `/admin/payments/${paymentId}`, parseAdminPaymentDetail)
        : Promise.resolve(NOT_FOUND),
  };
}

export type AdminPaymentsClient = ReturnType<typeof createAdminPaymentsClient>;
