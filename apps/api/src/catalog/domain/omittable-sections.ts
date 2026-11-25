// Omittable content sections (S8.1, S8.2). A `TemplateVersion` may declare, as data inside its own schema,
// which content sections a customer may switch off: `x-omittable` lists the groups (a stable English key and
// the content property names it covers) and `x-require-one` lists the group-key sets of which at least one must
// stay shown. The invitation content stores the omitted keys in `omittedSections`, an optional unique list the
// same schema declares, so the API and the web read one contract instead of inventing two.
//
// Everything here is inert for a version that declares no `x-omittable`: `parseOmittableSections` answers
// `value: null`, and every rule of this module — including the required `omittedSections` property — is skipped,
// so a version published before this contract keeps validating exactly as it did.
//
// Keys and fields are data compared by equality; no key selects a code path.

/** The top-level extension that lists the sections a customer may switch off. */
export const OMITTABLE_EXTENSION = "x-omittable";

/** The top-level extension that lists the group-key sets of which at least one must stay shown. */
export const REQUIRE_ONE_EXTENSION = "x-require-one";

/** The content property that stores the omitted group keys. */
export const OMITTED_SECTIONS_PROPERTY = "omittedSections";

/** One section a customer may switch off: its stable key and the content properties it covers. */
export interface OmittableSectionGroup {
  readonly key: string;
  readonly fields: readonly string[];
}

/** The omittable-section declarations of one version schema. */
export interface OmittableSections {
  readonly groups: readonly OmittableSectionGroup[];
  readonly requireOne: readonly (readonly string[])[];
}

/** The parsed declarations, `null` for a version that declares none, or the issues that refuse the extension. */
export type OmittableSectionsParse =
  | { readonly ok: true; readonly value: OmittableSections | null }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * The `omittedSections` property of a content schema: a unique list of the declared group keys. A type alias,
 * not an interface, so it is assignable to the JSON value type a `Json` column accepts.
 */
export type OmittedSectionsDeclaration = {
  readonly type: "array";
  readonly items: { readonly type: "string"; readonly enum: readonly string[] };
  readonly uniqueItems: true;
};

/** A stable English identifier, never a Spanish display name: `ceremony`, `honorSponsors` (S8.4). */
const GROUP_KEY = /^[a-z][A-Za-z0-9]{0,39}$/;

/** The shape of a JSON object read from a `Json` column; arrays and `null` are not objects here. */
type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads an own property only, so `__proto__`, `constructor`, and `toString` never resolve. */
function readOwn(object: JsonObject, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

/** The declaration this contract requires for the omitted keys, in the order the groups declare them. */
export function omittedSectionsDeclaration(
  sections: OmittableSections,
): OmittedSectionsDeclaration {
  return {
    type: "array",
    items: { type: "string", enum: sections.groups.map((group) => group.key) },
    uniqueItems: true,
  };
}

/** The `fields` of one group when they are a non-empty list of unique property names, otherwise null. */
function readFields(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const fields: string[] = [];
  for (const field of value) {
    if (typeof field !== "string" || field.length === 0) {
      return null;
    }
    fields.push(field);
  }
  return fields;
}

/** The `enum` of the content property when it is a list of strings, otherwise null. */
function readEnum(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const values: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return null;
    }
    values.push(entry);
  }
  return values;
}

/** The group-key set as a comparable value: its keys sorted, so the same set in another order is the same. */
function setKey(keys: readonly string[]): string {
  return [...keys].sort().join("\u0000");
}

/**
 * Reads the groups of one `x-omittable` list, reporting every entry that is not `{ key, fields }` with a unique
 * stable key, a non-empty list of unique property names, and a field that belongs to no earlier group. A
 * structural issue (a broken list, entry, key, or field list) makes the whole declaration unfit, so the caller
 * stops instead of reporting rules derived from a shape it could not read.
 */
function readGroups(
  declared: unknown,
  properties: JsonObject | null,
  issues: string[],
): { groups: OmittableSectionGroup[]; keys: string[]; structural: boolean } {
  if (!Array.isArray(declared)) {
    issues.push('schema["x-omittable"] must be an array of { key, fields } objects');
    return { groups: [], keys: [], structural: true };
  }

  const groups: OmittableSectionGroup[] = [];
  const keys: string[] = [];
  const fieldOwner = new Map<string, string>();
  let structural = false;

  declared.forEach((entry, index) => {
    const label = `schema["x-omittable"][${index}]`;

    if (!isJsonObject(entry)) {
      issues.push(`${label} must be an object with exactly key and fields`);
      structural = true;
      return;
    }
    const entries = Object.keys(entry);
    if (entries.length !== 2 || !entries.includes("key") || !entries.includes("fields")) {
      issues.push(`${label} must be an object with exactly key and fields`);
      structural = true;
      return;
    }

    const key = readOwn(entry, "key");
    if (typeof key !== "string" || !GROUP_KEY.test(key)) {
      issues.push(`${label}.key must be a stable English identifier, such as ceremony`);
      structural = true;
      return;
    }
    if (keys.includes(key)) {
      issues.push(`${label}.key repeats ${JSON.stringify(key)}`);
      structural = true;
      return;
    }

    const fields = readFields(readOwn(entry, "fields"));
    if (fields === null) {
      issues.push(`${label}.fields must be a non-empty array of content property names`);
      structural = true;
      return;
    }
    const repeated = fields.find((field, position) => fields.indexOf(field) !== position);
    if (repeated !== undefined) {
      issues.push(`${label}.fields must not repeat ${JSON.stringify(repeated)}`);
      structural = true;
      return;
    }

    keys.push(key);
    let covered = true;
    for (const field of fields) {
      if (properties !== null && !Object.hasOwn(properties, field)) {
        issues.push(
          `schema["x-omittable"] group ${JSON.stringify(key)} names ${JSON.stringify(field)}, which the schema does not declare in properties`,
        );
        covered = false;
        continue;
      }
      const owner = fieldOwner.get(field);
      if (owner !== undefined) {
        issues.push(
          `schema["x-omittable"] group ${JSON.stringify(key)} names ${JSON.stringify(field)}, which already belongs to group ${JSON.stringify(owner)}`,
        );
        covered = false;
        continue;
      }
      fieldOwner.set(field, key);
    }
    if (covered) {
      groups.push({ key, fields });
    }
  });

  return { groups, keys, structural };
}

/**
 * Reads the `x-require-one` sets: each one a list of at least two distinct keys of the declared groups, and no
 * set declared twice.
 */
function readRequireOne(
  declared: unknown,
  groupKeys: ReadonlySet<string>,
  issues: string[],
): string[][] {
  if (!Array.isArray(declared) || !declared.every((entry) => Array.isArray(entry))) {
    issues.push('schema["x-require-one"] must be an array of group-key lists');
    return [];
  }

  const sets: string[][] = [];
  const seen = new Set<string>();

  declared.forEach((entry, index) => {
    const label = `schema["x-require-one"][${index}]`;

    if (entry.length < 2 || entry.some((key) => typeof key !== "string")) {
      issues.push(`${label} must name at least two group keys`);
      return;
    }
    const keys = entry as string[];
    const repeated = keys.find((key, position) => keys.indexOf(key) !== position);
    if (repeated !== undefined) {
      issues.push(`${label} must not repeat ${JSON.stringify(repeated)}`);
      return;
    }

    let known = true;
    for (const key of keys) {
      if (!groupKeys.has(key)) {
        issues.push(`${label} names ${JSON.stringify(key)}, which is not an x-omittable key`);
        known = false;
      }
    }
    if (!known) {
      return;
    }

    const identifier = setKey(keys);
    if (seen.has(identifier)) {
      issues.push(`${label} repeats the set ${JSON.stringify(keys.join(","))}`);
      return;
    }
    seen.add(identifier);
    sets.push([...keys]);
  });

  return sets;
}

/** The issues of the `omittedSections` property the extension requires, empty when it is declared correctly. */
function omittedSectionsIssues(
  schema: JsonObject,
  properties: JsonObject,
  groupKeys: readonly string[],
  issues: string[],
): void {
  const declared = readOwn(properties, OMITTED_SECTIONS_PROPERTY);

  if (declared === undefined) {
    issues.push("schema.properties.omittedSections must declare the omitted group keys");
    return;
  }
  if (!isJsonObject(declared)) {
    issues.push("schema.properties.omittedSections must be an object");
    return;
  }
  if (readOwn(declared, "type") !== "array") {
    issues.push('schema.properties.omittedSections.type must be "array"');
  }
  if (readOwn(declared, "uniqueItems") !== true) {
    issues.push("schema.properties.omittedSections.uniqueItems must be true");
  }

  const items = readOwn(declared, "items");
  const declaredEnum = isJsonObject(items) ? readEnum(readOwn(items, "enum")) : null;
  if (declaredEnum === null) {
    issues.push("schema.properties.omittedSections.items must declare the group keys in enum");
  } else {
    const expected = [...groupKeys];
    const same =
      declaredEnum.length === expected.length &&
      setKey(declaredEnum) === setKey(expected) &&
      new Set(declaredEnum).size === declaredEnum.length;
    if (!same) {
      issues.push(
        `schema.properties.omittedSections.items.enum must be ${JSON.stringify(expected)}`,
      );
    }
  }

  const required = readOwn(schema, "required");
  if (Array.isArray(required) && required.includes(OMITTED_SECTIONS_PROPERTY)) {
    issues.push(`schema.required must not include ${JSON.stringify(OMITTED_SECTIONS_PROPERTY)}`);
  }
}

/**
 * Validates the omittable-section extensions of a version schema (S8.1, S8.2), or answers that the version
 * declares none. A version without `x-omittable` may only carry an empty `x-require-one`; anything else about
 * the extension is refused with the issue that names the exact declaration to fix.
 */
export function parseOmittableSections(schema: unknown): OmittableSectionsParse {
  if (!isJsonObject(schema)) {
    return { ok: false, issues: ["schema must be a JSON object"] };
  }

  const declaredGroups = readOwn(schema, OMITTABLE_EXTENSION);
  const declaredRequireOne = readOwn(schema, REQUIRE_ONE_EXTENSION);

  if (declaredGroups === undefined) {
    if (declaredRequireOne === undefined) {
      return { ok: true, value: null };
    }
    if (Array.isArray(declaredRequireOne) && declaredRequireOne.length === 0) {
      return { ok: true, value: null };
    }
    return {
      ok: false,
      issues: [
        'schema["x-require-one"] must be empty when the version declares no x-omittable group',
      ],
    };
  }

  const issues: string[] = [];
  const declaredProperties = readOwn(schema, "properties");
  const properties = isJsonObject(declaredProperties) ? declaredProperties : null;

  if (properties === null) {
    issues.push("schema.properties must be an object");
  }

  const read = readGroups(declaredGroups, properties, issues);
  if (read.structural) {
    return { ok: false, issues };
  }

  const groupKeys = new Set(read.keys);
  const requireOne =
    declaredRequireOne === undefined ? [] : readRequireOne(declaredRequireOne, groupKeys, issues);

  if (properties !== null) {
    omittedSectionsIssues(schema, properties, read.keys, issues);
  }

  return issues.length === 0
    ? { ok: true, value: { groups: read.groups, requireOne } }
    : { ok: false, issues };
}
