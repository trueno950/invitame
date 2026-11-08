import { ApiClientError, type ApiClientErrorKind } from "./api-client.ts";

/**
 * The web server's structured log for unexpected failures of its API calls (M2 T8d;
 * R4-account-catch-all-unlogged, L40). Each failure becomes one JSON line with the event name, the
 * error class, the API client's fixed failure kind, and the class of the error's cause (T9b part C1;
 * R4-api-client-unavailable-drops-cause-and-logs-nothing): never the error message, an address, a
 * cookie, a token, or a response body, because a message can carry any of them. This is an
 * operational log, not an audit trail.
 *
 * Only server modules import it (`session-api.ts`, which is `server-only`); it stays free of that
 * marker so `node --test` can load it.
 */
export const SERVER_LOG_EVENT = {
  OWN_PROFILE_READ_FAILED: "own_profile_read_failed",
  AUTH_SESSION_READ_FAILED: "auth_session_read_failed",
  OWN_PROFILE_UPDATE_FAILED: "own_profile_update_failed",
} as const;

export type ServerLogEventName = (typeof SERVER_LOG_EVENT)[keyof typeof SERVER_LOG_EVENT];

export interface ServerLogEvent {
  event: ServerLogEventName;
  /** The class name of the error, such as `ApiClientError`; `unknown` for a non-Error value. */
  error: string;
  /** For an `ApiClientError`: `rejected`, `unavailable`, `invalid-response`, or `short-circuited`. */
  kind?: ApiClientErrorKind;
  /** The class name of the error's cause, such as `TimeoutError` or `TypeError` (unreachable). */
  cause?: string;
}

export type ServerLog = (event: ServerLogEvent) => void;

export function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

/** A log that writes one JSON line per event and never throws, so logging cannot change a page. */
export function createServerLog(write: (line: string) => void): ServerLog {
  return (event) => {
    try {
      write(
        JSON.stringify({
          event: event.event,
          error: event.error,
          ...(event.kind === undefined ? {} : { kind: event.kind }),
          ...(event.cause === undefined ? {} : { cause: event.cause }),
        }),
      );
    } catch {
      // A failing sink must not change the response.
    }
  };
}

/** The process's log: standard error, which the platform collects. */
export const serverLog: ServerLog = createServerLog((line) => console.error(line));

/**
 * Runs an API call, a read or the profile update; on failure logs one event with the classes and
 * kind, and rethrows the error.
 */
export async function logApiCallFailure<T>(
  event: ServerLogEventName,
  call: () => Promise<T>,
  log: ServerLog = serverLog,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    log({
      event,
      error: errorClass(error),
      ...(error instanceof ApiClientError ? { kind: error.kind } : {}),
      ...(error instanceof Error && error.cause !== undefined
        ? { cause: errorClass(error.cause) }
        : {}),
    });
    throw error;
  }
}
