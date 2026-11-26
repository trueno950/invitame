import { isPlainObject, readOwn } from "./invitation-fields.ts";

/**
 * The content fields an invitation's omitted sections cover (S3, S8.2, S8.3), read from the pinned version
 * schema's `x-omittable` groups and the content's own `omittedSections`. The API computes the same answer from
 * the same two values and sends it with the public read (`hiddenFields`); this helper exists so the owner's
 * preview, which reads the invitation instead of the public projection, can pass the renderers the one set.
 *
 * The reader is deliberately lenient, exactly like the API's: an absent or unreadable extension, a content
 * without the list, and a key no group declares all mean "nothing is hidden", because a pinned snapshot keeps
 * the meaning it had when it was published. Keys and fields are data compared by equality; no key selects a
 * code path, and the answer keeps the schema's order so both sides agree on it.
 */

/** The extension that lists the sections a customer may switch off. */
const OMITTABLE_EXTENSION = "x-omittable";

/** The content property that stores the omitted section keys. */
const OMITTED_SECTIONS_PROPERTY = "omittedSections";

/** One group of the extension, as this module reads it; an entry it cannot read is ignored. */
interface OmittableGroup {
  readonly key: string;
  readonly fields: readonly string[];
}

function declaredGroups(schema: Record<string, unknown>): OmittableGroup[] {
  const declared = readOwn(schema, OMITTABLE_EXTENSION);

  if (!Array.isArray(declared)) {
    return [];
  }

  const groups: OmittableGroup[] = [];
  for (const entry of declared) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const key = readOwn(entry, "key");
    const fields = readOwn(entry, "fields");

    if (typeof key !== "string" || !Array.isArray(fields)) {
      continue;
    }
    groups.push({
      key,
      fields: fields.filter((field): field is string => typeof field === "string"),
    });
  }
  return groups;
}

function omittedKeys(content: Record<string, unknown>): Set<string> {
  const declared = readOwn(content, OMITTED_SECTIONS_PROPERTY);

  if (!Array.isArray(declared)) {
    return new Set();
  }
  return new Set(declared.filter((key): key is string => typeof key === "string"));
}

/** The content property names the omitted sections cover, in the order the schema declares them. */
export function hiddenFieldsOf(schema: unknown, content: unknown): string[] {
  const omitted = isPlainObject(content) ? omittedKeys(content) : new Set<string>();

  if (omitted.size === 0 || !isPlainObject(schema)) {
    return [];
  }

  const fields: string[] = [];
  for (const group of declaredGroups(schema)) {
    if (!omitted.has(group.key)) {
      continue;
    }
    for (const field of group.fields) {
      if (!fields.includes(field)) {
        fields.push(field);
      }
    }
  }
  return fields;
}
