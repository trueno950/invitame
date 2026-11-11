// Draft content against the pinned `TemplateVersion` schema (M4 T2; S7, A3). A draft may be incomplete:
// `required` is deliberately not enforced, because an invitation publishes only once it is complete. Every
// provided key must be declared by the pinned schema and match its declared primitive type, and the whole
// object stays bounded so a hostile payload cannot store unbounded JSONB. Values are validated, never
// trimmed or otherwise transformed; format, pattern, and numeric ranges belong to publication.

/** The bound of a draft string when the pinned schema declares no `maxLength`. */
export const DEFAULT_MAX_CONTENT_STRING_LENGTH = 2000;

/** The primitive JSON types a renderer schema may declare (renderer-contract.ts). */
const PRIMITIVE_TYPES = ["string", "integer", "number", "boolean"] as const;

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

/** Why one provided value does not match its declared type, or null when it does. */
function valueIssue(
  key: string,
  type: PrimitiveType,
  definition: JsonObject,
  value: unknown,
): string | null {
  switch (type) {
    case "string": {
      const maxLength = maxStringLength(definition);
      return typeof value === "string" && [...value].length <= maxLength
        ? null
        : `content.${key} must be a string of at most ${maxLength} characters`;
    }
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value)
        ? null
        : `content.${key} must be an integer`;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `content.${key} must be a number`;
    case "boolean":
      return typeof value === "boolean" ? null : `content.${key} must be a boolean`;
  }
}

/**
 * Validates the content of a draft against the `schema` of the `TemplateVersion` it is pinned to. The
 * content must be a plain object; every provided key must be declared in `properties` and match its
 * declared primitive type; at most as many keys as the schema declares are accepted; strings are bounded
 * by their `maxLength` or the default. `required` is not enforced (S7). A schema that does not declare
 * `properties` and `required` is refused, so an invalid pinned snapshot never accepts content silently.
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
    const issue = valueIssue(key, type, definition, content[key]);

    if (issue !== null) {
      issues.push(issue);
    }
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
