import type { InvitationRecord } from "./invitation.repository";

// The publication payment seam (M5 T3; S6). Milestone 5 publishes for free: the invitation application asks
// this port on every publication, and the only adapter bound today always answers "no payment required". The
// port exists so Milestone 7 changes one piece — the adapter bound to `INVITATION_PAYMENT_GATE` — without
// touching the publication use case, the domain lifecycle, or the persistence layers (S6, A2 in the roadmap).

/**
 * What the gate decides about one invitation. `required: false` lets the publication continue; `required: true`
 * carries the machine-readable `reason` the application reports, so presentation can map it without knowing
 * anything about payments.
 */
export type InvitationPaymentDecision =
  | { readonly required: false }
  | { readonly required: true; readonly reason: string };

/**
 * The publication payment port: asked once per DRAFT -> PUBLISHED transition, after readiness and before the
 * write, with the stored row (never with a request payload). It must answer, never throw for a business
 * outcome; a technical failure propagates and publication does not happen. It has no side effects of its own:
 * charging, if Milestone 7 charges, stays inside the adapter and behind its own idempotency.
 */
export interface InvitationPaymentGate {
  publicationPaymentRequired(invitation: InvitationRecord): Promise<InvitationPaymentDecision>;
}

export const INVITATION_PAYMENT_GATE = Symbol("InvitationPaymentGate");
