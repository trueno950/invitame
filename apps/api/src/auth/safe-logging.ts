/**
 * The error's class name, the only part of an error the auth module logs: a message may carry SQL, an
 * address, or a provider payload. Anything that is not an `Error` is reported as `unknown`.
 */
export function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : "unknown";
}

/**
 * Hands one structured event to a log sink and swallows a failing sink, so logging can neither change
 * a response nor turn into an unhandled rejection.
 */
export function logSafely<E>(log: (event: E) => void, event: E): void {
  try {
    log(event);
  } catch {
    // A failing log sink must not change the caller's outcome.
  }
}
