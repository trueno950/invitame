import type { InvitationReminders } from "../../invitations/domain/invitation-reminders";

/**
 * When a WhatsApp reminder is due (F6; S2.6, S6, L9.1, L9.4). The invitation's two switches become three kinds:
 * «Recordar a quien no ha confirmado» fires seven and two days before the RSVP deadline, and «Recordatorio del
 * evento» fires one day before the celebration. A kind is due on exactly one calendar day, read in the invitation's
 * own IANA zone — the day the owner set the deadline in, and the day the layout prints on the invitation — so a run
 * that starts at any hour of that day in Mexico City finds the same reminders.
 *
 * Nothing here reads a provider, a package, or a framework: this module answers which reminder belongs to which day
 * and nothing else. The message a guest receives is `reminder-message.ts`, and the command that sends and records
 * them is `../../scripts/reminders-send.ts` over the application use case.
 */

/** The catalog feature key that grants reminders (F6; L9.2): granted by Deluxe, editable from the panel (S5). */
export const REMINDERS_FEATURE_KEY = "WHATSAPP_REMINDERS";

/** Whether the pinned package grants reminders; the key is compared whole and case-sensitively (S5). */
export function remindersGranted(includedFeatureKeys: readonly string[]): boolean {
  return includedFeatureKeys.includes(REMINDERS_FEATURE_KEY);
}

/** The three reminders one invitation can send (L9.1). The order is the order a run plans them. */
export const REMINDER_KINDS = ["PENDING_RSVP_7D", "PENDING_RSVP_2D", "EVENT_EVE"] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number];

/** How many days before the RSVP deadline the first pending reminder is due (L9.1). */
export const PENDING_RSVP_FIRST_OFFSET_DAYS = 7;

/** How many days before the RSVP deadline the second pending reminder is due (L9.1). */
export const PENDING_RSVP_SECOND_OFFSET_DAYS = 2;

/** How many days before the celebration the event reminder is due (L9.1). */
export const EVENT_EVE_OFFSET_DAYS = 1;

/** Whether a kind reminds the guests who have not answered yet, instead of the ones expected at the celebration. */
export function isPendingRsvpKind(kind: ReminderKind): boolean {
  return kind === "PENDING_RSVP_7D" || kind === "PENDING_RSVP_2D";
}

/** A calendar day as `YYYY-MM-DD`, the form the deadline and the celebration are compared in. */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A wall clock as `HH:MM`, the form a layout stores its start time in. */
const WALL_CLOCK = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

const DAY_MS = 86_400_000;

/** The formatter of one zone, kept because a run reads the same zone for every guest of an invitation. */
const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** The `YYYY-MM-DD` formatter of one zone; an unknown zone is refused by `Intl` with a `RangeError`. */
function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = DATE_FORMATTERS.get(timeZone);

  if (cached !== undefined) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  DATE_FORMATTERS.set(timeZone, formatter);
  return formatter;
}

/**
 * The calendar day of an instant in one zone, as `YYYY-MM-DD` (L9.4). This is the one conversion between a stored
 * instant — the RSVP deadline — and the day the owner reads on their own calendar, so a deadline stored at
 * 23:30 in Mexico City never counts as the next day in UTC.
 */
export function zonedDateKey(instant: Date, timeZone: string): string {
  const parts = dateFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${read("year")}-${read("month")}-${read("day")}`;
}

/** Whether a value is a real calendar day, so `2026-02-30` is refused instead of shifting into March. */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = CALENDAR_DATE.exec(value);

  if (match === null) {
    return false;
  }

  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  return new Date(time).toISOString().slice(0, 10) === value;
}

/**
 * A calendar day moved by whole days, as `YYYY-MM-DD` (L9.4). The arithmetic is UTC arithmetic on a day with no
 * time, so no daylight-saving transition and no leap second can make a reminder land on the wrong day.
 */
export function shiftCalendarDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];

  return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** One reminder a run plans: its kind and the day it belongs to, which is what makes a delivery unique (L9.4). */
export interface DueReminder {
  readonly kind: ReminderKind;
  readonly dueDate: string;
}

/** What a run compares: the day it runs on, the two dates of the invitation, and the owner's switches. */
export interface ReminderScheduleInput {
  /** Today, as the calendar day of the invitation's own zone. */
  readonly today: string;
  /** The RSVP deadline as the calendar day of that zone, or null when the invitation never closes. */
  readonly deadlineDate: string | null;
  /** The celebration's calendar day, as the layout stores it, or null when the invitation has none. */
  readonly eventDate: string | null;
  readonly settings: InvitationReminders;
}

/**
 * The reminders due today (L9.4): the pending-RSVP kinds whose deadline offset falls on `today`, then the event-eve
 * kind when the celebration is tomorrow. A kind whose owner switch is off is never due, and an invitation without a
 * deadline or without a celebration sends only what it can date. An offset that already passed is never due, so a
 * deadline moved earlier never sends a reminder whose day is gone.
 */
export function remindersDueOn(input: ReminderScheduleInput): DueReminder[] {
  const due: DueReminder[] = [];
  const { today, deadlineDate, eventDate, settings } = input;

  if (settings.pendingRsvp && deadlineDate !== null) {
    if (shiftCalendarDate(deadlineDate, -PENDING_RSVP_FIRST_OFFSET_DAYS) === today) {
      due.push({ kind: "PENDING_RSVP_7D", dueDate: today });
    }
    if (shiftCalendarDate(deadlineDate, -PENDING_RSVP_SECOND_OFFSET_DAYS) === today) {
      due.push({ kind: "PENDING_RSVP_2D", dueDate: today });
    }
  }
  if (settings.eventEve && eventDate !== null) {
    if (shiftCalendarDate(eventDate, -EVENT_EVE_OFFSET_DAYS) === today) {
      due.push({ kind: "EVENT_EVE", dueDate: today });
    }
  }

  return due;
}

/**
 * The celebration's calendar day, as the layout stores it in the invitation's content (L9.6): every layout's
 * `date` field, refused when it is not a real day so a row written around the API sends no reminder on a day nobody
 * chose. The day is the wall clock of the invitation's own zone, which is exactly the day the owner picked.
 */
export function eventDateOf(content: unknown): string | null {
  const value = isJsonObject(content) ? content.date : undefined;

  return isCalendarDate(value) ? value : null;
}

/**
 * The celebration's start time, as the layout stores it (L9.6): the single `time` of the layouts that have one, or
 * the ceremony's or the reception's when the layout announces two places. A time the layout could not have written
 * reads as none, so the event message names the day instead of inventing a clock.
 */
export function eventWallClockOf(content: unknown): string | null {
  if (!isJsonObject(content)) {
    return null;
  }

  for (const field of ["time", "ceremonyTime", "receptionTime"]) {
    const value = content[field];

    if (typeof value === "string" && WALL_CLOCK.test(value)) {
      return value;
    }
  }

  return null;
}

/** A JSON object as the stored content answers it; arrays, null, and primitives are not objects. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
