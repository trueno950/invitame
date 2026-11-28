import { guestText } from "../i18n/guest-texts.ts";
import type { Locale } from "../i18n/locale.ts";
import type { EventFacts, EventPlace } from "./event-facts.ts";

/**
 * The calendar feature of the guest page (S4): a Google Calendar link and an RFC 5545 `.ics` file for one
 * four-hour event that starts at the invitation's wall clock in its own zone. Both are built from the same
 * `CalendarEvent`, so the two never disagree about the title, the place, or the description, and the
 * description lists every place — a baptism's reception included.
 *
 * The `.ics` text follows RFC 5545 literally, because a guest's calendar is a strict parser: UTC timestamps
 * in basic format, escaped text, folded lines of at most 75 octets, and CRLF after every line including the
 * last. The UID comes from the invitation's slug, so re-downloading the file updates the same event instead
 * of creating a second one.
 */

const HOUR_MS = 3_600_000;
const MAX_LINE_OCTETS = 75;
const CONTINUATION_OCTETS = 74;

/** The length of every calendar event this product creates: a celebration is an afternoon, not a day. */
export const CALENDAR_EVENT_HOURS = 4;

/** One event as both calendar formats read it. */
export interface CalendarEvent {
  readonly title: string;
  readonly start: Date;
  readonly end: Date;
  readonly location: string;
  readonly description: string;
}

/** The calendar event of an invitation: its title, its four hours, and every place in the description. */
export function calendarEventFor(facts: EventFacts, start: Date): CalendarEvent {
  const first = facts.places[0];

  return {
    title: facts.title,
    start,
    end: new Date(start.getTime() + CALENDAR_EVENT_HOURS * HOUR_MS),
    location: first === undefined ? "" : placeLine(first),
    description: facts.places.map((place) => `${place.label}: ${placeLine(place)}`).join("\n"),
  };
}

/** One place as a single line of text: the name and then the address. */
function placeLine(place: EventPlace): string {
  return `${place.name}, ${place.address}`;
}

/** A moment in UTC basic format, the only format RFC 5545 requires every implementation to read. */
export function icsTimestamp(date: Date): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, "0");

  return [
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`,
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`,
  ].join("");
}

/** A property value with the characters RFC 5545 reserves escaped. */
export function escapeIcsText(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

const encoder = new TextEncoder();

/**
 * One content line, folded at 75 octets: a long line continues on the next one, which starts with a space
 * that is part of the fold and not of the value. A character is never split, so every continuation line
 * stays valid UTF-8 while it carries at most 74 octets of text plus its leading space.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  let limit = MAX_LINE_OCTETS;

  for (const character of line) {
    const size = encoder.encode(character).length;

    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
      limit = CONTINUATION_OCTETS;
    }
    current += character;
    octets += size;
  }
  parts.push(current);

  return parts.join("\r\n ");
}

/** The stable UID of one invitation's event: the same slug always names the same event. */
export function calendarUid(slug: string): string {
  return `${slug}@invitame`;
}

/** Everything the file needs: the invitation's slug, the event, the moment the file was generated, and its language. */
export interface IcsCalendarInput {
  readonly slug: string;
  readonly event: CalendarEvent;
  readonly stamp: Date;
  /**
   * The locale the guest page renders (F14; L19.2). Only the file's fixed parts follow it — the product identifier and,
   * through the facts it is given, the layout's own derived title and place labels; every word the owner wrote is the
   * same in both languages.
   */
  readonly locale?: Locale;
}

/** The `.ics` file of one invitation, ready to answer a download request. */
export function buildIcsCalendar({ slug, event, stamp, locale = "es" }: IcsCalendarInput): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${guestText(locale, "calendar.prodid")}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(calendarUid(slug))}`,
    `DTSTAMP:${icsTimestamp(stamp)}`,
    `DTSTART:${icsTimestamp(event.start)}`,
    `DTEND:${icsTimestamp(event.end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** The Google Calendar template that adds the same event without a download. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const parameters: readonly (readonly [string, string])[] = [
    ["action", "TEMPLATE"],
    ["text", event.title],
    ["dates", `${icsTimestamp(event.start)}/${icsTimestamp(event.end)}`],
    ["details", event.description],
    ["location", event.location],
  ];

  return `https://calendar.google.com/calendar/render?${parameters
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("&")}`;
}
