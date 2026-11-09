import type { TemplateVersionStatus } from "./template-version-lifecycle";

/** Lifecycle of a template in the catalog (L4: PUBLISHED only while a version is PUBLISHED). */
export const TEMPLATE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/** `schema` and `configuration` of a version are each bounded to 64 KiB of serialized JSON. */
export const MAX_VERSION_JSON_BYTES = 64 * 1024;

/** ... and to 32 levels of nested objects or arrays, far beyond any renderer schema. */
export const MAX_VERSION_JSON_DEPTH = 32;

/** The category a template belongs to, as the catalog lists it. */
export interface TemplateCategoryRef {
  id: string;
  key: string;
  name: string;
}

/** A catalog template with its category and the summary of its versions. */
export interface CatalogTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: TemplateStatus;
  category: TemplateCategoryRef;
  createdAt: Date;
  updatedAt: Date;
  publishedVersion: { id: string; version: number } | null;
  versionCount: number;
}

/** One immutable snapshot of a template: renderer identity, schema, and configuration. */
export interface TemplateVersionRecord {
  id: string;
  version: number;
  status: TemplateVersionStatus;
  componentKey: string;
  schema: unknown;
  configuration: unknown;
  createdAt: Date;
}

/** The status when it is one of the allowed values, otherwise null. */
export function parseTemplateStatus(value: unknown): TemplateStatus | null {
  return TEMPLATE_STATUSES.find((status) => status === value) ?? null;
}

const UNPAIRED_SURROGATE = /\p{Cs}/u;
const encoder = new TextEncoder();

/** Whether PostgreSQL JSONB cannot store the text: a NUL or an unpaired surrogate. */
function isUnstorableText(text: string): boolean {
  return text.includes("\u0000") || UNPAIRED_SURROGATE.test(text);
}

/**
 * Whether a snapshot part can be stored: it serializes to JSON of at most 64 KiB, nests at most 32
 * levels, and no string or key holds a NUL or an unpaired surrogate (JSONB refuses both). The walk is
 * iterative and stops at the depth limit, so a hostile nesting cannot overflow the stack.
 */
export function parseVersionJson(value: unknown): boolean {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return false;
  }
  if (serialized === undefined || encoder.encode(serialized).length > MAX_VERSION_JSON_BYTES) {
    return false;
  }

  const pending: Array<{ item: unknown; depth: number }> = [{ item: value, depth: 0 }];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === undefined) {
      break;
    }
    const { item, depth } = next;

    if (typeof item === "string") {
      if (isUnstorableText(item)) {
        return false;
      }
    } else if (typeof item === "object" && item !== null) {
      if (depth >= MAX_VERSION_JSON_DEPTH) {
        return false;
      }
      for (const [key, child] of Object.entries(item)) {
        if (isUnstorableText(key)) {
          return false;
        }
        pending.push({ item: child, depth: depth + 1 });
      }
    }
  }
  return true;
}
