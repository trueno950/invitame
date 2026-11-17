import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PAYMENT_STATUS } from "./payment";
import { PAYMENT_REQUIRED_REASON, paymentEntitlement } from "./payment-entitlement";

// The entitlement rule (M7 S1, S3, S4): publication is granted only from a verified backend payment state. A
// package whose current price is zero needs no payment; a package with a price needs a `paid` payment for this
// invitation *and this package*, so a payment made for another package never grants publication. A package whose
// price the catalog cannot answer fails closed: publication asks for a payment instead of assuming one is not due.

const PACKAGE = "22222222-2222-4222-8222-222222222222";
const OTHER_PACKAGE = "33333333-3333-4333-8333-333333333333";

describe("payment entitlement (S4)", () => {
  it("needs no payment when the package's current price is zero", () => {
    assert.deepEqual(
      paymentEntitlement({
        price: { amountMinor: 0, currency: "MXN" },
        packageId: PACKAGE,
        payments: [],
      }),
      { paid: true },
    );
  });

  it("needs a payment when the price is positive and nothing is paid", () => {
    assert.deepEqual(
      paymentEntitlement({
        price: { amountMinor: 25_000, currency: "MXN" },
        packageId: PACKAGE,
        payments: [],
      }),
      { paid: false, reason: PAYMENT_REQUIRED_REASON.PAYMENT_REQUIRED },
    );
  });

  it("grants publication from a paid payment for this invitation and this package", () => {
    assert.deepEqual(
      paymentEntitlement({
        price: { amountMinor: 25_000, currency: "MXN" },
        packageId: PACKAGE,
        payments: [{ packageId: PACKAGE, status: PAYMENT_STATUS.PAID }],
      }),
      { paid: true },
    );
  });

  it("does not grant publication from any other status", () => {
    for (const status of [
      PAYMENT_STATUS.PENDING,
      PAYMENT_STATUS.FAILED,
      PAYMENT_STATUS.EXPIRED,
      PAYMENT_STATUS.REFUNDED,
    ]) {
      assert.deepEqual(
        paymentEntitlement({
          price: { amountMinor: 25_000, currency: "MXN" },
          packageId: PACKAGE,
          payments: [{ packageId: PACKAGE, status }],
        }),
        { paid: false, reason: PAYMENT_REQUIRED_REASON.PAYMENT_REQUIRED },
        status,
      );
    }
  });

  it("never grants publication from a payment made for another package", () => {
    assert.deepEqual(
      paymentEntitlement({
        price: { amountMinor: 25_000, currency: "MXN" },
        packageId: PACKAGE,
        payments: [{ packageId: OTHER_PACKAGE, status: PAYMENT_STATUS.PAID }],
      }),
      { paid: false, reason: PAYMENT_REQUIRED_REASON.PAYMENT_REQUIRED },
    );
  });

  it("fails closed when the catalog cannot answer the current price", () => {
    assert.deepEqual(paymentEntitlement({ price: null, packageId: PACKAGE, payments: [] }), {
      paid: false,
      reason: PAYMENT_REQUIRED_REASON.PAYMENT_PRICE_UNAVAILABLE,
    });
  });

  it("fails closed on a missing price even when a paid payment exists", () => {
    // The payment's own snapshot is the money fact; the gate still refuses to decide without the catalog's
    // answer, because the deployed price says nothing about the amount the owner saw.
    assert.deepEqual(
      paymentEntitlement({
        price: null,
        packageId: PACKAGE,
        payments: [{ packageId: PACKAGE, status: PAYMENT_STATUS.PAID }],
      }),
      { paid: false, reason: PAYMENT_REQUIRED_REASON.PAYMENT_PRICE_UNAVAILABLE },
    );
  });
});
