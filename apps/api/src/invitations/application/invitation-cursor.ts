// The page cursor of the administrator's invitation read (M9 T2; S1). Pagination is key-set on `(createdAt desc,
// id desc)`, so a page never repeats or skips a row while new invitations arrive: the cursor is the last row's own
// position, not an offset. It is opaque to the client — base64url of a small JSON object — and a malformed one is
// refused instead of being read as "the first page", so a client cannot silently loop from a broken link.

/** The position of one row in the `(createdAt desc, id desc)` order. */
export interface InvitationPageCursor {
  createdAt: Date;
  id: string;
}

/** The row id format the cursor must carry: a UUID, because PostgreSQL compares ids as uuids. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
 * ISO instant of a real date, or an id that is not a UUID. Null is what the use case turns into the 400.
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
  if (typeof createdAt !== "string" || typeof id !== "string" || !UUID.test(id)) {
    return null;
  }

  const instant = new Date(createdAt);
  // The round trip refuses a timestamp PostgreSQL could not compare against the stored one: only the canonical ISO
  // form this module writes is accepted, so `2026-11-25` or a trailing garbage suffix is malformed.
  if (Number.isNaN(instant.getTime()) || instant.toISOString() !== createdAt) {
    return null;
  }

  return { createdAt: instant, id };
}
