import { createHash } from "node:crypto";

import { decidePaymentEvent, type PaymentEventOutcome } from "../domain/payment";
import { PaymentProviderNotFoundError, PaymentWebhookRejectedError } from "./payment.errors";
import type { PaymentEventTransaction, PaymentRepository } from "./payment.repository";
import type { PaymentProvider } from "./payment-provider.port";
// The verified webhook intake (M7 S1, S4). This is the only path that changes a payment's status, and it is reached
// from the public route and from the development emit alike. In order: the route's provider must be the configured
// one, the adapter must verify the signature over the raw body and the query it signs, the event row and the
// transition must be written in one transaction, and a duplicate `(provider, eventId)` must change nothing. The raw
// payload is hashed, never stored: a provider payload can carry a payer's name or card metadata, and the normalized
// event plus the digest is what a replay investigation needs. A delivery the adapter proves authentic but that
// decides nothing answers `ignored` with 200, so the provider stops retrying, and writes nothing (T1).

/** What the intake answered: it stored and applied the event, it was already stored, or there was nothing to act on. */
export interface PaymentWebhookResult {
  outcome: "processed" | "duplicate" | "ignored";
}

export class HandlePaymentWebhookUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly provider: PaymentProvider,
  ) {}

  async execute(input: {
    provider: string;
    rawBody: string;
    headers: Readonly<Record<string, string | string[] | undefined>>;
    /** The parsed query of the delivery; an internal caller (the simulated emit) carries none. */
    query?: Readonly<Record<string, string>>;
    receivedAt: Date;
  }): Promise<PaymentWebhookResult> {
    // A route that names another provider is not a request this deployment can verify, and it never reaches the
    // adapter: an unknown provider cannot be answered with a signature check it does not implement.
    if (input.provider !== this.provider.key) {
      throw new PaymentProviderNotFoundError();
    }

    const verification = await this.provider.verifyWebhook({
      rawBody: input.rawBody,
      headers: input.headers,
      query: input.query ?? {},
      receivedAt: input.receivedAt,
    });
    // One refusal for a missing header, a stale timestamp, a forged signature, and a malformed body: the caller
    // learns nothing about which check failed (S4).
    if (!verification.ok) {
      throw new PaymentWebhookRejectedError();
    }

    // Authentic, but it names nothing this API acts on (another topic, an unmapped status): 200 and no write.
    if (verification.event === null) {
      return { outcome: "ignored" };
    }

    const event = verification.event;
    const payloadSha256 = createHash("sha256").update(input.rawBody, "utf8").digest("hex");

    return this.payments.transaction(async (transaction) => {
      const payment = await transaction.findPaymentByProviderReference(
        this.provider.key,
        event.providerReference,
      );

      // The rule is decided from the row this transaction read; the guarded update below is what actually moves
      // the payment, so a concurrent delivery cannot be overwritten.
      const decision = decidePaymentEvent({ payment, event });

      const inserted = await transaction.insertEvent({
        paymentId: payment?.id ?? null,
        provider: this.provider.key,
        providerEventId: event.eventId,
        type: event.type,
        receivedAt: input.receivedAt,
        payloadSha256,
        outcome: decision.outcome,
      });

      // A retried or replayed delivery has already been decided: nothing is written and the route answers 200.
      if (!inserted.created) {
        return { outcome: "duplicate" };
      }

      const outcome = await this.apply(transaction, payment, decision, input.receivedAt);

      await transaction.completeEvent({
        eventId: inserted.eventId,
        paymentId: payment?.id ?? null,
        outcome,
        processedAt: input.receivedAt,
      });

      return { outcome: "processed" };
    });
  }

  /**
   * Applies the decided transition, and answers what the event row should record. A guarded update that changes no
   * row means a concurrent delivery moved the payment first; the event is then recorded as an ignored transition
   * instead of pretending it applied, and the payment keeps whatever the winning delivery stored (S4).
   */
  private async apply(
    transaction: PaymentEventTransaction,
    payment: { id: string } | null,
    decision: ReturnType<typeof decidePaymentEvent>,
    receivedAt: Date,
  ): Promise<PaymentEventOutcome> {
    if (payment === null) {
      return decision.outcome;
    }

    if (decision.outcome !== "applied") {
      return decision.outcome;
    }

    const applied = await transaction.transition({
      paymentId: payment.id,
      from: decision.from,
      to: decision.to,
      at: receivedAt,
    });

    return applied ? decision.outcome : "ignored_transition";
  }
}
