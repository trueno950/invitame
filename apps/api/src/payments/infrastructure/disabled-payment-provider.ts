import { PaymentsDisabledError } from "../application/payment.errors";
import type {
  CheckoutIntent,
  CheckoutSession,
  PaymentProvider,
  WebhookVerification,
} from "../application/payment-provider.port";

// The adapter a `free` deployment binds (M7 S4). It exists so `PAYMENT_PROVIDER` is always bound and no code path
// has to branch on "there is no provider": the use case refuses a checkout before reaching it, and any delivery to
// the webhook route answers 404 because the path never names this key. It has no secret, no reference, and no
// network, and it never charges anything.

/** The key of a deployment that sells no payment; it matches no webhook route, which is the point. */
export const NO_PAYMENT_PROVIDER_KEY = "none";

export class DisabledPaymentProvider implements PaymentProvider {
  readonly key = NO_PAYMENT_PROVIDER_KEY;

  async createCheckout(_intent: CheckoutIntent): Promise<CheckoutSession> {
    throw new PaymentsDisabledError();
  }

  verifyWebhook(): WebhookVerification {
    return { ok: false };
  }
}
