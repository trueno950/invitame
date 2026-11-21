import {
  type OperationalSettings,
  SETTINGS_FIELDS,
  SETTINGS_NOTE_MAX_LENGTH,
  type SettingsField,
} from "../../server/admin-settings-client.ts";

/**
 * What the settings form submits (M9 T14; S5, S8, L15): the seven integers and the optional note. The page is a plain
 * server-rendered form, so its values arrive as text; this module turns them into a request or refuses the whole form.
 * It decides nothing about a limit: the API's bounds and cross-field rules stay the guard, and this parse only refuses
 * what could not become a request at all (a missing or repeated field, a number that is not a whole number, a note
 * beyond the API's 200 characters).
 */

/** The integers of the seven settings and the note, already trimmed; the note is absent when it was blank. */
export interface SettingsFormValues {
  readonly settings: OperationalSettings;
  /** The trimmed note, or undefined when the field was absent or only spaces. */
  readonly note: string | undefined;
}

/** A whole number as a browser sends one: digits only, never a sign, a decimal point, or an exponent. */
const INTEGER = /^\d{1,15}$/;

/**
 * One form value as text, or undefined when the field is missing, repeated, or not text. A repeated field is refused
 * instead of read: a form that names two values names neither, so the request is never sent for a guess.
 */
function text(form: FormData, name: string): string | undefined {
  const values = form.getAll(name);
  const value = values[0];

  return values.length === 1 && typeof value === "string" ? value : undefined;
}

/** One setting's value, or undefined when the text is not a whole number the API could hold. */
function settingValue(value: string): number | undefined {
  if (!INTEGER.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * The submitted form as values, or nothing when any part of it is unreadable. Every one of the seven fields is
 * required: a form that omits one is not a save of all seven, and the page never sends a partial update. The note is
 * optional, trimmed, and at most the API's own 200 characters.
 */
export function parseSettingsForm(form: FormData): SettingsFormValues | undefined {
  const settings = {} as Record<SettingsField, number>;

  for (const field of SETTINGS_FIELDS) {
    const text_ = text(form, field);
    const value = text_ === undefined ? undefined : settingValue(text_);

    if (value === undefined) {
      return undefined;
    }
    settings[field] = value;
  }

  const rawNote = text(form, "note");
  if (rawNote === undefined && form.getAll("note").length > 0) {
    return undefined;
  }

  const note = rawNote?.trim();
  if (note !== undefined && note.length > SETTINGS_NOTE_MAX_LENGTH) {
    return undefined;
  }

  return { settings, note: note === "" ? undefined : note };
}
