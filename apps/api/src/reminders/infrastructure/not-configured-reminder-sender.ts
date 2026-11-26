import {
  NOT_CONFIGURED_REASON,
  type ReminderMessage,
  type ReminderSendResult,
  type ReminderSender,
} from "../application/reminder-sender";

/**
 * The only reminder adapter of this release (F6; S6, L9.4): the deployment has no WhatsApp Business account, so it
 * sends nothing and reports `not_configured` for every message. Nothing leaves the process, no credential is read,
 * and no phone number or body is kept: the adapter holds no state at all, which is why the command can run it any
 * number of times and record the same skipped attempt.
 *
 * The keys a future Business adapter would read are documented as unset in `docs/development/runbooks.md`; none of
 * them is validated at startup, because their absence is exactly this adapter's configuration (S6).
 */
export class NotConfiguredReminderSender implements ReminderSender {
  isConfigured(): boolean {
    return false;
  }

  async send(_message: ReminderMessage): Promise<ReminderSendResult> {
    return { status: "skipped", reason: NOT_CONFIGURED_REASON };
  }
}
