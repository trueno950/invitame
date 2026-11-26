import { EDITOR_COPY, OMITTABLE_SECTION_LABELS } from "./copy.ts";
import { fieldLabel } from "./invitations.ts";

/**
 * The omittable sections of the pinned version, read as data (T4; S3, S7, S8.1-S8.4): which groups a customer may
 * switch off, which of them must keep at least one shown, the content fields they cover, and the Spanish words the
 * editor puts on them.
 *
 * The contract travels inside the version's own `TemplateVersion.schema`, exactly as the API validates it
 * (`apps/api/src/catalog/domain/omittable-sections.ts`): `x-omittable` lists the groups (a stable English key and
 * the content property names it covers), `x-require-one` lists the group-key sets of which at least one must stay
 * shown, and `omittedSections` is the optional content property that stores the omitted keys. No key selects a code
 * path here: the editor matches a card to a group by comparing the group's own `fields` with the fields of the card.
 *
 * A version that declares no extension answers `NO_OMITTABLE_SECTIONS`, and every rule of this module then does
 * nothing at all, so a template published before this contract keeps exactly the editor it had (S8.1).
 *
 * This module is pure and has no `server-only` marker, so `node --test` proves it and the browser island can import
 * it: it is the one reading of the contract both the editor and the owner read use.
 */

/** The extension that lists the sections a customer may switch off. */
export const OMITTABLE_EXTENSION = "x-omittable";

/** The extension that lists the group-key sets of which at least one must stay shown. */
export const REQUIRE_ONE_EXTENSION = "x-require-one";

/** The content property that stores the omitted group keys. */
export const OMITTED_SECTIONS_PROPERTY = "omittedSections";

/** The most section keys one content may omit, so a stored list stays a bounded value. */
export const MAX_OMITTED_SECTIONS = 24;

/** A stable English group key: the shape the API's own contract accepts (`ceremony`, `honorSponsors`). */
const SECTION_KEY = /^[a-z][A-Za-z0-9]{0,39}$/;

/** One section a customer may switch off: its stable key and the content properties it covers. */
export interface OmittableSection {
  readonly key: string;
  readonly fields: readonly string[];
}

/** The omittable-section declarations of one version schema. */
export interface OmittableSections {
  readonly groups: readonly OmittableSection[];
  readonly requireOne: readonly (readonly string[])[];
}

/** The declarations of a version that omits nothing: every rule below is then inert. */
export const NO_OMITTABLE_SECTIONS: OmittableSections = { groups: [], requireOne: [] };

/** The shape of a JSON object read from a schema; arrays and `null` are not objects here. */
type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads an own property only, so `__proto__`, `constructor`, and `toString` never resolve. */
function readOwn(object: JsonObject, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

/** The `fields` of one group when it names at least one property, otherwise null; an entry that is no name is dropped. */
function readFields(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const fields = value.filter(
    (field): field is string => typeof field === "string" && field.length > 0,
  );

  return fields.length === 0 ? null : fields;
}

/** The groups of one `x-omittable` list: an entry this module cannot read is ignored, never guessed at. */
function readGroups(declared: unknown): OmittableSection[] {
  if (!Array.isArray(declared)) {
    return [];
  }

  const groups: OmittableSection[] = [];
  for (const entry of declared) {
    if (!isJsonObject(entry)) {
      continue;
    }
    const key = readOwn(entry, "key");
    const fields = readFields(readOwn(entry, "fields"));

    if (typeof key !== "string" || !SECTION_KEY.test(key) || fields === null) {
      continue;
    }
    if (groups.some((group) => group.key === key)) {
      continue;
    }
    groups.push({ key, fields });
  }
  return groups;
}

/** The sets of one `x-require-one` list: a set is a non-empty list of group keys, and anything else is ignored. */
function readRequireOne(declared: unknown): string[][] {
  if (!Array.isArray(declared)) {
    return [];
  }

  const sets: string[][] = [];
  for (const entry of declared) {
    if (!Array.isArray(entry)) {
      continue;
    }
    const keys = entry.filter(
      (key): key is string => typeof key === "string" && SECTION_KEY.test(key),
    );

    if (keys.length > 0 && keys.length === entry.length) {
      sets.push(keys);
    }
  }
  return sets;
}

/** The omittable sections of one pinned schema, or the empty declarations of a version that has none. */
export function omittableSectionsOf(schema: unknown): OmittableSections {
  if (!isJsonObject(schema)) {
    return NO_OMITTABLE_SECTIONS;
  }

  const groups = readGroups(readOwn(schema, OMITTABLE_EXTENSION));

  return { groups, requireOne: readRequireOne(readOwn(schema, REQUIRE_ONE_EXTENSION)) };
}

/**
 * The stored list of a content, read leniently: the editor holds the values it wrote itself, and a key this version
 * does not declare simply hides nothing. The strict reading of the same list, for a body that arrives from the API,
 * is `parseOmittedSections`.
 */
export function omittedSectionKeys(content: unknown): string[] {
  if (!isJsonObject(content)) {
    return [];
  }
  const declared = readOwn(content, OMITTED_SECTIONS_PROPERTY);

  if (!Array.isArray(declared)) {
    return [];
  }

  const keys: string[] = [];
  for (const key of declared) {
    if (typeof key === "string" && key !== "" && !keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * The stored list of a content as the API wrote it, or undefined when the value cannot be one: an array of unique
 * group keys, bounded. `[]` is a valid list — the owner showed every section again — and an absent value is not a
 * list at all, so the caller keeps the property out of the content instead.
 */
export function parseOmittedSections(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_OMITTED_SECTIONS) {
    return undefined;
  }

  const keys: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !SECTION_KEY.test(entry) || keys.includes(entry)) {
      return undefined;
    }
    keys.push(entry);
  }
  return keys;
}

/** The Spanish name of one group: its own label, or the first property it covers, never the English key. */
export function sectionLabelOf(section: OmittableSection): string {
  const declared = Object.hasOwn(OMITTABLE_SECTION_LABELS, section.key)
    ? OMITTABLE_SECTION_LABELS[section.key]
    : undefined;

  if (declared !== undefined) {
    return declared;
  }
  const [first] = section.fields;

  return first === undefined ? section.key : fieldLabel(first);
}

/** The groups whose own fields this card holds, in the order the version declares them. */
export function sectionsOfFields(
  sections: OmittableSections,
  fields: readonly { readonly name: string }[],
): OmittableSection[] {
  const names = new Set(fields.map((field) => field.name));

  return sections.groups.filter((group) => group.fields.some((field) => names.has(field)));
}

/** The fields the shown sections keep, in their own order: an omitted section's fields stop counting (S8.3). */
export function shownFieldsOf<T extends { readonly name: string }>(
  fields: readonly T[],
  sections: OmittableSections,
  omitted: readonly string[],
): T[] {
  const hidden = new Set(
    sections.groups.filter((group) => omitted.includes(group.key)).flatMap((group) => group.fields),
  );

  return fields.filter((field) => !hidden.has(field.name));
}

/** The stored list with one section shown or hidden, kept in the order the owner switched them. */
export function withSectionShown(
  omitted: readonly string[],
  key: string,
  shown: boolean,
): string[] {
  const kept = omitted.filter((candidate) => candidate !== key);

  return shown ? kept : [...kept, key];
}

/**
 * The set that turning this section off would leave with nothing shown, or nothing when the switch may go ahead.
 * The editor refuses in place with `requireOneNote`, and the API refuses the publication of the same state with its
 * own `content.<keys> needs one shown` issue (S8.3), so both sides read one rule from one schema.
 */
export function requireOneRefusal(
  sections: OmittableSections,
  omitted: readonly string[],
  key: string,
): readonly string[] | undefined {
  return sections.requireOne.find(
    (set) => set.includes(key) && set.every((it) => it === key || omitted.includes(it)),
  );
}

/** Why one set cannot lose its last shown section, in Spanish, naming the sections it holds. */
export function requireOneNote(sections: OmittableSections, keys: readonly string[]): string {
  const labels = keys.map((key) => {
    const group = sections.groups.find((candidate) => candidate.key === key);

    return group === undefined ? key : sectionLabelOf(group);
  });

  return EDITOR_COPY.cards.needsOne(labels.join(" o "));
}
