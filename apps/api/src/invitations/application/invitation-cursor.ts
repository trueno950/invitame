// The page cursor of the administrator's invitation read (M9 T2; S1). Pagination is key-set on `(createdAt desc,
// id desc)`, so a page never repeats or skips a row while new invitations arrive: the cursor is the last row's own
// position, not an offset. It is opaque to the client — base64url of a small JSON object — and a malformed one is
// refused instead of being read as "the first page", so a client cannot silently loop from a broken link. The same
// refusal covers an instant PostgreSQL cannot compare: `Date` accepts years up to 275760, so a canonical instant
// outside the stored window below would reach a query that fails instead of the 400 the route answers.

/** The position of one row in the `(createdAt desc, id desc)` order. */
export interface InvitationPageCursor {
  createdAt: Date;
  id: string;
}

/** The row id format the cursor must carry: a UUID, because PostgreSQL compares ids as uuids. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value is the id form a stored invitation row carries; the cursor and the detail read share it, so a
 * statement never receives an id PostgreSQL would refuse to cast.
 */
export function isInvitationId(value: string): boolean {
  return UUID.test(value);
}

/**
 * The years a stored `createdAt` may fall in. JavaScript's `Date` reaches ±275760, and its canonical ISO form writes
 * any year outside 0..9999 as an expanded six-digit year (`+010000-01-01T00:00:00.000Z`), which PostgreSQL refuses to
 * read as a `timestamptz` at all ("time zone displacement out of range"), so a cursor carrying one would fail the page
 * query instead of earning the 400 it deserves. The window is the one this product's data can occupy: four-digit
 * years, no BC.
 */
const EARLIEST_STORED_YEAR = 1970;
const LATEST_STORED_YEAR = 9999;

/** The base64url alphabet, and the length a cursor of this shape can never exceed. */
const BASE64URL = /^[A-Za-z0-9_-]{1,200}$/;

/** Encodes one row's position as the opaque cursor the response answers. */
export function encodeInvitationCursor(cursor: InvitationPageCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
    "utf8",
  ).toString("base64url");
}

/**
 * Reads an opaque cursor back, or answers null for anything that is not one this API wrote: a value outside the
 * base64url alphabet, bytes that are not JSON, a missing or non-string field, a timestamp that is not the canonical
 * ISO instant of a real date inside the years a stored `createdAt` can have, or an id that is not a UUID. Null is what
 * the use case turns into the 400.
 */
export function decodeInvitationCursor(value: string): InvitationPageCursor | null {
  if (!BASE64URL.test(value)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const { createdAt, id } = parsed as { createdAt?: unknown; id?: unknown };
  if (typeof createdAt !== "string" || typeof id !== "string" || !isInvitationId(id)) {
    return null;
  }

  const instant = new Date(createdAt);
  // The round trip refuses a timestamp PostgreSQL could not compare against the stored one: only the canonical ISO
  // form this module writes is accepted, so `2026-11-25` or a trailing garbage suffix is malformed.
  if (Number.isNaN(instant.getTime()) || instant.toISOString() !== createdAt) {
    return null;
  }

  // A canonical instant can still be one the page query cannot compare: PostgreSQL refuses the expanded-year form
  // `Date` writes beyond 9999, and this product stores no BC or future-century instants. Refusing it here keeps a
  // malformed cursor from costing a failed query.
  const year = instant.getUTCFullYear();
  if (year < EARLIEST_STORED_YEAR || year > LATEST_STORED_YEAR) {
    return null;
  }

  return { createdAt: instant, id };
}
