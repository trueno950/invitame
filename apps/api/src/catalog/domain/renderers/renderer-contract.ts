/** A renderer's rules for one `TemplateVersion`: each method returns issue messages, empty when valid. */
export interface RendererContract {
  readonly componentKey: string;
  validateSchema(schema: unknown): string[];
  validateConfiguration(configuration: unknown, componentKey: string): string[];
}

/** The shape of a JSON object read from a `Json` column; arrays and null are not objects here. */
export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads an own property only, so `__proto__`, `constructor`, and `toString` never resolve. */
export function readOwn(object: JsonObject, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";
const EXTRA_PROPERTY_TYPES = ["string", "integer", "number", "boolean"] as const;

/** A field the renderer reads from the invitation data, and the JSON Schema type it must declare. */
export interface RendererField {
  readonly name: string;
  readonly type: (typeof EXTRA_PROPERTY_TYPES)[number];
}

/**
 * Validates a data schema against the fields a renderer reads: a 2020-12 object schema that refuses
 * undeclared data and declares every renderer field in `properties` and `required` with its type.
 * Extra properties are allowed only when declared with a primitive type.
 */
export function validateRendererSchema(
  schema: unknown,
  fields: readonly RendererField[],
): string[] {
  if (!isJsonObject(schema)) {
    return ["schema must be a JSON object"];
  }

  const issues: string[] = [];

  if (readOwn(schema, "$schema") !== JSON_SCHEMA_DRAFT) {
    issues.push(`schema.$schema must be ${JSON.stringify(JSON_SCHEMA_DRAFT)}`);
  }
  if (readOwn(schema, "type") !== "object") {
    issues.push('schema.type must be "object"');
  }
  if (readOwn(schema, "additionalProperties") !== false) {
    issues.push("schema.additionalProperties must be false");
  }

  const properties = readOwn(schema, "properties");
  const required = readOwn(schema, "required");
  const requiredNames =
    Array.isArray(required) && required.every((name) => typeof name === "string");

  if (!isJsonObject(properties)) {
    issues.push("schema.properties must be an object");
  }
  if (!requiredNames) {
    issues.push("schema.required must be an array of strings");
  } else if (new Set(required).size !== required.length) {
    issues.push("schema.required must not contain duplicates");
  }

  if (isJsonObject(properties)) {
    const rendererFieldNames = new Set(fields.map((field) => field.name));

    for (const field of fields) {
      if (!Object.hasOwn(properties, field.name)) {
        issues.push(`schema.properties.${field.name} is required by the renderer and is missing`);
        continue;
      }
      const definition = properties[field.name];

      if (!isJsonObject(definition)) {
        issues.push(`schema.properties.${field.name} must be an object`);
      } else if (readOwn(definition, "type") !== field.type) {
        issues.push(`schema.properties.${field.name}.type must be ${JSON.stringify(field.type)}`);
      }
    }

    for (const name of Object.keys(properties)) {
      if (rendererFieldNames.has(name)) {
        continue;
      }
      const definition = properties[name];
      const type = isJsonObject(definition) ? readOwn(definition, "type") : undefined;

      if (!EXTRA_PROPERTY_TYPES.some((allowed) => allowed === type)) {
        issues.push(
          `schema.properties.${name}.type must be one of: ${EXTRA_PROPERTY_TYPES.join(", ")}`,
        );
      }
    }

    if (requiredNames) {
      for (const field of fields) {
        if (!required.includes(field.name)) {
          issues.push(`schema.required must include ${JSON.stringify(field.name)}`);
        }
      }
      for (const name of required) {
        if (!Object.hasOwn(properties, name)) {
          issues.push(
            `schema.required lists ${JSON.stringify(name)}, which is not declared in schema.properties`,
          );
        }
      }
    }
  }

  return issues;
}
