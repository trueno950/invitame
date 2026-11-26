import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  GuestItem,
  GuestList,
  GuestWithToken,
  InvitationResult,
  OwnedInvitation,
} from "../server/invitations-api.ts";
import {
  createGuest,
  GUEST_PATHS,
  guestListView,
  guestSelection,
  parseGuestForm,
  removeGuestFromList,
  rotateGuestLink,
  updateGuestDetails,
} from "./invitation-guests.ts";

// The creator's guest list (M6 G4; S1, S4): the totals, the guests with their answer and check-in state, the form that
// adds or edits one guest, and the actions that write through the API. The API owns ownership, the bounds, and the
// personal token; these functions build the page and map each outcome to the query it comes back with.

const INVITATION_ID = "0b8f2a3c-4d5e-4f60-8a91-2b3c4d5e6f70";
const GUEST_ID = "1c9e3b4d-5e6f-4a71-9b02-3c4d5e6f7a81";
const OTHER_ID = "2d0f4c5e-6f70-4b82-8c13-4d5e6f7a8b92";
const AT = "2026-11-12T15:30:00.000Z";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

const INVITATION: OwnedInvitation = {
  id: INVITATION_ID,
  templateVersionId: "3e1a5d6f-7081-4c93-9d24-5e6f7a8b9c03",
  packageId: "4f2b6e70-8192-4da4-8e35-6f7a8b9c0d14",
  slug: "invitacion-k7m2qx",
  status: "PUBLISHED",
  publishedAt: AT,
  archivedAt: null,
  createdAt: AT,
  updatedAt: AT,
  content: { celebrantName: "Ana" },
  missingRequiredFields: [],
  timeZone: "America/Mexico_City",
  featureSettings: { whatsappPhone: null, playlistUrl: null },
  availableFeatures: ["RSVP", "GUEST_LIST", "QR_PASS", "CALENDAR"],
  places: {},
};

function guest(overrides: Partial<GuestItem> = {}): GuestItem {
  return {
    id: GUEST_ID,
    name: "Ana Pérez",
    seats: 4,
    tableLabel: "7",
    phone: "+525512345678",
    note: "Mesa de la familia",
    tokenIssuedAt: AT,
    checkedInAt: null,
    response: {
      attending: true,
      partySize: 2,
      companions: [{ name: "Luis", child: false }],
      dietaryNotes: "Sin nueces",
      message: "Con gusto",
      createdAt: AT,
      updatedAt: AT,
    },
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

const LIST: GuestList = {
  guests: [
    guest(),
    guest({
      id: OTHER_ID,
      name: "Luis Gómez",
      seats: 2,
      tableLabel: null,
      phone: null,
      note: null,
      response: null,
    }),
  ],
  totals: {
    guests: 2,
    seats: 6,
    attendingGuests: 1,
    attendingPeople: 2,
    attendingAdults: 2,
    attendingChildren: 0,
    declinedCount: 0,
    pendingCount: 1,
    checkedInCount: 0,
  },
};

function form(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }
  return data;
}

describe("the guest list view", () => {
  it("shows the totals, the guests, and their answer and check-in state", () => {
    const view = guestListView(INVITATION, LIST);

    assert.equal(view.editable, true);
    assert.equal(view.csvHref, `/cuenta/invitaciones/${INVITATION_ID}/asistencia/csv`);
    assert.deepEqual(view.totals, [
      { label: "Invitados", value: 2 },
      { label: "Lugares", value: 6 },
      { label: "Personas que asisten", value: 2 },
      { label: "Adultos que asisten", value: 2 },
      { label: "Niños que asisten", value: 0 },
      { label: "No asistirán", value: 0 },
      { label: "Sin responder", value: 1 },
      { label: "En la entrada", value: 0 },
    ]);

    const [first, second] = view.rows;
    assert.equal(first?.name, "Ana Pérez");
    assert.equal(first?.answerLabel, "Sí");
    assert.equal(first?.partySize, "2");
    // The companion columns of F3: the names they gave, how many are children, and their dietary notes (L6.4).
    assert.equal(first?.companions, "Luis");
    assert.equal(first?.children, "0");
    assert.equal(first?.dietaryNotes, "Sin nueces");
    assert.equal(first?.checkIn, "Sin registrar");
    assert.equal(first?.phone, "+525512345678");
    assert.equal(first?.note, "Mesa de la familia");
    assert.equal(first?.phoneValue, "+525512345678");
    assert.equal(first?.noteValue, "Mesa de la familia");
    // The table column of F5: the assigned one, and a dash for a guest the owner has not seated yet.
    assert.equal(first?.tableLabel, "7");
    assert.equal(first?.tableLabelValue, "7");
    assert.equal(second?.tableLabel, "—");
    assert.equal(second?.tableLabelValue, "");

    assert.equal(second?.answerLabel, "Sin responder");
    // A guest who has not answered names no party and shows a dash for what they left empty.
    assert.equal(second?.partySize, "—");
    assert.equal(second?.companions, "—");
    assert.equal(second?.children, "—");
    assert.equal(second?.dietaryNotes, "—");
    assert.equal(second?.phone, "—");
    assert.equal(second?.note, "—");
    // The cell's form hands the stored values back: an empty field is what clears them, never the dash.
    assert.equal(second?.phoneValue, "");
    assert.equal(second?.noteValue, "");
  });

  it("summarizes how many confirmed people sit at each table and who still has no table (F5; L8.3)", () => {
    const view = guestListView(INVITATION, {
      ...LIST,
      guests: [
        // «Mesa 7» seats the confirmed party of Ana (F5).
        guest(),
        guest({
          id: OTHER_ID,
          name: "Familia Gómez",
          seats: 4,
          tableLabel: "7",
          response: {
            attending: true,
            partySize: 3,
            companions: [
              { name: "Jorge", child: false },
              { name: "Sofía", child: true },
            ],
            dietaryNotes: null,
            message: null,
            createdAt: AT,
            updatedAt: AT,
          },
        }),
        guest({
          id: "3e1a6b7c-8091-4d05-9e46-7a8b9c0d1e25",
          name: "Tía Rosa",
          seats: 1,
          tableLabel: "2",
          response: null,
        }),
        guest({
          id: "4f2b7c8d-9102-4e16-af57-8b9c0d1e2f36",
          name: "Primos Ruiz",
          seats: 3,
          tableLabel: null,
          response: {
            attending: true,
            partySize: 2,
            companions: [{ name: "Diego", child: false }],
            dietaryNotes: null,
            message: null,
            createdAt: AT,
            updatedAt: AT,
          },
        }),
      ],
    });

    // One line per stored table in its own order, then the guests without a table. A pending table keeps its line
    // at zero confirmed people, so the owner sees it exists.
    assert.deepEqual(view.tableSummaries, [
      "Mesa 2 · 0 personas",
      "Mesa 7 · 5 personas",
      "Sin mesa · 1 invitado",
    ]);
    // The summary counts confirmed people, never seats: Ana confirmed 2 and Familia Gómez confirmed 3.
    assert.equal(JSON.stringify(view).includes(TOKEN), false);
  });

  it("says «1 persona» and «1 invitado» when the count is one (F5; L8.3)", () => {
    const view = guestListView(INVITATION, {
      guests: [guest({ seats: 2, tableLabel: "Principal" })],
      totals: LIST.totals,
    });

    assert.deepEqual(view.tableSummaries, ["Mesa Principal · 2 personas"]);
    const single = guestListView(INVITATION, {
      guests: [
        guest({
          seats: 1,
          tableLabel: "Principal",
          response: {
            attending: true,
            partySize: 1,
            companions: [],
            dietaryNotes: null,
            message: null,
            createdAt: AT,
            updatedAt: AT,
          },
        }),
      ],
      totals: LIST.totals,
    });
    assert.deepEqual(single.tableSummaries, ["Mesa Principal · 1 persona"]);

    const unseated = guestListView(INVITATION, {
      guests: [guest({ tableLabel: null, response: null })],
      totals: LIST.totals,
    });
    assert.deepEqual(unseated.tableSummaries, ["Sin mesa · 1 invitado"]);
  });

  it("answers no table summary for an empty guest list (F5)", () => {
    const view = guestListView(INVITATION, {
      guests: [],
      totals: {
        ...LIST.totals,
        guests: 0,
        seats: 0,
        attendingGuests: 0,
        attendingPeople: 0,
        attendingAdults: 0,
        attendingChildren: 0,
        pendingCount: 0,
      },
    });

    assert.deepEqual(view.tableSummaries, []);
  });

  it("reads a check-in on the invitation's own clock and marks a changed answer", () => {
    const view = guestListView(INVITATION, {
      ...LIST,
      guests: [
        guest({
          checkedInAt: AT,
          response: {
            attending: false,
            partySize: 0,
            companions: [],
            dietaryNotes: null,
            message: null,
            createdAt: AT,
            updatedAt: "2026-11-13T18:00:00.000Z",
          },
        }),
      ],
    });

    assert.equal(view.rows[0]?.answerLabel, "No");
    assert.equal(view.rows[0]?.partySize, "0");
    assert.equal(view.rows[0]?.updated, true);
    assert.match(view.rows[0]?.checkIn ?? "", /^Registrado el /);
    // The instant is read in the invitation's zone, never in the server's.
    assert.ok((view.rows[0]?.checkIn ?? "").includes("2026"));
  });

  it("keeps an archived invitation readable and not editable", () => {
    const view = guestListView({ ...INVITATION, status: "ARCHIVED" }, LIST);

    assert.equal(view.editable, false);
    assert.equal(view.rows.length, 2);
  });

  it("never renders a personal link: the list does not carry one", () => {
    const view = guestListView(INVITATION, LIST);

    assert.equal(JSON.stringify(view).includes(TOKEN), false);
    assert.equal(view.note.length > 0, true);
    assert.equal(
      GUEST_PATHS.asistencia(INVITATION_ID),
      `/cuenta/invitaciones/${INVITATION_ID}/asistencia`,
    );
  });
});

describe("the guest a page asks for", () => {
  it("reads the guest to edit and the guest to remove from the page's own query", () => {
    assert.deepEqual(guestSelection(LIST, { editar: GUEST_ID }), {
      editing: {
        id: GUEST_ID,
        name: "Ana Pérez",
        seats: 4,
        tableLabel: "7",
        phone: "+525512345678",
        note: "Mesa de la familia",
      },
      removing: null,
    });
    assert.deepEqual(guestSelection(LIST, { quitar: OTHER_ID }), {
      editing: null,
      removing: { id: OTHER_ID, name: "Luis Gómez" },
    });
  });

  it("ignores an id that is not part of this list, and a repeated or invented value", () => {
    for (const parameters of [
      { editar: "no-es-un-uuid" },
      { editar: "9a9a9a9a-0000-4000-8000-000000000000" },
      { editar: [GUEST_ID, OTHER_ID] },
      { quitar: "" },
      {},
    ]) {
      assert.deepEqual(guestSelection(LIST, parameters), { editing: null, removing: null });
    }
  });
});

describe("the submitted guest", () => {
  it("reads a name, its seats, the optional phone and note, and the table (F5; L8.1)", () => {
    assert.deepEqual(
      parseGuestForm(
        form({
          name: "  Ana Pérez ",
          seats: "4",
          phone: " 55 1234 5678 ",
          note: "  Mesa 3 ",
          tableLabel: "  7  ",
        }),
      ),
      {
        ok: true,
        value: {
          name: "Ana Pérez",
          seats: 4,
          phone: "55 1234 5678",
          note: "Mesa 3",
          tableLabel: "7",
        },
      },
    );
  });

  it("stores null for a phone, a note, and a table the creator left empty", () => {
    assert.deepEqual(
      parseGuestForm(form({ name: "Ana", seats: "1", phone: " ", note: "", tableLabel: "  " })),
      {
        ok: true,
        value: { name: "Ana", seats: 1, phone: null, note: null, tableLabel: null },
      },
    );
  });

  it("sends no table at all when the form does not carry the field, so an older page keeps the stored one (F5; L20)", () => {
    const parsed = parseGuestForm(form({ name: "Ana", seats: "1", phone: "", note: "" }));

    assert.equal(parsed.ok, true);
    assert.equal(parsed.ok ? "tableLabel" in parsed.value : true, false);
  });

  it("refuses a guest no request could store", () => {
    for (const entries of [
      { name: "", seats: "2" },
      { name: "   ", seats: "2" },
      { name: "a".repeat(81), seats: "2" },
      { name: "Ana", seats: "0" },
      { name: "Ana", seats: "11" },
      { name: "Ana", seats: "2.5" },
      { name: "Ana", seats: "dos" },
      { name: "Ana", seats: "" },
      { name: "Ana", seats: "2", note: "a".repeat(201) },
      { name: "Ana", seats: "2", phone: "1".repeat(33) },
      { name: "Ana", seats: "2", tableLabel: "t".repeat(13) },
    ]) {
      assert.deepEqual(parseGuestForm(form(entries)), { ok: false }, JSON.stringify(entries));
    }
  });
});

interface CreateCall {
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  tableLabel?: string | null;
}

function fakeClient(result: InvitationResult<GuestWithToken>, calls: CreateCall[] = []) {
  return {
    async createGuest(
      _id: string,
      input: {
        name: string;
        seats: number;
        phone?: string | null;
        note?: string | null;
        tableLabel?: string | null;
      },
    ): Promise<InvitationResult<GuestWithToken>> {
      calls.push({
        name: input.name,
        seats: input.seats,
        phone: input.phone ?? null,
        note: input.note ?? null,
        ...(input.tableLabel === undefined ? {} : { tableLabel: input.tableLabel }),
      });
      return result;
    },
  };
}

const CREATED: InvitationResult<GuestWithToken> = {
  ok: true,
  value: { guest: guest(), token: TOKEN },
};

const ADD = {
  id: INVITATION_ID,
  slug: "invitacion-k7m2qx",
  name: "Ana Pérez",
  seats: "4",
  phone: "5512345678",
  note: "Mesa 3",
  tableLabel: "7",
};

describe("adding a guest", () => {
  it("sends the guest and answers the one-time personal link hand-off", async () => {
    const calls: CreateCall[] = [];
    const outcome = await createGuest(fakeClient(CREATED, calls), form(ADD));

    assert.deepEqual(calls, [
      { name: "Ana Pérez", seats: 4, phone: "5512345678", note: "Mesa 3", tableLabel: "7" },
    ]);
    assert.deepEqual(outcome, {
      kind: "link",
      target: `/cuenta/invitaciones/${INVITATION_ID}/asistencia?notice=guest-added`,
      invitationId: INVITATION_ID,
      guestName: "Ana Pérez",
      personalPath: `/i/invitacion-k7m2qx/g/${TOKEN}`,
    });
    // The token travels only inside the personal path the action hands to the flash.
    assert.equal(JSON.stringify({ ...outcome, personalPath: "" }).includes(TOKEN), false);
  });

  it("never builds a personal link out of a slug the form invented", async () => {
    const outcome = await createGuest(fakeClient(CREATED), form({ ...ADD, slug: "Invitacion K7" }));

    assert.deepEqual(outcome, {
      kind: "redirect",
      target: `/cuenta/invitaciones/${INVITATION_ID}/asistencia?error=invalid-form`,
    });
  });

  it("maps every refusal to the page's own query, and the ended session to sign-in", async () => {
    const cases: Array<[InvitationResult<GuestWithToken>, string]> = [
      [{ ok: false, failure: "invalid-guest" }, "?error=invalid-guest"],
      [{ ok: false, failure: "guest-list-unavailable" }, "?error=guest-list-unavailable"],
      [{ ok: false, failure: "not-editable" }, "?error=not-editable"],
      [{ ok: false, failure: "not-found" }, "?error=not-found"],
    ];

    for (const [result, query] of cases) {
      const outcome = await createGuest(fakeClient(result), form(ADD));

      assert.deepEqual(outcome, {
        kind: "redirect",
        target: `/cuenta/invitaciones/${INVITATION_ID}/asistencia${query}`,
      });
    }

    assert.deepEqual(
      await createGuest(fakeClient({ ok: false, failure: "signed-out" }), form(ADD)),
      {
        kind: "redirect",
        target: "/ingresar",
      },
    );
  });

  it("answers the outage notice when the call throws, and the form's own error when it is refused", async () => {
    const failing = {
      async createGuest(): Promise<InvitationResult<GuestWithToken>> {
        throw new Error("red caída");
      },
    };

    assert.deepEqual(await createGuest(failing, form(ADD)), {
      kind: "redirect",
      target: `/cuenta/invitaciones/${INVITATION_ID}/asistencia?error=unavailable`,
    });

    assert.deepEqual(await createGuest(fakeClient(CREATED), form({ ...ADD, seats: "0" })), {
      kind: "redirect",
      target: `/cuenta/invitaciones/${INVITATION_ID}/asistencia?error=invalid-form`,
    });
  });
});

describe("editing, removing, and rotating", () => {
  it("saves an edit and comes back with its own notice", async () => {
    const calls: Array<{ guestId: string; value: CreateCall }> = [];
    const api = {
      async updateGuest(
        _id: string,
        guestId: string,
        input: {
          name: string;
          seats: number;
          phone?: string | null;
          note?: string | null;
          tableLabel?: string | null;
        },
      ): Promise<InvitationResult<GuestItem>> {
        calls.push({
          guestId,
          value: {
            name: input.name,
            seats: input.seats,
            phone: input.phone ?? null,
            note: input.note ?? null,
            tableLabel: input.tableLabel ?? null,
          },
        });
        return { ok: true, value: guest() };
      },
    };

    assert.deepEqual(await updateGuestDetails(api, form({ ...ADD, guestId: GUEST_ID })), {
      kind: "redirect",
      target: `/cuenta/invitaciones/${INVITATION_ID}/asistencia?notice=guest-saved`,
    });
    assert.equal(calls[0]?.guestId, GUEST_ID);
    assert.deepEqual(calls[0]?.value, {
      name: "Ana Pérez",
      seats: 4,
      phone: "5512345678",
      note: "Mesa 3",
      tableLabel: "7",
    });
  });

  it("removes a guest and comes back with its own notice", async () => {
    const api = {
      async removeGuest(): Promise<InvitationResult<{ status: "deleted" }>> {
        return { ok: true, value: { status: "deleted" } };
      },
    };

    assert.deepEqual(
      await removeGuestFromList(api, form({ id: INVITATION_ID, guestId: GUEST_ID })),
      {
        kind: "redirect",
        target: `/cuenta/invitaciones/${INVITATION_ID}/asistencia?notice=guest-removed`,
      },
    );
  });

  it("rotates a link and answers the new personal link once, warning that the old one dies", async () => {
    const api = {
      async rotateGuestToken(): Promise<InvitationResult<GuestWithToken>> {
        return CREATED;
      },
    };

    assert.deepEqual(
      await rotateGuestLink(
        api,
        form({ id: INVITATION_ID, slug: "invitacion-k7m2qx", guestId: GUEST_ID }),
      ),
      {
        kind: "link",
        target: `/cuenta/invitaciones/${INVITATION_ID}/asistencia?notice=link-rotated`,
        invitationId: INVITATION_ID,
        guestName: "Ana Pérez",
        personalPath: `/i/invitacion-k7m2qx/g/${TOKEN}`,
      },
    );
  });

  it("sends nothing for an id that is not a UUID", async () => {
    const api = {
      async removeGuest(): Promise<InvitationResult<{ status: "deleted" }>> {
        throw new Error("no debería llamarse");
      },
    };

    assert.deepEqual(await removeGuestFromList(api, form({ id: "abc", guestId: GUEST_ID })), {
      kind: "redirect",
      target: "/cuenta/invitaciones?error=not-found",
    });
  });
});
