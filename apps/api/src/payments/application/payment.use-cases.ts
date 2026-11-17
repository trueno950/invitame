import { randomUUID } from "node:crypto";

import { PAYMENTS_MODE, type PaymentsMode } from "../../config/environment";
import { assertEditable } from "../../invitations/domain/invitation-lifecycle";
import { PAYMENT_STATUS, type PaymentStatus } from "../domain/payment";
import { paymentEntitlement } from "../domain/payment-entitlement";
import {
  InvitationPackageLockedByPaymentError,
  PaymentAlreadyPaidError,
  PaymentNotFoundError,
  PaymentNotRequiredError,
  PaymentPriceUnavailableError,
  PaymentProviderUnavailableError,
  PaymentsDisabledError,
  PaymentsSimulationDisabledError,
} from "./payment.errors";
import type { PaymentRecord, PaymentRepository } from "./payment.repository";
import type { PaymentCatalog } from "./payment-catalog";
import {
  type CheckoutIntent,
  type CheckoutSession,
  isSimulatedEmitter,
  type PaymentProvider,
} from "./payment-provider.port";
import type { HandlePaymentWebhookUseCase, PaymentWebhookResult } from "./payment-webhook.use-case";

// The payment use cases (M7 S1, S3, S4). Checkout copies the package's price into the payment row and never reads it
// again, so a later catalog change cannot move what the owner was quoted. The webhook intake is the only path that
// changes a payment's status, and every delivery passes the provider's signature first. The simulated emit exists so
// the development flow exercises that same intake instead of writing a status directly.

/** What a checkout answers: the payment, the provider's redirect, and the snapshot the owner will pay. */
export interface CheckoutResult {
  paymentId: string;
  redirectUrl: string;
  amountMinor: number;
  currency: string;
}

/** What the owner's payment read answers; every field is a fact the backend holds (S4). */
export interface InvitationPaymentStatus {
  paymentRequired: boolean;
  status: PaymentStatus | null;
  amountMinor: number | null;
  currency: string | null;
  paidAt: Date | null;
}

/**
 * Starts (or resumes) the checkout of one owned invitation (M7 S4). The owner comes from the session, so an
 * invitation of another customer answers null exactly like an unknown id (A4, S9). A free deployment sells nothing
 * and refuses. An archived invitation is read-only and refuses like every other write. A package whose price is 0
 * needs no payment, and a package the catalog cannot price refuses instead of inventing an amount. An invitation
 * that already has a verified paid payment refuses a second one, and a paid payment made for another package
 * refuses too: the money is never silently reused or lost (S4). One pending payment is created or reused, so a
 * repeated checkout, a doubled click, and two simultaneous requests all answer the same row and the same snapshot.
 */
export class StartCheckoutUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly catalog: PaymentCatalog,
    private readonly provider: PaymentProvider,
    private readonly mode: PaymentsMode,
    /**
     * The server-generated idempotency key of one intent (S4). Injected so a test can observe the key the provider
     * receives; production draws it from the platform's cryptographic random source.
     */
    private readonly nextIdempotencyKey: () => string = () => randomUUID(),
  ) {}

  async execute(input: { ownerId: string; invitationId: string }): Promise<CheckoutResult | null> {
    if (this.mode === PAYMENTS_MODE.FREE) {
      throw new PaymentsDisabledError();
    }

    const invitation = await this.payments.findOwnedInvitation(input.ownerId, input.invitationId);
    if (invitation === null) {
      return null;
    }
    assertEditable(invitation.status);

    const price = await this.catalog.findCurrentPackagePrice(invitation.packageId);
    if (price === null) {
      throw new PaymentPriceUnavailableError();
    }
    if (price.amountMinor === 0) {
      throw new PaymentNotRequiredError();
    }

    const existing = await this.payments.listForInvitation(invitation.id);
    assertNoForeignPackagePayment(existing, invitation.packageId);
    if (
      existing.some(
        (payment) =>
          payment.status === PAYMENT_STATUS.PAID && payment.packageId === invitation.packageId,
      )
    ) {
      throw new PaymentAlreadyPaidError();
    }

    const pending = existing.find(
      (payment) =>
        payment.status === PAYMENT_STATUS.PENDING && payment.packageId === invitation.packageId,
    );
    const payment =
      pending ??
      (await this.payments.createOrReusePending({
        invitationId: invitation.id,
        packageId: invitation.packageId,
        // The snapshot: the amount and currency in force right now, stored once and never re-read (S4).
        amountMinor: price.amountMinor,
        currency: price.currency,
        provider: this.provider.key,
        idempotencyKey: this.nextIdempotencyKey(),
      }));

    const intent: CheckoutIntent = {
      paymentId: payment.id,
      invitationId: payment.invitationId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      idempotencyKey: payment.idempotencyKey,
    };

    let session: CheckoutSession;
    try {
      session = await this.provider.createCheckout(intent);
    } catch {
      // The provider's message is never echoed: it can name a key, an account, or a card. The pending row stays,
      // without a reference, so a retry asks for the same intent under the same idempotency key.
      throw new PaymentProviderUnavailableError();
    }

    if (payment.providerReference === null) {
      await this.payments.attachProviderReference(
        payment.id,
        this.provider.key,
        session.providerReference,
      );
    }

    return {
      paymentId: payment.id,
      redirectUrl: session.redirectUrl,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
    };
  }
}

/**
 * The owner's view of one invitation's payment (M7 S4): what the web panel and the return page render. `paymentRequired`
 * comes from the same entitlement rule the publication gate asks, so the panel can never say "paid" while the gate
 * still refuses to publish. Nothing here comes from a query parameter or from the browser (S1).
 */
export class GetInvitationPaymentUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly catalog: PaymentCatalog,
    private readonly mode: PaymentsMode,
  ) {}

  async execute(input: {
    ownerId: string;
    invitationId: string;
  }): Promise<InvitationPaymentStatus | null> {
    const invitation = await this.payments.findOwnedInvitation(input.ownerId, input.invitationId);
    if (invitation === null) {
      return null;
    }

    if (this.mode === PAYMENTS_MODE.FREE) {
      // Nothing is sold: the same answer the gate gives, without reading the catalog or the payments.
      return {
        paymentRequired: false,
        status: null,
        amountMinor: null,
        currency: null,
        paidAt: null,
      };
    }

    const [price, payments] = await Promise.all([
      this.catalog.findCurrentPackagePrice(invitation.packageId),
      this.payments.listForInvitation(invitation.id),
    ]);

    const current = payments.find((payment) => payment.packageId === invitation.packageId) ?? null;
    const decision = paymentEntitlement({
      price,
      packageId: invitation.packageId,
      payments,
    });

    return {
      paymentRequired: !decision.paid,
      status: current?.status ?? null,
      // The stored snapshot wins over the catalog, so the page shows what the owner will actually pay (S4).
      amountMinor: current?.amountMinor ?? price?.amountMinor ?? null,
      currency: current?.currency ?? price?.currency ?? null,
      paidAt: current?.paidAt ?? null,
    };
  }
}

/**
 * The development-only emit (M7 S4). It builds a normalized event for one of the owner's payments, signs it with the
 * simulated adapter, and hands the signed body to the same intake the public webhook route uses — so development
 * exercises the real verification and the real transaction instead of writing a status. The event id is derived from
 * the payment and the outcome, so pressing the button twice is a duplicate no-op. It refuses in every mode but
 * `simulated`, and it reads the payment with the owner in the query, so a foreign payment answers 404 (A4).
 */
export class EmitSimulatedPaymentUseCase {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly provider: PaymentProvider,
    private readonly mode: PaymentsMode,
    private readonly webhook: HandlePaymentWebhookUseCase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: {
    ownerId: string;
    paymentId: string;
    outcome: "paid" | "failed";
  }): Promise<PaymentWebhookResult> {
    if (this.mode !== PAYMENTS_MODE.SIMULATED || !isSimulatedEmitter(this.provider)) {
      throw new PaymentsSimulationDisabledError();
    }

    const payment = await this.payments.findOwnedPayment(input.ownerId, input.paymentId);
    if (payment === null) {
      throw new PaymentNotFoundError();
    }

    const at = this.now();
    const { rawBody, headers } = this.provider.buildEvent({
      payment,
      type: input.outcome,
      at,
    });

    return this.webhook.execute({
      provider: this.provider.key,
      rawBody,
      headers,
      receivedAt: at,
    });
  }
}

/**
 * The "package change" guard (M7 S4). An invitation pins its package when it is created and the database trigger
 * `Invitation_pinned_fields_immutable` refuses to change it, so this state cannot be produced by the API. It is
 * still refused here — with its own code — because the alternative would be to charge again or to let a paid payment
 * for one package grant another, which is exactly what S4 forbids.
 */
function assertNoForeignPackagePayment(
  payments: readonly PaymentRecord[],
  packageId: string,
): void {
  const foreign = payments.find(
    (payment) => payment.packageId !== packageId && payment.status === PAYMENT_STATUS.PAID,
  );

  if (foreign !== undefined) {
    throw new InvitationPackageLockedByPaymentError();
  }
}
