/**
 * The start instant of an invitation (S3, S4): the layout stores a calendar day and a wall clock, and the
 * invitation stores the IANA time zone the guest reads them in. This module is the one place that turns the
 * pair into an instant, using `Intl` only, so the web adds no time zone dependency and every caller agrees
 * on the same answer.
 *
 * Two properties matter for correctness, and both are pinned by `start-instant.test.ts`:
 *
 * - A wall clock that happens twice (the hour a zone repeats when daylight saving time ends) resolves to its
 *   first occurrence, which is the earlier instant.
 * - A wall clock that does not exist (the hour a zone skips when daylight saving time starts) resolves to
 *   the first instant after the transition, so an invitation never starts before the day it names.
 *
 * An unknown zone is refused with a `RangeError`. Falling back to UTC would silently move every celebration
 * of a mistyped snapshot, so there is no fallback.
 */

const DAY_MS = 86_400_000;

/** The formatters this module reuses; every one of them is a valid zone, so a failure is never cached. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** The wall clock fields of one instant in one zone. */
interface ZonedWallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/** The formatter of one zone, or a `RangeError` when `Intl` does not know the zone. */
function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(timeZone);

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
    second: "2-digit",
  });

  FORMATTERS.set(timeZone, formatter);
  return formatter;
}

/** Whether `Intl` knows the zone, so a caller can refuse a snapshot before it renders anything. */
export function isSupportedTimeZone(timeZone: string): boolean {
  try {
    zonedFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The wall clock of `instant` in `timeZone`. */
function zonedWallClock(instant: number, timeZone: string): ZonedWallClock {
  const parts = zonedFormatter(timeZone).formatToParts(new Date(instant));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** The instant at which UTC reads the same fields as `wall`, which is how a zone offset is measured. */
function wallClockMs(wall: ZonedWallClock): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

/** The offset of `timeZone` from UTC at `instant`, in milliseconds: local wall clock minus the instant. */
function offsetMs(instant: number, timeZone: string): number {
  const whole = Math.floor(instant / 1000) * 1000;

  return wallClockMs(zonedWallClock(whole, timeZone)) - whole;
}

/** The wall clock fields of a `YYYY-MM-DD` day and an `HH:MM` time, already parsed by the content parser. */
function requestedWallClock(date: string, time: string): number {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);

  if (day === null || clock === null) {
    throw new RangeError("the start of an invitation needs a YYYY-MM-DD date and an HH:MM time");
  }

  return Date.UTC(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2]),
    0,
  );
}

/**
 * The instant of `date` and `time` in `timeZone`, refused with a `RangeError` for an unknown zone. The two
 * candidate offsets are read a day either side of the requested wall clock, which is enough to see both
 * sides of a transition; an exact candidate wins, the earlier one when the clock repeats, and the later one
 * when the clock skips an hour.
 */
export function startInstant(date: string, time: string, timeZone: string): Date {
  const wall = requestedWallClock(date, time);
  const candidates = [
    wall - offsetMs(wall - DAY_MS, timeZone),
    wall - offsetMs(wall + DAY_MS, timeZone),
  ];
  const exact = [...new Set(candidates)]
    .filter((candidate) => wallClockMs(zonedWallClock(candidate, timeZone)) === wall)
    .sort((first, second) => first - second);

  return new Date(exact.length > 0 ? (exact[0] as number) : Math.max(...candidates));
}

/** The calendar day of `instant` in `timeZone`, as `YYYY-MM-DD`: the day the guest reads on the page. */
export function zonedDateKey(instant: Date, timeZone: string): string {
  const wall = zonedWallClock(instant.getTime(), timeZone);
  const pad = (value: number, length = 2): string => String(value).padStart(length, "0");

  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}`;
}
