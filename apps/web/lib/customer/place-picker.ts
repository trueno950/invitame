import {
  isPlaceConfirmed,
  PLACE_QUERY_MAX_LENGTH,
  PLACE_QUERY_MIN_LENGTH,
  type PlacePoint,
} from "../invitation-features/place-point.ts";

/**
 * The address combobox of the invitation editor (S1, S2). The owner types an address; while they type, the editor
 * asks the API for the real places that text matches, and choosing one writes its label into the content and its
 * coordinates into the stored point the guest's links and map read.
 *
 * Everything an owner feels is decided here, purely, so the component is only wiring: the shortest text worth
 * asking about, the debounce after the last keystroke, the state of the listbox, the keyboard model, and the note
 * under the field. A failed or rate-limited search is a status, never a block: free typing always works, and the
 * text the owner wrote is what the invitation keeps.
 */

export { PLACE_QUERY_MAX_LENGTH, PLACE_QUERY_MIN_LENGTH };

/** How long the editor waits after the last keystroke before asking, so a typed address is one request. */
export const PLACE_SEARCH_DEBOUNCE_MS = 350;

/** What the editor does with the text an owner typed. */
export type PlaceSearchRequest =
  | { readonly kind: "wait" }
  | { readonly kind: "search"; readonly query: string };

/** The normalized query of a text, or undefined when it is not worth asking about. */
export function placeQuery(text: string): string | undefined {
  const query = text.trim();
  const length = [...query].length;

  return length < PLACE_QUERY_MIN_LENGTH || length > PLACE_QUERY_MAX_LENGTH ? undefined : query;
}

/** The request one text asks for: nothing while it is too short, the normalized query otherwise. */
export function placeSearchRequest(text: string): PlaceSearchRequest {
  const query = placeQuery(text);

  return query === undefined ? { kind: "wait" } : { kind: "search", query };
}

/**
 * What the field shows: the suggestions of the text it holds, or the state of the search for it. `text` is the text
 * the state answers for, so an answer that arrives after another keystroke is dropped instead of being shown under
 * words it does not match.
 */
export interface PlacePickerState {
  readonly status: "idle" | "searching" | "ready" | "failed";
  readonly text: string;
  readonly suggestions: readonly PlacePoint[];
  /** The option the keyboard would choose, or -1 while none is active. */
  readonly activeIndex: number;
  readonly open: boolean;
}

/** The field before its owner typed anything. */
export const suggestionsPicker: PlacePickerState = {
  status: "idle",
  text: "",
  suggestions: [],
  activeIndex: -1,
  open: false,
};

/** The field while its text is too short to ask about: nothing is on its way and no list is shown. */
export function searchIdle(text: string): PlacePickerState {
  return { status: "idle", text, suggestions: [], activeIndex: -1, open: false };
}

/** The field while the answer for `text` is on its way; the list of another text is not shown. */
export function searchStarted(text: string): PlacePickerState {
  return { status: "searching", text, suggestions: [], activeIndex: -1, open: false };
}

/** The answer for `text`, opened with its first option active while there is one. */
export function searchAnswered(
  state: PlacePickerState,
  text: string,
  suggestions: readonly PlacePoint[],
): PlacePickerState {
  if (state.text !== text) {
    return state;
  }

  return {
    status: "ready",
    text,
    suggestions: [...suggestions],
    activeIndex: suggestions.length === 0 ? -1 : 0,
    open: suggestions.length > 0,
  };
}

/** A search that failed or was limited: a quiet note, an empty list, and the field still editable. */
export function searchFailed(state: PlacePickerState, text: string): PlacePickerState {
  return state.text === text
    ? { status: "failed", text, suggestions: [], activeIndex: -1, open: false }
    : state;
}

/** The answered list opened again, keeping the text and its suggestions. */
export function openedSuggestions(state: PlacePickerState): PlacePickerState {
  return state.suggestions.length === 0 ? state : { ...state, open: true, activeIndex: 0 };
}

/** The list closed by Escape or by a choice, keeping what it holds so the same text is not asked again. */
export function dismissedSuggestions(state: PlacePickerState): PlacePickerState {
  return state.open ? { ...state, open: false } : state;
}

/** The active option moved by `delta`, clamped to the list, or unchanged while nothing is active. */
export function resultMoved(state: PlacePickerState, delta: number): PlacePickerState {
  const last = state.suggestions.length - 1;

  if (!state.open || last < 0) {
    return state;
  }

  const start = state.activeIndex < 0 ? 0 : state.activeIndex;
  const activeIndex = Math.min(last, Math.max(0, start + delta));

  return activeIndex === state.activeIndex ? state : { ...state, activeIndex };
}

/** The option the keyboard would choose, or undefined. */
export function activeSuggestion(state: PlacePickerState): PlacePoint | undefined {
  return state.open && state.activeIndex >= 0 ? state.suggestions[state.activeIndex] : undefined;
}

/** The id of one option, so `aria-activedescendant` can name it. */
export function optionId(baseId: string, index: number): string {
  return `${baseId}-option-${index}`;
}

/** The id `aria-activedescendant` names, or undefined while no option is active. */
export function activeOptionId(state: PlacePickerState, baseId: string): string | undefined {
  return activeSuggestion(state) === undefined ? undefined : optionId(baseId, state.activeIndex);
}

/** What one key does to the picker. */
export type PlaceKeyAction =
  | { readonly kind: "open" }
  | { readonly kind: "move"; readonly delta: 1 | -1 }
  | { readonly kind: "choose"; readonly index: number }
  | { readonly kind: "dismiss" }
  | { readonly kind: "none" };

/**
 * The keyboard model of an ARIA combobox: the down arrow opens a closed list and moves down an open one, the up
 * arrow moves up, Enter chooses the active option, Escape closes the list, and every other key — including Tab and
 * ordinary typing — is left to the input, so free text is never trapped.
 */
export function keyAction(state: PlacePickerState, key: string): PlaceKeyAction {
  switch (key) {
    case "ArrowDown":
      return !state.open && state.suggestions.length === 0
        ? { kind: "none" }
        : state.open
          ? { kind: "move", delta: 1 }
          : { kind: "open" };
    case "ArrowUp":
      return !state.open && state.suggestions.length === 0
        ? { kind: "none" }
        : state.open
          ? { kind: "move", delta: -1 }
          : { kind: "open" };
    case "Enter": {
      const active = activeSuggestion(state);

      return active === undefined ? { kind: "none" } : { kind: "choose", index: state.activeIndex };
    }
    case "Escape":
      return state.open ? { kind: "dismiss" } : { kind: "none" };
    default:
      return { kind: "none" };
  }
}

/** The two notes an address field can carry, and the copy each one uses (S2). */
export type PlaceNoteKind = "confirmed" | "hint";

/** Which note the field shows: confirmed only while a stored point's label equals the text it holds. */
export function placeNoteKind(point: PlacePoint | undefined, text: string): PlaceNoteKind {
  return isPlaceConfirmed(point, text) ? "confirmed" : "hint";
}
