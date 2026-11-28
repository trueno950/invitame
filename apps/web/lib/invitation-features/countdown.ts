import { guestFormats, guestText } from "../i18n/guest-texts.ts";
import type { Locale } from "../i18n/locale.ts";
import { CALENDAR_EVENT_HOURS } from "./calendar.ts";
import { zonedDateKey } from "./start-instant.ts";

/**
 * The countdown of the guest page (S3, S4): days, hours, and minutes to the start of the celebration in the
 * invitation's own zone, plus the states a countdown has to say out loud — the celebration is today, it is
 * happening now, or it is over. The value is computed on the server at request time and recomputed in the client
 * island from the same pure functions, so a guest without JavaScript still reads the server's answer.
 *
 * Once the countdown reaches zero the celebration is happening: for the same four hours the calendar event
 * lasts it reads «¡Es hoy!», and only after that «La celebración ya pasó» (owner decision, invitation-features L8).
 */

export type CountdownStatus = "upcoming" | "today" | "live" | "passed";

/** What the countdown shows: a status and the whole days, hours, and minutes that are left. */
export interface CountdownParts {
  readonly status: CountdownStatus;
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
}

/** One number of the countdown, with the unit it is counted in. */
export interface CountdownGroup {
  readonly key: "days" | "hours" | "minutes";
  readonly value: number;
  readonly unit: string;
}

const MINUTE_MS = 60_000;
const MINUTES_PER_DAY = 1440;
const MINUTES_PER_HOUR = 60;
const EVENT_MS = CALENDAR_EVENT_HOURS * MINUTES_PER_HOUR * MINUTE_MS;

/**
 * The countdown of `target` seen from `now` in `timeZone`. The status compares calendar days in the
 * invitation's zone, never in UTC, so «Hoy es el día» means today for the guest who reads it.
 */
export function countdownParts(target: Date, now: Date, timeZone: string): CountdownParts {
  const remaining = target.getTime() - now.getTime();

  if (remaining <= 0) {
    return { status: remaining > -EVENT_MS ? "live" : "passed", days: 0, hours: 0, minutes: 0 };
  }

  const totalMinutes = Math.floor(remaining / MINUTE_MS);
  const status =
    zonedDateKey(target, timeZone) === zonedDateKey(now, timeZone) ? "today" : "upcoming";

  return {
    status,
    days: Math.floor(totalMinutes / MINUTES_PER_DAY),
    hours: Math.floor((totalMinutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR),
    minutes: totalMinutes % MINUTES_PER_HOUR,
  };
}

/**
 * The numbers the countdown shows: no days for a celebration that is today, none once it started. Each number carries
 * its unit in the locale the page renders (F14; L19.2), so an English guest reads «3 days» where a Spanish one reads
 * «3 días», and an absent locale keeps exactly the Spanish units this block always drew.
 */
export function countdownGroups(
  parts: CountdownParts,
  locale: Locale = "es",
): readonly CountdownGroup[] {
  if (parts.status === "live" || parts.status === "passed") {
    return [];
  }

  const formats = guestFormats(locale);
  const days: readonly CountdownGroup[] =
    parts.days > 0
      ? [{ key: "days", value: parts.days, unit: formats.countdownDays(parts.days) }]
      : [];

  return [
    ...days,
    { key: "hours", value: parts.hours, unit: formats.countdownHours(parts.hours) },
    { key: "minutes", value: parts.minutes, unit: formats.countdownMinutes(parts.minutes) },
  ];
}

/**
 * The countdown as one sentence, for the accessible name of the block (F14; L19.2): the same numbers the groups show,
 * joined with the list rule and the verb of the locale the page renders.
 */
export function countdownLabel(parts: CountdownParts, locale: Locale = "es"): string {
  if (parts.status === "live") {
    return guestText(locale, "countdown.live");
  }

  if (parts.status === "passed") {
    return guestText(locale, "countdown.passed");
  }

  const shown = countdownGroups(parts, locale).filter((group) => group.value > 0);

  if (shown.length === 0) {
    return guestText(locale, "countdown.soon");
  }

  return guestFormats(locale).countdownSentence(shown);
}
