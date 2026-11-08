import { databaseErrorCode } from "../domain/database-error-code";

/** The line a server-side command prints when it fails: no message, address, or value (S50, L71). */
export interface CommandFailureEvent<E extends string> {
  event: E;
  /** The class name of the error; `unknown` for anything that is not an `Error`. */
  error: string;
  /** The Prisma error code, such as `P2002`, only when the failure carries one. */
  code?: string;
}

/**
 * Builds the failure event of a command from the error: its class name and, for a Prisma failure,
 * its error code. The message is never copied, because it can carry SQL, a value, or the address.
 */
export function commandFailureEvent<E extends string>(
  event: E,
  error: unknown,
): CommandFailureEvent<E> {
  const code = databaseErrorCode(error);
  return {
    event,
    error: error instanceof Error ? error.name : "unknown",
    ...(code === undefined ? {} : { code }),
  };
}

/**
 * Closes the store of a command after its work is done. A failing `close()` must not turn a
 * committed result into an unhandled rejection or change the exit code (T10a R4-001): the failure is
 * reported as one line, built like any command failure, so it carries the class and the Prisma code
 * only (S50, L71).
 */
export async function closeCommandStore<E extends string>(
  close: () => Promise<void>,
  event: E,
  report: (line: string) => void,
): Promise<void> {
  try {
    await close();
  } catch (error) {
    report(JSON.stringify(commandFailureEvent(event, error)));
  }
}
