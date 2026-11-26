/**
 * The port that delivers one WhatsApp reminder (F6; S2.6, S6, L9.4). It is the only place a reminder leaves the API:
 * the command asks the port, the port is implemented by an adapter, and the adapter owns every provider detail — the
 * Business account, the template, the HTTP call, and its own credentials.
 *
 * This release implements no provider (S6: a paid subscription has to exist first), so the only adapter is the one
 * that sends nothing and reports `not_configured`. Turning reminders on later needs the Business configuration and a
 * second adapter — the command, the schedule, the record, and the owner's screen do not change.
 *
 * A message carries the guest's phone and the text, and neither is ever logged or returned: the outcome of a send is
 * a state and, at most, a stable reason key.
 */

/** The reason a send was skipped because the deployment has no provider configured (S6). */
export const NOT_CONFIGURED_REASON = "not_configured";

/** One reminder to deliver: the guest's phone in E.164 and the plain-text body. Never logged, never returned. */
export interface ReminderMessage {
  readonly to: string;
  readonly body: string;
}

/**
 * What one send answered: it left (`sent`), the deployment cannot send (`skipped`, `not_configured`), or the provider
 * refused it (`failed`, with a stable reason key that carries no phone and no provider payload).
 */
export type ReminderSendResult =
  | { readonly status: "sent" }
  | { readonly status: "skipped"; readonly reason: typeof NOT_CONFIGURED_REASON }
  | { readonly status: "failed"; readonly reason: string };

/**
 * The sender port (S6, L9.4). `isConfigured` is what the owner's screen shows as «Aún no está activo» and what the
 * command reads to explain a run that records only skipped attempts; it answers a capability, never a secret.
 */
export interface ReminderSender {
  /** Whether this deployment can deliver a reminder at all. False means every send answers `not_configured`. */
  isConfigured(): boolean;

  /** Delivers one reminder, or answers why it did not leave. Never throws for a provider refusal. */
  send(message: ReminderMessage): Promise<ReminderSendResult>;
}

/** The provider token of the sender port (F6; S6): `not_configured` until a Business adapter replaces it. */
export const REMINDER_SENDER = Symbol("ReminderSender");
