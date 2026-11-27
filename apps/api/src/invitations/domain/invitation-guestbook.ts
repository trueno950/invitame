// The guestbook of one invitation (F7; S2.7, L10.1, L10.3, L10.4, L10.6). Four pure decisions live here, and none of
// them reads a table, a clock, a request, or a provider:
//
// - the entry a guest signs: a name of 1 to 60 trimmed characters and a message of 1 to 500 trimmed characters, both
//   plain text and both free of the control characters a text column cannot store;
// - the shape a guest may read: the newest visible entries, at most 50, with no id and no hidden flag;
// - the bound of that read, so the database query and the projection agree on one number;
// - the bound of the owner's moderation read, so one screen never answers an unbounded list.
//
// Plain text is the rule of the whole feature: the validator stores what the guest typed, and the guest page renders it
// as React's own text node, so markup stays visible characters and no URL in a message becomes a link. Nothing here
// normalizes the inside of the text beyond trimming it: an emoji, an accent, a line break, and a run of spaces are the
// guest's words, not this module's business. The one exception is the control characters: PostgreSQL refuses U+0000 in
// a text column outright, so an entry carrying one would fail the write as a server fault after the rate limit was
// spent, and the rest of them are refused with it instead of becoming an invisible character of the wall.

/** The widest signature a guestbook entry may carry, counted in characters: the width of `GuestbookEntry.authorName`. */
export const GUESTBOOK_AUTHOR_NAME_MAX_LENGTH = 60;

/** The widest message a guestbook entry may carry, counted in characters: the width of `GuestbookEntry.message`. */
export const GUESTBOOK_MESSAGE_MAX_LENGTH = 500;

/** How many visible entries a guest page reads: the newest 50 of one invitation (L10.4). */
export const GUESTBOOK_VISIBLE_ENTRIES_MAX = 50;

/**
 * How many entries the owner's moderation read answers: the newest 500 of one invitation (L10.6). The owner reads one
 * bounded page instead of every row an invitation ever collected, so the screen and its two counts stay answerable.
 */
export const GUESTBOOK_OWNER_ENTRIES_MAX = 500;

/** The issue a name that is not a string is refused with. */
export const GUESTBOOK_AUTHOR_NAME_TYPE_ISSUE = "authorName must be a string";

/** The issue a blank or too wide name is refused with. */
export const GUESTBOOK_AUTHOR_NAME_LENGTH_ISSUE = "authorName must be between 1 and 60 characters";

/** The issue a message that is not a string is refused with. */
export const GUESTBOOK_MESSAGE_TYPE_ISSUE = "message must be a string";

/** The issue a blank or too wide message is refused with. */
export const GUESTBOOK_MESSAGE_LENGTH_ISSUE = "message must be between 1 and 500 characters";

/** The issue a signature carrying a control character is refused with. */
export const GUESTBOOK_AUTHOR_NAME_CONTROL_ISSUE = "authorName must not contain control characters";

/** The issue a message carrying a control character is refused with. */
export const GUESTBOOK_MESSAGE_CONTROL_ISSUE = "message must not contain control characters";

/**
 * The control characters (`Cc`: C0, the tab and the line feed included, and C1) a guest's text must not carry. U+0000 is
 * the one PostgreSQL refuses in a text column; the rest would be an invisible character of the wall.
 */
const CONTROL_CHARACTER = /\p{Cc}/u;

/**
 * The control characters a message may keep: the line feed and the tab, the two the RSVP message keeps, so a guest who
 * writes a list of greetings keeps the text they typed.
 */
const MESSAGE_ALLOWED_CONTROL_CHARACTERS = "\t\n";

/**
 * Whether a text carries a control character outside the ones it may keep. A signature keeps none — it is one line —
 * and a message keeps the line feed and the tab.
 */
function hasControlCharacter(value: string, allowed = ""): boolean {
  return [...value].some(
    (character) => CONTROL_CHARACTER.test(character) && !allowed.includes(character),
  );
}

/** What one guest signed, as the request carries it; neither value is trusted. */
export interface GuestbookEntryInput {
  readonly authorName: unknown;
  readonly message: unknown;
}

/** One stored entry as the guest page reads it (L10.4): the signature and the message, and nothing that names a row. */
export interface PublicGuestbookEntry {
  readonly authorName: string;
  readonly message: string;
}

/** One stored entry as the owner's moderation screen reads it: the row it writes, its text, its state, and its date. */
export interface GuestbookEntryRecord {
  readonly id: string;
  readonly authorName: string;
  readonly message: string;
  readonly hidden: boolean;
  readonly createdAt: Date;
}

/** The values one accepted entry stores; the use case validates them before the write. */
export interface GuestbookEntryValues {
  readonly authorName: string;
  readonly message: string;
}

export type GuestbookEntryValidation =
  | { readonly ok: true; readonly value: GuestbookEntryValues }
  | { readonly ok: false; readonly issues: string[] };

/** Whether a value is a text of 1 to `max` characters once trimmed; the bounds are counted in code points. */
function isTrimmedText(value: unknown, max: number): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const width = [...value.trim()].length;

  return width >= 1 && width <= max;
}

/**
 * The entry one guest signed (F7; L10.1): the name and the message, each trimmed, each inside its bound, and each free
 * of the control characters a text column cannot store or the wall should not hide. Every issue is reported at once,
 * and a refused entry stores nothing. The text is otherwise kept as the guest wrote it, so the stored value is exactly
 * what the page renders.
 */
export function validateGuestbookEntry(input: GuestbookEntryInput): GuestbookEntryValidation {
  const issues: string[] = [];
  const name = input.authorName;
  const message = input.message;

  if (typeof name !== "string") {
    issues.push(GUESTBOOK_AUTHOR_NAME_TYPE_ISSUE);
  } else if (!isTrimmedText(name, GUESTBOOK_AUTHOR_NAME_MAX_LENGTH)) {
    issues.push(GUESTBOOK_AUTHOR_NAME_LENGTH_ISSUE);
  } else if (hasControlCharacter(name)) {
    issues.push(GUESTBOOK_AUTHOR_NAME_CONTROL_ISSUE);
  }

  if (typeof message !== "string") {
    issues.push(GUESTBOOK_MESSAGE_TYPE_ISSUE);
  } else if (!isTrimmedText(message, GUESTBOOK_MESSAGE_MAX_LENGTH)) {
    issues.push(GUESTBOOK_MESSAGE_LENGTH_ISSUE);
  } else if (hasControlCharacter(message, MESSAGE_ALLOWED_CONTROL_CHARACTERS)) {
    issues.push(GUESTBOOK_MESSAGE_CONTROL_ISSUE);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      authorName: (name as string).trim(),
      message: (message as string).trim(),
    },
  };
}

/**
 * The entries a guest may read (L10.4): the visible ones in the order the read answered them — newest first — at most
 * `GUESTBOOK_VISIBLE_ENTRIES_MAX`. A hidden entry never reaches a guest, and neither an id nor the hidden flag is part
 * of the projection, so nothing about the moderation travels to the page.
 */
export function publicGuestbookEntries(
  entries: readonly GuestbookEntryRecord[],
): PublicGuestbookEntry[] {
  return entries
    .filter((entry) => !entry.hidden)
    .slice(0, GUESTBOOK_VISIBLE_ENTRIES_MAX)
    .map((entry) => ({ authorName: entry.authorName, message: entry.message }));
}
