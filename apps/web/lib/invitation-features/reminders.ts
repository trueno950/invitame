/**
 * The WhatsApp reminder switches as the owner read and the write carry them (F6; S2.6, S6, L9.1). The payload is the
 * one the API stores — `{ version: 1, pendingRsvp, eventEve }` — and this module is the web's single reader of it, so the
 * editor, the autosave, and the preview agree on its shape.
 *
 * A body written before the switches existed carries no value at all, which reads as no settings (L20: only fields are
 * added, never changed). Any other shape refuses the whole body instead of reaching the editor as a value no rule
 * validated, and a pair with both switches off reads as no settings because that is what the API stores for it.
 */

/** The only payload version this web reads; another version refuses the read. */
export const REMINDERS_VERSION = 1;

/** The stored switches of one invitation (F6; L9.1). */
export interface RemindersPayload {
  readonly version: typeof REMINDERS_VERSION;
  /** «Recordar a quien no ha confirmado»: seven and two days before the RSVP deadline. */
  readonly pendingRsvp: boolean;
  /** «Recordatorio del evento»: one day before the celebration. */
  readonly eventEve: boolean;
}

/** The only keys the payload carries: a body with another one is refused instead of half-read. */
const PAYLOAD_KEYS: ReadonlySet<string> = new Set(["version", "pendingRsvp", "eventEve"]);

/** A JSON object as the body answers it; arrays, null, and primitives are not objects. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Whether the object carries a key the payload does not declare. */
function hasOtherKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).some((key) => !allowed.has(key));
}

/**
 * The switches of one stored value, or null when the invitation has none, or `undefined` when the value is not the
 * payload this deployment reads. `undefined` is a refused body, never a silent "no settings": a shape nobody wrote
 * means a page and an API that disagree, which is worth failing closed on.
 */
export function parseRemindersPayload(value: unknown): RemindersPayload | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  const payload = record(value);

  if (
    payload === undefined ||
    payload.version !== REMINDERS_VERSION ||
    hasOtherKeys(payload, PAYLOAD_KEYS) ||
    typeof payload.pendingRsvp !== "boolean" ||
    typeof payload.eventEve !== "boolean"
  ) {
    return undefined;
  }
  if (!payload.pendingRsvp && !payload.eventEve) {
    return null;
  }

  return {
    version: REMINDERS_VERSION,
    pendingRsvp: payload.pendingRsvp,
    eventEve: payload.eventEve,
  };
}
