import { BIRTHDAY_THEMES } from "./birthday-themes";
import {
  type RendererField,
  validateRendererSchema,
  validateThemedConfiguration,
} from "./renderer-contract";

// The shared contract of a themed birthday layout (S8): the three layouts the owner chose read the same
// eight content fields, so the creator form needs no change, and they take exactly `{ componentKey, theme }`
// as configuration. A layout module owns only its own key and schema entry point; the field list and the
// configuration rules it shares live here once.

/** The eight invitation fields every birthday layout reads, all of them required. */
export const BIRTHDAY_CONTENT_FIELDS: readonly RendererField[] = [
  { name: "celebrantName", type: "string" },
  { name: "age", type: "integer" },
  { name: "date", type: "string" },
  { name: "time", type: "string" },
  { name: "location", type: "string" },
  { name: "address", type: "string" },
  { name: "mainPhoto", type: "string" },
  { name: "message", type: "string" },
];

/**
 * Validates the configuration of a themed birthday layout: exactly `componentKey` and `theme`, both
 * required and read as own properties, the key equal to the version's, and the theme from the shared
 * birthday allow-list.
 */
export function validateThemedLayoutConfiguration(
  configuration: unknown,
  componentKey: string,
): string[] {
  return validateThemedConfiguration(configuration, componentKey, BIRTHDAY_THEMES);
}

/** Validates a layout's data schema against the shared eight birthday content fields. */
export function validateBirthdayContentSchema(schema: unknown): string[] {
  return validateRendererSchema(schema, BIRTHDAY_CONTENT_FIELDS);
}
