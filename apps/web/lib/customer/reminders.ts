import type { RemindersPayload } from "../invitation-features/reminders.ts";

/**
 * The «Recordatorios por WhatsApp» block of the editor's «Funciones» tab (F6; S2.6, S6, L9.1, L9.5, L9.6).
 *
 * The owner switches two reminders on — «Recordar a quien no ha confirmado» (seven and two days before the RSVP
 * deadline) and «Recordatorio del evento» (one day before the celebration) — and both are stored as one small versioned
 * payload on the invitation, so they work the moment a sender is configured. This release has no provider: the block
 * says «Aún no está activo» and never pretends a message was sent (S6).
 *
 * The preview is built from the invitation's own data — the occasion its template is filed under, the deadline the
 * owner set, and the invitation's own public link — with a stand-in guest name, because the real one belongs to a guest
 * the owner is not looking at. The wording mirrors the API's template
 * (`apps/api/src/reminders/domain/reminder-message.ts`) sentence for sentence, and both suites pin the same text, so the
 * preview is the message a guest would receive.
 *
 * Everything here is pure: two switches, one payload, and one line of text.
 */

/** The two switches as the browser holds them; both are always present. */
export interface RemindersDraft {
  readonly pendingRsvp: boolean;
  readonly eventEve: boolean;
}

/** Both reminders off: what an invitation without stored switches shows. */
export const EMPTY_REMINDERS: RemindersDraft = { pendingRsvp: false, eventEve: false };

/**
 * The guest name the preview greets. It is the editor's own stand-in, never a real guest: the command greets each
 * guest by the name the owner stored in the guest list, and the preview only shows the shape of the message.
 */
export const REMINDERS_PREVIEW_GUEST = "Familia Gómez";

/** The deadline day format the message writes, in the months Spanish names; `UTC` keeps a calendar day one. */
const DEADLINE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** A calendar day as the deadline control writes it: the day part of `YYYY-MM-DDTHH:MM`. */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The switches of one stored payload, or both off when the invitation has none (L9.1). */
export function remindersDraftOf(payload: RemindersPayload | null | undefined): RemindersDraft {
  if (payload === null || payload === undefined) {
    return EMPTY_REMINDERS;
  }
  return { pendingRsvp: payload.pendingRsvp, eventEve: payload.eventEve };
}

/**
 * The payload to store (L9.1): the pair with its version, or `null` when both switches are off, which is how the API
 * clears the stored settings. The shape is always complete, so there is no half-written value to wait for.
 */
export function remindersPayloadOf(draft: RemindersDraft): RemindersPayload | null {
  if (!draft.pendingRsvp && !draft.eventEve) {
    return null;
  }
  return { version: 1, pendingRsvp: draft.pendingRsvp, eventEve: draft.eventEve };
}

/** The facts the preview is built from: the invitation's own data and the stand-in guest name. */
export interface ReminderPreviewFacts {
  /** The guest the message greets; the editor always passes `REMINDERS_PREVIEW_GUEST`. */
  readonly guestName: string;
  /** The occasion, as the pinned template's category names it («XV años», «Boda», «Bautizo»). */
  readonly occasion: string;
  /** The RSVP deadline as a calendar day, or null when the invitation closes no answers. */
  readonly deadline: string | null;
  /** The absolute public address of the invitation. */
  readonly link: string;
}

/** A run of whitespace, so a pasted name or occasion never adds a second space to the message. */
const WHITESPACE_RUN = /\s+/gu;

/** One line of visible text, exactly as the API's message keeps it. */
function oneLine(text: string): string {
  return text.replace(WHITESPACE_RUN, " ").trim();
}

/** The deadline day as the message writes it: «1 de agosto». A day no calendar has is named as it was stored. */
function deadlineText(deadline: string): string {
  const match = CALENDAR_DATE.exec(deadline);

  if (match === null) {
    return deadline;
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])] as [
    number,
    number,
    number,
  ];

  return DEADLINE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * The pending-RSVP message the command would send (L9.6): the greeting, the ask, the occasion, the deadline when the
 * invitation has one, and the public link. It is plain text with no markup and no line break, because a WhatsApp
 * message is one line, and it names nothing a guest does not already read on the invitation.
 */
export function reminderPreviewMessage(facts: ReminderPreviewFacts): string {
  const segments = [
    `Hola, ${oneLine(facts.guestName)} 👋`,
    "Te recordamos confirmar tu asistencia.",
    `Evento: ${oneLine(facts.occasion)}.`,
  ];

  if (facts.deadline !== null) {
    segments.push(`Fecha límite: ${deadlineText(facts.deadline)}.`);
  }
  segments.push(`Tu invitación: ${facts.link}`);

  return segments.join(" ");
}

/**
 * The deadline day of the editor's own deadline control (M6 G3): the `YYYY-MM-DD` part of the wall clock the owner
 * wrote in the invitation's zone, or null while the invitation closes no answers. The preview names the same day the
 * owner set, never an instant converted to another zone.
 */
export function deadlineDateOf(deadlineValue: string | undefined): string | null {
  const day = deadlineValue?.slice(0, 10) ?? "";

  return CALENDAR_DATE.test(day) ? day : null;
}
