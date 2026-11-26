import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deadlineDateOf,
  REMINDERS_PREVIEW_GUEST,
  reminderPreviewMessage,
  remindersDraftOf,
  remindersPayloadOf,
} from "./reminders.ts";

// The «Recordatorios por WhatsApp» block of the editor's «Funciones» tab (F6; S2.6, S6, L9.1, L9.6). The two switches
// are stored as one versioned payload, and the preview shows the message the command would send, built from the
// invitation's own data. The wording mirrors the API's own template (`apps/api/src/reminders/domain/reminder-message.ts`),
// so the owner reads the message a guest would receive.

const LINK = "https://invitame.mx/i/valentina-xv";

describe("the reminder settings draft (F6; L9.1)", () => {
  it("reads a stored payload, and treats an absent one as both switches off", () => {
    assert.deepEqual(remindersDraftOf({ version: 1, pendingRsvp: true, eventEve: false }), {
      pendingRsvp: true,
      eventEve: false,
    });
    // A body written before the switches existed has no value at all, and the editor shows the switches off.
    assert.deepEqual(remindersDraftOf(null), { pendingRsvp: false, eventEve: false });
    assert.deepEqual(remindersDraftOf(undefined), { pendingRsvp: false, eventEve: false });
  });

  it("writes the versioned payload, and nothing when both switches are off", () => {
    assert.deepEqual(remindersPayloadOf({ pendingRsvp: true, eventEve: true }), {
      version: 1,
      pendingRsvp: true,
      eventEve: true,
    });
    assert.deepEqual(remindersPayloadOf({ pendingRsvp: false, eventEve: true }), {
      version: 1,
      pendingRsvp: false,
      eventEve: true,
    });
    // Nothing switched on stores no reminder settings, exactly as the API normalizes it (L9.1).
    assert.equal(remindersPayloadOf({ pendingRsvp: false, eventEve: false }), null);
  });

  it("offers a preview guest name that is not the owner's data", () => {
    assert.equal(REMINDERS_PREVIEW_GUEST, "Familia Gómez");
  });

  it("reads the deadline day of the editor's own control, and nothing while there is none (L9.6)", () => {
    assert.equal(deadlineDateOf("2026-08-01T18:30"), "2026-08-01");
    assert.equal(deadlineDateOf(""), null);
    assert.equal(deadlineDateOf(undefined), null);
    assert.equal(deadlineDateOf("2026-8-1"), null);
  });
});

describe("the message preview (F6; L9.6)", () => {
  it("names the preview guest, the occasion, the deadline, and the invitation's own link", () => {
    assert.equal(
      reminderPreviewMessage({
        guestName: REMINDERS_PREVIEW_GUEST,
        occasion: "XV años",
        deadline: "2026-08-01",
        link: LINK,
      }),
      "Hola, Familia Gómez 👋 Te recordamos confirmar tu asistencia. Evento: XV años. Fecha límite: 1 de agosto. Tu invitación: https://invitame.mx/i/valentina-xv",
    );
  });

  it("leaves the deadline sentence out while the invitation closes no answers", () => {
    // The template drops the fact the invitation does not have instead of inventing one (L9.6).
    assert.equal(
      reminderPreviewMessage({
        guestName: REMINDERS_PREVIEW_GUEST,
        occasion: "Boda",
        deadline: null,
        link: LINK,
      }),
      "Hola, Familia Gómez 👋 Te recordamos confirmar tu asistencia. Evento: Boda. Tu invitación: https://invitame.mx/i/valentina-xv",
    );
  });

  it("writes the day as Spanish names it, and keeps one line of plain text", () => {
    const message = reminderPreviewMessage({
      guestName: REMINDERS_PREVIEW_GUEST,
      occasion: "Bautizo",
      deadline: "2026-12-31",
      link: LINK,
    });

    assert.match(message, /Fecha límite: 31 de diciembre\./u);
    assert.equal(message.includes("\n"), false);
    assert.equal(/[<>]/u.test(message), false);
  });
});
