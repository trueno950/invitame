import type { PaymentSnapshot, PaymentStatus } from "./payment";

// The publication entitlement rule (M7 S1, S3, S4). Milestone 5's gate answered "no payment required" for every
// publication; this rule replaces that answer in every mode that charges. It is pure, so the publication gate, the
// checkout use case, and the owner's payment read all state one rule instead of three that could drift.

/** Why a publication still needs money; the same codes the gate reports to the client. */
export const PAYMENT_REQUIRED_REASON = {
  /** The package has a current price and no verified paid payment covers it. */
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  /** The catalog could not answer the package's current price, so the API cannot grant publication for free. */
  PAYMENT_PRICE_UNAVAILABLE: "PAYMENT_PRICE_UNAVAILABLE",
} as const;

export type PaymentRequiredReason =
  (typeof PAYMENT_REQUIRED_REASON)[keyof typeof PAYMENT_REQUIRED_REASON];

/** The paid statuses a payment list is read from; only the status and the package matter to the rule. */
export interface EntitlementPayment {
  packageId: string;
  status: PaymentStatus;
}

export type PaymentEntitlement =
  | { readonly paid: true }
  | { readonly paid: false; readonly reason: PaymentRequiredReason };

/**
 * Whether the verified backend state already covers this invitation's publication. A package whose current price
 * is zero is free, so no payment is due (S4). Otherwise the invitation needs a `paid` payment for itself *and the
 * same package*: a payment made for a package the invitation no longer uses never grants publication, so a package
 * change cannot silently keep a payment it did not buy (S4). A missing price fails closed, because "the catalog
 * cannot tell me" is not "free" (S1).
 */
export function paymentEntitlement(input: {
  price: PaymentSnapshot | null;
  packageId: string;
  payments: readonly EntitlementPayment[];
}): PaymentEntitlement {
  if (input.price === null) {
    return { paid: false, reason: PAYMENT_REQUIRED_REASON.PAYMENT_PRICE_UNAVAILABLE };
  }

  if (input.price.amountMinor === 0) {
    return { paid: true };
  }

  const covered = input.payments.some(
    (payment) => payment.status === "paid" && payment.packageId === input.packageId,
  );

  return covered
    ? { paid: true }
    : { paid: false, reason: PAYMENT_REQUIRED_REASON.PAYMENT_REQUIRED };
}
