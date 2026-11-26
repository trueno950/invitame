import { RendererPropsError } from "./renderer-props-error.ts";

/**
 * The field rules the themed content parsers share (T6b, T7c; S8, S13). Every occasion reads its own list
 * of fields, but a date is the same calendar day, a time the same 24-hour clock value, and a photo the same
 * http(s) URL whichever layout renders it. A parser collects every defect in one `RendererPropsError`, so a
 * drifted snapshot fails once with the whole list instead of one field at a time.
 */

type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads an own property only, so `__proto__`, `constructor`, and `toString` never resolve. */
export function readOwn(object: PlainObject, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whether the text is a real calendar day as `YYYY-MM-DD`. */
export function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);

  if (!match) {
    return false;
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Whether the text is a 24-hour time down to the minute, as `HH:MM`. */
export function isClockTime(value: string): boolean {
  return CLOCK_TIME.test(value);
}

/** Whether the text is an absolute http or https URL. */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);

    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** The set of content fields a version hides, or one that hides nothing when the list is absent (S8.3). */
export function hiddenFieldSet(hiddenFields: readonly string[] = []): ReadonlySet<string> {
  return new Set(hiddenFields);
}

/** A content object and the defects found in it, in the order the parser reads its fields. */
export interface ContentReader {
  readonly issues: string[];
  /** A required non-empty string, or an issue naming the field. */
  text(name: string): string;
  /** A required string the `valid` rule accepts, or an issue naming the field and the rule. */
  formatted(name: string, valid: (field: string) => boolean, rule: string): string;
  /** An optional non-empty string; absent, null, and blank all read as "the invitation has no such field". */
  optionalText(name: string): string | undefined;
  /** An optional string the `valid` rule accepts; absent, null, and blank read as absent. */
  optionalFormatted(
    name: string,
    valid: (field: string) => boolean,
    rule: string,
  ): string | undefined;
  /** Whether an optional boolean field is set; absent and null read as absent, anything else is an issue. */
  optionalBoolean(name: string): boolean | undefined;
  /** The content of a snapshot that had no defect; otherwise it throws, naming every defect. */
  content<T>(build: () => T): T;
}

/**
 * A reader over one stored content snapshot; a non-object is refused before any field is read. The
 * `hiddenFields` of an invitation (S8.3) read as absent — empty text, no optional value, no issue — because
 * the customer switched that section off and the layout will not draw it; a field the list does not cover
 * keeps today's rule, so a shown required value that is blank still refuses the snapshot.
 */
export function contentReader(
  componentKey: string,
  value: unknown,
  hiddenFields: readonly string[] = [],
): ContentReader {
  if (!isPlainObject(value)) {
    throw new RendererPropsError(componentKey, "content", ["content must be a JSON object"]);
  }

  const issues: string[] = [];
  const hidden = hiddenFieldSet(hiddenFields);
  const blank = (field: unknown): boolean =>
    field === undefined || field === null || (typeof field === "string" && field.trim() === "");

  return {
    issues,
    text(name) {
      if (hidden.has(name)) {
        return "";
      }
      const field = readOwn(value, name);

      if (typeof field !== "string" || field.trim() === "") {
        issues.push(`content.${name} must be a non-empty string`);
        return "";
      }
      return field;
    },
    formatted(name, valid, rule) {
      if (hidden.has(name)) {
        return "";
      }
      const field = readOwn(value, name);

      if (typeof field !== "string" || !valid(field)) {
        issues.push(`content.${name} must be ${rule}`);
        return "";
      }
      return field;
    },
    optionalText(name) {
      if (hidden.has(name)) {
        return undefined;
      }
      const field = readOwn(value, name);

      if (blank(field)) {
        return undefined;
      }
      if (typeof field !== "string") {
        issues.push(`content.${name} must be a non-empty string`);
        return undefined;
      }
      return field;
    },
    optionalFormatted(name, valid, rule) {
      if (hidden.has(name)) {
        return undefined;
      }
      const field = readOwn(value, name);

      if (blank(field)) {
        return undefined;
      }
      if (typeof field !== "string" || !valid(field)) {
        issues.push(`content.${name} must be ${rule}`);
        return undefined;
      }
      return field;
    },
    optionalBoolean(name) {
      if (hidden.has(name)) {
        return undefined;
      }
      const field = readOwn(value, name);

      if (field === undefined || field === null) {
        return undefined;
      }
      if (typeof field !== "boolean") {
        issues.push(`content.${name} must be a boolean`);
        return undefined;
      }
      return field;
    },
    content<T>(build: () => T): T {
      if (issues.length > 0) {
        throw new RendererPropsError(componentKey, "content", issues);
      }
      return build();
    },
  };
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** `2026-12-05` as «5 de diciembre de 2026»; the input is already parsed as a calendar date. */
export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);

  return `${day} de ${MONTHS[(month ?? 1) - 1]} de ${year}`;
}

/**
 * The names of a bounded text list, one per line (E3c; S4): the owner types a sponsor, a parent, or a
 * chambelán on its own line, and the layout draws each on its own line. Blank lines and surrounding spaces
 * are dropped, so a stray newline never leaves an empty row, and a single-line value stays one name.
 */
export function nameLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
