import { RendererPropsError } from "./renderer-props-error.ts";

/**
 * The eight content fields of a themed birthday layout (T6b; S2, S8). They are exactly the fields of
 * `birthday-adventure-01` with the same types, limits, and required list, so the creator form needs no change
 * when a template moves to one of the new layouts. This module is the one content parser of the themed
 * layouts; the API validates the same shape before publication, and this parse re-reads a stored snapshot
 * defensively.
 */
export interface BirthdayContent {
  readonly celebrantName: string;
  readonly age: number;
  /** A calendar date as `YYYY-MM-DD`. */
  readonly date: string;
  /** A time as `HH:MM`. */
  readonly time: string;
  readonly location: string;
  readonly address: string;
  /** An http or https URL. */
  readonly mainPhoto: string;
  readonly message: string;
}

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads an own property only, so `__proto__`, `constructor`, and `toString` never resolve. */
function readOwn(object: PlainObject, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isCalendarDate(value: string): boolean {
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

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);

    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** The typed content of a themed birthday invitation, or a `RendererPropsError` naming every defect. */
export function parseBirthdayContent(componentKey: string, value: unknown): BirthdayContent {
  if (!isPlainObject(value)) {
    throw new RendererPropsError(componentKey, "content", ["content must be a JSON object"]);
  }

  const issues: string[] = [];

  const text = (name: string): string => {
    const field = readOwn(value, name);

    if (typeof field !== "string" || field.trim() === "") {
      issues.push(`content.${name} must be a non-empty string`);
      return "";
    }
    return field;
  };
  const formatted = (name: string, valid: (field: string) => boolean, rule: string): string => {
    const field = readOwn(value, name);

    if (typeof field !== "string" || !valid(field)) {
      issues.push(`content.${name} must be ${rule}`);
      return "";
    }
    return field;
  };

  const celebrantName = text("celebrantName");
  const age = readOwn(value, "age");

  if (typeof age !== "number" || !Number.isInteger(age) || age < 1 || age > 120) {
    issues.push("content.age must be an integer from 1 to 120");
  }

  const date = formatted("date", isCalendarDate, "a calendar date as YYYY-MM-DD");
  const time = formatted("time", (field) => CLOCK_TIME.test(field), "a time as HH:MM");
  const location = text("location");
  const address = text("address");
  const mainPhoto = formatted("mainPhoto", isHttpUrl, "an http or https URL");
  const message = text("message");

  if (issues.length > 0 || typeof age !== "number") {
    throw new RendererPropsError(componentKey, "content", issues);
  }
  return { celebrantName, age, date, time, location, address, mainPhoto, message };
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

/** The age line the layouts show, in neutral professional Spanish: «Cumple 7 años». */
export function formatAgeLabel(age: number): string {
  return `Cumple ${age} ${age === 1 ? "año" : "años"}`;
}

/** The age without the label, so a layout can set the number and its unit apart. */
export function formatAgeUnit(age: number): string {
  return age === 1 ? "año" : "años";
}
