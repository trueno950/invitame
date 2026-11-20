import { createHmac, timingSafeEqual } from "node:crypto";

import { Logger } from "@nestjs/common";

import { isIsoInstant, parseNormalizedPaymentEvent } from "../application/normalized-payment-event";
import type {
  CheckoutIntent,
  CheckoutSession,
  PaymentProvider,
  RefundResult,
  WebhookRequest,
  WebhookVerification,
} from "../application/payment-provider.port";
import type { PaymentEventType } from "../domain/payment";

// The Mercado Pago adapter (T1; S1, S2, S4). Checkout Pro opens the payment, and the notification the provider sends
// is only a pointer: the adapter verifies its signature over the notification id, the request id, and the timestamp,
// and then re-reads the payment from Mercado Pago's own API. Only `external_reference`, `status`, `transaction_amount`,
// `currency_id`, and the event instant cross this boundary — no provider status name, no payload key, no payer datum.
//
// Like the place-search adapter, it is deliberately strict, because it reads a third party's answer:
//
// - one request per step, five seconds, no retry: a provider that does not answer is a reported failure, and a failed
//   notification is answered "retry me" instead of pretending the event was handled;
// - no redirect is followed, so an answer from another host is an answer from nowhere;
// - the body is bounded before a byte is read and while it is read, so an unexpected answer cannot exhaust memory;
// - only the documented fields are read, and a value that is not the shape the domain needs is refused instead of
//   guessed at — money in particular: an amount that is not exact cents is not this API's amount;
// - the signature comparison is constant-time, its timestamp is bounded to ±5 minutes against the instant the API
//   received the delivery, and an authentic delivery that decides nothing answers `event: null` (200, nothing stored)
//   so a retry of it stops instead of repeating forever, while a delivery that names no topic at all is refused so it
//   is retried rather than dropped;
// - every failure is reported as one structured category and never as a body, a token, a secret, or a payer datum.
//
// The API origin is configuration (`MERCADOPAGO_API_BASE_URL`), so a spec or a sandbox proxy replaces the real one with
// no code change.

/** The adapter key stored in `Payment.provider` and compared with the webhook route's `:provider`. */
export const MERCADOPAGO_PROVIDER_KEY = "mercadopago";

/** The only currency the product charges: every package is priced in Mexican pesos (S1). */
export const MERCADOPAGO_CURRENCY = "MXN";

/** The item title Checkout Pro shows; it names the product, never the invitation or the owner. */
export const MERCADOPAGO_ITEM_TITLE = "Paquete InvitaMe";

/** A request that takes longer than this is abandoned (T1). */
export const MERCADOPAGO_TIMEOUT_MS = 5_000;

/** The largest answer this adapter reads; a real preference or payment is a few kilobytes (S4). */
export const MERCADOPAGO_MAX_BODY_BYTES = 64 * 1024;

/** How far from the API's receipt instant a signed timestamp may be, in either direction (T1, S4). */
export const MERCADOPAGO_SIGNATURE_TOLERANCE_SECONDS = 300;

/** The notification topic that carries a payment; every other topic is answered as verified and ignored. */
export const MERCADOPAGO_PAYMENT_TOPIC = "payment";

const SIGNATURE_HEADER = "x-signature";
const REQUEST_ID_HEADER = "x-request-id";
const HTTP_OK_MINIMUM = 200;
const HTTP_OK_MAXIMUM = 299;
/** A signature digest in hex: HMAC-SHA256 is 32 bytes. */
const SHA256_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;
/** A unix timestamp in seconds (10-12 digits) or in milliseconds (13-15 digits). */
const TIMESTAMP_PATTERN = /^\d{10,15}$/;
/** A millisecond clock has this many digits; see `secondsOf`. */
const MILLISECOND_TIMESTAMP_DIGITS = 13;
/**
 * An absolute https URL on a Mercado Pago or Mercado Libre host is a checkout this API may send a browser to. The
 * registrable domain is exact (`.com` or `.com.mx`, the MXN market), so `www.mercadopago.evil.com` is refused.
 */
const CHECKOUT_HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*(?:mercadopago|mercadolibre)\.com(?:\.mx)?$/;

/** The ways a request to Mercado Pago answers nothing (S4): a bounded category each, and never a body or a secret. */
export const MERCADOPAGO_FAILURE = {
  TIMEOUT: "timeout",
  NETWORK: "network",
  HTTP_STATUS: "http-status",
  BODY_REJECTED: "body-rejected",
  INVALID_JSON: "invalid-json",
  INVALID_RESPONSE: "invalid-response",
  UNSUPPORTED_CURRENCY: "unsupported-currency",
} as const;

export type MercadoPagoFailureCategory =
  (typeof MERCADOPAGO_FAILURE)[keyof typeof MERCADOPAGO_FAILURE];

/** The steps that can fail: a checkout, a payment re-read, and a refund. */
export const MERCADOPAGO_OPERATION = {
  CREATE_CHECKOUT: "create-checkout",
  FETCH_PAYMENT: "fetch-payment",
  REFUND: "refund",
} as const;

export type MercadoPagoOperation =
  (typeof MERCADOPAGO_OPERATION)[keyof typeof MERCADOPAGO_OPERATION];

/**
 * One operational fact about a request that answered nothing: what failed, where, and for a refused answer the status.
 * It carries no body, no token, no secret, and no payer datum, so a provider that stops answering is visible without
 * logging anyone's data (S4).
 */
export interface MercadoPagoFailure {
  readonly event: "mercadopago-request-failed";
  readonly operation: MercadoPagoOperation;
  readonly category: MercadoPagoFailureCategory;
  readonly status?: number;
}

/** Where a failed request is reported; the default writes one structured warning through Nest's logger. */
export type MercadoPagoFailureReporter = (failure: MercadoPagoFailure) => void;

const logger = new Logger("MercadoPago");

const logMercadoPagoFailure: MercadoPagoFailureReporter = (failure) => logger.warn(failure);

export interface MercadoPagoPaymentProviderOptions {
  /** Mercado Pago API credential; server-only, and never logged, echoed, or returned. */
  readonly accessToken: string;
  /** The signature secret of the Mercado Pago panel; never logged, echoed, or returned. */
  readonly webhookSecret: string;
  /** The web origin of the return page, from `PAYMENTS_RETURN_BASE_URL`. */
  readonly returnBaseUrl: string;
  /** The public API origin Mercado Pago notifies, from `PAYMENTS_WEBHOOK_BASE_URL`. */
  readonly webhookBaseUrl: string;
  /** The provider API origin, from `MERCADOPAGO_API_BASE_URL`. */
  readonly apiBaseUrl: string;
  /** Injected only so a test never reaches the network; the platform `fetch` is the default. */
  readonly fetch?: typeof fetch;
  /** Overridable so a test observes the timeout without waiting for it. */
  readonly timeoutMs?: number;
  readonly maxBodyBytes?: number;
  /** Overridable so a test observes the report without Nest's logger; the default warns once per failure. */
  readonly reportFailure?: MercadoPagoFailureReporter;
}

/** A signed notification header: the instant it claims and the digest, both already shape-checked. */
interface ParsedSignature {
  readonly timestamp: string;
  readonly digest: Buffer;
}

type HttpAnswer = { readonly ok: true; readonly body: unknown } | { readonly ok: false };

/** Releases a response body the adapter does not read, or a reader it gave up on. */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is already settled; nothing to release.
  }
}

/**
 * Reads at most `maxBytes` of a response body: the declared length is refused before a byte is read, and a body that
 * grows past the bound is cancelled. `null` means "too large to be a provider answer".
 */
async function readBoundedBody(response: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discardBody(response);
    return null;
  }

  const body = response.body;
  if (body === null) {
    return null;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

/** Whether the error is the abandoned request of the timeout, rather than a connection that never answered. */
function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first string a header carries; Express hands a repeated header over as an array. */
function headerValue(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string | null {
  for (const [headerName, value] of Object.entries(headers)) {
    if (headerName.toLowerCase() !== name) {
      continue;
    }
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      const first = value.find((entry) => typeof entry === "string");
      return typeof first === "string" ? first : null;
    }
    return null;
  }

  return null;
}

/** A non-empty string field of a provider answer, or null when it is absent or another type. */
function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** The JSON object a raw body holds, or null when it is not one; a delivery's body is never trusted blindly. */
function jsonObjectOf(rawBody: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The notification id the signature covers: the query value the provider sends, or the body's `data.id` when the query
 * carries none. An alphanumeric id is lower-cased, which is the manifest the provider signs (T1, S4).
 */
function notificationIdOf(request: WebhookRequest): string | null {
  const body = jsonObjectOf(request.rawBody);
  const fromBody = isRecord(body?.data) ? body.data.id : undefined;
  const raw =
    stringField(request.query["data.id"]) ??
    (typeof fromBody === "number" ? String(fromBody) : stringField(fromBody));

  if (raw === null) {
    return null;
  }

  return /[A-Za-z]/.test(raw) ? raw.toLowerCase() : raw;
}

/** The topic of a delivery, from the body the provider sends or the query the older notifications carry. */
function topicOf(request: WebhookRequest): string | null {
  const body = jsonObjectOf(request.rawBody);

  return (
    stringField(body?.type) ??
    stringField(body?.topic) ??
    stringField(request.query.type) ??
    stringField(request.query.topic)
  );
}

/**
 * Reads `ts=<unix>,v1=<hex>` in either order. Exactly one `ts` and one `v1` are required, and any other field is
 * refused: a provider that changes its scheme gets a new adapter rather than a lenient parser here.
 */
function parseSignature(header: string | null): ParsedSignature | null {
  if (header === null || header.length === 0) {
    return null;
  }

  let timestamp: string | null = null;
  let digest: Buffer | null = null;

  for (const entry of header.split(",")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      return null;
    }

    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();

    if (key === "ts" && timestamp === null) {
      if (!TIMESTAMP_PATTERN.test(value)) {
        return null;
      }
      timestamp = value;
      continue;
    }

    if (key === "v1" && digest === null) {
      if (!SHA256_HEX_PATTERN.test(value)) {
        return null;
      }
      digest = Buffer.from(value, "hex");
      continue;
    }

    return null;
  }

  return timestamp === null || digest === null ? null : { timestamp, digest };
}

/**
 * The seconds a signed timestamp names. Mercado Pago documents seconds; a value with 13 or more digits is a
 * millisecond clock, which the adapter accepts and reads as its own second (T1).
 */
function secondsOf(timestamp: string): number {
  const value = Number(timestamp);

  return timestamp.length >= MILLISECOND_TIMESTAMP_DIGITS ? Math.floor(value / 1_000) : value;
}

/**
 * Whether the header proves this exact notification came from the holder of the secret, recently enough to act on. The
 * manifest is the one Mercado Pago documents, including its trailing separator.
 */
function signatureMatches(input: {
  secret: string;
  dataId: string;
  requestId: string;
  signature: ParsedSignature;
  receivedAt: Date;
}): boolean {
  const age = Math.abs(
    Math.floor(input.receivedAt.getTime() / 1_000) - secondsOf(input.signature.timestamp),
  );
  if (age > MERCADOPAGO_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${input.signature.timestamp};`;
  const expected = createHmac("sha256", input.secret).update(manifest, "utf8").digest();

  // Both digests are 32 bytes by construction, so timingSafeEqual never throws here.
  return (
    expected.length === input.signature.digest.length &&
    timingSafeEqual(expected, input.signature.digest)
  );
}

/** The event type a provider status asks for; `null` is an authentic status this API does not act on (T1, S2). */
const STATUS_EVENT_TYPE: Readonly<Record<string, PaymentEventType | null>> = {
  approved: "paid",
  rejected: "failed",
  cancelled: "failed",
  refunded: "refunded",
  charged_back: "refunded",
  pending: null,
  authorized: null,
  in_process: null,
  in_mediation: null,
};

/** An amount in cents, or null when the provider reports something that is not exact cents (S4). */
function minorUnitsOf(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const cents = value * 100;
  const rounded = Math.round(cents);
  if (Math.abs(cents - rounded) > 1e-6) {
    return null;
  }

  return Number.isSafeInteger(rounded) && rounded >= 0 ? rounded : null;
}

/** The https checkout URL of a preference, or null when it is not one this API may redirect a browser to (S1). */
function checkoutRedirectUrlOf(value: unknown): string | null {
  const candidate = stringField(value);
  if (candidate === null) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  return url.protocol === "https:" && CHECKOUT_HOST_PATTERN.test(url.hostname) ? url.href : null;
}

/**
 * The id of one payment of a search answer, or null when it names none; the provider answers it as a number or a string.
 */
function paymentIdOf(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return stringField(value);
}

/** The provider statuses of a payment whose money already went back to the payer (S3). */
const ALREADY_REFUNDED_STATUSES: ReadonlySet<string> = new Set(["refunded", "charged_back"]);

/**
 * What a search answer for our external reference allows: the payment to refund, a payment the provider already
 * refunded, or nothing this API may act on (S3). An approved payment wins, because that is the one the refund is
 * asked of; only when the reference answers none does an already refunded one confirm the retried action (R4-001).
 */
type RefundTarget =
  | { readonly kind: "refund"; readonly paymentId: string }
  | { readonly kind: "already-refunded" }
  | null;

/** The refund target of a search answer, or null when it holds no payment this API may refund (S3, R4-001). */
function refundTargetOf(answer: unknown): RefundTarget {
  if (!isRecord(answer) || !Array.isArray(answer.results)) {
    return null;
  }

  let alreadyRefunded = false;

  for (const result of answer.results) {
    if (!isRecord(result)) {
      continue;
    }

    if (result.status === "approved") {
      const paymentId = paymentIdOf(result.id);
      if (paymentId !== null) {
        return { kind: "refund", paymentId };
      }
      continue;
    }

    if (typeof result.status === "string" && ALREADY_REFUNDED_STATUSES.has(result.status)) {
      alreadyRefunded = true;
    }
  }

  return alreadyRefunded ? { kind: "already-refunded" } : null;
}

/**
 * The instant the event one payment answer names happened (R3-001): an approval is stamped by `date_approved`, while a
 * refusal, a refund, and a chargeback happen later and are stamped by the payment's own last update — reading the
 * approval instant there would date a refund at the moment the charge happened. The creation instant is the last
 * deterministic fallback, and a payment that carries no usable instant is refused instead of (mis)dated.
 */
function occurredAtOf(
  payment: Record<string, unknown>,
  statusType: PaymentEventType,
): string | null {
  const candidates: readonly unknown[] =
    statusType === "paid"
      ? [payment.date_approved, payment.date_last_updated, payment.date_created]
      : [payment.date_last_updated, payment.date_created];

  for (const candidate of candidates) {
    if (isIsoInstant(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * The normalized event one payment answer names, `event: null` for an authentic status this API does not act on, or
 * null when the answer is not a payment this API can read. Nothing else of the answer is read (S4).
 */
function normalizePayment(payment: unknown, dataId: string): WebhookVerification | null {
  if (!isRecord(payment)) {
    return null;
  }

  const status = stringField(payment.status);
  if (status === null) {
    return null;
  }

  const statusType = STATUS_EVENT_TYPE[status];
  if (statusType === undefined || statusType === null) {
    return { ok: true, event: null };
  }

  const providerReference = stringField(payment.external_reference);
  const currency = stringField(payment.currency_id);
  const occurredAt = occurredAtOf(payment, statusType);
  const amountMinor = minorUnitsOf(payment.transaction_amount);

  if (
    providerReference === null ||
    currency === null ||
    occurredAt === null ||
    amountMinor === null
  ) {
    return null;
  }

  // The normalized event is validated by the same parser every adapter answers with, so a value this API cannot store
  // is refused here instead of reaching the intake.
  const event = parseNormalizedPaymentEvent({
    // The status is part of the id: two statuses of one payment are two deliveries, and a redelivery of one of them is
    // a duplicate (T1, S2).
    eventId: `${MERCADOPAGO_PROVIDER_KEY}-${dataId}-${status}`,
    type: statusType,
    providerReference,
    amountMinor,
    currency,
    occurredAt,
  });

  return event === null ? null : { ok: true, event };
}

/** The Mercado Pago adapter (S1, S2, S4): Checkout Pro, the signed notification, its re-read, and the refund. */
export class MercadoPagoPaymentProvider implements PaymentProvider {
  readonly key = MERCADOPAGO_PROVIDER_KEY;

  readonly #accessToken: string;
  readonly #webhookSecret: string;
  readonly #returnBaseUrl: string;
  readonly #webhookBaseUrl: string;
  readonly #apiBaseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #maxBodyBytes: number;
  readonly #reportFailure: MercadoPagoFailureReporter;

  constructor(options: MercadoPagoPaymentProviderOptions) {
    this.#accessToken = options.accessToken;
    this.#webhookSecret = options.webhookSecret;
    this.#returnBaseUrl = options.returnBaseUrl;
    this.#webhookBaseUrl = options.webhookBaseUrl;
    this.#apiBaseUrl = options.apiBaseUrl;
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? MERCADOPAGO_TIMEOUT_MS;
    this.#maxBodyBytes = options.maxBodyBytes ?? MERCADOPAGO_MAX_BODY_BYTES;
    this.#reportFailure = options.reportFailure ?? logMercadoPagoFailure;
  }

  /**
   * Opens one Checkout Pro preference (S1): one item at the snapshot amount in MXN, our payment id as the external
   * reference, the three return URLs, and the public webhook. The idempotency key is the server-generated one of the
   * intent, so a retried checkout asks for the same preference. The reference stored is our own payment id, the only
   * identifier both sides echo back.
   */
  async createCheckout(intent: CheckoutIntent): Promise<CheckoutSession> {
    if (intent.currency !== MERCADOPAGO_CURRENCY) {
      this.#report({
        event: "mercadopago-request-failed",
        operation: MERCADOPAGO_OPERATION.CREATE_CHECKOUT,
        category: MERCADOPAGO_FAILURE.UNSUPPORTED_CURRENCY,
      });
      throw new Error("Mercado Pago only charges MXN.");
    }

    const returnUrl = `${this.#returnBaseUrl}/cuenta/invitaciones/${intent.invitationId}/pago`;
    const answer = await this.#request(
      "/checkout/preferences",
      {
        method: "POST",
        headers: {
          ...this.#authorizationHeaders(),
          "Content-Type": "application/json",
          "X-Idempotency-Key": intent.idempotencyKey,
        },
        body: JSON.stringify({
          items: [
            {
              title: MERCADOPAGO_ITEM_TITLE,
              quantity: 1,
              // The snapshot in the smallest unit, as the decimal price the provider charges.
              unit_price: intent.amountMinor / 100,
              currency_id: MERCADOPAGO_CURRENCY,
            },
          ],
          external_reference: intent.paymentId,
          back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl },
          auto_return: "approved",
          notification_url: `${this.#webhookBaseUrl}/payments/webhooks/${MERCADOPAGO_PROVIDER_KEY}`,
        }),
      },
      MERCADOPAGO_OPERATION.CREATE_CHECKOUT,
    );

    const redirectUrl = answer.ok
      ? checkoutRedirectUrlOf(isRecord(answer.body) ? answer.body.init_point : undefined)
      : null;

    if (!answer.ok || redirectUrl === null) {
      if (answer.ok) {
        this.#report({
          event: "mercadopago-request-failed",
          operation: MERCADOPAGO_OPERATION.CREATE_CHECKOUT,
          category: MERCADOPAGO_FAILURE.INVALID_RESPONSE,
        });
      }
      throw new Error("Mercado Pago answered no usable checkout redirect.");
    }

    return { providerReference: intent.paymentId, redirectUrl };
  }

  /**
   * Verifies one notification and re-reads its payment (S2, S4): the signature covers the notification id, the request
   * id, and the timestamp, and only then is the payment fetched with the access token. A delivery that does not verify
   * answers `{ ok: false }` without reaching the provider; an authentic one that decides nothing answers
   * `event: null`; and a failed re-read answers `{ ok: false }`, so the provider sends it again instead of the API
   * pretending it handled it.
   */
  async verifyWebhook(request: WebhookRequest): Promise<WebhookVerification> {
    const dataId = notificationIdOf(request);
    const requestId = headerValue(request.headers, REQUEST_ID_HEADER);
    const signature = parseSignature(headerValue(request.headers, SIGNATURE_HEADER));

    if (
      dataId === null ||
      requestId === null ||
      signature === null ||
      !signatureMatches({
        secret: this.#webhookSecret,
        dataId,
        requestId,
        signature,
        receivedAt: request.receivedAt,
      })
    ) {
      return { ok: false };
    }

    const topic = topicOf(request);
    // A delivery that names no topic cannot be decided: it is refused exactly like the other malformed deliveries, so
    // the route answers 400 and the provider sends it again instead of the API dropping it silently (R4-002).
    if (topic === null) {
      return { ok: false };
    }

    if (topic.toLowerCase() !== MERCADOPAGO_PAYMENT_TOPIC) {
      return { ok: true, event: null };
    }

    const answer = await this.#request(
      `/v1/payments/${encodeURIComponent(dataId)}`,
      { method: "GET", headers: this.#authorizationHeaders() },
      MERCADOPAGO_OPERATION.FETCH_PAYMENT,
    );

    if (!answer.ok) {
      return { ok: false };
    }

    const verification = normalizePayment(answer.body, dataId);
    if (verification === null) {
      this.#report({
        event: "mercadopago-request-failed",
        operation: MERCADOPAGO_OPERATION.FETCH_PAYMENT,
        category: MERCADOPAGO_FAILURE.INVALID_RESPONSE,
      });
      return { ok: false };
    }

    return verification;
  }

  /**
   * Asks for a full refund of the approved payment of one of ours (S3): the search finds it by our external reference,
   * and the refund request carries the idempotency key of the admin action and no amount, so it is the whole payment.
   * A payment the search already shows as refunded answers the same success without asking for it again, so a retried
   * admin action confirms the refund that landed instead of failing (R4-001). Accepting it changes no stored state: the
   * payment moves only from the verified notification that follows.
   */
  async refund(providerReference: string, idempotencyKey: string): Promise<RefundResult> {
    const search = await this.#request(
      `/v1/payments/search?external_reference=${encodeURIComponent(providerReference)}`,
      { method: "GET", headers: this.#authorizationHeaders() },
      MERCADOPAGO_OPERATION.REFUND,
    );

    const target = search.ok ? refundTargetOf(search.body) : null;
    if (!search.ok || target === null) {
      if (search.ok) {
        this.#report({
          event: "mercadopago-request-failed",
          operation: MERCADOPAGO_OPERATION.REFUND,
          category: MERCADOPAGO_FAILURE.INVALID_RESPONSE,
        });
      }
      return { ok: false };
    }

    if (target.kind === "already-refunded") {
      return { ok: true };
    }

    const refund = await this.#request(
      `/v1/payments/${encodeURIComponent(target.paymentId)}/refunds`,
      {
        method: "POST",
        headers: {
          ...this.#authorizationHeaders(),
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: "{}",
      },
      MERCADOPAGO_OPERATION.REFUND,
    );

    return refund.ok ? { ok: true } : { ok: false };
  }

  /** The one header every request carries; the token never reaches a report, an answer, or a log. */
  #authorizationHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.#accessToken}`, Accept: "application/json" };
  }

  /**
   * One bounded, unredirected request to the provider API. A status outside 2xx, a body that grows past the bound, an
   * answer that is not JSON, a timeout, and a network failure each report one category and answer `ok: false`.
   */
  async #request(
    path: string,
    init: RequestInit,
    operation: MercadoPagoOperation,
  ): Promise<HttpAnswer> {
    let text: string | null;

    try {
      const response = await this.#fetch(`${this.#apiBaseUrl}${path}`, {
        ...init,
        // A redirect would leave the configured origin, so an answer that is not its own 2xx is nothing.
        redirect: "error",
        signal: AbortSignal.timeout(this.#timeoutMs),
      });

      if (response.status < HTTP_OK_MINIMUM || response.status > HTTP_OK_MAXIMUM) {
        await discardBody(response);
        this.#report({
          event: "mercadopago-request-failed",
          operation,
          category: MERCADOPAGO_FAILURE.HTTP_STATUS,
          status: response.status,
        });
        return { ok: false };
      }

      text = await readBoundedBody(response, this.#maxBodyBytes);
    } catch (error) {
      this.#report({
        event: "mercadopago-request-failed",
        operation,
        category: isTimeout(error) ? MERCADOPAGO_FAILURE.TIMEOUT : MERCADOPAGO_FAILURE.NETWORK,
      });
      return { ok: false };
    }

    if (text === null) {
      this.#report({
        event: "mercadopago-request-failed",
        operation,
        category: MERCADOPAGO_FAILURE.BODY_REJECTED,
      });
      return { ok: false };
    }

    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      this.#report({
        event: "mercadopago-request-failed",
        operation,
        category: MERCADOPAGO_FAILURE.INVALID_JSON,
      });
      return { ok: false };
    }
  }

  /** One structured warning per failure; the reporter never receives a body, a token, or a payer datum. */
  #report(failure: MercadoPagoFailure): void {
    this.#reportFailure(failure);
  }
}
