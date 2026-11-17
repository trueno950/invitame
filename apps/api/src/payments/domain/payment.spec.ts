import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decidePaymentEvent,
  decideTransition,
  PAYMENT_EVENT_OUTCOME,
  PAYMENT_EVENT_TYPE,
  PAYMENT_STATUS,
  type PaymentStatus,
  type PaymentTransition,
  targetStatusOf,
} from "./payment";

// The payment state machine (M7 S1, S3, S4): `pending` becomes `paid`, `failed`, or `expired`, and only `paid`
// becomes `refunded`. Every other pair is ignored, never an error, so an out-of-order or duplicated provider
// event can never move a payment backwards or resurrect a terminal one. Amount and currency are compared with
// the snapshot taken at checkout: a provider event that claims another amount or currency is refused and
// recorded instead of applied.

describe("payment state machine (S4)", () => {
  const statuses: readonly PaymentStatus[] = [
    PAYMENT_STATUS.PENDING,
    PAYMENT_STATUS.PAID,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.EXPIRED,
    PAYMENT_STATUS.REFUNDED,
  ];
  const eventTypes = [
    PAYMENT_EVENT_TYPE.PAID,
    PAYMENT_EVENT_TYPE.FAILED,
    PAYMENT_EVENT_TYPE.EXPIRED,
    PAYMENT_EVENT_TYPE.REFUNDED,
  ] as const;

  /** The table S4 states: the only six pairs that move a payment. */
  const allowed: ReadonlyArray<readonly [PaymentStatus, PaymentTransition, PaymentStatus]> = [
    [PAYMENT_STATUS.PENDING, PAYMENT_EVENT_TYPE.PAID, PAYMENT_STATUS.PAID],
    [PAYMENT_STATUS.PENDING, PAYMENT_EVENT_TYPE.FAILED, PAYMENT_STATUS.FAILED],
    [PAYMENT_STATUS.PENDING, PAYMENT_EVENT_TYPE.EXPIRED, PAYMENT_STATUS.EXPIRED],
    [PAYMENT_STATUS.PAID, PAYMENT_EVENT_TYPE.REFUNDED, PAYMENT_STATUS.REFUNDED],
  ];

  it("applies exactly the four allowed transitions", () => {
    for (const [from, type, to] of allowed) {
      assert.deepEqual(
        decideTransition(from, type),
        { kind: "applied", from, to },
        `${from}+${type}`,
      );
      assert.equal(targetStatusOf(type), to);
    }
  });

  it("ignores every other (status, event) pair of the 5 x 4 table, changing nothing", () => {
    const allowedPairs = new Set(allowed.map(([from, type]) => `${from}+${type}`));
    let ignored = 0;

    for (const from of statuses) {
      for (const type of eventTypes) {
        if (allowedPairs.has(`${from}+${type}`)) {
          continue;
        }
        ignored += 1;
        assert.deepEqual(
          decideTransition(from, type),
          { kind: "ignored", from },
          `${from}+${type}`,
        );
      }
    }

    assert.equal(ignored, 16);
  });

  it("keeps a paid payment paid when a late failure arrives (out-of-order safe)", () => {
    assert.deepEqual(decideTransition(PAYMENT_STATUS.PAID, PAYMENT_EVENT_TYPE.FAILED), {
      kind: "ignored",
      from: PAYMENT_STATUS.PAID,
    });
    assert.deepEqual(decideTransition(PAYMENT_STATUS.PAID, PAYMENT_EVENT_TYPE.PAID), {
      kind: "ignored",
      from: PAYMENT_STATUS.PAID,
    });
  });

  it("never resurrects a terminal payment", () => {
    for (const from of [PAYMENT_STATUS.FAILED, PAYMENT_STATUS.EXPIRED, PAYMENT_STATUS.REFUNDED]) {
      for (const type of eventTypes) {
        assert.deepEqual(
          decideTransition(from, type),
          { kind: "ignored", from },
          `${from}+${type}`,
        );
      }
    }
  });

  it("refuses a refund straight from pending, because only a paid payment is refunded", () => {
    assert.deepEqual(decideTransition(PAYMENT_STATUS.PENDING, PAYMENT_EVENT_TYPE.REFUNDED), {
      kind: "ignored",
      from: PAYMENT_STATUS.PENDING,
    });
  });
});

describe("payment event decision against the snapshot (S4)", () => {
  const snapshot = { amountMinor: 25_000, currency: "MXN" };

  it("applies a matching paid event to a pending payment", () => {
    const decision = decidePaymentEvent({
      payment: { ...snapshot, status: PAYMENT_STATUS.PENDING },
      event: { ...snapshot, type: PAYMENT_EVENT_TYPE.PAID },
    });

    assert.deepEqual(decision, {
      outcome: PAYMENT_EVENT_OUTCOME.APPLIED,
      from: PAYMENT_STATUS.PENDING,
      to: PAYMENT_STATUS.PAID,
    });
  });

  it("refuses an amount that differs from the snapshot, recording the refusal", () => {
    const decision = decidePaymentEvent({
      payment: { ...snapshot, status: PAYMENT_STATUS.PENDING },
      event: { ...snapshot, amountMinor: snapshot.amountMinor + 1, type: PAYMENT_EVENT_TYPE.PAID },
    });

    assert.deepEqual(decision, { outcome: PAYMENT_EVENT_OUTCOME.REFUSED_AMOUNT });
  });

  it("refuses a currency that differs from the snapshot, recording the refusal", () => {
    const decision = decidePaymentEvent({
      payment: { ...snapshot, status: PAYMENT_STATUS.PENDING },
      event: { ...snapshot, currency: "USD", type: PAYMENT_EVENT_TYPE.PAID },
    });

    assert.deepEqual(decision, { outcome: PAYMENT_EVENT_OUTCOME.REFUSED_CURRENCY });
  });

  it("checks the amount before the currency, so one refusal code is recorded", () => {
    const decision = decidePaymentEvent({
      payment: { ...snapshot, status: PAYMENT_STATUS.PENDING },
      event: { amountMinor: 1, currency: "USD", type: PAYMENT_EVENT_TYPE.PAID },
    });

    assert.deepEqual(decision, { outcome: PAYMENT_EVENT_OUTCOME.REFUSED_AMOUNT });
  });

  it("records an event for a payment the API does not know as ignored", () => {
    const decision = decidePaymentEvent({
      payment: null,
      event: { ...snapshot, type: PAYMENT_EVENT_TYPE.PAID },
    });

    assert.deepEqual(decision, { outcome: PAYMENT_EVENT_OUTCOME.IGNORED_UNKNOWN_PAYMENT });
  });

  it("records an out-of-order event as an ignored transition", () => {
    const decision = decidePaymentEvent({
      payment: { ...snapshot, status: PAYMENT_STATUS.PAID },
      event: { ...snapshot, type: PAYMENT_EVENT_TYPE.FAILED },
    });

    assert.deepEqual(decision, { outcome: PAYMENT_EVENT_OUTCOME.IGNORED_TRANSITION });
  });

  it("refuses a mismatching event even when its transition would be ignored", () => {
    const decision = decidePaymentEvent({
      payment: { ...snapshot, status: PAYMENT_STATUS.PAID },
      event: { ...snapshot, amountMinor: 1, type: PAYMENT_EVENT_TYPE.FAILED },
    });

    assert.deepEqual(decision, { outcome: PAYMENT_EVENT_OUTCOME.REFUSED_AMOUNT });
  });
});
