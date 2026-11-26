import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  availableFeatureKeys,
  type InvitationFeatureGate,
  publicInvitationFeatures,
} from "./invitation-features";
import { storedItinerary, validateItinerary } from "./invitation-itinerary";

// Independent verification probes of the itinerary (F1; S2.1, L3.1, L3.3), kept as regression tests.

const MOMENT = { time: "17:00", title: "Misa", place: "Parroquia", address: "Av. Juárez 45" };
const moments = (
  count: number,
): { time: string; title: string; place: string; address: string }[] =>
  Array.from({ length: count }, () => MOMENT);
const issuesOf = (payload: unknown): unknown => {
  const validated = validateItinerary(payload);

  return validated.ok ? validated.value : validated.issues;
};
const itemsOf = (payload: unknown): readonly { time: string; title: string }[] => {
  const validated = validateItinerary(payload);

  assert.equal(validated.ok, true);
  assert.notEqual(validated.ok ? validated.value : undefined, null);

  return (
    (validated.ok ? validated.value : null) as { items: readonly { time: string; title: string }[] }
  ).items;
};
const gateOf = (overrides: Partial<InvitationFeatureGate> = {}): InvitationFeatureGate => ({
  includedFeatureKeys: ["ITINERARY", "COUNTDOWN"],
  whatsappPhone: null,
  playlistUrl: null,
  playlistTitle: null,
  playlistCoverUrl: null,
  itinerary: { version: 1, items: [MOMENT] },
  rsvpDeadline: null,
  rsvpPartyLimit: 4,
  ...overrides,
});

describe("the itinerary payload bounds (L3.1)", () => {
  it("accepts 1 and 15 moments and refuses 16, in the owner's order", () => {
    assert.deepEqual(issuesOf({ version: 1, items: [MOMENT] }), { version: 1, items: [MOMENT] });
    assert.equal(itemsOf({ version: 1, items: moments(15) }).length, 15);
    assert.deepEqual(issuesOf({ version: 1, items: moments(16) }), [
      "itinerary.items must have at most 15 items",
    ]);
    assert.deepEqual(
      itemsOf({ version: 1, items: [{ time: "20:00", title: "Baile" }, MOMENT] }).map(
        (moment) => moment.time,
      ),
      ["20:00", "17:00"],
    );
  });

  it("treats null and an empty list as no itinerary, and refuses another version", () => {
    assert.equal(issuesOf(null), null);
    assert.equal(issuesOf({ version: 1, items: [] }), null);
    assert.deepEqual(issuesOf({ version: 2, items: [MOMENT] }), ["itinerary.version must be 1"]);
    assert.deepEqual(issuesOf({ items: [MOMENT] }), ["itinerary.version must be 1"]);
    assert.deepEqual(issuesOf({ version: 1, items: "x" }), ["itinerary.items must be a list"]);
    assert.deepEqual(issuesOf(["x"]), ["itinerary must be an object or null"]);
    assert.deepEqual(issuesOf({ version: 1, items: ["x"] }), [
      "itinerary.items[0] must be an object",
    ]);
  });

  it("bounds the time, the title, and the two optional texts, naming the moment", () => {
    assert.equal(
      itemsOf({
        version: 1,
        items: [
          { time: "00:00", title: "Inicio" },
          { time: "23:59", title: "Fin" },
        ],
      }).length,
      2,
    );
    for (const time of ["24:00", "9:05", "23:60"]) {
      assert.deepEqual(issuesOf({ version: 1, items: [{ time, title: "X" }] }), [
        "itinerary.items[0].time must be a time between 00:00 and 23:59",
      ]);
    }
    assert.deepEqual(issuesOf({ version: 1, items: [{ time: "10:00", title: "a".repeat(61) }] }), [
      "itinerary.items[0].title must be between 1 and 60 characters",
    ]);
    assert.deepEqual(issuesOf({ version: 1, items: [{ time: "10:00", title: "   " }] }), [
      "itinerary.items[0].title must be between 1 and 60 characters",
    ]);
    assert.deepEqual(
      issuesOf({ version: 1, items: [{ time: "10:00", title: "T", place: "p".repeat(161) }] }),
      ["itinerary.items[0].place must be a string of at most 160 characters"],
    );
    assert.deepEqual(
      issuesOf({ version: 1, items: [{ time: "10:00", title: "T", address: "a".repeat(161) }] }),
      ["itinerary.items[0].address must be a string of at most 160 characters"],
    );
  });

  it("trims every text and stores a blank optional value as absent", () => {
    assert.deepEqual(
      issuesOf({
        version: 1,
        items: [{ time: "10:00", title: "  Misa  ", place: "   ", address: "" }],
      }),
      { version: 1, items: [{ time: "10:00", title: "Misa" }] },
    );
  });

  it("reads a row written around the API as no itinerary", () => {
    assert.equal(storedItinerary({ version: 9, items: [MOMENT] }), null);
    assert.equal(storedItinerary({ version: 1, items: [{ time: "17:00" }] }), null);
    assert.equal(storedItinerary(null), null);
  });
});

describe("the public gate of the itinerary (L3.3)", () => {
  it("answers the moments only while the package grants the key and the list is not empty", () => {
    assert.deepEqual(publicInvitationFeatures(gateOf()).itinerary, { items: [MOMENT] });
    assert.equal(publicInvitationFeatures(gateOf({ itinerary: null })).itinerary, null);
    assert.equal(
      publicInvitationFeatures(gateOf({ itinerary: { version: 1, items: [] } })).itinerary,
      null,
    );
    assert.equal(
      publicInvitationFeatures(gateOf({ includedFeatureKeys: ["COUNTDOWN"] })).itinerary,
      null,
    );
    assert.equal(
      publicInvitationFeatures(
        gateOf({ itinerary: { version: 1, items: [{ time: "10:00" }] } as never }),
      ).itinerary,
      null,
    );
    assert.deepEqual(Object.keys(publicInvitationFeatures(gateOf()).itinerary ?? {}), ["items"]);
  });

  it("lists ITINERARY for the owner only once a moment is stored", () => {
    assert.deepEqual(availableFeatureKeys(gateOf()), ["ITINERARY", "COUNTDOWN", "CALENDAR"]);
    assert.deepEqual(availableFeatureKeys(gateOf({ itinerary: null })), ["COUNTDOWN", "CALENDAR"]);
  });
});
