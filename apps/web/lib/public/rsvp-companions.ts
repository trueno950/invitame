/**
 * The companion rows and the dietary notes of the guest's RSVP form (F3; S2.3, L6.3). One module serves both forms —
 * the open one on `/i/<slug>` and the guest's own card on `/i/<slug>/g/<token>` — because they ask the same question:
 * who comes with you, which of them are children, and what can they not eat.
 *
 * The fields are named by row (`companionName-1`, `companionChild-1`, …), not repeated under one name, so a row's name
 * and its child mark can never be paired with another row's. The rows are server-rendered up to the party limit, and
 * a page with no client script submits every one of them; `companionValues` therefore keeps the first
 * `partySize - 1` rows and drops the rest, which is what keeps an answer inside the party limit the API enforces.
 */

/** The widest companion name, in characters: the API's own bound on `RsvpResponse.companions[].name`. */
export const RSVP_COMPANION_NAME_MAX_LENGTH = 60;

/** The widest dietary notes, in characters: the API's own bound on `RsvpResponse.dietaryNotes`. */
export const RSVP_DIETARY_NOTES_MAX_LENGTH = 300;

/** How many companion rows one form may render: one fewer than the widest party the API accepts. */
export const RSVP_COMPANIONS_MAX = 9;

/** One companion as the form submits it. */
export interface RsvpCompanionValue {
  readonly name: string;
  readonly child: boolean;
}

/** The name of the field of one companion row, numbered from 1. */
export function companionNameField(index: number): string {
  return `companionName-${index}`;
}

/** The name of the child checkbox of one companion row, numbered from 1. */
export function companionChildField(index: number): string {
  return `companionChild-${index}`;
}

/** A form value as text, or undefined when the field is missing or repeated. */
function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/**
 * The companions one submitted form names for a party of `partySize` people (F3; L6.1): the first `partySize - 1` rows,
 * in the form's own order, each with the name the guest typed (trimmed, blank allowed) and whether the row's «Niño»
 * checkbox arrived. A declining answer names none, and rows past the party the guest chose are ignored, so a page
 * rendered without client script can never submit more people than the party limit.
 */
export function companionValues(form: FormData, partySize: number): RsvpCompanionValue[] {
  const count = Math.min(Math.max(partySize - 1, 0), RSVP_COMPANIONS_MAX);

  return Array.from({ length: count }, (_unused, index) => {
    const row = index + 1;

    return {
      name: (text(form, companionNameField(row)) ?? "").trim(),
      child: text(form, companionChildField(row)) !== undefined,
    };
  });
}

/**
 * The dietary notes the guest typed (F3; L6.1): trimmed, or null when the field is empty or absent. The length is left
 * to the API, which answers its own sentence; the form's own `maxlength` is what keeps a person inside it.
 */
export function dietaryNotesValue(form: FormData): string | null {
  const trimmed = (text(form, "dietaryNotes") ?? "").trim();

  return trimmed === "" ? null : trimmed;
}
