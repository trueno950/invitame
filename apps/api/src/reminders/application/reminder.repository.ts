import type { InvitationReminders } from "../../invitations/domain/invitation-reminders";
import type { ReminderKind } from "../domain/reminder-schedule";
import type { ReminderSendResult } from "./reminder-sender";

/**
 * What the reminder command reads and writes (F6; S2.6, S6, L9.3, L9.4). The port is the whole database surface of a
 * run: the invitations whose owner switched a reminder on, the guests who may receive one, and the attempt record
 * that makes a second run send nothing twice.
 *
 * The adapter (`infrastructure/prisma-reminder.repository.ts`) decides what a *scheduled* invitation is — published,
 * not expired, with reminder settings stored and a pinned package that grants the key — so the use case never writes
 * a query and the domain never sees Prisma.
 */

/**
 * One guest the command may remind (L9.3): the stored name, the stored phone in E.164 (null when the owner never
 * wrote one, which is what makes the guest not reachable), and the answer as the guest list holds it — `null` when
 * the guest has not answered yet, true or false once they did.
 */
export interface ReminderGuest {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly attending: boolean | null;
}

/**
 * One invitation a run may send reminders for (L9.3, L9.4): its released page, its own zone, the content the
 * celebration's day and hour come from, the occasion the message names, the validated switches, the deadline, the
 * keys its pinned package grants, and the guests who hold a personal link.
 */
export interface ScheduledReminderInvitation {
  readonly id: string;
  /** The public slug, which the message's link names. */
  readonly slug: string;
  /** The stored IANA zone the run reads «today» in (L9.4). */
  readonly timeZone: string;
  /** The stored content, read for the celebration's calendar day and start time (L9.6). */
  readonly content: unknown;
  /** The occasion, as the pinned template's category names it. */
  readonly occasion: string;
  /** The stored switches; a row that does not read as one is not scheduled at all. */
  readonly reminders: InvitationReminders;
  /** The RSVP deadline instant, or null for an invitation that never closes. */
  readonly rsvpDeadline: Date | null;
  /** The catalog keys of the pinned package, which is what grants reminders (L9.2). */
  readonly includedFeatureKeys: readonly string[];
  readonly guests: readonly ReminderGuest[];
}

/** What makes one attempt unique (L9.4): the invitation, the guest, the kind, and the day it belongs to. */
export interface ReminderDeliveryKey {
  readonly invitationId: string;
  readonly guestId: string;
  readonly kind: ReminderKind;
  /** The calendar day of the invitation's own zone, as `YYYY-MM-DD`. */
  readonly dueDate: string;
}

/** The stored attempt this run owns, which is what it records the outcome on. */
export interface ReminderDeliveryClaim extends ReminderDeliveryKey {
  readonly id: string;
}

/** The persistence port of the reminder command (F6; L9.4). */
export interface ReminderRepository {
  /**
   * Every invitation a run may send reminders for, at the given instant: published and not expired, with reminder
   * settings the owner switched on, with the guests of its list and the keys its package grants. A database error
   * propagates unchanged, so the command reports a failed run instead of a successful one with nothing to do.
   */
  listScheduled(now: Date): Promise<ScheduledReminderInvitation[]>;

  /** Whether one attempt is already recorded, which is what a dry run reports without claiming it. */
  hasDelivery(key: ReminderDeliveryKey): Promise<boolean>;

  /**
   * Claims one attempt, or answers null when it is already recorded. The unique key of the table is the guard, so a
   * concurrent or repeated run never sends the same reminder twice (L9.4).
   */
  claimDelivery(key: ReminderDeliveryKey, at: Date): Promise<ReminderDeliveryClaim | null>;

  /** Records what the sender answered on the claimed attempt: sent, skipped with its reason, or failed. */
  recordOutcome(id: string, result: ReminderSendResult): Promise<void>;
}

export const REMINDER_REPOSITORY = Symbol("ReminderRepository");
