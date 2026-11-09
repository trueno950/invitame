import { ApiClientError } from "./api-client.ts";
import { errorClass } from "./server-log.ts";

/**
 * The operational log of an unexpected failure of an administrator catalog call (M3 T8a): one JSON
 * line with the event name, the error class, the API client's fixed failure kind, and the class of the
 * error's cause. Never the message, a cookie, a body, or a name or key the administrator typed, because
 * any of them could carry personal data. It is an operational log, not an audit trail. It lives here
 * and not in `server-log.ts`, whose event names are a closed list of the session calls.
 */
export const ADMIN_CATALOG_FAILED_EVENT = "admin_catalog_call_failed";

export function adminCatalogFailureLine(error: unknown): string {
  return JSON.stringify({
    event: ADMIN_CATALOG_FAILED_EVENT,
    error: errorClass(error),
    ...(error instanceof ApiClientError ? { kind: error.kind } : {}),
    ...(error instanceof Error && error.cause !== undefined
      ? { cause: errorClass(error.cause) }
      : {}),
  });
}

/** Writes the line to standard error and never throws, so logging cannot change a response. */
export function logAdminCatalogFailure(
  error: unknown,
  write: (line: string) => void = (line) => console.error(line),
): void {
  try {
    write(adminCatalogFailureLine(error));
  } catch {
    // A failing sink must not change the response.
  }
}
