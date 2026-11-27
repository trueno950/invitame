import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_LIVESTREAM,
  type LivestreamDraft,
  livestreamDraftOf,
  livestreamNeedsSave,
  livestreamPayloadOf,
  livestreamUrlIssue,
  setLivestreamNote,
  setLivestreamUrl,
} from "./livestream.ts";

// The «Transmisión en vivo» block of the editor's «Funciones» tab (F9; L12.1): the two texts the browser holds, the
// payload the feature autosave sends, and the rule that keeps a link still being typed from asking for a save.

const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const DRAFT: LivestreamDraft = { url: WATCH, note: "Inicia a las 17:00 h" };

describe("the livestream the editor holds (F9; L12.1)", () => {
  it("reads the stored payload into the two texts", () => {
    assert.deepEqual(
      livestreamDraftOf({ version: 1, url: WATCH, note: "Inicia a las 17:00 h" }),
      DRAFT,
    );
    assert.deepEqual(livestreamDraftOf({ version: 1, url: WATCH }), { url: WATCH, note: "" });
    assert.deepEqual(livestreamDraftOf(null), EMPTY_LIVESTREAM);
    assert.deepEqual(livestreamDraftOf(undefined), EMPTY_LIVESTREAM);
  });

  it("changes one text and leaves the other alone", () => {
    assert.deepEqual(setLivestreamUrl(DRAFT, "https://youtu.be/dQw4w9WgXcQ"), {
      url: "https://youtu.be/dQw4w9WgXcQ",
      note: "Inicia a las 17:00 h",
    });
    assert.deepEqual(setLivestreamNote(DRAFT, "Empieza pronto"), {
      url: WATCH,
      note: "Empieza pronto",
    });
  });

  it("sends the trimmed payload, clears with no link, and refuses a value it cannot store", () => {
    assert.deepEqual(livestreamPayloadOf({ url: ` ${WATCH} `, note: " Inicia a las 17:00 h " }), {
      version: 1,
      url: WATCH,
      note: "Inicia a las 17:00 h",
    });
    assert.deepEqual(livestreamPayloadOf({ url: WATCH, note: "   " }), { version: 1, url: WATCH });
    // No link is no livestream, whatever the note says: there is nothing to draw.
    assert.equal(livestreamPayloadOf(EMPTY_LIVESTREAM), null);
    assert.equal(livestreamPayloadOf({ url: "   ", note: "Inicia a las 17:00 h" }), null);
    // A complete value outside its bounds is the one case the API refuses, and the editor names it instead.
    assert.equal(livestreamPayloadOf({ url: "http://youtu.be/dQw4w9WgXcQ", note: "" }), undefined);
    assert.equal(livestreamPayloadOf({ url: WATCH, note: "n".repeat(121) }), undefined);
  });

  it("names why a link cannot be stored while it is being typed", () => {
    assert.equal(livestreamUrlIssue(EMPTY_LIVESTREAM), "");
    assert.equal(livestreamUrlIssue({ url: WATCH, note: "" }), "");
    // A value still being written shows the hint, never an error the owner has to dismiss.
    assert.notEqual(livestreamUrlIssue({ url: "https://", note: "" }), "");
    assert.notEqual(livestreamUrlIssue({ url: "http://youtu.be/dQw4w9WgXcQ", note: "" }), "");
  });

  it("asks for a save only when the stored livestream would change", () => {
    assert.equal(livestreamNeedsSave(EMPTY_LIVESTREAM, EMPTY_LIVESTREAM), false);
    assert.equal(livestreamNeedsSave(DRAFT, { ...DRAFT }), false);
    assert.equal(livestreamNeedsSave(DRAFT, setLivestreamNote(DRAFT, "Empieza pronto")), true);
    assert.equal(
      livestreamNeedsSave(DRAFT, setLivestreamUrl(DRAFT, "https://youtu.be/dQw4w9WgXcQ")),
      true,
    );
    // Clearing the link is a change; a link still being written is not.
    assert.equal(livestreamNeedsSave(DRAFT, EMPTY_LIVESTREAM), true);
    assert.equal(livestreamNeedsSave(DRAFT, { url: "https://", note: DRAFT.note }), false);
    assert.equal(livestreamNeedsSave(EMPTY_LIVESTREAM, { url: "https://", note: "" }), false);
  });
});
