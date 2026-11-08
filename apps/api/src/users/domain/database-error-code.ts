/** A Prisma error code such as `P2002`; anything else is not a code this log accepts. */
const PRISMA_ERROR_CODE = /^P\d{4}$/;

/**
 * The Prisma error code of a failure, such as `P2002` for a unique violation or `P1001` for an
 * unreachable database, and nothing else about it (S50, L71). The code is a fixed identifier from
 * Prisma's published list. The message is never read: it can echo the values of the failed query,
 * such as an address. A known request error carries the code as `code`, and an initialization error
 * as `errorCode`; a value that does not match the code format, such as a Node `ECONNREFUSED`, is not
 * a Prisma code and yields `undefined`. The check is on the shape only: another error carrying a code
 * of the same shape, such as a PostgreSQL SQLSTATE `P0001`, would be logged as if it were Prisma's.
 * That can mislead a diagnosis but cannot leak data, since the value is always five fixed characters.
 */
export function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const { code, errorCode } = error as { code?: unknown; errorCode?: unknown };
  return [code, errorCode].find(
    (candidate): candidate is string =>
      typeof candidate === "string" && PRISMA_ERROR_CODE.test(candidate),
  );
}
