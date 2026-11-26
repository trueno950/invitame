import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicInvitation } from "../server/public-invitations-api.ts";
import {
  INVITATION_CALENDAR_HEADERS,
  invitationCalendar,
  invitationCalendarFile,
  invitationCalendarPath,
  publicFeatureBlock,
} from "./invitation-features.ts";

// The guest page's wiring (F3; S4): the public read becomes the features block's props, the `.ics` download
// path, and the file the route handler answers. An unsupported zone or a snapshot whose facts cannot be read
// degrades the features it affects instead of failing the page.

const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";

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
    whatsapp: { phone: "+525512345678" },
    music: { url: PLAYLIST, provider: "spotify" },
    giftRegistry: true,
    itinerary: null,
    gallery: [],
    rsvp: { mode: "open", deadline: null, partyLimit: 4, qrPass: false },
  },
  // The pinned schema of this fixture omits no section, so the page hides no block (S8.3).
  hiddenFields: [],
  places: {},
  // The read-only flag the API decided (S2, T3); this projection only renders what it is given.
  expired: false,
};

const NOW = new Date("2026-11-13T10:00:00.000Z");

const FACTS = {
  title: "Cumpleaños de Ana",
  date: "2026-12-05",
  time: "16:30",
  places: [
    { label: "Lugar", field: "address", name: "Jardín Los Pinos", address: "Calle Reforma 123" },
  ],
};

/** A wedding whose reception the customer switched off (S8.3): the API withheld its three values. */
const WEDDING_WITHOUT_RECEPTION: PublicInvitation = {
  ...PUBLIC,
  componentKey: "wedding-arch-01",
  configuration: { componentKey: "wedding-arch-01", theme: "blush-gold" },
  content: {
    coupleNameOne: "Ana Sofía",
    coupleNameTwo: "Daniel",
    date: "2026-09-12",
    ceremonyPlace: "Parroquia de Santa Ana",
    ceremonyAddress: "Av. Juárez 120, Centro, Querétaro",
    ceremonyTime: "17:00",
    dressCode: "Formal",
    message: "Nos encantaría celebrar contigo.",
    rsvpContact: "Confirma con Ana Sofía al 55 1234 5678",
    omittedSections: ["reception"],
  },
  hiddenFields: ["receptionPlace", "receptionAddress", "receptionTime"],
};

describe("the features of an invitation that omits a section (S8.3)", () => {
  it("keeps the block, and names only the place that stays shown", () => {
    const block = publicFeatureBlock(WEDDING_WITHOUT_RECEPTION);

    assert.deepEqual(block?.facts.time, "17:00");
    assert.deepEqual(block?.facts.places, [
      {
        label: "Ceremonia",
        field: "ceremonyAddress",
        name: "Parroquia de Santa Ana",
        address: "Av. Juárez 120, Centro, Querétaro",
      },
    ]);
    // The gated features are untouched: an omission hides a block, it never closes a feature (S3, S6).
    assert.equal(block?.features.countdown, true);
    assert.equal(block?.features.map, true);
    assert.equal(block?.features.calendar, true);
  });

  it("builds the .ics from the place that stays shown", () => {
    const file = invitationCalendar(WEDDING_WITHOUT_RECEPTION, NOW);

    assert.ok(file !== undefined);
    assert.match(file, /Parroquia de Santa Ana/);
    assert.doesNotMatch(file, /Hacienda San Gabriel/);
  });
});

describe("publicFeatureBlock", () => {
  it("maps the public read to the block's features, facts, and download path", () => {
    assert.deepEqual(publicFeatureBlock(PUBLIC), {
      features: {
        timeZone: "America/Mexico_City",
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: { phone: "+525512345678" },
        music: { url: PLAYLIST, provider: "spotify" },
        giftRegistry: true,
        gallery: [],
      },
      facts: FACTS,
      calendarHref: "/i/invitacion-k7m2qx/calendario.ics",
    });
  });

  it("passes no block when the API gated nothing at all", () => {
    // The strict public read refuses a body like this one (`calendar` is always true), so it is the second
    // line of defense: were such a body ever to reach the page, no block would render.
    const gatedNothing = {
      ...PUBLIC,
      features: {
        countdown: false,
        map: false,
        calendar: false,
        whatsapp: null,
        music: null,
        giftRegistry: false,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      },
    } as unknown as PublicInvitation;

    assert.equal(publicFeatureBlock(gatedNothing), undefined);
  });

  it("turns off only the features that need a zone when it is not one this runtime knows", () => {
    const block = publicFeatureBlock({ ...PUBLIC, timeZone: "Mars/Olympus" });

    assert.deepEqual(block?.features, {
      timeZone: "Mars/Olympus",
      countdown: false,
      map: true,
      calendar: false,
      whatsapp: { phone: "+525512345678" },
      music: { url: PLAYLIST, provider: "spotify" },
      giftRegistry: true,
      gallery: [],
    });
    assert.equal(block?.calendarHref, "/i/invitacion-k7m2qx/calendario.ics");
  });

  it("still hands the gate to the layouts when only the gift registry is on (S7)", () => {
    const block = publicFeatureBlock({
      ...PUBLIC,
      features: {
        countdown: false,
        map: false,
        calendar: true,
        whatsapp: null,
        music: null,
        giftRegistry: true,
        itinerary: null,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      },
    });

    // The block itself renders nothing, but the layout must still learn that its gift registry is gated.
    assert.deepEqual(block?.features, {
      timeZone: "America/Mexico_City",
      countdown: false,
      map: false,
      calendar: true,
      whatsapp: null,
      music: null,
      giftRegistry: true,
      gallery: [],
    });
  });

  it("passes no block when the layout's own facts cannot be read", () => {
    for (const invitation of [
      { ...PUBLIC, content: { celebrantName: "Ana" } },
      { ...PUBLIC, content: {} },
      { ...PUBLIC, componentKey: "birthday-layout-99" },
    ]) {
      assert.equal(publicFeatureBlock(invitation), undefined, invitation.componentKey);
    }
  });

  it("carries the gated itinerary into the block, in the API's order (F1; L3.3, L3.5)", () => {
    const items = [
      { time: "17:00", title: "Misa", place: "Parroquia de San Juan", address: "Av. Juárez 45" },
      { time: "19:30", title: "Recepción y cóctel" },
    ];
    const block = publicFeatureBlock({
      ...PUBLIC,
      features: { ...PUBLIC.features, itinerary: { items } },
    });

    assert.deepEqual(block?.features.itinerary, items);
  });

  it("carries no itinerary while the page gates none", () => {
    const block = publicFeatureBlock(PUBLIC);

    assert.equal(block?.features.itinerary, undefined);
  });

  it("keeps the map alone when the zone is unknown and nothing else is gated", () => {
    const block = publicFeatureBlock({
      ...PUBLIC,
      timeZone: "Mars/Olympus",
      features: {
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: null,
        music: null,
        giftRegistry: false,
        itinerary: null,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      },
    });

    assert.deepEqual(block?.features, {
      timeZone: "Mars/Olympus",
      countdown: false,
      map: true,
      calendar: false,
      whatsapp: null,
      music: null,
      giftRegistry: false,
      gallery: [],
    });
  });
});

describe("invitationCalendarPath", () => {
  it("puts the download next to the invitation it belongs to", () => {
    assert.equal(
      invitationCalendarPath("invitacion-k7m2qx"),
      "/i/invitacion-k7m2qx/calendario.ics",
    );
  });
});

describe("invitationCalendar", () => {
  it("builds the four-hour .ics of the invitation from its own facts", () => {
    const body = invitationCalendar(PUBLIC, NOW);

    assert.ok(body !== undefined);
    assert.match(body, /\r\n$/);
    const lines = body.split("\r\n");
    for (const line of [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:invitacion-k7m2qx@invitame",
      "DTSTAMP:20261113T100000Z",
      // 16:30 in Mexico City is UTC-06:00, so the four hours run from 22:30Z to 02:30Z.
      "DTSTART:20261205T223000Z",
      "DTEND:20261206T023000Z",
      "SUMMARY:Cumpleaños de Ana",
      "LOCATION:Jardín Los Pinos\\, Calle Reforma 123",
      "END:VEVENT",
      "END:VCALENDAR",
    ]) {
      assert.ok(lines.includes(line), line);
    }
  });

  it("refuses to build a calendar from a zone or facts it cannot read", () => {
    assert.equal(invitationCalendar({ ...PUBLIC, timeZone: "Mars/Olympus" }, NOW), undefined);
    assert.equal(
      invitationCalendar({ ...PUBLIC, content: { celebrantName: "Ana" } }, NOW),
      undefined,
    );
    assert.equal(
      invitationCalendar({ ...PUBLIC, componentKey: "birthday-layout-99" }, NOW),
      undefined,
    );
  });
});

describe("invitationCalendarFile", () => {
  it("answers the download with a calendar type, an attachment name, and no store", () => {
    const file = invitationCalendarFile(PUBLIC, NOW);

    assert.ok(file !== undefined);
    assert.deepEqual(file.headers, {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="invitacion.ics"',
      "cache-control": "no-store",
    });
    assert.deepEqual(file.headers, INVITATION_CALENDAR_HEADERS);
    assert.equal(file.body, invitationCalendar(PUBLIC, NOW));
    assert.match(file.body, /^BEGIN:VCALENDAR\r\n/);
  });

  it("answers nothing, which the route turns into a 404, when the calendar cannot be built", () => {
    assert.equal(invitationCalendarFile({ ...PUBLIC, timeZone: "Mars/Olympus" }, NOW), undefined);
    assert.equal(invitationCalendarFile({ ...PUBLIC, content: {} }, NOW), undefined);
  });
});

// The confirmed points a guest page may use (S1, S2): the public read already filtered them on the API side, so they
// travel to the block as they came, and a point whose field no longer holds its label never reaches a guest.

describe("the places of a guest page (S1, S2)", () => {
  const PARROQUIA = { label: "Calle Reforma 123", lat: 19.432608, lng: -99.133209 };

  it("carries the confirmed points to the block, keyed by address field", () => {
    const block = publicFeatureBlock({ ...PUBLIC, places: { address: PARROQUIA } });

    assert.deepEqual(block?.features.places, { address: PARROQUIA });
  });

  it("keeps the block exactly as it was when no field has a point", () => {
    const block = publicFeatureBlock(PUBLIC);

    assert.equal(block === undefined ? "none" : Object.hasOwn(block.features, "places"), false);
  });

  it("drops a point whose label the content rewrote", () => {
    const block = publicFeatureBlock({
      ...PUBLIC,
      content: { ...PUBLIC.content, address: "Otra dirección" },
      places: { address: PARROQUIA },
    });

    assert.deepEqual(block?.features.places, undefined);
  });
});
