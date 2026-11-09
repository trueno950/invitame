// Props of the `birthday-adventure-01` renderer (M3 T7; S2, S6). The API validates a version's schema and
// configuration before publication (`apps/api/src/catalog/domain/renderers/birthday-adventure-01.renderer.ts`);
// the web re-reads the props defensively anyway, because it renders a stored snapshot. A failure is an
// operational error (a drifted or hand-edited snapshot), never user input, so it throws.

export const BIRTHDAY_ADVENTURE_COMPONENT_KEY = "birthday-adventure-01";

export const PALETTES = ["sunset", "ocean", "forest"] as const;
export type Palette = (typeof PALETTES)[number];

export const SECTIONS = ["hero", "details", "message"] as const;
export type Section = (typeof SECTIONS)[number];

export interface BirthdayAdventureConfiguration {
  readonly palette: Palette;
  readonly sectionOrder: readonly Section[];
}

export interface BirthdayAdventureContent {
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

/** Thrown when the configuration or content a renderer receives does not fit its contract. */
export class RendererPropsError extends Error {
  override name = "RendererPropsError";
  readonly issues: string[];

  constructor(subject: "configuration" | "content", issues: string[]) {
    super(`Invalid ${BIRTHDAY_ADVENTURE_COMPONENT_KEY} ${subject}: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads an own property only, so `__proto__`, `constructor`, and `toString` never resolve. */
function readOwn(object: PlainObject, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

const CONFIGURATION_KEYS = [
  "componentKey",
  "layout",
  "palette",
  "typography",
  "sectionOrder",
] as const;

function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return allowed.some((candidate) => candidate === value);
}

export function parseBirthdayAdventureConfiguration(
  value: unknown,
): BirthdayAdventureConfiguration {
  if (!isPlainObject(value)) {
    throw new RendererPropsError("configuration", ["configuration must be a JSON object"]);
  }

  const issues: string[] = [];

  for (const key of Object.keys(value)) {
    if (!isOneOf(CONFIGURATION_KEYS, key)) {
      issues.push(
        `configuration.${key} is not allowed; allowed keys: ${CONFIGURATION_KEYS.join(", ")}`,
      );
    }
  }
  for (const key of CONFIGURATION_KEYS) {
    if (!Object.hasOwn(value, key)) {
      issues.push(`configuration.${key} is required`);
    }
  }

  const exact = (key: string, expected: string) => {
    if (Object.hasOwn(value, key) && readOwn(value, key) !== expected) {
      issues.push(`configuration.${key} must be ${JSON.stringify(expected)}`);
    }
  };

  exact("componentKey", BIRTHDAY_ADVENTURE_COMPONENT_KEY);
  exact("layout", "adventure");
  exact("typography", "rounded");

  const palette = readOwn(value, "palette");

  if (Object.hasOwn(value, "palette") && !isOneOf(PALETTES, palette)) {
    issues.push(`configuration.palette must be one of: ${PALETTES.join(", ")}`);
  }

  const sectionOrder = readOwn(value, "sectionOrder");
  const sections: Section[] = [];

  if (Object.hasOwn(value, "sectionOrder")) {
    if (!Array.isArray(sectionOrder) || sectionOrder.length === 0) {
      issues.push("configuration.sectionOrder must be a non-empty array");
    } else {
      sectionOrder.forEach((section: unknown, index) => {
        if (isOneOf(SECTIONS, section)) {
          sections.push(section);
        } else {
          issues.push(
            `configuration.sectionOrder[${index}] must be one of: ${SECTIONS.join(", ")}`,
          );
        }
      });
      if (new Set(sectionOrder).size !== sectionOrder.length) {
        issues.push("configuration.sectionOrder must not contain duplicates");
      }
      if (!sectionOrder.includes("hero")) {
        issues.push('configuration.sectionOrder must include "hero"');
      }
    }
  }

  if (issues.length > 0 || !isOneOf(PALETTES, palette)) {
    throw new RendererPropsError("configuration", issues);
  }
  return { palette, sectionOrder: sections };
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

export function parseBirthdayAdventureContent(value: unknown): BirthdayAdventureContent {
  if (!isPlainObject(value)) {
    throw new RendererPropsError("content", ["content must be a JSON object"]);
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
    throw new RendererPropsError("content", issues);
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

export function formatAgeLabel(age: number): string {
  return `Cumple ${age} ${age === 1 ? "año" : "años"}`;
}

/** The colors of one palette; `ink` and `accent` keep 4.5:1 on `background`, `surface`, and `soft`. */
export interface PaletteColors {
  readonly background: string;
  readonly surface: string;
  readonly soft: string;
  readonly ink: string;
  readonly accent: string;
}

export const PALETTE_COLORS: Readonly<Record<Palette, PaletteColors>> = {
  sunset: {
    background: "#fff4e5",
    surface: "#ffffff",
    soft: "#ffe0bd",
    ink: "#3d1f0f",
    accent: "#a8380c",
  },
  ocean: {
    background: "#e8f6fa",
    surface: "#ffffff",
    soft: "#c4e8f1",
    ink: "#0b2f3d",
    accent: "#075c75",
  },
  forest: {
    background: "#eef6e9",
    surface: "#ffffff",
    soft: "#d3e9c8",
    ink: "#17301a",
    accent: "#2a622a",
  },
};
