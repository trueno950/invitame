// The payment state machine (M7 S1, S3, S4). This file is pure: no framework, ORM, provider, or transport type,
// so every rule here is stated once and can be exercised from a table. The database keeps the same closed set of
// statuses in a PostgreSQL enum, and `PaymentEvent` keeps the same closed set of event types and outcomes in CHECK
// constraints; this module is the rule, those are the guards that make an unstated value impossible.

/** The stored statuses. `pending` is the only one a checkout writes; a provider event moves it. */
export const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  EXPIRED: "expired",
  REFUNDED: "refunded",
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/**
 * The normalized event types. A provider adapter must map its own vocabulary to exactly these four values, so no
 * provider payload, status name, or field ever becomes part of the domain model (S4).
 */
export const PAYMENT_EVENT_TYPE = {
  PAID: "paid",
  FAILED: "failed",
  EXPIRED: "expired",
  REFUNDED: "refunded",
} as const;

export type PaymentEventType = (typeof PAYMENT_EVENT_TYPE)[keyof typeof PAYMENT_EVENT_TYPE];

/**
 * What one stored event decided. Every event that reached the intake is recorded with one of these, whether it
 * changed a payment or not, so an ignored or refused event is auditable instead of silently dropped (S4).
 */
export const PAYMENT_EVENT_OUTCOME = {
  /** The transition was applied. */
  APPLIED: "applied",
  /** The pair (current status, event type) is not a legal transition; nothing changed. */
  IGNORED_TRANSITION: "ignored_transition",
  /** No payment of this API answers the provider's reference; nothing changed. */
  IGNORED_UNKNOWN_PAYMENT: "ignored_unknown_payment",
  /** The event claims another amount than the snapshot taken at checkout; nothing changed. */
  REFUSED_AMOUNT: "refused_amount",
  /** The event claims another currency than the snapshot taken at checkout; nothing changed. */
  REFUSED_CURRENCY: "refused_currency",
} as const;

export type PaymentEventOutcome =
  (typeof PAYMENT_EVENT_OUTCOME)[keyof typeof PAYMENT_EVENT_OUTCOME];

/** An amount in the smallest currency unit and its ISO code, copied from the price at checkout (S4). */
export interface PaymentSnapshot {
  amountMinor: number;
  currency: string;
}

/** A stored payment as the rules read it: its status and the snapshot it was created with. */
export interface PaymentStateView extends PaymentSnapshot {
  status: PaymentStatus;
}

/** The event types that name a status: a normalized event asks for exactly this status. */
export type PaymentTransition = PaymentEventType;

/** What one (status, event type) pair does: move the payment, or nothing at all. */
export type PaymentTransitionDecision =
  | { readonly kind: "applied"; readonly from: PaymentStatus; readonly to: PaymentStatus }
  | { readonly kind: "ignored"; readonly from: PaymentStatus };

/** The status an event type asks for. */
export function targetStatusOf(type: PaymentTransition): PaymentStatus {
  switch (type) {
    case PAYMENT_EVENT_TYPE.PAID:
      return PAYMENT_STATUS.PAID;
    case PAYMENT_EVENT_TYPE.FAILED:
      return PAYMENT_STATUS.FAILED;
    case PAYMENT_EVENT_TYPE.EXPIRED:
      return PAYMENT_STATUS.EXPIRED;
    case PAYMENT_EVENT_TYPE.REFUNDED:
      return PAYMENT_STATUS.REFUNDED;
  }
}

/** Whether the pair (current status, event type) is one of the four legal transitions (S4). */
function isAllowedTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === PAYMENT_STATUS.PENDING) {
    return (
      to === PAYMENT_STATUS.PAID || to === PAYMENT_STATUS.FAILED || to === PAYMENT_STATUS.EXPIRED
    );
  }

  // Only a paid payment is refunded; every terminal status stays where it is.
  return from === PAYMENT_STATUS.PAID && to === PAYMENT_STATUS.REFUNDED;
}

/**
 * The pure transition rule: `pending` becomes `paid`, `failed`, or `expired`, and `paid` becomes `refunded`.
 * Every other pair is `ignored`, which is an ordinary outcome and never an error: a late, duplicated, or
 * out-of-order provider event must not move a payment backwards or resurrect a terminal one (S1, S4).
 */
export function decideTransition(
  current: PaymentStatus,
  type: PaymentTransition,
): PaymentTransitionDecision {
  const to = targetStatusOf(type);

  return isAllowedTransition(current, to)
    ? { kind: "applied", from: current, to }
    : { kind: "ignored", from: current };
}

/** What recording one provider event does to one payment, or why it changes nothing. */
export type PaymentEventDecision =
  | {
      readonly outcome: typeof PAYMENT_EVENT_OUTCOME.APPLIED;
      readonly from: PaymentStatus;
      readonly to: PaymentStatus;
    }
  | { readonly outcome: Exclude<PaymentEventOutcome, typeof PAYMENT_EVENT_OUTCOME.APPLIED> };

/**
 * The whole intake rule for one normalized event: the amount and the currency must equal the snapshot the
 * payment was created with, and only then is the transition considered. A mismatch is `refused` — recorded,
 * never applied — because the money the provider reports must be the money the owner was quoted (S1, S4).
 * A payment that no row answers is `ignored_unknown_payment`: the event is signed, so it is real, but there is
 * nothing of ours to move.
 */
export function decidePaymentEvent(input: {
  payment: PaymentStateView | null;
  event: PaymentSnapshot & { type: PaymentEventType };
}): PaymentEventDecision {
  const { payment, event } = input;

  if (payment === null) {
    return { outcome: PAYMENT_EVENT_OUTCOME.IGNORED_UNKNOWN_PAYMENT };
  }

  if (event.amountMinor !== payment.amountMinor) {
    return { outcome: PAYMENT_EVENT_OUTCOME.REFUSED_AMOUNT };
  }

  if (event.currency !== payment.currency) {
    return { outcome: PAYMENT_EVENT_OUTCOME.REFUSED_CURRENCY };
  }

  const decision = decideTransition(payment.status, event.type);

  return decision.kind === "applied"
    ? { outcome: PAYMENT_EVENT_OUTCOME.APPLIED, from: decision.from, to: decision.to }
    : { outcome: PAYMENT_EVENT_OUTCOME.IGNORED_TRANSITION };
}

/** Whether a stored value is one of the statuses; the intake never trusts an untyped value. */
export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return Object.values(PAYMENT_STATUS).some((status) => status === value);
}

/** Whether a value is one of the four normalized event types. */
export function isPaymentEventType(value: unknown): value is PaymentEventType {
  return Object.values(PAYMENT_EVENT_TYPE).some((type) => type === value);
}
