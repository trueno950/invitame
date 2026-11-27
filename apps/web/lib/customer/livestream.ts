import { FEATURE_ISSUE_COPY } from "./copy.ts";
import {
  LIVESTREAM_NOTE_MAX_LENGTH,
  LIVESTREAM_URL_MAX_LENGTH,
  LIVESTREAM_VERSION,
  type LivestreamPayload,
  isLivestreamUrl,
} from "../invitation-features/livestream.ts";

// The «Transmisión en vivo» block of the editor's «Funciones» tab (F9; L12.1, L12.4). The owner pastes the link of the
// stream they will broadcast and writes one optional note; these helpers hold the two texts the browser is writing, turn
// them into the value the feature autosave sends, and tell a link still being typed from an edited one, so typing never
// asks for a save the contract would refuse.
//
// A draft is all texts, because a form control always holds a string. Everything is pure and immutable.

// The editor and the pages that hold its drafts share one payload shape, so a caller imports it from here.
export type { LivestreamPayload };

/** The block as the browser holds it: the link and the note, empty while the owner wrote nothing. */
export interface LivestreamDraft {
  readonly url: string;
  readonly note: string;
}

/** The block a livestream without one starts as. */
export const EMPTY_LIVESTREAM: LivestreamDraft = { url: "", note: "" };

/** The drafts of one stored payload, or an empty block when the invitation has no livestream. */
export function livestreamDraftOf(payload: LivestreamPayload | null | undefined): LivestreamDraft {
  return { url: payload?.url ?? "", note: payload?.note ?? "" };
}

/** The drafts with the link as the owner typed it. */
export function setLivestreamUrl(draft: LivestreamDraft, url: string): LivestreamDraft {
  return { ...draft, url };
}

/** The drafts with the note as the owner typed it; the payload trims it. */
export function setLivestreamNote(draft: LivestreamDraft, note: string): LivestreamDraft {
  return { ...draft, note };
}

/** One text trimmed. */
function textOf(value: string): string {
  return value.trim();
}

/**
 * Why the link the owner typed cannot be stored, or "" while it can (F9; L12.1). It is the same sentence the API's own
 * refusal reaches the status line with (`FEATURE_ISSUE_COPY.livestream`), shown under the field while the owner writes,
 * so an unfinished address is a hint and never an error to dismiss.
 */
export function livestreamUrlIssue(draft: LivestreamDraft): string {
  const url = textOf(draft.url);

  if (url === "") {
    return "";
  }
  return isLivestreamUrl(url) && [...url].length <= LIVESTREAM_URL_MAX_LENGTH
    ? ""
    : FEATURE_ISSUE_COPY.livestream;
}

/**
 * The value one feature save sends (F9; L12.1): the versioned payload with both texts trimmed and a blank note absent;
 * `null` when the block has no link, which is how the owner clears the stored livestream; or `undefined` when the link or
 * the note is outside its bounds, which is the one case the API refuses and the owner has to fix.
 */
export function livestreamPayloadOf(draft: LivestreamDraft): LivestreamPayload | null | undefined {
  const url = textOf(draft.url);
  const note = textOf(draft.note);

  if ([...note].length > LIVESTREAM_NOTE_MAX_LENGTH) {
    return undefined;
  }
  if (url === "") {
    return null;
  }
  if (!isLivestreamUrl(url)) {
    return undefined;
  }

  return {
    version: LIVESTREAM_VERSION,
    url,
    ...(note === "" ? {} : { note }),
  };
}

/**
 * Whether the drafts the editor now holds ask for a save (F9; L12.1, L12.4): true only when the stored livestream would
 * change. Clearing the link is a change, because it is what removes the card from the guests' page; a link the owner is
 * still typing is not, so an unfinished address stays in the browser without a request and without a refusal.
 */
export function livestreamNeedsSave(current: LivestreamDraft, next: LivestreamDraft): boolean {
  const before = livestreamPayloadOf(current);
  const after = livestreamPayloadOf(next);

  // A value still being written is not a save, and neither is an edit that leaves an unreadable stored value alone.
  if (before === undefined || after === undefined) {
    return false;
  }
  if (before === null || after === null) {
    return before !== after;
  }
  return before.url !== after.url || (before.note ?? "") !== (after.note ?? "");
}
