import { OMITTED_SECTIONS_PROPERTY, parseOmittableSections } from "../omittable-sections";

/** A renderer's rules for one `TemplateVersion`: each method returns issue messages, empty when valid. */
export interface RendererContract {
  readonly componentKey: string;
  /**
   * The feature keys a package must include for this renderer's version to fit it (S6, A1). Keys are
   * catalog data compared by equality; `[]` means the renderer needs no catalog feature.
   */
  readonly requiredFeatureKeys: readonly string[];
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
  /**
   * `optional` declares a field the renderer reads only when the family provides it: it stays in
   * `properties` with its exact type and must be absent from `required` (S13). An absent value keeps the
   * original rule — every renderer field is required — so no existing contract changes meaning.
   */
  readonly presence?: "optional";
}

/**
 * Validates a data schema against the fields a renderer reads: a 2020-12 object schema that refuses
 * undeclared data and declares every renderer field in `properties` with its type, listed in `required`
 * unless the field declares `presence: "optional"`, in which case it must stay out of `required`.
 * Extra properties are allowed only when declared with a primitive type.
 *
 * A version that declares omittable sections (S8.1, S8.2) is validated too: the extension is read by
 * `parseOmittableSections`, every group field must be a field this renderer reads, and the `omittedSections`
 * content property — a list, not a primitive — is accepted only because that extension declares it. A version
 * without the extension keeps exactly the contract above, so an array property is still refused there.
 */
export function validateRendererSchema(
  schema: unknown,
  fields: readonly RendererField[],
): string[] {
  if (!isJsonObject(schema)) {
    return ["schema must be a JSON object"];
  }

  const issues: string[] = [];
  // The extension is read before the property loop only to know whether `omittedSections` is legitimately a
  // list; its own issues are reported last, once the shape of the snapshot is already stated.
  const declaresOmittableSections = Object.hasOwn(schema, "x-omittable");
  const sections = parseOmittableSections(schema);

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
        issues.push(
          field.presence === "optional"
            ? `schema.properties.${field.name} is declared by the renderer and is missing`
            : `schema.properties.${field.name} is required by the renderer and is missing`,
        );
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
      // The omitted keys are a bounded list the extension itself declares (S8.2), validated below.
      if (declaresOmittableSections && name === OMITTED_SECTIONS_PROPERTY) {
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
        const listed = required.includes(field.name);

        if (field.presence === "optional") {
          if (listed) {
            issues.push(`schema.required must not include ${JSON.stringify(field.name)}`);
          }
        } else if (!listed) {
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

  issues.push(...omittableSectionsIssues(sections, fields));

  return issues;
}

/**
 * The issues of a version's omittable-section extension: what the contract of `./omittable-sections` refuses,
 * plus the one rule only a renderer can state — a section covers fields this renderer reads, so a group never
 * promises an editor a section the guest page could not draw.
 */
function omittableSectionsIssues(
  sections: ReturnType<typeof parseOmittableSections>,
  fields: readonly RendererField[],
): string[] {
  if (!sections.ok) {
    return [...sections.issues];
  }
  if (sections.value === null) {
    return [];
  }

  const rendererFieldNames = new Set(fields.map((field) => field.name));
  const issues: string[] = [];

  for (const group of sections.value.groups) {
    for (const name of group.fields) {
      if (!rendererFieldNames.has(name)) {
        issues.push(
          `schema["x-omittable"] group ${JSON.stringify(group.key)} names ${JSON.stringify(name)}, which the renderer does not read`,
        );
      }
    }
  }

  return issues;
}

/** The configuration keys a themed layout accepts, and nothing else (S8, S13). */
const THEMED_CONFIGURATION_KEYS = ["componentKey", "theme"] as const;

/**
 * Validates the configuration of a themed layout: exactly `componentKey` and `theme`, both required and read
 * as own properties, the key equal to the version's, and the theme from that renderer's allow-list. Each
 * layout passes its own list, so a theme reviewed for one occasion is never accepted by another (S13).
 */
export function validateThemedConfiguration(
  configuration: unknown,
  componentKey: string,
  themes: readonly string[],
): string[] {
  if (!isJsonObject(configuration)) {
    return ["configuration must be a JSON object"];
  }

  const issues: string[] = [];

  for (const key of Object.keys(configuration)) {
    if (!THEMED_CONFIGURATION_KEYS.some((allowed) => allowed === key)) {
      issues.push(
        `configuration.${key} is not allowed; allowed keys: ${THEMED_CONFIGURATION_KEYS.join(", ")}`,
      );
    }
  }
  for (const key of THEMED_CONFIGURATION_KEYS) {
    if (!Object.hasOwn(configuration, key)) {
      issues.push(`configuration.${key} is required`);
    }
  }

  if (
    Object.hasOwn(configuration, "componentKey") &&
    readOwn(configuration, "componentKey") !== componentKey
  ) {
    issues.push(`configuration.componentKey must equal ${JSON.stringify(componentKey)}`);
  }
  if (
    Object.hasOwn(configuration, "theme") &&
    !themes.some((allowed) => allowed === readOwn(configuration, "theme"))
  ) {
    issues.push(`configuration.theme must be one of: ${themes.join(", ")}`);
  }

  return issues;
}
