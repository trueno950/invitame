import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OwnedInvitation, RsvpRead, RsvpSettings } from "../server/invitations-api.ts";
import {
  RSVP_PATHS,
  rsvpCsvResponse,
  rsvpResponsesView,
  rsvpSettingsView,
} from "./invitation-rsvp.ts";

// The creator's «Asistencia» section and its responses page (M6 G3; S1, S4): the settings view in the
// invitation's own zone, the responses page's data, and the CSV download the owner's session fetches. The
// writes live in the editor's autosave, which `invitation-autosave.test.ts` proves.

const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const AT = "2026-11-12T10:00:00.000Z";
const DEADLINE = "2026-12-05T23:30:00.000Z";

const INVITATION: OwnedInvitation = {
  id: ID,
  templateVersionId: "4b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e14",
  packageId: "5b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e15",
  slug: "invitacion-k7m2qx",
  status: "DRAFT",
  publishedAt: null,
  archivedAt: null,
  createdAt: AT,
  updatedAt: AT,
  content: { celebrantName: "Ana" },
  missingRequiredFields: [],
  timeZone: "America/Mexico_City",
  featureSettings: { whatsappPhone: null, playlistUrl: null },
  availableFeatures: ["COUNTDOWN", "RSVP", "CALENDAR"],
  places: {},
};

const SETTINGS: RsvpSettings = { deadline: DEADLINE, partyLimit: 4 };

const RESPONSE_ITEM = {
  id: "7b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e20",
  name: "Ana Pérez",
  attending: true,
  partySize: 2,
  phone: "+525512345678",
  message: "Con mucho gusto",
  createdAt: AT,
  updatedAt: AT,
};

const READ: RsvpRead = {
  settings: SETTINGS,
  responses: [
    RESPONSE_ITEM,
    {
      ...RESPONSE_ITEM,
      id: "8b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e21",
      name: "Luis Ramos",
      attending: false,
      partySize: 0,
      phone: null,
      message: null,
      createdAt: "2026-11-11T09:00:00.000Z",
      updatedAt: "2026-11-11T09:30:00.000Z",
    },
  ],
  totals: { attendingPeople: 2, declinedCount: 1, responses: 2 },
};

describe("rsvpSettingsView", () => {
  it("writes the stored deadline in the invitation's own zone and offers 1 to 10 people", () => {
    const view = rsvpSettingsView(INVITATION, SETTINGS);

    assert.equal(view.id, ID);
    assert.equal(view.editable, true);
    assert.equal(view.deadlineValue, "2026-12-05T17:30");
    assert.equal(view.deadlineText, "5 de diciembre de 2026 a las 17:30");
    assert.equal(view.partyLimit, 4);
    assert.deepEqual(view.partyLimits, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(view.timeZone, "America/Mexico_City");
    assert.equal(view.responsesHref, RSVP_PATHS.responses(ID));
    assert.equal(view.responsesHref, `/cuenta/invitaciones/${ID}/asistencia`);
  });

  it("shows an empty deadline, and keeps an archived invitation read-only", () => {
    const view = rsvpSettingsView(
      { ...INVITATION, status: "ARCHIVED" },
      { deadline: null, partyLimit: 10 },
    );

    assert.equal(view.editable, false);
    assert.equal(view.deadlineValue, "");
    assert.equal(view.deadlineText, "");
    assert.equal(view.partyLimit, 10);
  });
});

describe("rsvpResponsesView", () => {
  it("keeps the API's newest-first order and its totals", () => {
    const view = rsvpResponsesView(INVITATION, READ);

    assert.deepEqual(view.totals, READ.totals);
    assert.deepEqual(
      view.rows.map((row) => row.name),
      ["Ana Pérez", "Luis Ramos"],
    );
  });

  it("reads each answer on the invitation's clock and says which ones were updated", () => {
    const view = rsvpResponsesView(INVITATION, READ);
    const [first, second] = view.rows;

    assert.equal(first?.answeredAt, "12 de noviembre de 2026 a las 04:00");
    assert.equal(first?.updated, false);
    assert.equal(second?.updated, true);
    assert.equal(second?.phone, "");
    assert.equal(second?.message, "");
    assert.equal(second?.attending, false);
    assert.equal(second?.partySize, 0);
  });

  it("points the download at the owner's CSV route", () => {
    assert.equal(
      rsvpResponsesView(INVITATION, READ).csvHref,
      `/cuenta/invitaciones/${ID}/asistencia/csv`,
    );
  });
});

describe("rsvpCsvResponse", () => {
  const DOWNLOAD = {
    body: 'Nombre,Asiste\r\n"Ana Pérez",Sí\r\n',
    contentType: "text/csv; charset=utf-8",
    contentDisposition: 'attachment; filename="asistencia-invitacion-k7m2qx.csv"',
  };

  it("passes the API's file and headers through, and no cache may keep it", () => {
    const response = rsvpCsvResponse({ ok: true, value: DOWNLOAD });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), DOWNLOAD.contentType);
    assert.equal(response.headers.get("content-disposition"), DOWNLOAD.contentDisposition);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  it("sends an ended session to sign in, and answers a missing invitation as 404", () => {
    const ended = rsvpCsvResponse({ ok: false, failure: "signed-out" });
    assert.equal(ended.status, 307);
    assert.equal(ended.headers.get("location"), "/ingresar");
    assert.equal(ended.headers.get("cache-control"), "no-store");

    const missing = rsvpCsvResponse({ ok: false, failure: "not-found" });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-store");
  });

  it("answers an outage of the API with 503 instead of an empty file", () => {
    const response = rsvpCsvResponse("unavailable");

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });
});
