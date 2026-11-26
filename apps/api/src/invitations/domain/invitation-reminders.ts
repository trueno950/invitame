/**
 * The WhatsApp reminder settings of one invitation (F6; S2.6, S6, L9.1). The owner chooses which reminders the
 * invitation may send — «Recordar a quien no ha confirmado» (seven and two days before the RSVP deadline) and
 * «Recordatorio del evento» (one day before the celebration) — and those two switches are the whole stored value:
 *
 * ```json
 * { "version": 1, "pendingRsvp": true, "eventEve": true }
 * ```
 *
 * The rules are the ones the column cannot state: the version is exactly 1, both switches are booleans, and a pair
 * with nothing switched on means the invitation has no reminder settings at all, which is why `null` is a valid
 * value of the whole payload. Nothing here sends anything, knows a provider, or holds a secret: the switches work as
 * soon as a sender is configured (S6), and the schedule and the message are `src/reminders/domain`.
 */

/** The only payload version this API stores; a later shape needs a new version and its own reader (L9.1). */
export const REMINDERS_VERSION = 1;

/** The message a payload that is not an object is refused with. */
export const REMINDERS_TYPE_ISSUE = "reminders must be an object or null";

/** The message a payload of another version is refused with. */
export const REMINDERS_VERSION_ISSUE = "reminders.version must be 1";

/** The message a pending-RSVP switch that is not a boolean is refused with. */
export const REMINDERS_PENDING_RSVP_ISSUE = "reminders.pendingRsvp must be true or false";

/** The message an event-eve switch that is not a boolean is refused with. */
export const REMINDERS_EVENT_EVE_ISSUE = "reminders.eventEve must be true or false";

/**
 * The reminder settings of one invitation: the two switches, in the version this API stores. Both are always
 * present, so a reader never has to guess what an absent switch means.
 */
export interface InvitationReminders {
  readonly version: typeof REMINDERS_VERSION;
  /** «Recordar a quien no ha confirmado»: seven and two days before the RSVP deadline (L9.1). */
  readonly pendingRsvp: boolean;
  /** «Recordatorio del evento»: one day before the celebration (L9.1). */
  readonly eventEve: boolean;
}

/** A validated payload, or every deterministic English issue that refuses it. */
export type RemindersValidation =
  | { readonly ok: true; readonly value: InvitationReminders | null }
  | { readonly ok: false; readonly issues: readonly string[] };

/** A JSON object as a request or a `Json` column answers it; arrays, null, and primitives are not objects. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates the reminder settings of one feature-settings request (F6; L9.1). `null`, `undefined`, and a pair with
 * both switches off all mean "no reminder settings" and answer `null`, which is how the owner turns every reminder
 * off. Every other value must be the versioned payload this API stores; the issues are reported in a deterministic
 * order — the version, then the pending-RSVP switch, then the event-eve switch — so a client shows them without
 * guessing. The stored value always satisfies the rules above, which is the only shape the column trusts.
 */
export function validateReminders(value: unknown): RemindersValidation {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (!isJsonObject(value)) {
    return { ok: false, issues: [REMINDERS_TYPE_ISSUE] };
  }

  const issues: string[] = [];

  if (value.version !== REMINDERS_VERSION) {
    issues.push(REMINDERS_VERSION_ISSUE);
  }
  if (typeof value.pendingRsvp !== "boolean") {
    issues.push(REMINDERS_PENDING_RSVP_ISSUE);
  }
  if (typeof value.eventEve !== "boolean") {
    issues.push(REMINDERS_EVENT_EVE_ISSUE);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (value.pendingRsvp === false && value.eventEve === false) {
    return { ok: true, value: null };
  }

  return {
    ok: true,
    value: {
      version: REMINDERS_VERSION,
      pendingRsvp: value.pendingRsvp as boolean,
      eventEve: value.eventEve as boolean,
    },
  };
}

/**
 * The reminder settings a stored row carries, or null when the row cannot be one this deployment sends from (F6;
 * L9.1). A row written around the API — another version, a switch that is not a boolean, a pair with nothing on —
 * reads as no reminder settings instead of reaching the command as a value no rule validated.
 */
export function storedReminders(value: unknown): InvitationReminders | null {
  if (value === null || value === undefined) {
    return null;
  }

  const validated = validateReminders(value);

  return validated.ok ? validated.value : null;
}
