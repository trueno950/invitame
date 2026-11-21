import type { SettingsField, SettingsView } from "../../server/admin-settings-client.ts";
import { formatInstant } from "../catalog/format.ts";
import { SETTINGS_COPY, SETTINGS_FIELD_COPY, SETTINGS_GROUPS } from "./copy.ts";

/**
 * What `/admin/configuracion` renders (M9 T14; S5, S8, L15): the four groups of the owner's decision, each field with
 * its own label and help text, the value the input starts from, and the range the API answered. The bounds are never a
 * constant of the page: they come from the same answer as the values, so a field whose limit the API widens shows the
 * wider range without a deploy. The page still treats the API as the guard (S5): the attributes only help the browser.
 *
 * The last update is shown in Mexico City time, the day the administration reads, and its instant is kept for a
 * `<time>` element. An instant that cannot be read shows no date instead of an invented one.
 */

/** One input of the form, everything the markup needs and nothing more. */
export interface SettingsFieldView {
  /** The field's own name, which is also the form field and the input's id. */
  readonly field: SettingsField;
  readonly label: string;
  readonly hint: string;
  /** The stored value the input starts from. */
  readonly value: number;
  readonly min: number;
  readonly max: number;
  /** The range in words, under the input («De 1 a 10.»). */
  readonly boundsHint: string;
}

/** One group of the form with its fields, in the order the owner grouped them (S8). */
export interface SettingsGroupView {
  readonly title: string;
  readonly hint: string;
  readonly fields: readonly SettingsFieldView[];
}

/** The whole form: its groups and the last update line. */
export interface SettingsPageView {
  readonly groups: readonly SettingsGroupView[];
  /** The API's own instant, for the `<time datetime>` attribute; empty when it cannot be read. */
  readonly updatedAt: string;
  /** The instant as `20 nov 2026, 10:30`, or empty when it cannot be read. */
  readonly updated: string;
  /** The line under the form, in the page's own words. */
  readonly updatedLabel: string;
}

/**
 * An ISO instant as `20 nov 2026, 10:30` in Mexico City time; empty when the text is not an instant, so the page never
 * shows a rolled-over or invented date.
 */
export function formatSettingsUpdatedAt(instant: string): string {
  return formatInstant(instant);
}

function fieldView(view: SettingsView, field: SettingsField): SettingsFieldView {
  const copy = SETTINGS_FIELD_COPY[field];
  const bound = view.bounds[field];

  return {
    field,
    label: copy.label,
    hint: copy.hint,
    value: view.settings[field],
    min: bound.min,
    max: bound.max,
    boundsHint: SETTINGS_COPY.bounds(bound.min, bound.max),
  };
}

/** The page's whole form: the four groups, their seven fields, and the last update line. */
export function settingsPageView(view: SettingsView): SettingsPageView {
  const updated = formatSettingsUpdatedAt(view.updatedAt);

  return {
    groups: SETTINGS_GROUPS.map((group) => ({
      title: group.title,
      hint: group.hint,
      fields: group.fields.map((field) => fieldView(view, field)),
    })),
    updatedAt: updated === "" ? "" : view.updatedAt,
    updated,
    updatedLabel:
      updated === "" ? SETTINGS_COPY.updatedAtUnknown : SETTINGS_COPY.updatedAt(updated),
  };
}
