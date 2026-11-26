import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reminderMessage } from "./reminder-message";

// The WhatsApp message one guest receives (F6; L9.6): the guest's name, the occasion, the deadline or the event time,
// and the public link — and nothing the guest does not already read on the invitation. The text is plain Spanish with
// no markup, no owner data, and no phone.

const LINK = "https://invitame.mx/i/valentina-xv";

describe("the reminder message (L9.6)", () => {
  it("names the guest, the occasion, the deadline, and the public link", () => {
    assert.equal(
      reminderMessage({
        kind: "PENDING_RSVP_7D",
        guestName: "Familia Gómez",
        occasion: "XV años",
        deadline: "2026-08-01",
        eventTime: "19:30",
        link: LINK,
      }),
      "Hola, Familia Gómez 👋 Te recordamos confirmar tu asistencia. Evento: XV años. Fecha límite: 1 de agosto. Tu invitación: https://invitame.mx/i/valentina-xv",
    );
  });

  it("says the same thing for both pending reminders: only the day it is sent differs", () => {
    const first = reminderMessage({
      kind: "PENDING_RSVP_7D",
      guestName: "Ana",
      occasion: "Boda",
      deadline: "2026-08-01",
      eventTime: null,
      link: LINK,
    });

    assert.equal(
      reminderMessage({
        kind: "PENDING_RSVP_2D",
        guestName: "Ana",
        occasion: "Boda",
        deadline: "2026-08-01",
        eventTime: null,
        link: LINK,
      }),
      first,
    );
    assert.match(first, /Fecha límite: 1 de agosto\./u);
  });

  it("names the time of the celebration in the event reminder", () => {
    assert.equal(
      reminderMessage({
        kind: "EVENT_EVE",
        guestName: "Familia Gómez",
        occasion: "XV años",
        deadline: "2026-08-01",
        eventTime: "19:30",
        link: LINK,
      }),
      "Hola, Familia Gómez 👋 Te esperamos mañana. Evento: XV años. Hora: 19:30 h. Tu invitación: https://invitame.mx/i/valentina-xv",
    );
  });

  it("leaves out the sentence whose fact the invitation does not have", () => {
    // A layout with no single start time names the day only, and a pending reminder always has its deadline.
    assert.equal(
      reminderMessage({
        kind: "EVENT_EVE",
        guestName: "Ana",
        occasion: "Bautizo",
        deadline: null,
        eventTime: null,
        link: LINK,
      }),
      "Hola, Ana 👋 Te esperamos mañana. Evento: Bautizo. Tu invitación: https://invitame.mx/i/valentina-xv",
    );
    assert.equal(
      reminderMessage({
        kind: "PENDING_RSVP_2D",
        guestName: "Ana",
        occasion: "Bautizo",
        deadline: null,
        eventTime: null,
        link: LINK,
      }),
      "Hola, Ana 👋 Te recordamos confirmar tu asistencia. Evento: Bautizo. Tu invitación: https://invitame.mx/i/valentina-xv",
    );
  });

  it("carries no markup and no line break, so the message is one WhatsApp line", () => {
    const message = reminderMessage({
      kind: "EVENT_EVE",
      guestName: "  Familia   Gómez ",
      occasion: "XV años",
      deadline: null,
      eventTime: "19:30",
      link: LINK,
    });

    assert.equal(message.includes("\n"), false);
    assert.equal(/[<>]/u.test(message), false);
    // The guest's name is the one the owner stored, with its runs of spaces collapsed.
    assert.match(message, /^Hola, Familia Gómez 👋/u);
  });
});
