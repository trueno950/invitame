import type { PaymentEventType } from "../domain/payment";

// The provider port (M7 S1, S4). Everything that talks to a payment provider sits behind this one interface: the
// application never sees a provider's own status names, its payload shape, its signature scheme, or its ids as
// anything but an opaque reference. The `simulated` adapter implements it for development and test, and a real
// provider adapter is one more implementation of it plus one configuration value — no use case changes.

/** What the adapter needs to open a checkout for one stored payment. */
export interface CheckoutIntent {
  /** The `Payment` row the checkout belongs to; the adapter may use it as its own reference. */
  paymentId: string;
  invitationId: string;
  /** The snapshot taken at checkout, in the smallest currency unit. The provider must charge exactly this. */
  amountMinor: number;
  currency: string;
  /** The server-generated key of this intent, so a retried request asks for the same session. */
  idempotencyKey: string;
}

/** What a created checkout answers: the provider's reference and the URL the browser is sent to. */
export interface CheckoutSession {
  providerReference: string;
  redirectUrl: string;
}

/**
 * A provider event normalized to the domain's vocabulary (S4). Every adapter must map its payload to exactly these
 * fields: no provider status name, payload key, or customer datum crosses this boundary.
 */
export interface NormalizedPaymentEvent {
  /** The provider's own event id; `(provider, eventId)` is unique, so a replayed delivery inserts nothing. */
  eventId: string;
  type: PaymentEventType;
  /** The provider's reference of the checkout this event is about. */
  providerReference: string;
  amountMinor: number;
  currency: string;
  /** When the provider says it happened; validated, not trusted for `paidAt`. */
  occurredAt: Date;
}

/** The request values an adapter verifies. `rawBody` is the exact bytes the provider signed. */
export interface WebhookRequest {
  rawBody: string;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  /**
   * The query string the delivery carried, one value per name (the first, when a name repeats). Mercado Pago signs
   * the notification id it sends there, so the adapter has to see it exactly as the API parsed it (T1, S4).
   */
  query: Readonly<Record<string, string>>;
  /** The instant the API received the request; the adapter's timestamp tolerance is measured against it. */
  receivedAt: Date;
}

/**
 * The outcome of verifying a webhook. A refusal carries no detail, so the route can never tell a caller whether the
 * signature was missing, stale, or forged (S4).
 *
 * The third answer is a delivery the adapter proved authentic but that decides nothing: another notification topic,
 * or a payment status the domain does not map. `event: null` answers 200 so the provider stops retrying, and writes
 * nothing — it is not the same answer as a forged delivery, which is refused (T1, S4). A delivery that names no topic
 * at all is malformed rather than undecided, so it is refused like any other unverifiable one and can be retried.
 */
export type WebhookVerification =
  | { readonly ok: true; readonly event: NormalizedPaymentEvent }
  | { readonly ok: true; readonly event: null }
  | { readonly ok: false };

/** What a refund answers: the provider accepted a full refund, or it did not (T1, S3). */
export type RefundResult =
  | { readonly ok: true }
  /** The provider refused it or could not be reached; nothing was asked of it twice, and nothing changed. */
  | { readonly ok: false };

/**
 * The provider port. One adapter per mode that charges; `free` binds an adapter that refuses to charge. Neither
 * method ever reports a provider payload: the adapter maps its own vocabulary to these answers.
 */
export interface PaymentProvider {
  /** The stable adapter key, stored in `Payment.provider` and compared with the webhook route's `:provider`. */
  readonly key: string;

  /** Opens (or re-opens, under the same idempotency key) the checkout of one stored payment. */
  createCheckout(intent: CheckoutIntent): Promise<CheckoutSession>;

  /**
   * Verifies the signature of one delivery and parses its normalized event, or answers `event: null` for an authentic
   * delivery that decides nothing. It answers `{ ok: false }` for anything it cannot verify or parse, and never throws
   * for a bad request. It is asynchronous because a real provider is verified against configuration and, for the
   * event itself, against the provider's own API (T1, S2, S4).
   */
  verifyWebhook(request: WebhookRequest): Promise<WebhookVerification>;

  /**
   * Asks the provider for a full refund of one payment of ours (T1, S3). `providerReference` is the reference stored at
   * checkout and `idempotencyKey` makes a retried request the same refund. A provider that already refunded that
   * payment answers the same success without a second refund request, so a retried action confirms the refund instead
   * of failing. Accepting a refund changes nothing by itself: the payment moves only from the verified notification
   * that follows, so no admin click is a payment state.
   */
  refund(providerReference: string, idempotencyKey: string): Promise<RefundResult>;
}

export const PAYMENT_PROVIDER = Symbol("PaymentProvider");

/**
 * The development-only facet of the simulated adapter (M7 S4): it builds one normalized event for a stored payment
 * and signs it exactly as a provider would. It is a separate interface so no production code path can reach it
 * through the provider port, and the emit use case refuses unless the bound provider implements it *and* the
 * deployment runs `simulated`.
 */
export interface SimulatedWebhookEmitter {
  /** The signed raw body and headers of one simulated delivery, ready for the public intake. */
  buildEvent(input: {
    payment: {
      id: string;
      amountMinor: number;
      currency: string;
      providerReference: string | null;
    };
    type: "paid" | "failed";
    at: Date;
  }): { rawBody: string; headers: Record<string, string> };
}

/** Whether a bound provider can emit simulated events. */
export function isSimulatedEmitter(
  provider: PaymentProvider,
): provider is PaymentProvider & SimulatedWebhookEmitter {
  return typeof (provider as Partial<SimulatedWebhookEmitter>).buildEvent === "function";
}
