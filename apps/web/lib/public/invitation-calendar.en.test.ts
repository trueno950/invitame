import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicInvitation } from "../server/public-invitations-api.ts";
import { invitationCalendar } from "./invitation-features.ts";

// The calendar file in English (F14; S2.14, L19.2): a guest who reads an English invitation downloads a file whose
// fixed parts are English — the product identifier, the place labels, and the title the layout derives — while every
// word the owner wrote stays exactly as written. The Spanish file is the one it always was, byte for byte.

const NOW = new Date("2026-11-12T15:30:00.000Z");

/** One published birthday invitation, as the public read answers it. */
const PUBLIC: PublicInvitation = {
  slug: "invitacion-k7m2qx",
  componentKey: "birthday-poster-01",
  configuration: { componentKey: "birthday-poster-01", theme: "dinosaurs" },
  content: {
    celebrantName: "Ana",
    age: 7,
    date: "2026-12-05",
    time: "16:30",
    location: "Jardín Los Pinos",
    address: "Calle Reforma 123",
    mainPhoto: "https://example.com/ana.jpg",
    message: "Ven a celebrar conmigo.",
  },
  publishedAt: "2026-11-12T15:30:00.000Z",
  timeZone: "America/Mexico_City",
  features: {
    countdown: true,
    map: true,
    calendar: true,
    whatsapp: null,
    music: null,
    giftRegistry: false,
    giftRegistryDetails: null,
    lodging: null,
    livestream: null,
    openingAnimation: false,
    guestbook: null,
    guestAlbum: null,
    itinerary: null,
    gallery: [],
    rsvp: { mode: "open", deadline: null, partyLimit: 4, qrPass: false },
  },
  hiddenFields: [],
  places: {},
  expired: false,
  redirectTo: null,
};

describe("the calendar file in English (F14; L19.2)", () => {
  it("writes the product identifier, the derived title, and the place in English", () => {
    const file = invitationCalendar(PUBLIC, NOW, "en");

    assert.ok(file !== undefined);
    assert.match(file, /PRODID:-\/\/InvitaMe\/\/Invitations\/\/EN/);
    assert.match(file, /SUMMARY:Ana's birthday/);
    assert.match(file, /LOCATION:Jardín Los Pinos\\, Calle Reforma 123/);
    assert.match(file, /DESCRIPTION:Venue: Jardín Los Pinos\\, Calle Reforma 123/);
  });

  it("keeps the Spanish file exactly as it was without the locale", () => {
    const file = invitationCalendar(PUBLIC, NOW);

    assert.ok(file !== undefined);
    assert.match(file, /PRODID:-\/\/InvitaMe\/\/Invitaciones\/\/ES/);
    assert.match(file, /SUMMARY:Cumpleaños de Ana/);
    assert.match(file, /DESCRIPTION:Lugar: Jardín Los Pinos\\, Calle Reforma 123/);
  });

  it("keeps every instant and the owner's own words untouched in both languages", () => {
    for (const locale of ["es", "en"] as const) {
      const file = invitationCalendar(PUBLIC, NOW, locale) ?? "";

      // The start is the invitation's own wall clock in its own zone, four hours long, whatever the language.
      assert.match(file, /DTSTART:20261205T223000Z/);
      assert.match(file, /DTEND:20261206T023000Z/);
      assert.match(file, /UID:invitacion-k7m2qx@invitame/);
    }
  });
});
