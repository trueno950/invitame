import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  InvitationResult,
  InvitationsClient,
  OwnedInvitation,
  RsvpRead,
  RsvpSettings,
} from "../server/invitations-api.ts";
import {
  parseRsvpSettingsForm,
  RSVP_PATHS,
  rsvpCsvResponse,
  rsvpResponsesView,
  rsvpSettingsView,
  saveRsvpSettings,
} from "./invitation-rsvp.ts";

// The creator's «Asistencia» section and its responses page (M6 G3; S1, S4): the settings view in the
// invitation's own zone, the submitted form, the fold of one save into the page's query, the responses page's
// data, and the CSV download the owner's session fetches.

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

function form(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }
  return data;
}

const SETTINGS_FORM = {
  id: ID,
  timeZone: "America/Mexico_City",
  deadline: "2026-12-05T17:30",
  partyLimit: "6",
};

function fakeClient(
  result: InvitationResult<RsvpSettings> | InvitationResult<never> | Error = {
    ok: true,
    value: { deadline: DEADLINE, partyLimit: 6 },
  },
) {
  const calls: Array<{ id: string; settings: RsvpSettings }> = [];

  return {
    calls,
    async updateRsvpSettings(id: string, settings: RsvpSettings) {
      calls.push({ id, settings });
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
  };
}

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

describe("parseRsvpSettingsForm", () => {
  it("reads a wall clock of the invitation's zone as the instant the API stores", () => {
    assert.deepEqual(parseRsvpSettingsForm(form(SETTINGS_FORM)), {
      ok: true,
      deadline: DEADLINE,
      partyLimit: 6,
      timeZone: "America/Mexico_City",
    });
  });

  it("clears the deadline when the field is empty", () => {
    const parsed = parseRsvpSettingsForm(form({ ...SETTINGS_FORM, deadline: "" }));

    assert.deepEqual(parsed.ok && parsed.deadline, null);
    assert.deepEqual(parsed.ok && parsed.partyLimit, 6);
  });

  it("refuses a deadline it cannot read and a party limit outside 1 to 10", () => {
    for (const entries of [
      { ...SETTINGS_FORM, deadline: "2026-02-30T17:30" },
      { ...SETTINGS_FORM, deadline: "mañana" },
      { ...SETTINGS_FORM, partyLimit: "0" },
      { ...SETTINGS_FORM, partyLimit: "11" },
      { ...SETTINGS_FORM, partyLimit: "cuatro" },
      { ...SETTINGS_FORM, partyLimit: "2.5" },
      { ...SETTINGS_FORM, timeZone: "Marte/Olimpo" },
      { ...SETTINGS_FORM, timeZone: "" },
    ]) {
      assert.equal(parseRsvpSettingsForm(form(entries)).ok, false, JSON.stringify(entries));
    }
    assert.deepEqual(
      parseRsvpSettingsForm(form({ ...SETTINGS_FORM, deadline: "mañana", partyLimit: "40" })),
      { ok: false, issues: ["deadline", "party"] },
    );
  });
});

describe("saveRsvpSettings", () => {
  it("saves the pair and comes back to the draft with its notice", async () => {
    const client = fakeClient();

    assert.equal(
      await saveRsvpSettings(client, form(SETTINGS_FORM)),
      `${RSVP_PATHS.detail(ID)}?notice=rsvp-saved`,
    );
    assert.deepEqual(client.calls, [{ id: ID, settings: { deadline: DEADLINE, partyLimit: 6 } }]);
  });

  it("comes back with the issue codes of a form it cannot read, and sends nothing", async () => {
    const client = fakeClient();

    assert.equal(
      await saveRsvpSettings(client, form({ ...SETTINGS_FORM, partyLimit: "40" })),
      `${RSVP_PATHS.detail(ID)}?error=rsvp-settings-invalid&issues=party`,
    );
    assert.deepEqual(client.calls, []);
  });

  it("maps the API's refusal and its issues, and an ended session, like every other save", async () => {
    const refused = fakeClient({
      ok: false,
      failure: "rsvp-settings-invalid",
      issues: ["deadline must be an ISO 8601 instant with an offset, or null"],
    });
    assert.equal(
      await saveRsvpSettings(refused, form(SETTINGS_FORM)),
      `${RSVP_PATHS.detail(ID)}?error=rsvp-settings-invalid&issues=deadline`,
    );

    const archived = fakeClient({ ok: false, failure: "not-editable" });
    assert.equal(
      await saveRsvpSettings(archived, form(SETTINGS_FORM)),
      `${RSVP_PATHS.detail(ID)}?error=not-editable`,
    );

    const ended = fakeClient({ ok: false, failure: "signed-out" });
    assert.equal(await saveRsvpSettings(ended, form(SETTINGS_FORM)), "/ingresar");
  });

  it("sends nothing for an id that is not an invitation id", async () => {
    const client = fakeClient();

    for (const id of ["", "1", "not-a-uuid"]) {
      assert.equal(
        await saveRsvpSettings(client, form({ ...SETTINGS_FORM, id })),
        `${RSVP_PATHS.list}?error=not-found`,
      );
    }
    assert.deepEqual(client.calls, []);
  });

  it("answers an outage of the API with the page's own notice", async () => {
    assert.equal(
      await saveRsvpSettings(fakeClient(new Error("unreachable")), form(SETTINGS_FORM)),
      `${RSVP_PATHS.detail(ID)}?error=unavailable`,
    );
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

/** The client shape `saveRsvpSettings` needs, so a test can hand it a fake without the whole client. */
export type RsvpSettingsClient = Pick<InvitationsClient, "updateRsvpSettings">;
