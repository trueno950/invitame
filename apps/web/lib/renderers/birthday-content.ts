import {
  hiddenFieldSet,
  isCalendarDate,
  isClockTime,
  isHttpUrl,
  isPlainObject,
  readOwn,
} from "./invitation-fields.ts";
import { RendererPropsError } from "./renderer-props-error.ts";

// The date wording is shared with the celebration layouts (T7c; S13); re-exported here because the birthday
// layouts and their tests name it from this module.
export { formatLongDate } from "./invitation-fields.ts";

/**
 * The eight content fields of a themed birthday layout (T6b; S2, S8). Every layout reads the same fields
 * with the same types, limits, and required list, so the creator form needs no change when a template moves
 * to one of the new layouts. This module is the one content parser of the themed
 * layouts; the API validates the same shape before publication, and this parse re-reads a stored snapshot
 * defensively.
 */
export interface BirthdayContent {
  readonly celebrantName: string;
  /** The age; absent only when the invitation omits its `age` section (S8.3). */
  readonly age?: number;
  /** A calendar date as `YYYY-MM-DD`. */
  readonly date: string;
  /** A time as `HH:MM`. */
  readonly time: string;
  readonly location: string;
  readonly address: string;
  /**
   * An http or https URL; absent only when the invitation omits its `mainPhoto` section (S8.3), because a
   * birthday may be announced without a picture.
   */
  readonly mainPhoto?: string;
  readonly message: string;
}

/**
 * The typed content of a themed birthday invitation, or a `RendererPropsError` naming every defect. A field of
 * an omitted section (`hiddenFields`, S8.3) reads as absent — no age, no photo, empty text — and is never an
 * issue; a section that stays shown keeps today's rule, so a blank required value still refuses the snapshot.
 */
export function parseBirthdayContent(
  componentKey: string,
  value: unknown,
  hiddenFields: readonly string[] = [],
): BirthdayContent {
  if (!isPlainObject(value)) {
    throw new RendererPropsError(componentKey, "content", ["content must be a JSON object"]);
  }

  const issues: string[] = [];
  const hidden = hiddenFieldSet(hiddenFields);

  const text = (name: string): string => {
    if (hidden.has(name)) {
      return "";
    }
    const field = readOwn(value, name);

    if (typeof field !== "string" || field.trim() === "") {
      issues.push(`content.${name} must be a non-empty string`);
      return "";
    }
    return field;
  };
  const formatted = (name: string, valid: (field: string) => boolean, rule: string): string => {
    if (hidden.has(name)) {
      return "";
    }
    const field = readOwn(value, name);

    if (typeof field !== "string" || !valid(field)) {
      issues.push(`content.${name} must be ${rule}`);
      return "";
    }
    return field;
  };

  const celebrantName = text("celebrantName");
  const declaredAge = readOwn(value, "age");
  const age = hidden.has("age") ? undefined : declaredAge;

  if (
    !hidden.has("age") &&
    (typeof age !== "number" || !Number.isInteger(age) || age < 1 || age > 120)
  ) {
    issues.push("content.age must be an integer from 1 to 120");
  }

  const date = formatted("date", isCalendarDate, "a calendar date as YYYY-MM-DD");
  const time = formatted("time", isClockTime, "a time as HH:MM");
  const location = text("location");
  const address = text("address");
  const mainPhoto = hidden.has("mainPhoto")
    ? undefined
    : formatted("mainPhoto", isHttpUrl, "an http or https URL");
  const message = text("message");

  if (issues.length > 0) {
    throw new RendererPropsError(componentKey, "content", issues);
  }
  return {
    celebrantName,
    ...(typeof age === "number" ? { age } : {}),
    date,
    time,
    location,
    address,
    ...(mainPhoto === undefined ? {} : { mainPhoto }),
    message,
  };
}

/** The age line the layouts show, in neutral professional Spanish: «Cumple 7 años». */
export function formatAgeLabel(age: number): string {
  return `Cumple ${age} ${age === 1 ? "año" : "años"}`;
}

/** The age without the label, so a layout can set the number and its unit apart. */
export function formatAgeUnit(age: number): string {
  return age === 1 ? "año" : "años";
}
