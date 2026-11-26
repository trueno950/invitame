import { reminderMessage } from "../domain/reminder-message";
import {
  eventDateOf,
  eventWallClockOf,
  isPendingRsvpKind,
  type ReminderKind,
  remindersDueOn,
  remindersGranted,
  zonedDateKey,
} from "../domain/reminder-schedule";
import type {
  ReminderGuest,
  ReminderRepository,
  ScheduledReminderInvitation,
} from "./reminder.repository";
import type { ReminderSendResult, ReminderSender } from "./reminder-sender";

/**
 * Sends the WhatsApp reminders due today (F6; S2.6, S6, L9.3, L9.4). One run reads every invitation whose owner
 * switched a reminder on and whose package grants `WHATSAPP_REMINDERS`, works out in the invitation's own zone which
 * reminder belongs to today, and asks the sender port once per guest and reminder. Every attempt is recorded before
 * it leaves, so a second run of the same day sends nothing twice and a provider refusal is visible as a row instead
 * of a mystery.
 *
 * The sender is a port (S6): with the default adapter the run sends nothing and records each attempt as skipped
 * `not_configured`, which is exactly what this release does until a Business account exists. A run prints counts
 * only — never a phone, a name, a body, or an id — so an operator can read its report without personal data.
 *
 * Nothing here reads a secret, a provider, or a package name: the gate compares the catalog key, the schedule
 * compares calendar days, and the message names what the guest already sees on the invitation.
 */

/** What one run did, as the command prints it and a caller asserts it. Counts only, never personal data. */
export interface ReminderRunReport {
  /** Whether the run only planned (`dry-run`) or claimed, sent, and recorded. */
  readonly mode: "dry-run" | "send";
  /** How many scheduled invitations the run read. */
  readonly invitations: number;
  /** How many reminders were planned: one per guest and due kind, already recorded ones included. */
  readonly due: number;
  readonly sent: number;
  readonly skipped: number;
  readonly failed: number;
  /** The planned reminders an earlier run already recorded; nothing is sent for them. */
  readonly alreadyRecorded: number;
  /** The guests a due reminder could not reach because the owner stored no phone for them (L9.3). */
  readonly unreachable: number;
  /** The invitations whose pinned package does not grant reminders, so nothing was planned for them (L9.2). */
  readonly notGranted: number;
  /** The invitations whose stored zone cannot be read, so the run could not know what today is for them. */
  readonly unusable: number;
}

/** The run's composition: the public origin the message links name, and the instant it reads «today» at. */
export interface ReminderRunOptions {
  /** The absolute public origin of the guest page, from the deployment's own configuration. */
  readonly publicBaseUrl: string;
  /** The instant the run judges the day at; injectable so a test observes the boundary exactly. */
  readonly now: () => Date;
}

/** The reason a sender that threw is recorded with: a stable key, never the provider's own error text. */
const SENDER_ERROR_REASON = "sender_error";

export class SendDueRemindersUseCase {
  constructor(
    private readonly reminders: ReminderRepository,
    private readonly sender: ReminderSender,
    private readonly options: ReminderRunOptions,
  ) {}

  async execute(input: { readonly dryRun: boolean }): Promise<ReminderRunReport> {
    const mode = input.dryRun ? "dry-run" : "send";
    const now = this.options.now();
    const report = {
      mode,
      invitations: 0,
      due: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      alreadyRecorded: 0,
      unreachable: 0,
      notGranted: 0,
      unusable: 0,
    } as {
      mode: ReminderRunReport["mode"];
      invitations: number;
      due: number;
      sent: number;
      skipped: number;
      failed: number;
      alreadyRecorded: number;
      unreachable: number;
      notGranted: number;
      unusable: number;
    };

    const scheduled = await this.reminders.listScheduled(now);

    for (const invitation of scheduled) {
      report.invitations += 1;

      if (!remindersGranted(invitation.includedFeatureKeys)) {
        report.notGranted += 1;
        continue;
      }

      const today = todayIn(invitation, now);
      if (today === null) {
        report.unusable += 1;
        continue;
      }
      const deadlineDate =
        invitation.rsvpDeadline === null
          ? null
          : zonedDateKey(invitation.rsvpDeadline, invitation.timeZone);

      const due = remindersDueOn({
        today,
        deadlineDate,
        eventDate: eventDateOf(invitation.content),
        settings: invitation.reminders,
      });

      for (const reminder of due) {
        const recipients = guestsFor(invitation, reminder.kind);
        // A guest this reminder is meant for but the owner stored no phone for cannot be reached, which is what the
        // report counts instead of naming them (L9.3). A guest the reminder is not for is not unreachable.
        const reachable = recipients.filter((guest) => guest.phone !== null);
        report.unreachable += recipients.length - reachable.length;

        for (const guest of reachable) {
          report.due += 1;

          const key = {
            invitationId: invitation.id,
            guestId: guest.id,
            kind: reminder.kind,
            dueDate: reminder.dueDate,
          };

          if (input.dryRun) {
            if (await this.reminders.hasDelivery(key)) {
              report.alreadyRecorded += 1;
            }
            continue;
          }

          const claim = await this.reminders.claimDelivery(key, now);
          if (claim === null) {
            report.alreadyRecorded += 1;
            continue;
          }

          const result = await this.deliver(invitation, guest, reminder.kind, deadlineDate);
          await this.reminders.recordOutcome(claim.id, result);

          if (result.status === "sent") {
            report.sent += 1;
          } else if (result.status === "skipped") {
            report.skipped += 1;
          } else {
            report.failed += 1;
          }
        }
      }
    }

    return report;
  }

  /**
   * One delivery through the port (S6). A sender that throws is a failed attempt, not a crashed run: the guest keeps a
   * recorded attempt with a stable reason, and the rest of the invitations of the same run still run.
   */
  private async deliver(
    invitation: ScheduledReminderInvitation,
    guest: ReminderGuest,
    kind: ReminderKind,
    deadlineDate: string | null,
  ): Promise<ReminderSendResult> {
    // A scheduled guest always has a phone, and `guestsFor` plus the phone filter is what guarantees it; the guard keeps
    // the type honest instead of sending a message to nowhere.
    if (guest.phone === null) {
      return { status: "failed", reason: SENDER_ERROR_REASON };
    }

    const body = reminderMessage({
      kind,
      guestName: guest.name,
      occasion: invitation.occasion,
      deadline: kind === "EVENT_EVE" ? null : deadlineDate,
      eventTime: eventWallClockOf(invitation.content),
      link: publicInvitationUrl(this.options.publicBaseUrl, invitation.slug),
    });

    try {
      return await this.sender.send({ to: guest.phone, body });
    } catch {
      return { status: "failed", reason: SENDER_ERROR_REASON };
    }
  }
}

/**
 * The calendar day of one invitation (L9.4), or null when the stored zone is not one this runtime can read. A row
 * written around the API then sends nothing instead of guessing an hour in another zone.
 */
function todayIn(invitation: ScheduledReminderInvitation, now: Date): string | null {
  try {
    return zonedDateKey(now, invitation.timeZone);
  } catch {
    return null;
  }
}

/**
 * The guests one reminder is for (L9.3): for a deadline reminder, only the guests who have not answered yet; for the
 * event reminder, everyone expected that day, so a guest who declined it is left out while one who never answered
 * still receives it, because the celebration happens whether they answered or not. The phone is checked after this
 * rule, so a guest without one is reported as not reachable instead of being mistaken for a guest with nothing to say.
 */
function guestsFor(invitation: ScheduledReminderInvitation, kind: ReminderKind): ReminderGuest[] {
  return invitation.guests.filter((guest) =>
    isPendingRsvpKind(kind) ? guest.attending === null : guest.attending !== false,
  );
}

/** The public link of one invitation, without a duplicate slash and without trusting the origin blindly. */
function publicInvitationUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/i/${slug}`;
}
