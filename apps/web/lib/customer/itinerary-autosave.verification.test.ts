import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ItineraryPayload } from "../invitation-features/itinerary.ts";
import type { InvitationFeatureInput } from "../server/invitations-api.ts";
import { mergeFeatureChanges, parseFeatureChanges } from "./invitation-autosave.ts";
import {
  addItineraryMoment,
  itineraryDraftsOf,
  itineraryNeedsSave,
  removeItineraryMoment,
} from "./itinerary.ts";

// Independent verification probes of the itinerary autosave (F1; S2.1, L3.4), kept as regression tests.

const STORED: ItineraryPayload = {
  version: 1,
  items: [
    { time: "17:00", title: "Misa", place: "Parroquia" },
    { time: "19:00", title: "Cena" },
  ],
};
const STORED_FEATURES: InvitationFeatureInput = {
  timeZone: "America/Mexico_City",
  whatsappPhone: "+5215512345678",
  playlistUrl: null,
  itinerary: STORED,
  giftRegistry: null,
};

function merged(payload: Record<string, unknown>): InvitationFeatureInput {
  const parsed = parseFeatureChanges(payload);

  assert.equal(parsed.ok, true);

  return mergeFeatureChanges(STORED_FEATURES, parsed.ok ? parsed.changes : {});
}

describe("the feature autosave and the itinerary (L3.4)", () => {
  it("carries the stored plan through a save of another field", () => {
    assert.deepEqual(merged({ timeZone: "America/Cancun" }).itinerary, STORED);
    assert.equal(merged({ timeZone: "America/Cancun" }).timeZone, "America/Cancun");
    assert.deepEqual(merged({ whatsappPhone: null }).itinerary, STORED);
    assert.deepEqual(merged({ playlistUrl: null }).itinerary, STORED);
  });

  it("clears the plan only when the owner empties it", () => {
    assert.equal(merged({ itinerary: null }).itinerary, null);
    assert.equal(merged({ itinerary: [] }).itinerary, null);
  });

  it("never sends a moment that is still being written", () => {
    const drafts = addItineraryMoment(itineraryDraftsOf(STORED));

    assert.deepEqual(merged({ itinerary: drafts }).itinerary, STORED);
    assert.equal(itineraryNeedsSave(itineraryDraftsOf(STORED), drafts, STORED), false);
  });

  it("keeps the last complete version of a stored moment being retyped", () => {
    for (const patch of [{ title: "" }, { time: "" }]) {
      const drafts = itineraryDraftsOf(STORED).map((draft, index) =>
        index === 0 ? { ...draft, ...patch } : draft,
      );

      assert.deepEqual(merged({ itinerary: drafts }).itinerary, STORED);
    }
  });

  it("drops a moment the owner removed, and clears the plan with the last one", () => {
    const withoutFirst = removeItineraryMoment(itineraryDraftsOf(STORED), 0);

    assert.deepEqual(merged({ itinerary: withoutFirst }).itinerary, {
      version: 1,
      items: [{ time: "19:00", title: "Cena" }],
    });
    assert.equal(merged({ itinerary: [] }).itinerary, null);
  });

  it("refuses a payload whose moment is outside its bounds, naming the itinerary", () => {
    const parsed = parseFeatureChanges({
      itinerary: [{ time: "17:00", title: "a".repeat(61), place: "", address: "" }],
    });

    assert.equal(parsed.ok, false);
    assert.deepEqual(parsed.ok ? [] : parsed.fieldIssues.map((issue) => issue.field), [
      "itinerary",
    ]);
  });
});
