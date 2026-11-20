// The refusals of the payment application layer (M7 S1, S4). Each one is a distinct answer the presentation maps to
// one stable code: a webhook the signature does not prove is a 400 that says nothing, a state conflict is a 409, an
// invisible resource is a 404, and a provider that could not be reached is a 503. None of them carries a provider
// payload, a signature, a secret, an amount, or an owner.

/**
 * The delivery did not pass the provider's signature check, or its body was not the normalized event shape. One
 * error for every case: missing, stale, forged, and malformed are indistinguishable to the caller (S4).
 */
export class PaymentWebhookRejectedError extends Error {
  constructor() {
    super("The payment webhook was rejected.");
    this.name = "PaymentWebhookRejectedError";
  }
}

/** The route names a provider this deployment does not configure. */
export class PaymentProviderNotFoundError extends Error {
  constructor() {
    super("The payment provider is not configured.");
    this.name = "PaymentProviderNotFoundError";
  }
}

/** This deployment sells no payment (`PAYMENTS_MODE=free`), so no checkout exists to open. */
export class PaymentsDisabledError extends Error {
  constructor() {
    super("Payments are disabled in this deployment.");
    this.name = "PaymentsDisabledError";
  }
}

/** The simulated provider can only be asked to emit an event while the deployment runs it (S4). */
export class PaymentsSimulationDisabledError extends Error {
  constructor() {
    super("The simulated payment provider is not enabled in this deployment.");
    this.name = "PaymentsSimulationDisabledError";
  }
}

/** The package's current price is 0, so there is nothing to charge and no payment to create (S4). */
export class PaymentNotRequiredError extends Error {
  constructor() {
    super("This package requires no payment.");
    this.name = "PaymentNotRequiredError";
  }
}

/** The catalog could not answer the package's current price; a checkout cannot invent one (S4). */
export class PaymentPriceUnavailableError extends Error {
  constructor() {
    super("The package has no current price.");
    this.name = "PaymentPriceUnavailableError";
  }
}

/** A verified paid payment already covers this invitation's current package. */
export class PaymentAlreadyPaidError extends Error {
  constructor() {
    super("This invitation is already paid.");
    this.name = "PaymentAlreadyPaidError";
  }
}

/**
 * The invitation carries a payment for another package than the one it uses now (S4). The database forbids changing
 * a pinned package at all, so this state can only come from an out-of-band repair; refusing here is what keeps a
 * paid payment from being silently lost or reused for something it did not buy.
 */
export class InvitationPackageLockedByPaymentError extends Error {
  constructor() {
    super("The invitation has a payment for another package.");
    this.name = "InvitationPackageLockedByPaymentError";
  }
}

/** The payment named by a simulated emit does not exist, or belongs to another owner (no oracle, A4). */
export class PaymentNotFoundError extends Error {
  constructor() {
    super("The payment was not found.");
    this.name = "PaymentNotFoundError";
  }
}

/** The provider adapter failed; nothing about the attempt is trusted, and the request may be retried. */
export class PaymentProviderUnavailableError extends Error {
  constructor() {
    super("The payment provider is unavailable.");
    this.name = "PaymentProviderUnavailableError";
  }
}

/**
 * The payment exists but is not in the one state a refund starts from (`paid`), or it has no provider reference
 * to refund (T2, S3). One error for both: from outside, neither state is refundable and the answer is the same 409.
 */
export class PaymentNotRefundableError extends Error {
  constructor() {
    super("The payment is not refundable.");
    this.name = "PaymentNotRefundableError";
  }
}

/**
 * The refund rule «Sin reembolso tras publicar» (T2, S3): an invitation that was ever published is refused, even
 * after it returned to DRAFT or was archived. The payments module owns this error because the rule belongs to the
 * refund, not to the invitation lifecycle.
 */
export class PaymentInvitationAlreadyPublishedError extends Error {
  constructor() {
    super("The invitation has already been published.");
    this.name = "PaymentInvitationAlreadyPublishedError";
  }
}
