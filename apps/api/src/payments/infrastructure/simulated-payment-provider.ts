import { parseNormalizedPaymentEvent } from "../application/normalized-payment-event";
import type {
  CheckoutIntent,
  CheckoutSession,
  NormalizedPaymentEvent,
  PaymentProvider,
  RefundResult,
  SimulatedWebhookEmitter,
  WebhookRequest,
  WebhookVerification,
} from "../application/payment-provider.port";
import {
  SIMULATED_SIGNATURE_HEADER,
  signSimulatedWebhook,
  verifySimulatedSignature,
} from "./simulated-signature";

// The development and test provider (M7 S4). It has no account and no network: the checkout redirects to the web's
// simulated page, and the event that page asks for is signed here and posted to the API's real webhook route, so the
// whole intake — signature, event row, transaction, transition — runs exactly as it will with a real provider. Its
// secret is a configuration value and is never logged, echoed, or returned; production refuses this mode at startup.

/** The adapter key stored in `Payment.provider` and compared with the webhook route's `:provider`. */
export const SIMULATED_PROVIDER_KEY = "simulated";

/**
 * Where the web's simulated page lives under `PAYMENTS_RETURN_BASE_URL`: inside the owner's account, under the
 * invitation it pays for, so the page is behind the account session and can send the owner back to that invitation's
 * payment page. The web owns the page, the API the URL.
 */
function simulatedPagePath(invitationId: string, paymentId: string): string {
  return `/cuenta/invitaciones/${invitationId}/pago/simulado/${paymentId}`;
}

export interface SimulatedPaymentProviderOptions {
  /** HMAC key of the signature scheme; never logged, echoed, or returned. */
  secret: string;
  /** The web origin the redirect points at, from `PAYMENTS_RETURN_BASE_URL`. */
  returnBaseUrl: string;
}

export class SimulatedPaymentProvider implements PaymentProvider, SimulatedWebhookEmitter {
  readonly key = SIMULATED_PROVIDER_KEY;

  constructor(private readonly options: SimulatedPaymentProviderOptions) {}

  /**
   * The reference is derived from the payment row, so a repeated checkout under the same idempotency key answers the
   * same reference, exactly as a provider's idempotent session creation does. The redirect is the web's simulated
   * page: nothing about the payment is in the URL but its own id and its invitation's, which the owner already owns.
   */
  async createCheckout(intent: CheckoutIntent): Promise<CheckoutSession> {
    return {
      providerReference: `${SIMULATED_PROVIDER_KEY}-${intent.paymentId}`,
      redirectUrl: `${this.options.returnBaseUrl}${simulatedPagePath(intent.invitationId, intent.paymentId)}`,
    };
  }

  /** Verifies the HMAC-SHA256 signature and parses the normalized body; any failure answers `{ ok: false }`. */
  async verifyWebhook(request: WebhookRequest): Promise<WebhookVerification> {
    const header = request.headers[SIMULATED_SIGNATURE_HEADER];
    const verified = verifySimulatedSignature({
      secret: this.options.secret,
      rawBody: request.rawBody,
      header,
      now: request.receivedAt,
    });
    if (!verified) {
      return { ok: false };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(request.rawBody);
    } catch {
      return { ok: false };
    }

    const event = parseNormalizedPaymentEvent(payload);

    return event === null ? { ok: false } : { ok: true, event };
  }

  /**
   * The simulated provider refunds nothing, because there is nothing to refund: it answers ok so the development
   * flow can exercise the admin refund path end to end, and it emits no event — the payment state does not move from
   * a refund request, here or with a real provider (T1, S3).
   */
  async refund(_providerReference: string, _idempotencyKey: string): Promise<RefundResult> {
    return { ok: true };
  }

  /**
   * Builds and signs one event body for the development emit (S4). The event id is derived from the payment and the
   * outcome, so emitting the same outcome twice is a replayed delivery the intake answers as a duplicate.
   */
  buildEvent(input: {
    payment: {
      id: string;
      amountMinor: number;
      currency: string;
      providerReference: string | null;
    };
    type: "paid" | "failed";
    at: Date;
  }): { rawBody: string; headers: Record<string, string> } {
    const event: NormalizedPaymentEvent = {
      eventId: `${this.key}-${input.payment.id}-${input.type}`,
      type: input.type,
      providerReference: input.payment.providerReference ?? `${this.key}-${input.payment.id}`,
      amountMinor: input.payment.amountMinor,
      currency: input.payment.currency,
      occurredAt: input.at,
    };
    const rawBody = JSON.stringify(event);
    const timestamp = Math.floor(input.at.getTime() / 1000);

    return {
      rawBody,
      headers: {
        "content-type": "application/json",
        [SIMULATED_SIGNATURE_HEADER]: signSimulatedWebhook({
          secret: this.options.secret,
          rawBody,
          timestamp,
        }),
      },
    };
  }
}
