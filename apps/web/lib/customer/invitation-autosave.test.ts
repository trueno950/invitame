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
import { contentFields } from "./invitations.ts";

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
});

describe("a feature autosave merges only the changed fields (S2, S4)", () => {
  it("keeps the stored zone and playlist when only the phone changes", () => {
    const parsed = parseFeatureChanges({ whatsappPhone: " 55 1234 5678 " });

    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? mergeFeatureChanges(STORED_FEATURES, parsed.changes) : undefined, {
      timeZone: "America/Mexico_City",
      whatsappPhone: "55 1234 5678",
      playlistUrl: STORED_FEATURES.playlistUrl,
    });
  });

  it("clears the phone the creator emptied, and keeps the playlist", () => {
    const parsed = parseFeatureChanges({ whatsappPhone: "" });

    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? mergeFeatureChanges(STORED_FEATURES, parsed.changes) : undefined, {
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: STORED_FEATURES.playlistUrl,
    });
  });

  it("refuses a key that is not one of the three feature fields", () => {
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

  it("names a payload the server could not read, with the issues it collected", () => {
    assert.deepEqual(
      invalidPayload([{ field: "date", message: AUTOSAVE_COPY.fieldIssue("Fecha") }]),
      {
        ok: false,
        reason: "invalid",
        message: AUTOSAVE_COPY.invalidPayload,
        fieldIssues: [{ field: "date", message: AUTOSAVE_COPY.fieldIssue("Fecha") }],
      },
    );
  });
});
