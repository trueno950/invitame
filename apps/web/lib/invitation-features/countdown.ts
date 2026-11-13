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

/** The numbers the countdown shows: no days for a celebration that is today, none once it started. */
export function countdownGroups(parts: CountdownParts): readonly CountdownGroup[] {
  if (parts.status === "live" || parts.status === "passed") {
    return [];
  }

  const days: readonly CountdownGroup[] =
    parts.days > 0
      ? [{ key: "days", value: parts.days, unit: amount(parts.days, "día", "días") }]
      : [];

  return [
    ...days,
    { key: "hours", value: parts.hours, unit: amount(parts.hours, "hora", "horas") },
    { key: "minutes", value: parts.minutes, unit: amount(parts.minutes, "minuto", "minutos") },
  ];
}

/** The countdown as one neutral Spanish sentence, for the accessible name of the block. */
export function countdownLabel(parts: CountdownParts): string {
  if (parts.status === "live") {
    return "¡Es hoy!";
  }

  if (parts.status === "passed") {
    return "La celebración ya pasó";
  }

  const shown = countdownGroups(parts).filter((group) => group.value > 0);
  const chunks = shown.map((group) => `${group.value} ${group.unit}`);

  if (chunks.length === 0) {
    return "Falta menos de un minuto";
  }

  // «Falta 1 día» but «Faltan 40 minutos»: the verb agrees with the amount it counts.
  const singular = shown.length === 1 && shown[0]?.value === 1;

  return `${singular ? "Falta" : "Faltan"} ${joinList(chunks)}`;
}

/** A number with its singular or plural unit: `1 día`, `3 días`. */
function amount(value: number, singular: string, plural: string): string {
  return value === 1 ? singular : plural;
}

/** `a`, `a y b`, `a, b y c`: the Spanish list of a sentence. */
function joinList(chunks: readonly string[]): string {
  if (chunks.length <= 1) {
    return chunks.join("");
  }

  return `${chunks.slice(0, -1).join(", ")} y ${chunks.at(-1) ?? ""}`;
}
