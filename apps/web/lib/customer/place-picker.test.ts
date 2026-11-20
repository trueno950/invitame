import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PLACE_PICKER_COPY } from "./copy.ts";
import {
  activeOptionId,
  activeSuggestion,
  blurredPicker,
  dismissedSuggestions,
  keyAction,
  notedPicker,
  openedSuggestions,
  PLACE_SEARCH_DEBOUNCE_MS,
  placeNoteKind,
  placeQuery,
  placeSearchRequest,
  resultMoved,
  searchAnswered,
  searchAnswerNote,
  searchFailed,
  searchFailureNote,
  searchIdle,
  searchStarted,
  suggestionsPicker,
} from "./place-picker.ts";

// The combobox of an address field (S1, S2): what the editor asks, what it shows, and what each key does. It is pure
// so the browser check only has to prove the wiring; the rules an owner feels — the minimum text, the debounce, the
// keyboard model, and the «confirmed» note — are pinned here.

const PARROQUIA = { label: "Parroquia de San José, Querétaro", lat: 20.588793, lng: -100.389888 };
const JARDIN = { label: "Jardín de los Olivos, Querétaro", lat: 20.6, lng: -100.4 };

describe("the text of an address field", () => {
  it("is searchable from three characters on, trimmed, and never empty", () => {
    assert.equal(placeQuery("Parroquia de San José"), "Parroquia de San José");
    assert.equal(placeQuery("  San  "), "San");
    assert.equal(placeQuery("Sa"), undefined);
    assert.equal(placeQuery("   "), undefined);
    assert.equal(placeQuery(""), undefined);
    assert.equal(placeQuery("x".repeat(121)), undefined);
  });

  it("is not a query when the value is not a text, as an untrusted caller may send", () => {
    // The server action applies this same rule to what the browser sends, so no other shape reaches the API.
    assert.equal(placeQuery(7), undefined);
    assert.equal(placeQuery(null), undefined);
    assert.equal(placeQuery({ query: "San" }), undefined);
  });

  it("asks nothing while the text is too short, and the query once it is not", () => {
    assert.deepEqual(placeSearchRequest("Sa"), { kind: "wait" });
    assert.deepEqual(placeSearchRequest("San"), { kind: "search", query: "San" });
  });

  it("waits about a third of a second after the last keystroke", () => {
    assert.equal(PLACE_SEARCH_DEBOUNCE_MS, 350);
  });
});

describe("the state of the listbox", () => {
  it("is closed and idle before the owner types", () => {
    assert.equal(suggestionsPicker.open, false);
    assert.equal(suggestionsPicker.status, "idle");
    assert.equal(activeSuggestion(suggestionsPicker), undefined);
  });

  it("stays idle, with the text it holds, while that text is too short to ask about", () => {
    const state = searchIdle("Sa");

    assert.equal(state.status, "idle");
    assert.equal(state.text, "Sa");
    assert.equal(state.open, false);
    assert.deepEqual(state.suggestions, []);
  });

  it("is searching while the answer is on its way, with no stale list", () => {
    const state = searchStarted("Parroquia");

    assert.equal(state.status, "searching");
    assert.equal(state.open, false);
    assert.deepEqual(state.suggestions, []);
  });

  it("opens the answered list and marks the first suggestion active", () => {
    const state = searchAnswered(searchStarted("Parroquia"), "Parroquia", [PARROQUIA, JARDIN]);

    assert.equal(state.status, "ready");
    assert.equal(state.open, true);
    assert.equal(state.suggestions.length, 2);
    assert.equal(state.activeIndex, 0);
    assert.deepEqual(activeSuggestion(state), PARROQUIA);
    assert.equal(activeOptionId(state, "place-address"), "place-address-option-0");
  });

  it("closes an empty answer instead of opening an empty list", () => {
    const state = searchAnswered(searchStarted("Nada"), "Nada", []);

    assert.equal(state.status, "ready");
    assert.equal(state.open, false);
    assert.equal(activeSuggestion(state), undefined);
  });

  it("keeps a failed search quiet: the note is a status, never a block", () => {
    const state = searchFailed(searchStarted("Parroquia"), "Parroquia", "unavailable");

    assert.equal(state.status, "failed");
    assert.equal(state.open, false);
    assert.deepEqual(state.suggestions, []);
    assert.equal(state.note, PLACE_PICKER_COPY.failed);
  });

  it("carries the note of an answer with the text it answers", () => {
    assert.equal(searchAnswered(searchStarted("Nada"), "Nada", []).note, PLACE_PICKER_COPY.empty);
    assert.equal(searchAnswered(searchStarted("Q"), "Q", [PARROQUIA]).note, undefined);
    assert.equal(
      searchFailed(searchStarted("Parroquia"), "Parroquia", "rate-limited").note,
      PLACE_PICKER_COPY.limited,
    );
  });

  it("keeps the note of the current words when a slower answer for other words arrives", () => {
    const answered = searchAnswered(searchStarted("Jardín"), "Jardín", [JARDIN]);
    const late = searchFailed(answered, "Parroquia", "rate-limited");

    assert.equal(late, answered, "an answer for other words leaves the field as it was");
    assert.equal(late.note, undefined);
  });

  it("closes the list when the field loses the focus and opens nothing after it", () => {
    const answered = searchAnswered(searchStarted("Q"), "Q", [PARROQUIA]);
    const blurred = blurredPicker(answered);

    assert.equal(blurred.open, false);
    assert.equal(
      searchAnswered(blurred, "Q", [PARROQUIA]),
      blurred,
      "an answer that arrives after the owner left opens no list",
    );
    assert.equal(
      blurredPicker(answered).suggestions.length,
      1,
      "the answered list is kept, not asked again",
    );
  });

  it("keeps a refused save's message under the field until the owner types", () => {
    const noted = notedPicker(suggestionsPicker, PLACE_PICKER_COPY.saveFailed);

    assert.equal(noted.note, PLACE_PICKER_COPY.saveFailed);
    assert.equal(noted.open, false);
    assert.equal(searchIdle("Parroquia").note, undefined);
  });

  it("ignores an answer that belongs to another text", () => {
    const state = searchStarted("Parroquia");
    const stale = searchAnswered(state, "Jardín", [PARROQUIA]);

    assert.equal(stale.status, "searching");
    assert.equal(stale.open, false);
  });
});

describe("the keyboard model", () => {
  const answered = searchAnswered(searchStarted("Q"), "Q", [PARROQUIA, JARDIN]);

  it("opens a closed list with the down arrow, and a closed empty list not at all", () => {
    assert.deepEqual(keyAction(dismissedSuggestions(answered), "ArrowDown"), { kind: "open" });
    assert.deepEqual(keyAction(suggestionsPicker, "ArrowDown"), { kind: "none" });
  });

  it("moves the active option and stops at both ends", () => {
    assert.deepEqual(keyAction(answered, "ArrowDown"), { kind: "move", delta: 1 });
    assert.deepEqual(keyAction(answered, "ArrowUp"), { kind: "move", delta: -1 });
    assert.equal(resultMoved(answered, 1).activeIndex, 1);
    assert.equal(
      resultMoved(resultMoved(answered, 1), 1).activeIndex,
      1,
      "a second step down stays on the last option",
    );
    assert.equal(resultMoved(answered, -1).activeIndex, 0);
    assert.equal(resultMoved(suggestionsPicker, 1).activeIndex, -1, "nothing to move");
  });

  it("chooses the active option on Enter and nothing while no option is active", () => {
    assert.deepEqual(keyAction(answered, "Enter"), { kind: "choose", index: 0 });
    assert.deepEqual(keyAction(resultMoved(answered, 1), "Enter"), { kind: "choose", index: 1 });
    assert.deepEqual(keyAction(suggestionsPicker, "Enter"), { kind: "none" });
  });

  it("dismisses the list on Escape and leaves every other key to the input", () => {
    assert.deepEqual(keyAction(answered, "Escape"), { kind: "dismiss" });
    assert.deepEqual(keyAction(answered, "a"), { kind: "none" });
    assert.deepEqual(keyAction(answered, "Tab"), { kind: "none" });
  });

  it("reopens the answered list after a dismissal without asking again", () => {
    const closed = dismissedSuggestions(answered);

    assert.equal(closed.open, false);
    assert.equal(closed.suggestions.length, 2);
    assert.equal(openedSuggestions(closed).open, true);
  });
});

describe("the note under the field", () => {
  it("names no note for a list of places and the empty note for a list without one", () => {
    assert.equal(searchAnswerNote([PARROQUIA]), undefined);
    assert.equal(searchAnswerNote([]), PLACE_PICKER_COPY.empty);
  });

  it("gives each refused search its own quiet sentence", () => {
    assert.equal(searchFailureNote("rate-limited"), PLACE_PICKER_COPY.limited);
    assert.equal(searchFailureNote("not-found"), PLACE_PICKER_COPY.notFound);
    assert.equal(searchFailureNote("invalid-query"), PLACE_PICKER_COPY.failed);
    assert.equal(searchFailureNote("unavailable"), PLACE_PICKER_COPY.failed);
  });
});

describe("the confirmed note", () => {
  it("says confirmed only while the stored label equals the text the field holds", () => {
    assert.equal(placeNoteKind(PARROQUIA, PARROQUIA.label), "confirmed");
    assert.equal(placeNoteKind(PARROQUIA, "Parroquia de San José"), "hint");
    assert.equal(placeNoteKind(undefined, PARROQUIA.label), "hint");
  });
});
