import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InvitationFeatureInput, RsvpSettings } from "../server/invitations-api.ts";
import {
  AUTOSAVE_COPY,
  FEATURE_ISSUE_COPY,
  INVITATION_ERROR_COPY,
  RSVP_SETTINGS_ISSUE_COPY,
} from "./copy.ts";
import {
  type AutosaveFieldIssue,
  invalidPayload,
  mergeContent,
  mergeFeatureChanges,
  mergeRsvpChanges,
  parseContentChanges,
  parseFeatureChanges,
  parseRsvpChanges,
  refusal,
} from "./invitation-autosave.ts";
import { contentFields, fieldLabel } from "./invitations.ts";
import {
  addItineraryMoment,
  EMPTY_ITINERARY_MOMENT,
  type ItineraryDraftMoment,
  itineraryNeedsSave,
  removeItineraryMoment,
  updateItineraryMoment,
} from "./itinerary.ts";

// The autosave building blocks (T2a; S2, S4): a content autosave merges only the fields the creator changed into
// the content it reads from the API at that instant, so it never overwrites a field written elsewhere (the
// uploaded main photo, for one); a field the creator cleared travels as cleared instead of being dropped; a field
// the pinned template does not declare is refused; and every refusal of the API becomes a Spanish message with the
// fields it names.

const SCHEMA = {
  type: "object",
  required: ["celebrantName", "date"],
  properties: {
    celebrantName: { type: "string", maxLength: 80 },
    date: { type: "string", format: "date" },
    age: { type: "integer", minimum: 1, maximum: 120 },
    message: { type: "string", maxLength: 20 },
    mainPhoto: { type: "string", format: "uri", maxLength: 500 },
    confirmed: { type: "boolean" },
  },
};

const FIELDS = contentFields(SCHEMA);

/** What the API has stored when the creator edits: the photo was uploaded from another section. */
const STORED = {
  mainPhoto: "https://cdn.example.test/foto.jpg",
  celebrantName: "Ana",
  date: "2026-12-05",
  message: "Te esperamos",
};

const STORED_FEATURES: InvitationFeatureInput = {
  timeZone: "America/Mexico_City",
  whatsappPhone: "+525512345678",
  playlistUrl: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
  itinerary: {
    version: 1,
    items: [{ time: "17:00", title: "Misa", address: "Av. Juárez 45" }],
  },
};

const STORED_RSVP: RsvpSettings = { deadline: "2026-12-01T23:30:00.000Z", partyLimit: 4 };

function changesOf(parsed: ReturnType<typeof parseContentChanges>) {
  assert.equal(parsed.ok, true);
  return parsed.ok ? parsed.changes : [];
}

function issuesOf(parsed: {
  ok: boolean;
  fieldIssues?: readonly AutosaveFieldIssue[];
}): readonly AutosaveFieldIssue[] {
  assert.equal(parsed.ok, false);
  return parsed.fieldIssues ?? [];
}

describe("a content autosave merges only the changed fields (S2, S4)", () => {
  it("keeps every stored field the creator did not touch, such as the uploaded main photo", () => {
    const parsed = parseContentChanges(FIELDS, { message: "Ven a celebrar" });

    assert.deepEqual(mergeContent(STORED, changesOf(parsed)), {
      ...STORED,
      message: "Ven a celebrar",
    });
  });

  it("sends a cleared field as cleared, so the stored value is removed instead of kept", () => {
    const parsed = parseContentChanges(FIELDS, { message: "" });

    assert.deepEqual(changesOf(parsed), [{ name: "message", value: null }]);
    assert.deepEqual(mergeContent(STORED, changesOf(parsed)), {
      mainPhoto: STORED.mainPhoto,
      celebrantName: "Ana",
      date: "2026-12-05",
    });
  });

  it("clears a field that arrives as null, which is how a control with no empty state clears it", () => {
    const parsed = parseContentChanges(FIELDS, { message: null });

    assert.deepEqual(changesOf(parsed), [{ name: "message", value: null }]);
  });

  it("keeps the declared type of every value, and reads the text a number control submits", () => {
    const parsed = parseContentChanges(FIELDS, { age: 30, confirmed: true });

    assert.deepEqual(changesOf(parsed), [
      { name: "age", value: 30 },
      { name: "confirmed", value: true },
    ]);
    // A number control submits its value as text: the number it names is what gets stored.
    assert.deepEqual(changesOf(parseContentChanges(FIELDS, { age: "31" })), [
      { name: "age", value: 31 },
    ]);
  });

  it("refuses a field the pinned template does not declare, and keeps no change at all", () => {
    const parsed = parseContentChanges(FIELDS, { message: "Ven", gallery: ["a"] });

    assert.deepEqual(
      issuesOf(parsed).map((issue) => issue.field),
      ["gallery"],
    );
    assert.equal(issuesOf(parsed)[0]?.message, AUTOSAVE_COPY.unknownField);
  });

  it("refuses a value of the wrong type, an out-of-range number, and a text over its bound", () => {
    assert.deepEqual(
      issuesOf(parseContentChanges(FIELDS, { age: "treinta" }))[0]?.message,
      AUTOSAVE_COPY.fieldIssue("Edad"),
    );
    assert.deepEqual(issuesOf(parseContentChanges(FIELDS, { age: "30.5" }))[0]?.field, "age");
    assert.deepEqual(issuesOf(parseContentChanges(FIELDS, { age: 500 }))[0]?.field, "age");
    assert.deepEqual(
      issuesOf(parseContentChanges(FIELDS, { message: "x".repeat(21) }))[0]?.field,
      "message",
    );
    assert.deepEqual(
      issuesOf(parseContentChanges(FIELDS, { date: "2026-02-30" }))[0]?.field,
      "date",
    );
  });

  it("refuses a payload that is not an object, and names no field", () => {
    for (const payload of [null, "text", ["celebrantName"], 7]) {
      assert.deepEqual(parseContentChanges(FIELDS, payload), { ok: false, fieldIssues: [] });
    }
  });

  it("refuses a value it cannot read as text, so nothing unreadable is written", () => {
    assert.deepEqual(
      issuesOf(parseContentChanges(FIELDS, { celebrantName: { name: "Ana" } }))[0]?.field,
      "celebrantName",
    );
  });

  it("writes the omitted sections as a list of section keys, never as one text (S8.2)", () => {
    assert.deepEqual(changesOf(parseContentChanges(FIELDS, { omittedSections: ["ceremony"] })), [
      { name: "omittedSections", value: ["ceremony"] },
    ]);
    // Showing every section again stores the empty list, which replaces the stored one whole instead of keeping it.
    assert.deepEqual(changesOf(parseContentChanges(FIELDS, { omittedSections: [] })), [
      { name: "omittedSections", value: [] },
    ]);
    assert.deepEqual(
      mergeContent({ ...STORED, omittedSections: ["ceremony"] }, [
        { name: "omittedSections", value: [] },
      ]),
      { ...STORED, omittedSections: [] },
    );

    for (const refused of [
      "ceremony",
      ["ceremony", "ceremony"],
      [""],
      ["Ceremony"],
      [1],
      null,
      { key: "ceremony" },
      Array.from({ length: 25 }, (_, index) => `key${index}`),
    ]) {
      assert.deepEqual(
        issuesOf(parseContentChanges(FIELDS, { omittedSections: refused })).map(
          (issue) => issue.field,
        ),
        ["omittedSections"],
        JSON.stringify(refused),
      );
    }
  });
});

describe("a feature autosave merges only the changed fields (S2, S4)", () => {
  it("keeps the stored zone and playlist when only the phone changes", () => {
    const parsed = parseFeatureChanges({ whatsappPhone: " 55 1234 5678 " });

    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? mergeFeatureChanges(STORED_FEATURES, parsed.changes) : undefined, {
      timeZone: "America/Mexico_City",
      whatsappPhone: "55 1234 5678",
      playlistUrl: STORED_FEATURES.playlistUrl,
      itinerary: STORED_FEATURES.itinerary,
    });
  });

  it("clears the phone the creator emptied, and keeps the playlist", () => {
    const parsed = parseFeatureChanges({ whatsappPhone: "" });

    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? mergeFeatureChanges(STORED_FEATURES, parsed.changes) : undefined, {
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: STORED_FEATURES.playlistUrl,
      itinerary: STORED_FEATURES.itinerary,
    });
  });

  it("sends the moments of the itinerary as the payload the API stores (F1; L3.1, L3.4)", () => {
    const parsed = parseFeatureChanges({
      itinerary: [
        { time: " 19:30 ", title: " Recepción y cóctel ", place: "", address: "" },
        { time: "17:00", title: "Misa", place: " Parroquia ", address: "   " },
      ],
    });

    assert.equal(parsed.ok, true);
    assert.deepEqual(
      parsed.ok
        ? mergeFeatureChanges({ ...STORED_FEATURES, itinerary: null }, parsed.changes)
        : undefined,
      {
        ...STORED_FEATURES,
        itinerary: {
          version: 1,
          items: [
            { time: "19:30", title: "Recepción y cóctel" },
            { time: "17:00", title: "Misa", place: "Parroquia" },
          ],
        },
      },
    );
  });

  it("clears the stored plan when the owner removes every moment (F1; L3.4)", () => {
    const parsed = parseFeatureChanges({ itinerary: null });

    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? mergeFeatureChanges(STORED_FEATURES, parsed.changes) : undefined, {
      ...STORED_FEATURES,
      itinerary: null,
    });
  });

  it("accepts a moment that is still being written and sends only the complete ones (L3.4)", () => {
    const blank = { time: "", title: "", place: "", address: "" };
    const parsed = parseFeatureChanges({
      itinerary: [{ time: "17:00", title: "Misa", place: "", address: "" }, blank],
    });

    assert.equal(parsed.ok, true);
    assert.deepEqual(
      parsed.ok
        ? mergeFeatureChanges({ ...STORED_FEATURES, itinerary: null }, parsed.changes)
        : undefined,
      {
        ...STORED_FEATURES,
        itinerary: { version: 1, items: [{ time: "17:00", title: "Misa" }] },
      },
    );

    // A plan that only holds a row being written carries no moment at all, so it is nothing to store.
    const onlyBlank = parseFeatureChanges({ itinerary: [blank] });

    assert.equal(onlyBlank.ok, true);
    assert.deepEqual(
      onlyBlank.ok
        ? mergeFeatureChanges({ ...STORED_FEATURES, itinerary: null }, onlyBlank.changes)
        : undefined,
      { ...STORED_FEATURES, itinerary: null },
    );
  });

  it("sends the stored plan again when a row being written was added to it (L3.4)", () => {
    const parsed = parseFeatureChanges({
      itinerary: [
        { time: "17:00", title: "Misa", place: "", address: "Av. Juárez 45" },
        { time: "", title: "Cóctel", place: "", address: "" },
      ],
    });

    assert.equal(parsed.ok, true);
    // The stored payload is already the complete set, so the save is a no-op the queue never sends.
    assert.deepEqual(
      parsed.ok ? mergeFeatureChanges(STORED_FEATURES, parsed.changes) : undefined,
      STORED_FEATURES,
    );
  });

  it("keeps a stored moment whose title the owner is retyping, and drops it only when removed (L3.4)", () => {
    const stored: InvitationFeatureInput = {
      ...STORED_FEATURES,
      itinerary: {
        version: 1,
        items: [
          { time: "17:00", title: "Misa", place: "Parroquia", address: "Av. Juárez 45" },
          { time: "19:30", title: "Recepción y cóctel" },
        ],
      },
    };
    const cleared = parseFeatureChanges({
      itinerary: [
        { time: "17:00", title: "  ", place: "Parroquia", address: "Av. Juárez 45" },
        { time: "19:30", title: "Recepción y cóctel", place: "", address: "" },
      ],
    });

    assert.equal(cleared.ok, true);
    // The API receives the plan it already had, not a plan that lost the moment being retyped.
    assert.deepEqual(
      cleared.ok ? mergeFeatureChanges(stored, cleared.changes).itinerary : undefined,
      stored.itinerary,
    );

    // «Quitar» is the way to remove it, and then it is gone from the payload.
    const removed = parseFeatureChanges({
      itinerary: [{ time: "19:30", title: "Recepción y cóctel", place: "", address: "" }],
    });

    assert.equal(removed.ok, true);
    assert.deepEqual(
      removed.ok ? mergeFeatureChanges(stored, removed.changes).itinerary : undefined,
      { version: 1, items: [{ time: "19:30", title: "Recepción y cóctel" }] },
    );
  });

  it("walks a moment added empty and filled step by step without a refusal (L3.4)", () => {
    const stored = { ...STORED_FEATURES, itinerary: null };
    let drafts: readonly ItineraryDraftMoment[] = [];

    // «Agregar momento»: an empty row is nothing complete, so no request is made and no refusal can appear.
    drafts = addItineraryMoment(drafts);
    assert.equal(itineraryNeedsSave([], drafts), false);

    // The owner types the time: the row is still being written, so nothing is sent yet.
    const beforeTime = drafts;
    drafts = updateItineraryMoment(drafts, 0, { time: "17:00" });
    assert.equal(itineraryNeedsSave(beforeTime, drafts), false);

    // The title completes it: this is the save, and its payload is one the API accepts.
    const beforeTitle = drafts;
    drafts = updateItineraryMoment(drafts, 0, { title: "Misa" });
    assert.equal(itineraryNeedsSave(beforeTitle, drafts), true);

    const parsed = parseFeatureChanges({ itinerary: drafts });

    assert.equal(parsed.ok, true);
    assert.deepEqual(
      parsed.ok ? mergeFeatureChanges(stored, parsed.changes).itinerary : undefined,
      { version: 1, items: [{ time: "17:00", title: "Misa" }] },
    );

    // A second row added and removed while it is empty never asks for a save either.
    const withEmpty = addItineraryMoment(drafts);
    assert.equal(itineraryNeedsSave(drafts, withEmpty), false);
    assert.equal(itineraryNeedsSave(withEmpty, removeItineraryMoment(withEmpty, 1)), false);
    assert.ok(EMPTY_ITINERARY_MOMENT.time === "");
  });

  it("refuses a complete moment no control could have written (F1; L3.1, L3.4)", () => {
    for (const refused of [
      "Misa",
      [{ time: "17:00", title: "Misa" }],
      [{ time: 17, title: "Misa", place: "", address: "" }],
      [{ time: "17:00", title: "Misa", place: null, address: "" }],
      Array.from({ length: 16 }, () => ({ time: "17:00", title: "Misa", place: "", address: "" })),
      [{ time: "24:00", title: "Misa", place: "", address: "" }],
      [{ time: "17:00", title: "a".repeat(61), place: "", address: "" }],
    ]) {
      assert.deepEqual(
        issuesOf(parseFeatureChanges({ itinerary: refused })).map((issue) => issue.field),
        ["itinerary"],
        JSON.stringify(refused),
      );
    }
    assert.equal(FEATURE_ISSUE_COPY.itinerary.length > 0, true);
  });

  it("refuses a key that is not one of the feature fields", () => {
    assert.deepEqual(issuesOf(parseFeatureChanges({ gifts: "x" }))[0], {
      field: "gifts",
      message: AUTOSAVE_COPY.unknownField,
    });
  });

  it("refuses a zone the API does not accept and a phone over its bound, in Spanish", () => {
    assert.deepEqual(
      issuesOf(parseFeatureChanges({ timeZone: "Europe/Madrid" }))[0]?.message,
      FEATURE_ISSUE_COPY.timezone,
    );
    assert.deepEqual(
      issuesOf(parseFeatureChanges({ whatsappPhone: "5".repeat(33) }))[0]?.message,
      FEATURE_ISSUE_COPY.phone,
    );
    assert.deepEqual(
      issuesOf(
        parseFeatureChanges({ playlistUrl: `https://open.spotify.com/${"a".repeat(500)}` }),
      )[0]?.field,
      "playlistUrl",
    );
  });
});

describe("an RSVP autosave merges only the changed fields (S2, S4)", () => {
  it("keeps the stored deadline when only the party limit changes", () => {
    const parsed = parseRsvpChanges({ partyLimit: 6 });

    assert.equal(parsed.ok, true);
    const merged = parsed.ok
      ? mergeRsvpChanges(STORED_RSVP, parsed.changes, "America/Mexico_City")
      : undefined;

    assert.deepEqual(merged, { ok: true, settings: { ...STORED_RSVP, partyLimit: 6 } });
  });

  it("reads the wall clock the creator wrote in the invitation's own zone", () => {
    const parsed = parseRsvpChanges({ deadline: "2026-12-05T18:00" });

    assert.equal(parsed.ok, true);
    const merged = parsed.ok
      ? mergeRsvpChanges(STORED_RSVP, parsed.changes, "America/Mexico_City")
      : undefined;

    assert.deepEqual(merged, {
      ok: true,
      settings: { deadline: "2026-12-06T00:00:00.000Z", partyLimit: STORED_RSVP.partyLimit },
    });
  });

  it("clears the deadline the creator emptied", () => {
    const parsed = parseRsvpChanges({ deadline: null });

    assert.equal(parsed.ok, true);
    assert.deepEqual(
      parsed.ok ? mergeRsvpChanges(STORED_RSVP, parsed.changes, "America/Mexico_City") : undefined,
      { ok: true, settings: { deadline: null, partyLimit: STORED_RSVP.partyLimit } },
    );
  });

  it("refuses a wall clock it cannot read and a party limit outside 1 to 10", () => {
    assert.deepEqual(issuesOf(parseRsvpChanges({ deadline: "2026-12-05T25:00" }))[0], {
      field: "deadline",
      message: RSVP_SETTINGS_ISSUE_COPY.deadline,
    });
    assert.deepEqual(issuesOf(parseRsvpChanges({ partyLimit: 11 }))[0], {
      field: "partyLimit",
      message: RSVP_SETTINGS_ISSUE_COPY.party,
    });
    assert.deepEqual(
      issuesOf(parseRsvpChanges({ deadline: "x", partyLimit: 0 }))[0]?.field,
      "deadline",
    );
  });

  it("refuses a payload key that names no setting", () => {
    assert.deepEqual(issuesOf(parseRsvpChanges({ guests: 2 }))[0]?.field, "guests");
  });
});

describe("every refusal becomes a Spanish result the status line can show (S2, S4)", () => {
  it("maps a content refusal to the fields the API named", () => {
    assert.deepEqual(
      refusal("content", "content-invalid", [
        "content.date must be a calendar date as YYYY-MM-DD",
        "schema.properties must be an object",
      ]),
      {
        ok: false,
        reason: "invalid",
        message: INVITATION_ERROR_COPY["content-invalid"],
        fieldIssues: [{ field: "date", message: AUTOSAVE_COPY.fieldIssue("Fecha") }],
      },
    );
  });

  it("maps an ended session to its own reason, so the UI offers a sign-in link", () => {
    assert.deepEqual(refusal("content", "signed-out"), {
      ok: false,
      reason: "signed-out",
      message: AUTOSAVE_COPY.signedOut,
    });
  });

  it("maps an outage to the retryable reason", () => {
    assert.deepEqual(refusal("features", "unavailable"), {
      ok: false,
      reason: "unavailable",
      message: INVITATION_ERROR_COPY.unavailable,
    });
  });

  it("maps an archived invitation to its own sentence", () => {
    assert.deepEqual(refusal("rsvp", "not-editable"), {
      ok: false,
      reason: "refused",
      message: INVITATION_ERROR_COPY["not-editable"],
    });
  });

  it("reports a content conflict with the sentence that says the invitation changed elsewhere", () => {
    assert.deepEqual(refusal("content", "content-conflict"), {
      ok: false,
      reason: "refused",
      message: INVITATION_ERROR_COPY["content-conflict"],
    });
  });

  it("maps the feature and RSVP issues to the field each one names", () => {
    assert.deepEqual(
      refusal("features", "features-invalid", [
        "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
      ]).fieldIssues,
      [{ field: "whatsappPhone", message: FEATURE_ISSUE_COPY.phone }],
    );
    assert.deepEqual(
      refusal("rsvp", "rsvp-settings-invalid", ["partyLimit must be between 1 and 10"]).fieldIssues,
      [{ field: "partyLimit", message: RSVP_SETTINGS_ISSUE_COPY.party }],
    );
    assert.equal(
      refusal("rsvp", "rsvp-settings-invalid", ["x must be a thing"]).fieldIssues,
      undefined,
    );
  });

  it("shows a content field's own sentence when its payload is refused (T2a; S2)", () => {
    // A content autosave of a value the pinned schema refuses names the field, and the status line says what to fix
    // instead of telling the customer to reload a page that is not stale.
    const parsed = parseContentChanges(FIELDS, { date: "no-es-una-fecha" });

    assert.equal(parsed.ok, false);
    const refused = invalidPayload(parsed.ok ? [] : parsed.fieldIssues);

    assert.deepEqual(
      refused.fieldIssues?.map((issue) => issue.field),
      ["date"],
    );
    assert.equal(refused.reason, "invalid");
    assert.equal(refused.message, AUTOSAVE_COPY.fieldIssue(fieldLabel("date")));
    assert.notEqual(refused.message, AUTOSAVE_COPY.invalidPayload);
  });

  it("names a payload the server could not read, with the issues it collected", () => {
    // A payload refused for a named field says what to fix under that field; the generic sentence is for a refusal
    // that names nothing, because only then is there nothing the owner can do but try again.
    assert.deepEqual(
      invalidPayload([{ field: "date", message: AUTOSAVE_COPY.fieldIssue("Fecha") }]),
      {
        ok: false,
        reason: "invalid",
        message: AUTOSAVE_COPY.fieldIssue("Fecha"),
        fieldIssues: [{ field: "date", message: AUTOSAVE_COPY.fieldIssue("Fecha") }],
      },
    );
    assert.deepEqual(invalidPayload([]), {
      ok: false,
      reason: "invalid",
      message: AUTOSAVE_COPY.invalidPayload,
    });
    assert.equal(
      invalidPayload([{ field: "itinerary", message: FEATURE_ISSUE_COPY.itinerary }]).message,
      FEATURE_ISSUE_COPY.itinerary,
    );
  });
});
