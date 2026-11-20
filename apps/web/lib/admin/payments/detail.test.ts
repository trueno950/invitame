import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AdminPaymentDetail } from "../../server/admin-payments-client.ts";
import {
  PAYMENT_DETAIL_COPY,
  PAYMENTS_STATUS_LABELS,
  paymentEventOutcomeLabel,
  paymentEventTypeLabel,
} from "./copy.ts";
import { paymentDetailView } from "./detail.ts";

// What the payment detail page renders (M9 T7; S4): the stored facts and the events the intake kept for them. Every
// event type and outcome the API writes has a Spanish label, and a value outside that closed set still renders — with
// a neutral label — instead of failing the page, because a support read must never crash on a new stored value.

const PAYMENT_ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const INVITATION_ID = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";
const AT = "2026-11-23T09:00:00.000Z";

const DETAIL: AdminPaymentDetail = {
  paymentId: PAYMENT_ID,
  invitationId: INVITATION_ID,
  invitationSlug: "ana-y-daniel",
  status: "paid",
  amountMinor: 150000,
  currency: "MXN",
  provider: "mercadopago",
  createdAt: AT,
  paidAt: AT,
  events: [
    {
      type: "refunded",
      outcome: "refused_currency",
      receivedAt: "2026-11-23T10:00:00.000Z",
      processedAt: "2026-11-23T10:00:02.000Z",
    },
    { type: "paid", outcome: "applied", receivedAt: AT, processedAt: AT },
  ],
};

describe("paymentDetailView", () => {
  it("shows the payment, its amount like the list, and the link to its invitation", () => {
    const view = paymentDetailView(DETAIL);

    assert.equal(view.paymentId, PAYMENT_ID);
    assert.equal(view.slug, "ana-y-daniel");
    assert.equal(view.statusLabel, PAYMENTS_STATUS_LABELS.paid);
    assert.equal(view.amount, "$1,500.00 MXN");
    assert.equal(view.provider, "mercadopago");
    assert.equal(view.invitationHref, `/admin/invitaciones/${INVITATION_ID}`);
    assert.match(view.created, /23 nov 2026/);
    assert.match(view.paid, /23 nov 2026/);
  });

  it("keeps the events newest first with their Spanish labels and instants", () => {
    const view = paymentDetailView(DETAIL);

    assert.deepEqual(
      view.events.map((event) => [event.typeLabel, event.outcomeLabel]),
      [
        [
          PAYMENT_DETAIL_COPY.eventTypes.refunded,
          PAYMENT_DETAIL_COPY.eventOutcomes.refused_currency,
        ],
        [PAYMENT_DETAIL_COPY.eventTypes.paid, PAYMENT_DETAIL_COPY.eventOutcomes.applied],
      ],
    );
    assert.equal(view.events[0]?.processedAt, "2026-11-23T10:00:02.000Z");
    assert.match(view.events[0]?.received ?? "", /23 nov 2026/);
    assert.match(view.events[0]?.processed ?? "", /23 nov 2026/);
    // Two events of the same payment share no React key.
    assert.equal(new Set(view.events.map((event) => event.key)).size, view.events.length);
  });

  it("labels every event type and outcome the verified intake writes", () => {
    for (const type of ["paid", "failed", "expired", "refunded"] as const) {
      assert.equal(paymentEventTypeLabel(type), PAYMENT_DETAIL_COPY.eventTypes[type], type);
      assert.notEqual(paymentEventTypeLabel(type), PAYMENT_DETAIL_COPY.unknownEventType, type);
    }
    for (const outcome of [
      "applied",
      "ignored_transition",
      "ignored_unknown_payment",
      "refused_amount",
      "refused_currency",
    ] as const) {
      assert.equal(
        paymentEventOutcomeLabel(outcome),
        PAYMENT_DETAIL_COPY.eventOutcomes[outcome],
        outcome,
      );
      assert.notEqual(
        paymentEventOutcomeLabel(outcome),
        PAYMENT_DETAIL_COPY.unknownOutcome,
        outcome,
      );
    }
  });

  it("renders a value outside the closed set with a neutral label instead of crashing", () => {
    const view = paymentDetailView({
      ...DETAIL,
      events: [{ type: "charged_back", outcome: "new_outcome", receivedAt: AT, processedAt: null }],
    });

    assert.equal(view.events[0]?.typeLabel, PAYMENT_DETAIL_COPY.unknownEventType);
    assert.equal(view.events[0]?.outcomeLabel, PAYMENT_DETAIL_COPY.unknownOutcome);
    assert.equal(view.events[0]?.processed, PAYMENT_DETAIL_COPY.notProcessed);
    assert.equal(view.events[0]?.processedAt, undefined);
    assert.equal(paymentEventTypeLabel("__proto__"), PAYMENT_DETAIL_COPY.unknownEventType);
    assert.equal(paymentEventOutcomeLabel("toString"), PAYMENT_DETAIL_COPY.unknownOutcome);
  });

  it("shows no amount or date it could not read", () => {
    const view = paymentDetailView({ ...DETAIL, currency: "not-a-currency", paidAt: null });

    assert.equal(view.amount, "");
    assert.equal(view.paid, "");
    assert.equal(paymentDetailView({ ...DETAIL, events: [] }).events.length, 0);
  });
});
