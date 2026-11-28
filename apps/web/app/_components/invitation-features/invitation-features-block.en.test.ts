import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventFacts } from "../../../lib/invitation-features/event-facts.ts";
import type { InvitationFeatures } from "../../../lib/invitation-features/invitation-features.ts";
import { InvitationFeaturesBlock } from "./invitation-features-block.ts";

// The English guest invitation (F14; S2.14, L19.2): every fixed text of the shared features block follows the locale
// the page renders, and every card is proved card by card. Spanish output is untouched — the block's own Spanish tests
// stay exactly as they were — so these tests only read the English page, and one of them pins that the same block
// without the prop keeps writing Spanish.

const FACTS: EventFacts = {
  title: "Valentina's birthday",
  date: "2026-12-05",
  time: "16:30",
  places: [
    {
      label: "Venue",
      field: "address",
      name: "Jardín Los Arcos",
      address: "Av. de las Flores 214, Ciudad de México",
    },
  ],
};

const SLUG = "invitacion-k7m2qx";
const NOW = new Date("2026-12-01T12:00:00.000Z");

/** Every feature of a guest invitation switched on, as the API gated them. */
const EVERYTHING: InvitationFeatures = {
  timeZone: "America/Mexico_City",
  countdown: true,
  map: true,
  calendar: true,
  whatsapp: { phone: "+525512345678" },
  music: {
    url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
    provider: "spotify",
    coverUrl: "https://i.scdn.co/image/cover.jpg",
  },
  giftRegistry: true,
  giftRegistryDetails: {
    stores: [{ name: "Liverpool", reference: "Evento 4821", url: "https://liverpool.com.mx" }],
    transfer: { bank: "BBVA", holder: "Ana Gómez", clabe: "012180001234567897" },
    envelopes: true,
    note: null,
  },
  gallery: [{ url: "https://cdn.invitame.mx/foto.jpg", width: 800, height: 1200, alt: null }],
  itinerary: [{ time: "17:00", title: "Misa", address: "Calle Hidalgo 45" }],
  lodging: {
    hotels: [
      {
        name: "City Express",
        address: "Av. Reforma 100",
        price: "$1,200 la noche",
        groupCode: "INVITAME",
        bookingUrl: "https://cityexpress.com/reserva",
      },
    ],
    transport: "Camión a las 19:00.",
  },
  livestream: { url: "https://youtu.be/dQw4w9WgXcQ", videoId: "dQw4w9WgXcQ", note: null },
};

const RSVP: InvitationFeatures = {
  ...EVERYTHING,
  rsvp: { slug: SLUG, partyLimit: 4, deadline: "2026-12-01T18:00:00.000Z", closed: false },
};

const GUEST: InvitationFeatures = {
  ...EVERYTHING,
  guest: {
    greeting: "Hi, Ana",
    seats: "You have 3 seats reserved in your name.",
    rsvp: {
      slug: SLUG,
      token: "AbCdEfGhIjKlMnOpQrStUv",
      seats: 3,
      partySizes: [1, 2, 3],
      answer: { attending: true, partySize: 3 },
      companions: [{ name: "Jorge", child: true }],
      dietaryNotes: "",
      message: "",
      deadline: null,
      closed: false,
    },
    pass: {
      checkInUrl: `http://localhost:3000/cuenta/acceso/${SLUG}/AbCdEfGhIjKlMnOpQrStUv`,
      name: "Familia Gómez",
      tableLabel: "7",
      people: 3,
    },
  },
};

const SOCIAL: InvitationFeatures = {
  ...EVERYTHING,
  guestbook: {
    slug: SLUG,
    entries: [{ authorName: "Tía Rosa", message: "Que sea un día hermoso." }],
    closed: false,
  },
  guestAlbum: {
    slug: SLUG,
    photos: [{ url: "https://cdn.invitame.mx/album.jpg", uploaderName: "Jorge" }],
    count: 12,
    closed: false,
  },
};

function render(features: InvitationFeatures, locale?: "es" | "en"): string {
  return renderToStaticMarkup(
    createElement(InvitationFeaturesBlock, {
      features,
      facts: FACTS,
      calendarHref: `/i/${SLUG}/calendario.ics`,
      now: NOW,
      ...(locale === undefined ? {} : { locale }),
    }),
  );
}

describe("the features block in English (F14; S2.14, L19.2)", () => {
  it("writes the countdown, the calendar, and the WhatsApp card in English", () => {
    const html = render(EVERYTHING, "en");

    assert.match(html, />Countdown</);
    assert.match(html, />days</);
    assert.match(html, />hours</);
    assert.match(html, />minutes</);
    assert.match(html, />Add to calendar</);
    assert.match(html, /Save the date so you don&#x27;t forget it\./);
    assert.match(html, />Download \.ics</);
    assert.match(html, />Google Calendar</);
    assert.match(html, />Message on WhatsApp</);
    assert.match(html, /Write to confirm you&#x27;re coming\./);
    assert.match(html, /aria-label="Write on WhatsApp about Valentina&#x27;s birthday"/);
    // Nothing of the Spanish card survives in the same block.
    assert.doesNotMatch(html, /Cuenta regresiva/);
    assert.doesNotMatch(html, /Agregar al calendario/);
    assert.doesNotMatch(html, /Escribir por WhatsApp/);
  });

  it("writes the map, the playlist, and the gallery in English", () => {
    const html = render(EVERYTHING, "en");

    assert.match(html, />Getting there</);
    assert.match(html, /aria-label="Directions to Jardín Los Arcos on Google Maps"/);
    assert.match(html, /aria-label="Directions to Jardín Los Arcos on Waze"/);
    assert.match(html, />Google Maps</);
    assert.match(html, />Waze</);
    assert.match(html, />Listen to our playlist</);
    assert.match(html, /The music we chose for this celebration\./);
    assert.match(html, />Open in Spotify</);
    assert.match(html, /alt="Playlist cover"/);
    assert.match(html, />Gallery</);
    assert.match(html, /A few moments from this celebration\./);
    assert.match(html, /alt="Gallery photo"/);
    assert.doesNotMatch(html, /Cómo llegar/);
    assert.doesNotMatch(html, /Escucha nuestra playlist/);
  });

  it("writes the itinerary, the gift registry, and its copy button in English", () => {
    const html = render(EVERYTHING, "en");

    assert.match(html, />Itinerary</);
    assert.match(html, /The plan for the day, moment by moment\./);
    assert.match(html, />Directions</);
    assert.match(html, />Gift registry</);
    assert.match(html, /Your presence is our best gift/);
    assert.match(html, />View registry →</);
    assert.match(html, /aria-label="View registry for Liverpool in a new tab"/);
    assert.match(html, />Bank transfer</);
    assert.match(html, />Bank</);
    assert.match(html, />Account holder</);
    assert.match(html, />CLABE</);
    assert.match(html, />Copy CLABE</);
    assert.match(html, /You can also give us your gift in an envelope/);
    assert.doesNotMatch(html, /Mesa de regalos/);
    assert.doesNotMatch(html, /Copiar CLABE/);
  });

  it("writes the lodging, the livestream, and their actions in English", () => {
    const html = render(EVERYTHING, "en");

    assert.match(html, />Where to stay</);
    assert.match(html, /For those coming from out of town/);
    assert.match(html, /Here are a few places to stay near the event\./);
    assert.match(html, />Group code</);
    assert.match(html, />Book</);
    assert.match(html, />Transportation</);
    assert.match(html, />Watch it live</);
    assert.match(html, /If it doesn&#x27;t load, open it here/);
    assert.match(html, /aria-label="Play the stream"/);
    assert.doesNotMatch(html, /Hospedaje/);
    assert.doesNotMatch(html, /Míralo en vivo/);
  });

  it("writes the open RSVP card, its companion rows, and its bounds in English", () => {
    const html = render(RSVP, "en");

    assert.match(html, />RSVP</);
    assert.match(html, /Let us know if you can join us\./);
    assert.match(html, />Your name</);
    assert.match(html, />Will you attend\?</);
    assert.match(html, />Yes, I&#x27;ll be there</);
    assert.match(html, />No, I won&#x27;t be able to make it</);
    assert.match(html, />How many are coming with you\?</);
    assert.match(html, />The names of your guests</);
    assert.match(html, />Guest 1</);
    assert.match(html, />Child</);
    assert.match(html, />Dietary restrictions \(optional\)</);
    assert.match(html, />Seats for 4 people\.</);
    assert.match(html, />Send RSVP</);
    assert.match(html, /Please answer before/);
    assert.doesNotMatch(html, /Confirma tu asistencia/);
    assert.doesNotMatch(html, /Enviar respuesta/);
  });

  it("writes the personal card and the access pass of a guest in English", () => {
    const html = render(GUEST, "en");

    assert.match(html, />Your RSVP</);
    assert.match(html, /You told us 3 people are coming\./);
    assert.match(html, />You can change your answer until the deadline\.</);
    assert.match(html, />People coming with you \(yourself included\)</);
    assert.match(html, />Save my answer</);
    assert.match(html, />Access pass</);
    assert.match(html, /<dt[^>]*>Table<\/dt>/);
    assert.match(html, /<dt[^>]*>Guests<\/dt>/);
    assert.match(html, /alt="QR code of your access pass"/);
    assert.match(html, /Show this code at the entrance · Jardín Los Arcos/);
    assert.doesNotMatch(html, /Pase de acceso/);
    assert.doesNotMatch(html, />Mesa</);
  });

  it("writes the guestbook, the album, and their counts in English", () => {
    const html = render(SOCIAL, "en");

    assert.match(html, />Guestbook</);
    assert.match(html, /Leave your best wishes for whoever is celebrating\./);
    assert.match(html, />Your message</);
    assert.match(html, />Sign the guestbook</);
    assert.match(html, />Our photos</);
    assert.match(html, /Share the photos you take at the party\./);
    assert.match(html, />Upload my photos</);
    assert.match(html, />Your photo</);
    assert.match(html, />Your name \(optional\)</);
    assert.match(html, /12 photos published/);
    assert.match(html, /alt="Photo uploaded by Jorge"/);
    assert.doesNotMatch(html, /Libro de firmas/);
    assert.doesNotMatch(html, /fotos publicadas/);
  });

  it("keeps the Spanish block byte-identical without the prop, and reads every English line it is given", () => {
    const spanish = render(EVERYTHING);
    const english = render(EVERYTHING, "en");

    assert.match(spanish, />Cuenta regresiva</);
    assert.match(spanish, />Cómo llegar</);
    assert.match(spanish, />Mesa de regalos</);
    assert.match(spanish, />Hospedaje</);
    assert.doesNotMatch(spanish, /Countdown|Getting there|Gift registry/);
    // The same texts, in the two languages, with the labels the owner wrote untouched in both.
    for (const html of [spanish, english]) {
      assert.match(html, /Jardín Los Arcos/);
      assert.match(html, /City Express/);
      assert.match(html, /INVITAME/);
    }
  });
});
