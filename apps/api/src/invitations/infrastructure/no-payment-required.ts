import type {
  InvitationPaymentGate,
  InvitationPaymentDecision,
} from "../application/invitation-payment-gate";

/**
 * The payment gate Milestone 5 binds (M5 T3; S6): publication is free, so every publication is answered
 * `{ required: false }` and nothing else happens. This adapter is the whole Milestone 7 seam — the milestone
 * replaces this provider with one that charges, and neither the publish use case nor the domain lifecycle
 * changes. It reads the invitation only to satisfy the port and answers the same decision for every row.
 */
export class NoPaymentRequiredGate implements InvitationPaymentGate {
  async publicationPaymentRequired(): Promise<InvitationPaymentDecision> {
    return { required: false };
  }
}
