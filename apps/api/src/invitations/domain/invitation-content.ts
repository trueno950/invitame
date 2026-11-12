// Draft content against the pinned `TemplateVersion` schema (M4 T2, T7; S7, S11, A3). A draft may be
// incomplete: `required` is deliberately not enforced, because an invitation publishes only once it is complete.
// Every provided key must be declared by the pinned schema and satisfy the rules that schema itself declares
// for it — primitive type, `minLength`/`maxLength`, `pattern`, `format`, and the numeric `minimum`,
// `maximum`, `exclusiveMinimum`, and `exclusiveMaximum` — and the whole object stays bounded so a hostile
// payload cannot store unbounded JSONB. `format` is enforced for `date`, `uri`, and `time`; a format this
// module does not implement is ignored, and a `pattern` that does not compile is reported instead of thrown.
// Values are validated, never trimmed or otherwise transformed.

/** The bound of a draft string when the pinned schema declares no `maxLength`. */
export const DEFAULT_MAX_CONTENT_STRING_LENGTH = 2000;

/** The primitive JSON types a renderer schema may declare (renderer-contract.ts). */
const PRIMITIVE_TYPES = ["string", "integer", "number", "boolean"] as const;

/** `YYYY-MM-DD`, the date format the renderers accept. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `HH:MM` or `HH:MM:SS`, the clock time a renderer may declare as `format: "time"`. */
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

/** The shape of a JSON object read from the `content` column; arrays and null are not objects here. */
export type JsonObject = Record<string, unknown>;

/** A draft's validated content, or the issues that name every value the pinned schema refuses. */
export type DraftContentValidation =
  | { readonly ok: true; readonly value: JsonObject }
  | { readonly ok: false; readonly issues: string[] };

/** Own-property reads only, so `__proto__`, `constructor`, and `toString` never resolve. */
function readOwn(object: JsonObject, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

/** A JSON object as JSON.parse and Prisma produce it: not an array, null, Date, Map, or class instance. */
function isPlainObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPrimitiveType(value: unknown): value is PrimitiveType {
  return PRIMITIVE_TYPES.some((type) => type === value);
}

/** The `required` names of a schema, or null when the schema does not declare an array of strings. */
function requiredNames(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const names: string[] = [];
  for (const name of value) {
    if (typeof name !== "string") {
      return null;
    }
    names.push(name);
  }
  return names;
}

/** The schema's `maxLength` when it declares a usable one, otherwise the default bound. */
function maxStringLength(definition: JsonObject): number {
  const declared = readOwn(definition, "maxLength");

  return typeof declared === "number" && Number.isSafeInteger(declared) && declared >= 0
    ? declared
    : DEFAULT_MAX_CONTENT_STRING_LENGTH;
}

/** The schema's `minLength` when it declares a usable one, or null when it declares none. */
function minStringLength(definition: JsonObject): number | null {
  const declared = readOwn(definition, "minLength");

  return typeof declared === "number" && Number.isSafeInteger(declared) && declared >= 0
    ? declared
    : null;
}

/** A declared numeric bound, or null when the schema declares none this validation can enforce. */
function declaredBound(definition: JsonObject, name: string): number | null {
  const declared = readOwn(definition, name);

  return typeof declared === "number" && Number.isFinite(declared) ? declared : null;
}

/**
 * `YYYY-MM-DD` naming a real calendar date, checked the way `apps/web`'s birthday renderer checks it, so a
 * value a draft accepts is a value the renderer can render.
 */
function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);

  if (match === null) {
    return false;
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** An absolute `http` or `https` URL, as `apps/web`'s birthday renderer accepts `mainPhoto`. */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);

    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** The issues of the numeric bounds a schema declares, in a fixed order. */
function numericIssues(key: string, definition: JsonObject, value: number): string[] {
  const issues: string[] = [];
  const minimum = declaredBound(definition, "minimum");
  const exclusiveMinimum = declaredBound(definition, "exclusiveMinimum");
  const maximum = declaredBound(definition, "maximum");
  const exclusiveMaximum = declaredBound(definition, "exclusiveMaximum");

  if (minimum !== null && value < minimum) {
    issues.push(`content.${key} must be at least ${minimum}`);
  }
  if (exclusiveMinimum !== null && value <= exclusiveMinimum) {
    issues.push(`content.${key} must be greater than ${exclusiveMinimum}`);
  }
  if (maximum !== null && value > maximum) {
    issues.push(`content.${key} must be at most ${maximum}`);
  }
  if (exclusiveMaximum !== null && value >= exclusiveMaximum) {
    issues.push(`content.${key} must be less than ${exclusiveMaximum}`);
  }
  return issues;
}

/**
 * The `pattern` issue of a declared pattern, or null when the schema declares none this validation can
 * enforce. A declared pattern is compiled with the `u` flag; one that does not compile is reported, so a
 * drifted snapshot never throws and never accepts a value silently.
 */
function patternIssue(key: string, definition: JsonObject, value: string): string | null {
  if (!Object.hasOwn(definition, "pattern")) {
    return null;
  }

  const pattern = definition.pattern;

  if (typeof pattern !== "string") {
    return `content.${key} is declared with an invalid pattern in the template version schema`;
  }

  try {
    return new RegExp(pattern, "u").test(value)
      ? null
      : `content.${key} must match the pattern ${pattern}`;
  } catch {
    return `content.${key} is declared with an invalid pattern in the template version schema`;
  }
}

/** The `format` issue of a declared format, or null when the format is absent or not implemented here. */
function formatIssue(key: string, definition: JsonObject, value: string): string | null {
  const format = readOwn(definition, "format");

  switch (format) {
    case "date":
      return isCalendarDate(value) ? null : `content.${key} must be a calendar date as YYYY-MM-DD`;
    case "uri":
      return isHttpUrl(value) ? null : `content.${key} must be an absolute http or https URL`;
    case "time":
      return CLOCK_TIME.test(value) ? null : `content.${key} must be a time as HH:MM or HH:MM:SS`;
    default:
      return null;
  }
}

/** The issues of one string value, in a fixed order: length, pattern, then format. */
function stringIssues(key: string, definition: JsonObject, value: unknown): string[] {
  const maxLength = maxStringLength(definition);

  if (typeof value !== "string") {
    return [`content.${key} must be a string of at most ${maxLength} characters`];
  }

  const issues: string[] = [];
  const length = [...value].length;
  const minLength = minStringLength(definition);

  if (minLength !== null && length < minLength) {
    issues.push(
      `content.${key} must be a string of at least ${minLength} ${minLength === 1 ? "character" : "characters"}`,
    );
  }
  if (length > maxLength) {
    issues.push(`content.${key} must be a string of at most ${maxLength} characters`);
  }

  const pattern = patternIssue(key, definition, value);
  const format = formatIssue(key, definition, value);

  if (pattern !== null) {
    issues.push(pattern);
  }
  if (format !== null) {
    issues.push(format);
  }
  return issues;
}

/** Why one provided value does not satisfy the rules its declared type and definition set, if it does not. */
function valueIssues(
  key: string,
  type: PrimitiveType,
  definition: JsonObject,
  value: unknown,
): string[] {
  switch (type) {
    case "string":
      return stringIssues(key, definition, value);
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value)
        ? numericIssues(key, definition, value)
        : [`content.${key} must be an integer`];
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? numericIssues(key, definition, value)
        : [`content.${key} must be a number`];
    case "boolean":
      return typeof value === "boolean" ? [] : [`content.${key} must be a boolean`];
  }
}

/**
 * Validates the content of a draft against the `schema` of the `TemplateVersion` it is pinned to (S7). The
 * content must be a plain object; every provided key must be declared in `properties` and satisfy the rules
 * that definition declares — its primitive type, `minLength`/`maxLength` (code points), `pattern` (compiled
 * with the `u` flag), `format` (`date`, `uri`, or `time`; any other format is ignored), and the numeric
 * `minimum`, `maximum`, `exclusiveMinimum`, and `exclusiveMaximum`; at most as many keys as the schema
 * declares are accepted, and strings are bounded by their `maxLength` or the default. `required` is not
 * enforced (S7). A schema that does not declare `properties` and `required` is refused, so an invalid pinned
 * snapshot never accepts content silently.
 */
export function validateDraftContent(schema: unknown, content: unknown): DraftContentValidation {
  if (!isPlainObject(content)) {
    return { ok: false, issues: ["content must be a JSON object"] };
  }

  const issues: string[] = [];
  const properties = isPlainObject(schema) ? readOwn(schema, "properties") : undefined;
  const required = isPlainObject(schema) ? readOwn(schema, "required") : undefined;

  if (!isPlainObject(properties)) {
    issues.push("schema.properties must be an object");
  }
  if (requiredNames(required) === null) {
    issues.push("schema.required must be an array of strings");
  }
  if (issues.length > 0 || !isPlainObject(properties)) {
    return { ok: false, issues };
  }

  const keys = Object.keys(content);
  const declaredCount = Object.keys(properties).length;

  if (keys.length > declaredCount) {
    return {
      ok: false,
      issues: [
        ...issues,
        `content has ${keys.length} keys; the template version schema declares ${declaredCount}`,
      ],
    };
  }

  for (const key of keys) {
    if (!Object.hasOwn(properties, key)) {
      issues.push(`content.${key} is not declared in the template version schema`);
      continue;
    }
    const definition = properties[key];
    const type = isPlainObject(definition) ? readOwn(definition, "type") : undefined;

    if (!isPrimitiveType(type) || !isPlainObject(definition)) {
      issues.push(
        `content.${key} is declared with an unsupported type in the template version schema`,
      );
      continue;
    }
    const issue = valueIssues(key, type, definition, content[key]);

    issues.push(...issue);
  }

  return issues.length === 0 ? { ok: true, value: content } : { ok: false, issues };
}

/**
 * The required keys the draft does not provide yet, in schema order, for the "incomplete" state of the
 * editor. A provided key counts as present even when its value is invalid; validation reports that
 * separately. Content that is not an object provides nothing; a schema without a usable `required` list
 * has no expectation to report.
 */
export function missingRequiredFields(schema: unknown, content: unknown): string[] {
  const required = isPlainObject(schema) ? requiredNames(readOwn(schema, "required")) : null;

  if (required === null) {
    return [];
  }
  const provided = isPlainObject(content) ? content : {};

  return required.filter((name) => !Object.hasOwn(provided, name));
}
