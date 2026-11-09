import type { CatalogTemplateVersion } from "../../server/admin-catalog-validators.ts";

/**
 * The version form's data and its pure rules (M3 T8b; S5, S6, S8). A version is an immutable snapshot, so
 * the form never edits one: it starts from a copy of an existing version and creates a new DRAFT. The
 * schema and the configuration are typed as JSON text; the server parses and bounds them
 * (`parseSnapshotJson`) before any API call, and the API's registry contract stays the authority on
 * their shape.
 */

/** The largest serialized `schema` or `configuration` the API stores (`MAX_VERSION_JSON_BYTES`). */
export const MAX_SNAPSHOT_BYTES = 64 * 1024;

/**
 * The longest text parsed at all. Pretty-printed JSON is longer than its compact form, so the raw text
 * may exceed `MAX_SNAPSHOT_BYTES`; beyond this limit it cannot fit even when compacted much further
 * than a person writes it, and it is refused without parsing.
 */
export const MAX_SNAPSHOT_TEXT_LENGTH = 4 * MAX_SNAPSHOT_BYTES;

export type SnapshotJsonFailure = "empty" | "syntax" | "too-large";

export type SnapshotJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: SnapshotJsonFailure };

const encoder = new TextEncoder();

/**
 * Parses the text of a `schema` or `configuration` field. Blank is `empty`, text that is not JSON is
 * `syntax`, and a value whose compact form exceeds 64 KiB (the API's own measure) is `too-large`.
 * Nothing here judges the shape: any JSON value passes, and the renderer contract decides.
 */
export function parseSnapshotJson(text: string): SnapshotJsonResult {
  if (text.trim() === "") {
    return { ok: false, reason: "empty" };
  }
  if (text.length > MAX_SNAPSHOT_TEXT_LENGTH) {
    return { ok: false, reason: "too-large" };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "syntax" };
  }

  try {
    if (encoder.encode(JSON.stringify(value)).length > MAX_SNAPSHOT_BYTES) {
      return { ok: false, reason: "too-large" };
    }
  } catch {
    // Not serializable again (for example, nested too deeply): the API could not store it either.
    return { ok: false, reason: "too-large" };
  }
  return { ok: true, value };
}

/** A stored JSON value as the readable text the form starts from. */
export function formatSnapshotJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "";
}

export interface VersionFormValues {
  componentKey: string;
  schema: string;
  configuration: string;
}

/**
 * The state of the create-version form after a submission. It stays on the page, instead of
 * redirecting with a code, because the API's `issues` and the typed JSON must not travel in a URL.
 */
export type VersionFormState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      /** The bounded technical `issues` of a contract violation; empty for other errors. */
      issues: readonly string[];
      /** What was submitted, so the administrator does not retype the JSON. */
      values: VersionFormValues;
    };

/**
 * The version a new one starts from: the published one when there is one, else the newest (the list is
 * newest first). `undefined` for a template without versions.
 */
export function prefillVersion(
  versions: readonly CatalogTemplateVersion[],
): CatalogTemplateVersion | undefined {
  return versions.find((version) => version.status === "PUBLISHED") ?? versions[0];
}

export function prefillValues(
  source: CatalogTemplateVersion | undefined,
  rendererKeys: readonly string[],
): VersionFormValues {
  return source === undefined
    ? { componentKey: rendererKeys[0] ?? "", schema: "", configuration: "" }
    : {
        // A key the registry no longer lists cannot be chosen: start from the first renderer instead.
        componentKey: rendererKeys.includes(source.componentKey)
          ? source.componentKey
          : (rendererKeys[0] ?? ""),
        schema: formatSnapshotJson(source.schema),
        configuration: formatSnapshotJson(source.configuration),
      };
}

/** What a version's row offers: only a DRAFT is published and only a PUBLISHED one is retired. */
export function versionAction(
  status: CatalogTemplateVersion["status"],
): "publish" | "retire" | null {
  if (status === "DRAFT") {
    return "publish";
  }
  return status === "PUBLISHED" ? "retire" : null;
}
