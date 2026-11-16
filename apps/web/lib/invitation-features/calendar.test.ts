import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildIcsCalendar,
  CALENDAR_EVENT_HOURS,
  calendarEventFor,
  calendarUid,
  escapeIcsText,
  foldIcsLine,
  googleCalendarUrl,
  icsTimestamp,
} from "./calendar.ts";
import type { EventFacts } from "./event-facts.ts";
import { startInstant } from "./start-instant.ts";

// The calendar feature of the guest page (S4): a Google Calendar link and an RFC 5545 `.ics` download for a
// four-hour event that starts at the invitation's wall clock in its own zone. Both carry the same facts, and
// the guest's calendar must read the file the same way on every device, so the text is escaped, the lines
// are folded at 75 octets, and every line ends in CRLF.

const FACTS: EventFacts = {
  title: "Cumpleaños de Mateo",
  date: "2026-12-05",
  time: "16:30",
  places: [
    {
      label: "Lugar",
      name: "Jardín Los Arcos",
      address: "Av. de las Flores 214, Ciudad de México",
    },
  ],
};

const BAPTISM_FACTS: EventFacts = {
  title: "Bautizo de Emilia",
  date: "2027-04-11",
  time: "11:00",
  places: [
    {
      label: "Ceremonia",
      name: "Parroquia San Miguel",
      address: "Calle Hidalgo 45, Centro, Querétaro",
    },
    {
      label: "Recepción",
      name: "Casa de los abuelos",
      address: "Av. de los Fresnos 210, Querétaro",
    },
  ],
};

const START = startInstant(FACTS.date, FACTS.time, "America/Mexico_City");

/** The logical lines of an `.ics` document, unfolded. */
function linesOf(ics: string): string[] {
  return ics
    .split("\r\n ")
    .join("")
    .split("\r\n")
    .filter((line) => line !== "");
}

/** The value of the first `NAME:` line of an `.ics` document. */
function propertyOf(ics: string, name: string): string | undefined {
  return linesOf(ics)
    .find((line) => line.startsWith(`${name}:`))
    ?.slice(name.length + 1);
}

describe("calendar event of an invitation", () => {
  it("starts at the invitation's wall clock and lasts four hours", () => {
    const event = calendarEventFor(FACTS, START);

    assert.equal(event.title, "Cumpleaños de Mateo");
    assert.equal(event.start.toISOString(), "2026-12-05T22:30:00.000Z");
    assert.equal(event.end.toISOString(), "2026-12-06T02:30:00.000Z");
    assert.equal(CALENDAR_EVENT_HOURS, 4);
    assert.equal(event.end.getTime() - event.start.getTime(), CALENDAR_EVENT_HOURS * 3_600_000);
  });

  it("puts every place in the description, so a baptism carries its reception", () => {
    const event = calendarEventFor(BAPTISM_FACTS, START);

    assert.equal(event.location, "Parroquia San Miguel, Calle Hidalgo 45, Centro, Querétaro");
    assert.match(
      event.description,
      /Ceremonia: Parroquia San Miguel, Calle Hidalgo 45, Centro, Querétaro/,
    );
    assert.match(
      event.description,
      /Recepción: Casa de los abuelos, Av. de los Fresnos 210, Querétaro/,
    );
    assert.equal(event.description.split("\n").length, 2);
  });
});

describe("Google Calendar link", () => {
  it("opens the event template with the UTC start and end", () => {
    const href = googleCalendarUrl(calendarEventFor(FACTS, START));
    const parsed = new URL(href);

    assert.equal(parsed.origin, "https://calendar.google.com");
    assert.equal(parsed.pathname, "/calendar/render");
    assert.equal(parsed.searchParams.get("action"), "TEMPLATE");
    assert.equal(parsed.searchParams.get("text"), "Cumpleaños de Mateo");
    assert.equal(parsed.searchParams.get("dates"), "20261205T223000Z/20261206T023000Z");
    assert.equal(
      parsed.searchParams.get("location"),
      "Jardín Los Arcos, Av. de las Flores 214, Ciudad de México",
    );
    assert.equal(
      parsed.searchParams.get("details"),
      "Lugar: Jardín Los Arcos, Av. de las Flores 214, Ciudad de México",
    );
  });

  it("encodes the title and the place text", () => {
    const href = googleCalendarUrl({
      title: "Bautizo de Emilia",
      start: START,
      end: new Date(START.getTime() + 3_600_000),
      location: "Salón «Los Pinos» & jardín",
      description: "Ceremonia: Parroquia San Miguel",
    });

    assert.doesNotMatch(href, /[ "«»]/);
    assert.equal(new URL(href).searchParams.get("location"), "Salón «Los Pinos» & jardín");
  });
});

describe("RFC 5545 calendar text", () => {
  const event = calendarEventFor(FACTS, START);
  const stamp = new Date("2026-11-20T15:04:05Z");

  it("writes one well-formed calendar with a single event", () => {
    const ics = buildIcsCalendar({ slug: "cumple-mateo", event, stamp });
    const lines = linesOf(ics);

    assert.equal(lines[0], "BEGIN:VCALENDAR");
    assert.ok(lines.includes("VERSION:2.0"));
    assert.ok(lines.includes("PRODID:-//InvitaMe//Invitaciones//ES"));
    assert.ok(lines.includes("CALSCALE:GREGORIAN"));
    assert.ok(lines.includes("METHOD:PUBLISH"));
    assert.ok(lines.includes("BEGIN:VEVENT"));
    assert.ok(lines.includes("END:VEVENT"));
    assert.equal(lines.at(-1), "END:VCALENDAR");
    assert.equal(lines.filter((line) => line === "BEGIN:VEVENT").length, 1);
  });

  it("carries the same facts as the Google link, in UTC", () => {
    const ics = buildIcsCalendar({ slug: "cumple-mateo", event, stamp });

    assert.equal(propertyOf(ics, "DTSTART"), "20261205T223000Z");
    assert.equal(propertyOf(ics, "DTEND"), "20261206T023000Z");
    assert.equal(propertyOf(ics, "DTSTAMP"), "20261120T150405Z");
    assert.equal(propertyOf(ics, "SUMMARY"), "Cumpleaños de Mateo");
    assert.equal(
      propertyOf(ics, "LOCATION"),
      escapeIcsText("Jardín Los Arcos, Av. de las Flores 214, Ciudad de México"),
    );
    assert.match(propertyOf(ics, "UID") ?? "", /^cumple-mateo@/);
  });

  it("derives a stable UID from the slug the caller passes in", () => {
    const first = buildIcsCalendar({ slug: "cumple-mateo", event, stamp });
    const again = buildIcsCalendar({ slug: "cumple-mateo", event, stamp });
    const other = buildIcsCalendar({ slug: "bautizo-emilia", event, stamp });

    assert.equal(first, again);
    assert.equal(calendarUid("cumple-mateo"), propertyOf(first, "UID"));
    assert.notEqual(propertyOf(first, "UID"), propertyOf(other, "UID"));
    assert.equal(calendarUid("cumple-mateo"), calendarUid("cumple-mateo"));
  });

  it("terminates every line with CRLF, including the last one", () => {
    const ics = buildIcsCalendar({ slug: "cumple-mateo", event, stamp });

    assert.doesNotMatch(ics.replaceAll("\r\n", ""), /[\r\n]/);
    assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
    assert.equal(ics.indexOf("BEGIN:VCALENDAR\r\n"), 0);
  });

  it("escapes the characters a property value reserves", () => {
    assert.equal(escapeIcsText("a, b; c\\d"), "a\\, b\\; c\\\\d");
    assert.equal(escapeIcsText("línea uno\nlínea dos"), "línea uno\\nlínea dos");
    assert.equal(escapeIcsText("línea uno\r\nlínea dos"), "línea uno\\nlínea dos");

    const ics = buildIcsCalendar({
      slug: "cumple-mateo",
      event: { ...event, title: "Cumpleaños, de; Mateo \\ bis" },
      stamp,
    });

    assert.equal(propertyOf(ics, "SUMMARY"), "Cumpleaños\\, de\\; Mateo \\\\ bis");
  });

  it("folds a long line at 75 octets without splitting a character", () => {
    const long = `Lugar: ${"Jardín Los Arcos, Av. de las Flores 214, Ciudad de México. ".repeat(6)}`;
    const folded = foldIcsLine(`DESCRIPTION:${escapeIcsText(long)}`);
    const foldedLines = folded.split("\r\n");

    assert.ok(foldedLines.length > 1, "the line is folded");
    for (const line of foldedLines) {
      assert.ok(
        Buffer.byteLength(line, "utf8") <= 75,
        `line of ${Buffer.byteLength(line, "utf8")} octets: ${line}`,
      );
      assert.doesNotMatch(line, /\uFFFD/);
    }
    assert.equal(folded.split("\r\n ").join(""), `DESCRIPTION:${escapeIcsText(long)}`);
  });

  it("folds the folded lines of a real event the same way", () => {
    const ics = buildIcsCalendar({
      slug: "bautizo-emilia",
      event: calendarEventFor(BAPTISM_FACTS, START),
      stamp,
    });

    for (const line of ics.split("\r\n").filter((line) => line !== "")) {
      assert.ok(Buffer.byteLength(line, "utf8") <= 75, `line: ${line}`);
    }
    assert.equal(
      propertyOf(ics, "DESCRIPTION"),
      escapeIcsText(
        "Ceremonia: Parroquia San Miguel, Calle Hidalgo 45, Centro, Querétaro\nRecepción: Casa de los abuelos, Av. de los Fresnos 210, Querétaro",
      ),
    );
  });

  it("formats a timestamp as UTC basic format", () => {
    assert.equal(icsTimestamp(new Date("2026-01-02T03:04:05Z")), "20260102T030405Z");
  });
});
