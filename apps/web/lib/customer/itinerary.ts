import {
  ITINERARY_MAX_ITEMS,
  ITINERARY_TEXT_MAX_LENGTH,
  ITINERARY_TITLE_MAX_LENGTH,
  ITINERARY_VERSION,
  type ItineraryMoment,
  type ItineraryPayload,
} from "../invitation-features/itinerary.ts";

// The editor and the pages that hold its drafts share one payload shape, so a caller imports it from here.
export type { ItineraryPayload };

/**
 * The «Itinerario» block of the editor's «Funciones» tab (F1; L3.4). The owner adds, edits, removes, and reorders the
 * moments of the day; these helpers hold the drafts the browser is writing and turn them into the value the feature
 * autosave sends. Everything is pure and immutable: a helper that changes nothing answers the array it was given, so
 * a boundary (moving the first moment up, adding a sixteenth) never looks like a save.
 *
 * A draft is all texts, including the two optional ones, because a form control always holds a string. The payload is
 * the strict shape the API stores: the texts trimmed, a blank optional one absent, and a moment that is still
 * incomplete refused — the save waits for it instead of storing half a plan.
 */

/** The message the editor shows while the list is at its bound (L3.1). */
export const ITINERARY_DRAFT_LIMIT_MESSAGE = "Puedes agregar hasta 15 momentos.";

/** One moment as the form holds it: four texts, the two optional ones empty when the owner wrote nothing. */
export interface ItineraryDraftMoment {
  readonly time: string;
  readonly title: string;
  readonly place: string;
  readonly address: string;
}

/** A wall clock as the API stores it: two digits of hour from 00 to 23, and two of minute from 00 to 59. */
const ITINERARY_TIME = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

/** The moment a new row starts as: everything empty, so the first control is the time the owner picks. */
export const EMPTY_ITINERARY_MOMENT: ItineraryDraftMoment = {
  time: "",
  title: "",
  place: "",
  address: "",
};

/** The drafts of one stored payload, or none when the invitation has no itinerary. */
export function itineraryDraftsOf(
  payload: ItineraryPayload | null | undefined,
): ItineraryDraftMoment[] {
  return (payload?.items ?? []).map((moment) => ({
    time: moment.time,
    title: moment.title,
    place: moment.place ?? "",
    address: moment.address ?? "",
  }));
}

/** The drafts with one empty moment at the end, or the same array while the bound is reached (L3.1). */
export function addItineraryMoment(
  drafts: readonly ItineraryDraftMoment[],
): readonly ItineraryDraftMoment[] {
  return drafts.length >= ITINERARY_MAX_ITEMS ? drafts : [...drafts, EMPTY_ITINERARY_MOMENT];
}

/** Whether another moment may be added. */
export function canAddItineraryMoment(drafts: readonly ItineraryDraftMoment[]): boolean {
  return drafts.length < ITINERARY_MAX_ITEMS;
}

/** The drafts with one control of one moment changed, or the same array when that moment does not exist. */
export function updateItineraryMoment(
  drafts: readonly ItineraryDraftMoment[],
  index: number,
  patch: Partial<ItineraryDraftMoment>,
): readonly ItineraryDraftMoment[] {
  const current = drafts[index];

  if (current === undefined || !Number.isInteger(index) || index < 0) {
    return drafts;
  }
  return drafts.map((moment, position) => (position === index ? { ...moment, ...patch } : moment));
}

/** The drafts without one moment, or the same array when that moment does not exist. */
export function removeItineraryMoment(
  drafts: readonly ItineraryDraftMoment[],
  index: number,
): readonly ItineraryDraftMoment[] {
  if (!Number.isInteger(index) || index < 0 || drafts[index] === undefined) {
    return drafts;
  }
  return drafts.filter((_moment, position) => position !== index);
}

/** The drafts with one moment swapped with its neighbour, or the same array at either end of the list. */
export function moveItineraryMoment(
  drafts: readonly ItineraryDraftMoment[],
  index: number,
  direction: "up" | "down",
): readonly ItineraryDraftMoment[] {
  const target = direction === "up" ? index - 1 : index + 1;

  if (!Number.isInteger(index) || drafts[index] === undefined || drafts[target] === undefined) {
    return drafts;
  }

  const next = [...drafts];
  const moved = next[index] as ItineraryDraftMoment;
  next[index] = next[target] as ItineraryDraftMoment;
  next[target] = moved;
  return next;
}

/** One text trimmed, or nothing when the value is not a string at all. */
function textOf(value: string): string {
  return value.trim();
}

/**
 * Whether one row is still being written, because it has no time or no title yet. A row like that is not a moment the
 * contract can store; it stays in the editor with a hint of its own instead of refusing a save the owner did not ask
 * for (L3.4).
 */
export function isItineraryMomentIncomplete(moment: ItineraryDraftMoment): boolean {
  return textOf(moment.time) === "" || textOf(moment.title) === "";
}

/**
 * The stored moment an incomplete row still stands for (F1; L3.4): the one whose texts agree with everything the row
 * still says. A row whose title was cleared but whose time is still there is the stored moment of that time, and one
 * whose time was cleared is the stored moment of that title; the optional texts narrow the match when they are filled
 * in. A row with nothing left to say matches nothing — it is a row the owner is just starting — and a moment this list
 * already kept is never claimed twice.
 */
function storedMomentOf(
  draft: ItineraryDraftMoment,
  stored: readonly ItineraryMoment[],
  claimed: ReadonlySet<number>,
): { readonly moment: ItineraryMoment; readonly position: number } | undefined {
  const time = textOf(draft.time);
  const title = textOf(draft.title);
  const place = textOf(draft.place);
  const address = textOf(draft.address);

  if (time === "" && title === "") {
    return undefined;
  }

  for (const [position, moment] of stored.entries()) {
    if (claimed.has(position)) {
      continue;
    }
    if (time !== "" && moment.time !== time) {
      continue;
    }
    if (title !== "" && moment.title !== title) {
      continue;
    }
    if (place !== "" && (moment.place ?? "") !== place) {
      continue;
    }
    if (address !== "" && (moment.address ?? "") !== address) {
      continue;
    }
    return { moment, position };
  }

  return undefined;
}

/**
 * The value one feature save sends (F1; L3.1, L3.4): the payload of the moments that are complete, with every text
 * trimmed and the optional ones absent when they say nothing; `null` when the plan holds no moment (the invitation has
 * no plan, and the owner may still be writing the first one); or `undefined` when a complete moment is outside its
 * bounds, which is the one case the API refuses and the owner has to fix.
 *
 * A row still being written is never refused: adding an empty moment or typing into it must not fail a save. A row the
 * owner is retyping keeps the last complete version the plan already stored (`stored`), so clearing a title does not
 * take the moment away from the guests while it is being written; removing the row with «Quitar» is what drops it, and a
 * row that was never complete carries nothing.
 */
export function itineraryPayloadOf(
  drafts: readonly ItineraryDraftMoment[],
  stored: ItineraryPayload | null | undefined = null,
): ItineraryPayload | null | undefined {
  if (drafts.length > ITINERARY_MAX_ITEMS) {
    return undefined;
  }

  const storedMoments = stored?.items ?? [];
  const shaped = drafts.map(shapedMomentOf);
  // A stored moment a complete row already reproduces is not available to a row being written: the plan would carry it
  // twice the moment a new row started at the same time.
  const claimed = new Set<number>();
  for (const moment of shaped) {
    if (moment === undefined) {
      continue;
    }

    const position = storedMoments.findIndex(
      (storedMoment, index) => !claimed.has(index) && sameMoment(moment, storedMoment),
    );

    if (position !== -1) {
      claimed.add(position);
    }
  }

  const items: ItineraryMoment[] = [];

  for (const [index, draft] of drafts.entries()) {
    const moment = shaped[index];

    if (moment === undefined) {
      const kept = storedMomentOf(draft, storedMoments, claimed);

      if (kept !== undefined) {
        claimed.add(kept.position);
        items.push(kept.moment);
      }
      continue;
    }

    if (
      !ITINERARY_TIME.test(moment.time) ||
      [...moment.title].length > ITINERARY_TITLE_MAX_LENGTH ||
      [...(moment.place ?? "")].length > ITINERARY_TEXT_MAX_LENGTH ||
      [...(moment.address ?? "")].length > ITINERARY_TEXT_MAX_LENGTH
    ) {
      return undefined;
    }

    items.push(moment);
  }

  return items.length === 0 ? null : { version: ITINERARY_VERSION, items };
}

/**
 * One complete row as a moment, trimmed and with the optional texts absent when they say nothing, or nothing when the
 * row is not complete yet. It only shapes the texts: whether they are inside the bounds is the payload's decision.
 */
function shapedMomentOf(draft: ItineraryDraftMoment): ItineraryMoment | undefined {
  if (isItineraryMomentIncomplete(draft)) {
    return undefined;
  }

  const place = textOf(draft.place);
  const address = textOf(draft.address);

  return {
    time: textOf(draft.time),
    title: textOf(draft.title),
    ...(place === "" ? {} : { place }),
    ...(address === "" ? {} : { address }),
  };
}

/** Whether two moments carry the same four texts, comparing the optional ones as the empty text. */
function sameMoment(left: ItineraryMoment, right: ItineraryMoment): boolean {
  return (
    left.time === right.time &&
    left.title === right.title &&
    (left.place ?? "") === (right.place ?? "") &&
    (left.address ?? "") === (right.address ?? "")
  );
}

/**
 * Whether the drafts the editor now holds ask for a save (F1; L3.4): true only when the plan changed. Adding an empty
 * row, typing into one that is still incomplete, retyping the title of a stored moment, or removing a row that was
 * never complete leaves the stored plan exactly as it was, so the editor keeps the drafts and sends nothing — no
 * request, and no refusal to show. `stored` is the plan the invitation holds: with it, a row being retyped still
 * stands for its stored moment, and removing that row is a change.
 *
 * A complete moment the contract refuses also asks for a save, so the API's own sentence reaches the status line instead
 * of the editor staying silent about a value the owner has to fix.
 */
export function itineraryNeedsSave(
  current: readonly ItineraryDraftMoment[],
  next: readonly ItineraryDraftMoment[],
  stored: ItineraryPayload | null | undefined = null,
): boolean {
  const before = itineraryPayloadOf(current, stored);
  const after = itineraryPayloadOf(next, stored);

  if (before === undefined || after === undefined) {
    return true;
  }
  if (before === null || after === null) {
    return before !== after;
  }
  return !(
    before.items.length === after.items.length &&
    before.items.every((moment, index) => {
      const other = after.items[index];

      return other !== undefined && sameMoment(moment, other);
    })
  );
}
