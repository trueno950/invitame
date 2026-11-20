import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AdminPayment } from "../../server/admin-payments-client.ts";
import {
  PAYMENTS_ERROR_COPY,
  PAYMENTS_NOTICE_COPY,
  PAYMENTS_STATUS_LABELS,
  PAYMENTS_COPY,
  paymentDetailPath,
} from "./copy.ts";
import { paymentsPageNotices } from "./notices.ts";
import { paymentRowView } from "./rows.ts";

// What one row of the refund list renders (M7 T3; S3): the stored facts plus the rule's own answer. The refund button
// exists only for a payment the API marked refundable, and its absence is explained, because the API — not the hidden
// button — is what refuses a refund after publishing.

const PAYMENT_ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const INVITATION_ID = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";
const AT = "2026-11-12T10:00:00.000Z";

const PAID: AdminPayment = {
  paymentId: PAYMENT_ID,
  invitationId: INVITATION_ID,
  invitationSlug: "ana-y-daniel",
  status: "paid",
  amountMinor: 150000,
  currency: "MXN",
  paidAt: AT,
  refundable: true,
};

describe("paymentRowView", () => {
  it("offers the refund only when the API reports the payment as refundable", () => {
    const view = paymentRowView(PAID);

    assert.equal(view.refund, PAYMENTS_COPY.refund);
    assert.equal(view.note, undefined);
    assert.equal(view.slug, "ana-y-daniel");
    // The row links to its own detail (M9 T7; S4), and the link is the id the list already showed.
    assert.equal(view.href, paymentDetailPath(PAYMENT_ID));
    assert.equal(view.href, `/admin/pagos/${PAYMENT_ID}`);
    assert.equal(view.amount, "$1,500.00 MXN");
    assert.equal(view.statusLabel, PAYMENTS_STATUS_LABELS.paid);
    assert.match(view.paidOn, /12 nov 2026/);
  });

  it("explains the missing refund of an invitation that was already published", () => {
    const view = paymentRowView({ ...PAID, refundable: false });

    assert.equal(view.refund, undefined);
    assert.equal(view.note, PAYMENTS_COPY.notRefundableNote);
  });

  it("shows the amount and the date of every stored payment state", () => {
    for (const status of ["pending", "paid", "failed", "expired", "refunded"] as const) {
      const view = paymentRowView({ ...PAID, status });

      assert.equal(view.statusLabel, PAYMENTS_STATUS_LABELS[status], status);
      assert.equal(view.amount, "$1,500.00 MXN", status);
    }

    assert.equal(paymentRowView({ ...PAID, paidAt: null }).paidOn, "");
  });

  it("never prints an amount it could not format", () => {
    assert.equal(paymentRowView({ ...PAID, currency: "not-a-currency" }).amount, "");
  });
});

describe("the messages of the refund page", () => {
  it("names the notice that explains a requested refund and what happens next", () => {
    assert.equal(
      paymentsPageNotices({ notice: "refund-requested" }).notice,
      PAYMENTS_NOTICE_COPY["refund-requested"],
    );
    assert.match(PAYMENTS_NOTICE_COPY["refund-requested"], /Mercado Pago/);
    assert.match(PAYMENTS_NOTICE_COPY["refund-requested"], /confirme/);
  });

  it("shows a Spanish message for each refusal the API answers", () => {
    const cases: Array<[string, string]> = [
      ["not-found", PAYMENTS_ERROR_COPY["not-found"]],
      ["not-refundable", PAYMENTS_ERROR_COPY["not-refundable"]],
      ["already-published", PAYMENTS_ERROR_COPY["already-published"]],
      ["provider-unavailable", PAYMENTS_ERROR_COPY["provider-unavailable"]],
    ];

    for (const [code, message] of cases) {
      assert.equal(paymentsPageNotices({ error: code }).error?.message, message, code);
    }

    // The four refusal codes exist one to one, and each message says what happened.
    assert.deepEqual(Object.keys(PAYMENTS_ERROR_COPY).sort(), [
      "already-published",
      "invalid-form",
      "not-found",
      "not-refundable",
      "provider-unavailable",
      "unavailable",
      "validation",
    ]);
    assert.match(PAYMENTS_ERROR_COPY["already-published"], /publicó/);
    assert.match(PAYMENTS_ERROR_COPY["not-refundable"], /reembols/);
    assert.match(PAYMENTS_ERROR_COPY["not-found"], /pago/);
    assert.match(PAYMENTS_ERROR_COPY["provider-unavailable"], /Mercado Pago/);
  });

  it("shows nothing for an unknown, repeated, or provider-supplied value", () => {
    for (const parameters of [
      {},
      { error: "approved", notice: "approved" },
      { error: ["not-found", "not-refundable"] },
      { error: "PAYMENT_NOT_FOUND" },
    ]) {
      assert.deepEqual(paymentsPageNotices(parameters), {}, JSON.stringify(parameters));
    }
  });
});
