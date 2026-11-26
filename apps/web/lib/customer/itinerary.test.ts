import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ItineraryMoment } from "../invitation-features/itinerary.ts";
import {
  addItineraryMoment,
  EMPTY_ITINERARY_MOMENT,
  ITINERARY_DRAFT_LIMIT_MESSAGE,
  isItineraryMomentIncomplete,
  itineraryDraftsOf,
  itineraryNeedsSave,
  itineraryPayloadOf,
  moveItineraryMoment,
  removeItineraryMoment,
  updateItineraryMoment,
} from "./itinerary.ts";

// The «Itinerario» block of «Funciones» (F1; L3.4). The editor holds the moments the owner is writing, and these
// pure helpers add one, change one, remove one, and move one up or down without touching the array they are given.
// `itineraryPayloadOf` turns the drafts into the value the feature autosave sends, so an incomplete moment never
// reaches the API as a half-written payload.

const MISA: ItineraryMoment = {
  time: "17:00",
  title: "Misa",
  place: "Parroquia de San Juan",
  address: "Av. Juárez 45",
};

describe("the drafts of one itinerary (F1; L3.4)", () => {
  it("reads the stored moments as editable texts, in the owner's order", () => {
    assert.deepEqual(
      itineraryDraftsOf({ version: 1, items: [MISA, { time: "18:30", title: "Fotos" }] }),
      [
        { time: "17:00", title: "Misa", place: "Parroquia de San Juan", address: "Av. Juárez 45" },
        { time: "18:30", title: "Fotos", place: "", address: "" },
      ],
    );
  });

  it("answers no draft for an invitation without an itinerary", () => {
    assert.deepEqual(itineraryDraftsOf(null), []);
  });

  it("adds one empty moment at the end", () => {
    const drafts = addItineraryMoment([]);

    assert.deepEqual(drafts, [EMPTY_ITINERARY_MOMENT]);
    assert.notEqual(drafts, []);
  });

  it("adds no more than the fifteen moments the API stores", () => {
    const full = Array.from({ length: 15 }, () => EMPTY_ITINERARY_MOMENT);

    assert.equal(addItineraryMoment(full), full);
    assert.equal(ITINERARY_DRAFT_LIMIT_MESSAGE, "Puedes agregar hasta 15 momentos.");
  });

  it("changes one moment without touching the others", () => {
    const drafts = itineraryDraftsOf({
      version: 1,
      items: [MISA, { time: "18:30", title: "Fotos" }],
    });
    const next = updateItineraryMoment(drafts, 0, { title: "Misa y bendición" });

    assert.deepEqual(next[0], { ...drafts[0], title: "Misa y bendición" });
    assert.deepEqual(next[1], drafts[1]);
    assert.deepEqual(drafts[0], {
      time: "17:00",
      title: "Misa",
      place: "Parroquia de San Juan",
      address: "Av. Juárez 45",
    });
  });

  it("changes nothing for a moment that does not exist", () => {
    const drafts = [EMPTY_ITINERARY_MOMENT];

    assert.equal(updateItineraryMoment(drafts, 3, { title: "Nada" }), drafts);
    assert.equal(updateItineraryMoment(drafts, -1, { title: "Nada" }), drafts);
    assert.equal(updateItineraryMoment(drafts, 0.5, { title: "Nada" }), drafts);
  });

  it("removes one moment and leaves the rest in order", () => {
    const drafts = itineraryDraftsOf({
      version: 1,
      items: [MISA, { time: "18:30", title: "Fotos" }, { time: "19:30", title: "Cóctel" }],
    });

    assert.deepEqual(
      removeItineraryMoment(drafts, 1).map((moment) => moment.title),
      ["Misa", "Cóctel"],
    );
    assert.equal(removeItineraryMoment(drafts, 3), drafts);
    assert.equal(removeItineraryMoment(drafts, -1), drafts);
  });

  it("moves one moment up and down", () => {
    const drafts = itineraryDraftsOf({
      version: 1,
      items: [MISA, { time: "18:30", title: "Fotos" }, { time: "19:30", title: "Cóctel" }],
    });

    assert.deepEqual(
      moveItineraryMoment(drafts, 2, "up").map((moment) => moment.title),
      ["Misa", "Cóctel", "Fotos"],
    );
    assert.deepEqual(
      moveItineraryMoment(drafts, 0, "down").map((moment) => moment.title),
      ["Fotos", "Misa", "Cóctel"],
    );
  });

  it("keeps the first moment where it is when it moves up, and the last when it moves down", () => {
    const drafts = itineraryDraftsOf({
      version: 1,
      items: [MISA, { time: "18:30", title: "Fotos" }],
    });

    assert.equal(moveItineraryMoment(drafts, 0, "up"), drafts);
    assert.equal(moveItineraryMoment(drafts, 1, "down"), drafts);
    assert.equal(moveItineraryMoment(drafts, 2, "up"), drafts);
  });
});

describe("the payload one save sends (F1; L3.1, L3.4)", () => {
  it("trims every text and drops the optional ones that say nothing", () => {
    assert.deepEqual(
      itineraryPayloadOf([
        { time: " 17:00 ", title: "  Misa  ", place: "  Parroquia  ", address: "   " },
        { time: "18:30", title: "Sesión de fotos", place: "", address: "" },
      ]),
      {
        version: 1,
        items: [
          { time: "17:00", title: "Misa", place: "Parroquia" },
          { time: "18:30", title: "Sesión de fotos" },
        ],
      },
    );
  });

  it("answers null for an empty list, which is how the owner removes the whole itinerary", () => {
    assert.equal(itineraryPayloadOf([]), null);
  });

  it("skips a moment that is still being written, so typing never refuses the save (L3.4)", () => {
    // A row with no time or no title is not a moment yet: it stays in the browser, and the save carries the ones that
    // are complete. Nothing about it is an error the owner has to fix before the rest of the plan can be stored.
    for (const draft of [
      { time: "", title: "Misa", place: "", address: "" },
      { time: "17:00", title: "", place: "", address: "" },
      { time: "17:00", title: "   ", place: "", address: "" },
      { time: "   ", title: "   ", place: "", address: "" },
    ]) {
      assert.equal(itineraryPayloadOf([draft]), null, JSON.stringify(draft));
    }
    assert.deepEqual(
      itineraryPayloadOf([
        { time: "17:00", title: "Misa", place: "", address: "" },
        EMPTY_ITINERARY_MOMENT,
      ]),
      { version: 1, items: [{ time: "17:00", title: "Misa" }] },
    );
  });

  it("still refuses a complete moment outside its bounds, which no control could have written", () => {
    for (const draft of [
      { time: "24:00", title: "Misa", place: "", address: "" },
      { time: "7:00", title: "Misa", place: "", address: "" },
      { time: "17:00", title: "a".repeat(61), place: "", address: "" },
      { time: "17:00", title: "Misa", place: "a".repeat(161), address: "" },
      { time: "17:00", title: "Misa", place: "", address: "a".repeat(161) },
    ]) {
      assert.equal(itineraryPayloadOf([draft]), undefined, JSON.stringify(draft));
    }
  });

  it("keeps the stored version of a moment whose title was cleared (L3.4)", () => {
    const stored = {
      version: 1 as const,
      items: [
        { time: "17:00", title: "Misa", place: "Parroquia de San Juan", address: "Av. Juárez 45" },
        { time: "19:30", title: "Recepción y cóctel" },
      ],
    };

    // Clearing the title of a stored moment leaves the row in the browser, and the plan keeps that moment exactly as it
    // was stored: a title being retyped is not a reason to lose the one the guests already see.
    assert.deepEqual(
      itineraryPayloadOf(
        [
          { time: "17:00", title: "", place: "Parroquia de San Juan", address: "Av. Juárez 45" },
          { time: "19:30", title: "Recepción y cóctel", place: "", address: "" },
        ],
        stored,
      ),
      stored,
    );
    // The same holds when only the time survives a cleared title.
    assert.deepEqual(
      itineraryPayloadOf(
        [
          { time: "17:00", title: "", place: "", address: "" },
          { time: "19:30", title: "Recepción y cóctel", place: "", address: "" },
        ],
        stored,
      ),
      stored,
    );

    // «Quitar» still drops it: the drafts no longer hold the row, so nothing carries the stored moment.
    assert.deepEqual(
      itineraryPayloadOf(
        [{ time: "19:30", title: "Recepción y cóctel", place: "", address: "" }],
        stored,
      ),
      { version: 1, items: [{ time: "19:30", title: "Recepción y cóctel" }] },
    );

    // A row that was never complete carries no stored moment, and it never borrows one it does not name.
    assert.deepEqual(
      itineraryPayloadOf(
        [
          {
            time: "17:00",
            title: "Misa",
            place: "Parroquia de San Juan",
            address: "Av. Juárez 45",
          },
          EMPTY_ITINERARY_MOMENT,
        ],
        stored,
      ),
      { version: 1, items: [stored.items[0]] },
    );
    assert.equal(itineraryPayloadOf([EMPTY_ITINERARY_MOMENT], stored), null);
    // Two incomplete rows never claim the same stored moment twice.
    assert.deepEqual(
      itineraryPayloadOf(
        [
          { time: "17:00", title: "", place: "", address: "" },
          { time: "17:00", title: "", place: "", address: "" },
        ],
        stored,
      ),
      { version: 1, items: [stored.items[0]] },
    );
  });

  it("never duplicates a stored moment when a new row repeats its time (L3.4)", () => {
    const stored = { version: 1 as const, items: [{ time: "17:00", title: "Misa" }] };

    // The complete row already is that moment; the new empty row that happens to start at the same time is not it.
    assert.deepEqual(
      itineraryPayloadOf(
        [
          { time: "17:00", title: "Misa", place: "", address: "" },
          { time: "17:00", title: "", place: "", address: "" },
        ],
        stored,
      ),
      { version: 1, items: [{ time: "17:00", title: "Misa" }] },
    );
  });

  it("decides with the stored plan, so retyping a title saves nothing and removing the row does (L3.4)", () => {
    const baseline = {
      version: 1 as const,
      items: [{ time: "17:00", title: "Misa", address: "Av. Juárez 45" }],
    };
    const complete = { time: "17:00", title: "Misa", place: "", address: "Av. Juárez 45" };
    const cleared = { time: "17:00", title: "", place: "", address: "Av. Juárez 45" };

    // The row still stands for the stored moment, so the plan did not change while its title is being retyped.
    assert.equal(itineraryNeedsSave([complete], [cleared], baseline), false);
    // «Quitar» must reach the API: the row is gone, so the stored moment has to go with it.
    assert.equal(itineraryNeedsSave([cleared], [], baseline), true);
    // Without a stored plan there is nothing to keep, and the same removal is nothing to save.
    assert.equal(itineraryNeedsSave([cleared], []), false);
  });

  it("tells a moment that is still being written from one that is complete", () => {
    for (const draft of [
      EMPTY_ITINERARY_MOMENT,
      { time: "", title: "Misa", place: "", address: "" },
      { time: "17:00", title: "  ", place: "", address: "" },
    ]) {
      assert.equal(isItineraryMomentIncomplete(draft), true, JSON.stringify(draft));
    }
    for (const draft of [
      { time: "17:00", title: "Misa", place: "", address: "" },
      { time: "00:00", title: "a", place: "", address: "" },
    ]) {
      assert.equal(isItineraryMomentIncomplete(draft), false, JSON.stringify(draft));
    }
  });

  it("asks for a save only when the complete moments change (L3.4)", () => {
    const stored = [{ time: "17:00", title: "Misa", place: "", address: "" }] as const;

    // Adding an empty row, or half-writing it, leaves the complete plan as it was: there is nothing to save.
    assert.equal(itineraryNeedsSave(stored, addItineraryMoment(stored)), false);
    assert.equal(
      itineraryNeedsSave(addItineraryMoment(stored), [
        ...stored,
        { time: "", title: "Cóctel", place: "", address: "" },
      ]),
      false,
    );
    // Removing a row that was never complete is not a change either.
    assert.equal(
      itineraryNeedsSave([...stored, { time: "", title: "", place: "", address: "" }], stored),
      false,
    );
    // Completing it, editing a stored moment, or removing one is a save.
    assert.equal(
      itineraryNeedsSave(addItineraryMoment(stored), [
        ...stored,
        { time: "19:30", title: "Cóctel", place: "", address: "" },
      ]),
      true,
    );
    assert.equal(
      itineraryNeedsSave(stored, [{ time: "17:30", title: "Misa", place: "", address: "" }]),
      true,
    );
    assert.equal(itineraryNeedsSave(stored, []), true);
    // A complete moment the contract refuses is a save too, so its own sentence reaches the owner instead of silence.
    assert.equal(
      itineraryNeedsSave(stored, [{ time: "24:00", title: "Misa", place: "", address: "" }]),
      true,
    );
    // An empty plan on both sides is nothing to save.
    assert.equal(itineraryNeedsSave([], [EMPTY_ITINERARY_MOMENT]), false);
  });

  it("refuses more moments than the API stores", () => {
    assert.equal(
      itineraryPayloadOf(
        Array.from({ length: 16 }, () => ({
          time: "17:00",
          title: "Misa",
          place: "",
          address: "",
        })),
      ),
      undefined,
    );
  });
});
