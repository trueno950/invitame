import { isCalendarDate, isClockTime } from "../renderers/invitation-fields.ts";
import { isSupportedTimeZone, startInstant } from "./start-instant.ts";

/**
 * The RSVP deadline of an invitation, in the invitation's own zone (M6 G3; S4). The API stores an ISO instant;
 * the creator writes a wall clock with a `datetime-local` field and the guest reads the same wall clock as a
 * sentence. These three functions are the only place the web moves between the two, and every one of them refuses
 * a value it cannot read instead of guessing a zone or an instant.
 *
 * The wall clock is read with the same `startInstant` the countdown and the calendar use, so a deadline that
 * falls in a repeated or skipped hour of a DST transition resolves exactly like the celebration's own start.
 */

/** The two formatters this module reads a wall clock with; the zone is part of the key, never a fallback. */
const PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const TEXT_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = PARTS_FORMATTERS.get(timeZone);

  if (cached !== undefined) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  PARTS_FORMATTERS.set(timeZone, formatter);
  return formatter;
}

function textFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = TEXT_FORMATTERS.get(timeZone);

  if (cached !== undefined) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("es-MX", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  TEXT_FORMATTERS.set(timeZone, formatter);
  return formatter;
}

/**
 * The API's own shape of a stored deadline: a date, `T`, a time, and `Z` or an offset. A date alone names no
 * instant, so a value the API would never store is never read as one here either.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** The instant of an ISO deadline value, or undefined when it is not one. */
function instantOf(deadline: string): Date | undefined {
  const at = ISO_INSTANT.test(deadline) ? Date.parse(deadline) : Number.NaN;

  return Number.isNaN(at) ? undefined : new Date(at);
}

/** The deadline as one sentence on the invitation's clock: «5 de diciembre de 2026 a las 17:30». */
export function formatRsvpDeadline(deadline: string, timeZone: string): string | undefined {
  const instant = instantOf(deadline);

  if (instant === undefined) {
    return undefined;
  }

  try {
    return textFormatter(timeZone).format(instant);
  } catch {
    return undefined;
  }
}

/**
 * The deadline as the value of a `datetime-local` field, in the invitation's zone: `YYYY-MM-DDTHH:MM`.
 * The value is written in that zone and read back with `deadlineInstant`, so a creator who saves the settings
 * without touching the field stores exactly the instant that was there.
 */
export function deadlineInputValue(deadline: string, timeZone: string): string | undefined {
  const instant = instantOf(deadline);

  if (instant === undefined) {
    return undefined;
  }

  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = partsFormatter(timeZone).formatToParts(instant);
  } catch {
    return undefined;
  }

  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

/**
 * The instant of a `datetime-local` value read in the invitation's zone, as the ISO string the API stores.
 * A value that is not a real calendar day and wall clock is refused, as is a zone this runtime does not know:
 * the caller reports an issue instead of storing an instant nobody chose.
 */
export function deadlineInstant(input: string, timeZone: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(input);

  if (match === null || !isCalendarDate(match[1] as string) || !isClockTime(match[2] as string)) {
    return undefined;
  }
  if (!isSupportedTimeZone(timeZone)) {
    return undefined;
  }

  return startInstant(match[1] as string, match[2] as string, timeZone).toISOString();
}
