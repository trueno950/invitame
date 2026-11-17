import { isPaymentEventType, type PaymentEventType } from "../domain/payment";
import type { NormalizedPaymentEvent } from "./payment-provider.port";

// The normalized event shape every adapter must produce (M7 S4). A provider payload becomes a domain fact only
// after this validation: an event id and a reference of the provider's own opaque format, one of the four event
// types, a non-negative integer amount, an ISO currency code, and an ISO instant. Anything else is a malformed
// delivery, answered as an unverifiable one. Providers may add fields; nothing else is read or stored.

/** The largest amount a payment can carry, the `INTEGER` ceiling of `Payment.amountMinor`. */
const MAX_AMOUNT_MINOR = 2_147_483_647;

/** Provider ids and references: printable ASCII without separators, so nothing odd reaches a VARCHAR or a log. */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_.:-]{1,200}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Whether a value is the normalized event an adapter must answer, with no field left unchecked. */
export function parseNormalizedPaymentEvent(value: unknown): NormalizedPaymentEvent | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const { eventId, type, providerReference, amountMinor, currency, occurredAt } = candidate;

  if (typeof eventId !== "string" || !IDENTIFIER_PATTERN.test(eventId)) {
    return null;
  }
  if (!isPaymentEventType(type)) {
    return null;
  }
  if (typeof providerReference !== "string" || !IDENTIFIER_PATTERN.test(providerReference)) {
    return null;
  }
  if (
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    amountMinor > MAX_AMOUNT_MINOR
  ) {
    return null;
  }
  if (typeof currency !== "string" || !CURRENCY_PATTERN.test(currency)) {
    return null;
  }
  if (typeof occurredAt !== "string" || !ISO_INSTANT.test(occurredAt)) {
    return null;
  }

  const instant = new Date(occurredAt);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }

  return {
    eventId,
    type: type as PaymentEventType,
    providerReference,
    amountMinor,
    currency,
    occurredAt: instant,
  };
}
