import { isCalendarDate } from "./reminder-schedule";
import type { ReminderKind } from "./reminder-schedule";

/**
 * The WhatsApp message one guest receives (F6; S2.6, S6, L9.6). It names the guest, the occasion, the deadline or the
 * time of the celebration, and the public link — the facts the guest already reads on the invitation — and nothing
 * else: no owner name beyond what the invocation already public says, no phone, no answer, no address, no price.
 *
 * The words are neutral professional Spanish in the second person, so one template serves every layout; the text
 * carries no markup and no line break, because a WhatsApp message is plain text. The same template is mirrored by the
 * web preview (`apps/web/lib/customer/reminders.ts`), and both suites assert the exact wording, so the owner sees
 * the message the command would send.
 */

/** The formatter of the deadline day, in the months Spanish names; `UTC` keeps a calendar day a calendar day. */
const DEADLINE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** A run of whitespace, including the non-breaking space a name may carry: one space is what a message shows. */
const WHITESPACE_RUN = /\s+/gu;

/** The facts one reminder message is built from. */
export interface ReminderMessageFacts {
  readonly kind: ReminderKind;
  /** The guest's name as the owner stored it; it is the guest's own name, which the invitation already shows them. */
  readonly guestName: string;
  /** The occasion, as the pinned template's category names it («XV años», «Boda», «Bautizo»). */
  readonly occasion: string;
  /** The RSVP deadline as a calendar day, or null when the invitation has none. */
  readonly deadline: string | null;
  /** The start of the celebration as a wall clock, or null when the layout announces none. */
  readonly eventTime: string | null;
  /** The absolute public address of the invitation. */
  readonly link: string;
}

/** One line of visible text, so a name with a line break can never add a sentence to the message. */
function oneLine(text: string): string {
  return text.replace(WHITESPACE_RUN, " ").trim();
}

/** The deadline day as the message writes it: «1 de agosto». A day no calendar has is named as it was stored. */
function deadlineText(deadline: string): string {
  if (!isCalendarDate(deadline)) {
    return deadline;
  }

  const [year, month, day] = deadline.split("-").map(Number) as [number, number, number];

  return DEADLINE_FORMATTER.format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * The message of one reminder (L9.6). The pending-RSVP reminder asks the guest to confirm before the deadline; the
 * event reminder says the celebration is tomorrow and names its start time. A fact the invitation does not have is
 * left as no sentence instead of a made-up one, so a layout without a single start time still gets a correct message.
 */
export function reminderMessage(facts: ReminderMessageFacts): string {
  const segments = [`Hola, ${oneLine(facts.guestName)} 👋`];

  if (facts.kind === "EVENT_EVE") {
    segments.push("Te esperamos mañana.");
    segments.push(`Evento: ${oneLine(facts.occasion)}.`);
    if (facts.eventTime !== null) {
      segments.push(`Hora: ${oneLine(facts.eventTime)} h.`);
    }
  } else {
    segments.push("Te recordamos confirmar tu asistencia.");
    segments.push(`Evento: ${oneLine(facts.occasion)}.`);
    if (facts.deadline !== null) {
      segments.push(`Fecha límite: ${deadlineText(facts.deadline)}.`);
    }
  }
  segments.push(`Tu invitación: ${facts.link}`);

  return segments.join(" ");
}
