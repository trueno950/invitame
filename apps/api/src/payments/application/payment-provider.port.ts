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
  /** The instant the API received the request; the adapter's timestamp tolerance is measured against it. */
  receivedAt: Date;
}

/**
 * The outcome of verifying a webhook. A refusal carries no detail, so the route can never tell a caller whether the
 * signature was missing, stale, or forged (S4).
 */
export type WebhookVerification =
  | { readonly ok: true; readonly event: NormalizedPaymentEvent }
  | { readonly ok: false };

/** The provider port. One adapter per mode that charges; `free` binds an adapter that refuses to charge. */
export interface PaymentProvider {
  /** The stable adapter key, stored in `Payment.provider` and compared with the webhook route's `:provider`. */
  readonly key: string;

  /** Opens (or re-opens, under the same idempotency key) the checkout of one stored payment. */
  createCheckout(intent: CheckoutIntent): Promise<CheckoutSession>;

  /**
   * Verifies the signature of one delivery and parses its normalized event. It answers `{ ok: false }` for
   * anything it cannot verify or parse, and never throws for a bad request.
   */
  verifyWebhook(request: WebhookRequest): WebhookVerification;
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
