import { ApiClientError } from "./api-client.ts";
import { errorClass } from "./server-log.ts";

/**
 * The operational log of one unexpected media call (M8 S2, S4). An upload carries the creator's own alt text and the
 * file the browser submitted, so the line names only the event, the error's class, the client's fixed failure kind, and
 * the class of the error's cause: never a message, a file name, an alt text, an invitation or asset id, a cookie, a
 * storage key, or a provider detail. It is an operational log, not an audit trail (AGENTS.md).
 *
 * The event name is its own because the media routes are their own module: a reader can tell an upload failure apart
 * from an invitation or profile failure without reading a message.
 */

export const INVITATION_MEDIA_CALL_FAILED_EVENT = "invitation_media_call_failed";

/** One JSON line for an unexpected failure of a media call; it never carries a value the caller supplied. */
export function invitationMediaFailureLine(error: unknown): string {
  return JSON.stringify({
    event: INVITATION_MEDIA_CALL_FAILED_EVENT,
    error: errorClass(error),
    ...(error instanceof ApiClientError ? { kind: error.kind } : {}),
    ...(error instanceof Error && error.cause !== undefined
      ? { cause: errorClass(error.cause) }
      : {}),
  });
}

/** Writes the line to standard error and never throws, so logging cannot change a response. */
export function logInvitationMediaFailure(
  error: unknown,
  write: (line: string) => void = (line) => console.error(line),
): void {
  try {
    write(invitationMediaFailureLine(error));
  } catch {
    // A failing sink must not change the response.
  }
}
