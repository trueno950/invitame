import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EVENT_EVE_OFFSET_DAYS,
  eventDateOf,
  eventWallClockOf,
  PENDING_RSVP_FIRST_OFFSET_DAYS,
  PENDING_RSVP_SECOND_OFFSET_DAYS,
  REMINDER_KINDS,
  REMINDERS_FEATURE_KEY,
  remindersDueOn,
  remindersGranted,
  shiftCalendarDate,
  zonedDateKey,
} from "./reminder-schedule";

// The schedule of the WhatsApp reminders (F6; S2.6, S6, L9.4): which reminder is due today — seven and two days
// before the RSVP deadline for the guests who have not answered, one day before the celebration — always read in the
// invitation's own IANA zone. The message itself is `reminder-message.ts`.

const SETTINGS = { version: 1, pendingRsvp: true, eventEve: true } as const;

/** The reminder kinds due on one day, with their due date, as the command plans them. */
function due(today: string, deadlineDate: string | null, eventDate: string | null): string[] {
  return remindersDueOn({ today, deadlineDate, eventDate, settings: SETTINGS }).map(
    (reminder) => `${reminder.kind}@${reminder.dueDate}`,
  );
}

describe("the reminder kinds and their offsets (L9.1, L9.4)", () => {
  it("states the three kinds and the days before the deadline and the celebration", () => {
    assert.deepEqual(REMINDER_KINDS, ["PENDING_RSVP_7D", "PENDING_RSVP_2D", "EVENT_EVE"]);
    assert.equal(PENDING_RSVP_FIRST_OFFSET_DAYS, 7);
    assert.equal(PENDING_RSVP_SECOND_OFFSET_DAYS, 2);
    assert.equal(EVENT_EVE_OFFSET_DAYS, 1);
  });

  it("gates on the catalog key the deluxe package grants, and on nothing else", () => {
    assert.equal(REMINDERS_FEATURE_KEY, "WHATSAPP_REMINDERS");
    assert.equal(remindersGranted(["WHATSAPP", REMINDERS_FEATURE_KEY]), true);
    assert.equal(remindersGranted(["WHATSAPP"]), false);
    assert.equal(remindersGranted([]), false);
    // A look-alike key never grants the capability: the key is compared whole and case-sensitively.
    assert.equal(remindersGranted(["whatsapp_reminders"]), false);
  });
});

describe("the reminder due today (L9.4)", () => {
  it("finds the two pending-RSVP reminders and the event-eve reminder on their own day", () => {
    assert.deepEqual(due("2026-07-25", "2026-08-01", "2026-09-12"), ["PENDING_RSVP_7D@2026-07-25"]);
    assert.deepEqual(due("2026-07-30", "2026-08-01", "2026-09-12"), ["PENDING_RSVP_2D@2026-07-30"]);
    assert.deepEqual(due("2026-09-11", "2026-08-01", "2026-09-12"), ["EVENT_EVE@2026-09-11"]);
    // Every other day has nothing to send: a reminder is due on exactly one day, never on a range.
    for (const day of ["2026-07-24", "2026-07-26", "2026-07-31", "2026-08-01", "2026-09-10"]) {
      assert.deepEqual(due(day, "2026-08-01", "2026-09-12"), []);
    }
  });

  it("plans the reminders the owner switched on and nothing else", () => {
    for (const settings of [
      { version: 1 as const, pendingRsvp: false, eventEve: false },
      { version: 1 as const, pendingRsvp: true, eventEve: false },
      { version: 1 as const, pendingRsvp: false, eventEve: true },
    ]) {
      const pendingOn = settings.pendingRsvp;
      const eventOn = settings.eventEve;

      assert.deepEqual(
        remindersDueOn({
          today: "2026-07-25",
          deadlineDate: "2026-08-01",
          eventDate: "2026-09-12",
          settings,
        }),
        pendingOn ? [{ kind: "PENDING_RSVP_7D", dueDate: "2026-07-25" }] : [],
      );
      assert.deepEqual(
        remindersDueOn({
          today: "2026-09-11",
          deadlineDate: "2026-08-01",
          eventDate: "2026-09-12",
          settings,
        }),
        eventOn ? [{ kind: "EVENT_EVE", dueDate: "2026-09-11" }] : [],
      );
    }
  });

  it("sends no deadline reminder to an invitation that never closes its RSVP", () => {
    assert.deepEqual(due("2026-07-25", null, "2026-09-12"), []);
    // The event reminder does not depend on the deadline.
    assert.deepEqual(due("2026-09-11", null, "2026-09-12"), ["EVENT_EVE@2026-09-11"]);
  });

  it("sends the event reminder only while the celebration has a date", () => {
    // The deadline reminder names the deadline, so it needs no celebration date; the event reminder is about that
    // day, so an invitation without one sends nothing for it.
    assert.deepEqual(due("2026-07-25", "2026-08-01", null), ["PENDING_RSVP_7D@2026-07-25"]);
    assert.deepEqual(due("2026-09-11", "2026-08-01", null), []);
  });

  it("ignores the offset days that already passed before the run", () => {
    // A deadline of tomorrow: both pending-reminder days are behind us, so only a moving deadline could make one
    // due, and a day that is gone never sends anything.
    assert.deepEqual(due("2026-08-01", "2026-08-02", "2026-09-12"), []);
    // The same deadline on its own two offset days still finds each reminder exactly once.
    assert.deepEqual(due("2026-07-26", "2026-08-02", "2026-09-12"), ["PENDING_RSVP_7D@2026-07-26"]);
    assert.deepEqual(due("2026-07-31", "2026-08-02", "2026-09-12"), ["PENDING_RSVP_2D@2026-07-31"]);
  });
});

describe("calendar days in the invitation's own zone (L9.4)", () => {
  it("reads an instant as the day the guest reads in that zone", () => {
    // Four in the morning of August 1st in UTC is still July 31st in Mexico City.
    assert.equal(
      zonedDateKey(new Date("2026-08-01T04:00:00Z"), "America/Mexico_City"),
      "2026-07-31",
    );
    assert.equal(zonedDateKey(new Date("2026-08-01T04:00:00Z"), "UTC"), "2026-08-01");
    assert.equal(
      zonedDateKey(new Date("2026-08-01T06:00:00Z"), "America/Mexico_City"),
      "2026-08-01",
    );
    assert.equal(zonedDateKey(new Date("2026-01-01T05:00:00Z"), "America/Tijuana"), "2025-12-31");
  });

  it("shifts a calendar day across month, year, and leap-year boundaries", () => {
    assert.equal(shiftCalendarDate("2026-08-01", -7), "2026-07-25");
    assert.equal(shiftCalendarDate("2026-08-01", -2), "2026-07-30");
    assert.equal(shiftCalendarDate("2026-03-01", -1), "2026-02-28");
    assert.equal(shiftCalendarDate("2028-03-01", -1), "2028-02-29");
    assert.equal(shiftCalendarDate("2026-01-01", -1), "2025-12-31");
    assert.equal(shiftCalendarDate("2026-12-31", 1), "2027-01-01");
  });
});

describe("the facts of the celebration the message names (L9.6)", () => {
  it("reads the calendar day and the start time the layout stores", () => {
    assert.equal(eventDateOf({ date: "2026-09-12", time: "19:30" }), "2026-09-12");
    assert.equal(eventWallClockOf({ date: "2026-09-12", time: "19:30" }), "19:30");
  });

  it("reads the ceremony or the reception time when the layout has no single time", () => {
    assert.equal(
      eventWallClockOf({ date: "2026-09-12", ceremonyTime: "13:00", receptionTime: "19:00" }),
      "13:00",
    );
    assert.equal(eventWallClockOf({ date: "2026-09-12", receptionTime: "19:00" }), "19:00");
  });

  it("refuses a day or a clock the layout could not have written", () => {
    assert.equal(eventDateOf({ date: "12/09/2026", time: "19:30" }), null);
    assert.equal(eventDateOf({ date: "2026-02-30", time: "19:30" }), null);
    assert.equal(eventDateOf({ time: "19:30" }), null);
    assert.equal(eventDateOf(null), null);
    assert.equal(eventWallClockOf({ date: "2026-09-12", time: "7 pm" }), null);
    assert.equal(eventWallClockOf({ date: "2026-09-12", time: "24:00" }), null);
    assert.equal(eventWallClockOf({ date: "2026-09-12" }), null);
  });
});
