import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvitationFeaturesBlock } from "../../app/_components/invitation-features/invitation-features-block.ts";
import type { EventFacts } from "./event-facts.ts";
import { LIVESTREAM_IFRAME_SANDBOX, LIVESTREAM_IFRAME_TITLE } from "./livestream.ts";
import { OPENING_ANIMATION_DURATION_MS } from "./opening-animation.ts";
import type {
  GuestPassBlockView,
  InvitationFeatures,
  RsvpBlockView,
} from "./invitation-features.ts";

// The shared themed features block of the guest page (S3, S4): countdown, «Cómo llegar», «Agregar al
// calendario», and «Escribir por WhatsApp», each rendered only when the API says the invitation has it. It is
// a server component that draws with the theme's CSS variables, and the only client island is the countdown,
// which takes its first value from the server render.

const FEATURES_DIRECTORY = fileURLToPath(
  new URL("../../app/_components/invitation-features/", import.meta.url),
);

const ALL_OFF: InvitationFeatures = {
  timeZone: "America/Mexico_City",
  countdown: false,
  map: false,
  calendar: false,
  whatsapp: null,
  music: null,
  giftRegistry: false,
};

const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";

const FACTS: EventFacts = {
  title: "Cumpleaños de Mateo",
  date: "2026-12-05",
  time: "16:30",
  places: [
    {
      label: "Lugar",
      field: "address",
      name: "Jardín Los Arcos",
      address: "Av. de las Flores 214, Ciudad de México",
    },
  ],
};

const BAPTISM_FACTS: EventFacts = {
  title: "Bautizo de Emilia",
  date: "2027-04-11",
  time: "11:00",
  places: [
    {
      label: "Ceremonia",
      field: "ceremonyAddress",
      name: "Parroquia San Miguel",
      address: "Calle Hidalgo 45, Centro, Querétaro",
    },
    {
      label: "Recepción",
      field: "receptionAddress",
      name: "Casa de los abuelos",
      address: "Av. de los Fresnos 210, Querétaro",
    },
  ],
};

const CALENDAR_HREF = "/i/cumple-mateo/calendario.ics";
const SLUG_FOR_GUEST = "invitacion-k7m2qx";

/** The features of an invitation, with the ones a case does not name switched off. */
function featuresOf(overrides: Partial<InvitationFeatures> = {}): InvitationFeatures {
  return { ...ALL_OFF, ...overrides };
}

function render(features: InvitationFeatures, facts: EventFacts = FACTS, now?: Date): string {
  return renderToStaticMarkup(
    createElement(InvitationFeaturesBlock, {
      features,
      facts,
      calendarHref: CALENDAR_HREF,
      ...(now === undefined ? {} : { now }),
    }),
  );
}

/** Every `<a>` tag of a rendered block. */
function linksOf(html: string): string[] {
  return html.match(/<a[\s>][\s\S]*?<\/a>/g) ?? [];
}

function classesOf(tag: string): string[] {
  return (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

function attributeOf(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

describe("features block visibility", () => {
  it("renders nothing at all when the invitation has no feature", () => {
    assert.equal(render(ALL_OFF), "");
  });

  it("renders only the sections of the features the invitation has", () => {
    for (const feature of ["countdown", "map", "calendar", "whatsapp", "music"] as const) {
      const html = render(
        featuresOf(
          feature === "whatsapp"
            ? { whatsapp: { phone: "+525512345678" } }
            : feature === "music"
              ? { music: { url: PLAYLIST, provider: "spotify" } }
              : { [feature]: true },
        ),
      );

      assert.match(html, new RegExp(`data-feature="${feature}"`), feature);
      for (const other of ["countdown", "map", "calendar", "whatsapp", "music"]) {
        if (other !== feature) {
          assert.doesNotMatch(html, new RegExp(`data-feature="${other}"`), `${feature} only`);
        }
      }
    }
  });

  it("renders the gift registry nowhere: the layout owns that block (S7)", () => {
    assert.equal(render(featuresOf({ giftRegistry: true })), "");
    assert.doesNotMatch(render(featuresOf({ giftRegistry: true, calendar: true })), /regalo/i);
  });

  it("renders exactly the features the invitation has, for every combination of flags", () => {
    for (const countdown of [false, true]) {
      for (const map of [false, true]) {
        for (const calendar of [false, true]) {
          for (const whatsapp of [false, true]) {
            for (const music of [false, true]) {
              const features: InvitationFeatures = {
                timeZone: "America/Mexico_City",
                countdown,
                map,
                calendar,
                whatsapp: whatsapp ? { phone: "+525512345678" } : null,
                music: music ? { url: PLAYLIST, provider: "spotify" } : null,
                giftRegistry: false,
              };
              const expected = [
                ...(countdown ? ["countdown"] : []),
                ...(map ? ["map"] : []),
                ...(calendar ? ["calendar"] : []),
                ...(whatsapp ? ["whatsapp"] : []),
                ...(music ? ["music"] : []),
              ];
              const html = render(features);

              if (expected.length === 0) {
                assert.equal(html, "");
                continue;
              }
              assert.deepEqual(
                [...html.matchAll(/data-feature="([^"]+)"/g)].map((match) => match[1]),
                expected,
                JSON.stringify(features),
              );
            }
          }
        }
      }
    }
  });

  it("is one themed section of the invitation", () => {
    const html = render(featuresOf({ calendar: true }));

    assert.match(html, /<section[^>]*data-section="features"/);
    assert.match(html, /<h2[^>]*id="[^"]*"[^>]*>Todo lo que necesitas<\/h2>/);
    assert.match(html, /<section[^>]*aria-labelledby="[^"]*"/);
  });
});

describe("countdown in the features block", () => {
  it("renders the days, hours, and minutes the server computed", () => {
    const html = render(featuresOf({ countdown: true }), FACTS, new Date("2026-12-01T18:00:00Z"));

    assert.match(html, /data-countdown="upcoming"/);
    assert.match(html, /role="group"[^>]*aria-label="Faltan 4 días, 4 horas y 30 minutos"/);
    assert.match(html, /data-countdown-part="days"[^>]*>[\s\S]*?>4</);
    assert.match(html, /data-countdown-part="hours"[^>]*>[\s\S]*?>4</);
    assert.match(html, /data-countdown-part="minutes"[^>]*>[\s\S]*?>30</);
    assert.match(html, />días</);
    assert.match(html, />horas</);
    assert.match(html, />minutos</);
  });

  it("says the celebration is today once it is the same day in its zone", () => {
    const html = render(featuresOf({ countdown: true }), FACTS, new Date("2026-12-05T16:00:00Z"));

    assert.match(html, /data-countdown="today"/);
    assert.match(html, />¡Hoy es el día!</);
    assert.match(html, /aria-label="Faltan 6 horas y 30 minutos"/);
    assert.doesNotMatch(html, /data-countdown-part="days"/);
  });

  it("says «¡Es hoy!» while the celebration is happening", () => {
    const html = render(featuresOf({ countdown: true }), FACTS, new Date("2026-12-05T23:00:00Z"));

    assert.match(html, /data-countdown="live"/);
    assert.match(html, />¡Es hoy!</);
    assert.doesNotMatch(html, /data-countdown-part=/);
    assert.doesNotMatch(html, /ya pasó/);
  });

  it("says the celebration has passed instead of counting to a past start", () => {
    const html = render(featuresOf({ countdown: true }), FACTS, new Date("2026-12-06T18:00:00Z"));

    assert.match(html, /data-countdown="passed"/);
    assert.match(html, />La celebración ya pasó</);
    assert.doesNotMatch(html, /data-countdown-part=/);
    assert.doesNotMatch(html, /Faltan/);
  });

  it("carries the target instant to the island as a serializable value", () => {
    const html = render(featuresOf({ countdown: true }), FACTS, new Date("2026-12-01T18:00:00Z"));

    assert.match(html, /data-countdown-target="2026-12-05T22:30:00.000Z"/);
    assert.match(html, /data-countdown-zone="America\/Mexico_City"/);
  });
});

describe("«Cómo llegar» in the features block", () => {
  it("offers Google Maps and Waze for the one place of a birthday", () => {
    const html = render(featuresOf({ map: true }));
    const links = linksOf(html);

    assert.match(html, /data-place="Lugar"/);
    assert.equal(links.length, 2);
    assert.match(
      links[0] ?? "",
      /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=/,
    );
    assert.match(links[1] ?? "", /href="https:\/\/www\.waze\.com\/ul\?q=/);
    assert.match(links[0] ?? "", /aria-label="Cómo llegar a Jardín Los Arcos en Google Maps"/);
    assert.match(links[1] ?? "", /aria-label="Cómo llegar a Jardín Los Arcos en Waze"/);
  });

  it("offers a pair of links for each place of a baptism", () => {
    const html = render(featuresOf({ map: true }), BAPTISM_FACTS);
    const places = [...html.matchAll(/data-place="([^"]+)"/g)].map((match) => match[1]);

    assert.deepEqual(places, ["Ceremonia", "Recepción"]);
    assert.equal(linksOf(html).length, 4);
    assert.match(
      linksOf(html)[2] ?? "",
      /aria-label="Cómo llegar a Casa de los abuelos en Google Maps"/,
    );
  });

  it("opens every map in a new tab without leaking the opener", () => {
    for (const link of linksOf(render(featuresOf({ map: true }), BAPTISM_FACTS))) {
      assert.equal(attributeOf(link, "target"), "_blank");
      assert.equal(attributeOf(link, "rel"), "noopener noreferrer");
    }
  });
});

describe("«Agregar al calendario» in the features block", () => {
  it("links to Google Calendar and to the download the caller owns", () => {
    const links = linksOf(render(featuresOf({ calendar: true })));

    assert.equal(links.length, 2);
    assert.match(
      links[0] ?? "",
      /href="https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&amp;text=/,
    );
    assert.equal(attributeOf(links[0] ?? "", "target"), "_blank");
    assert.equal(attributeOf(links[0] ?? "", "rel"), "noopener noreferrer");
    assert.equal(attributeOf(links[1] ?? "", "href"), CALENDAR_HREF);
    assert.match(links[1] ?? "", />Descargar \.ics</);
    assert.equal(attributeOf(links[1] ?? "", "target"), undefined);
  });

  it("carries the celebration and its four-hour start to Google Calendar", () => {
    const html = render(featuresOf({ calendar: true }));
    const href = attributeOf(linksOf(html)[0] ?? "", "href") ?? "";
    const query = new URL(href.replaceAll("&amp;", "&")).searchParams;

    assert.equal(query.get("text"), "Cumpleaños de Mateo");
    assert.equal(query.get("dates"), "20261205T223000Z/20261206T023000Z");
    assert.equal(
      query.get("location"),
      "Jardín Los Arcos, Av. de las Flores 214, Ciudad de México",
    );
  });

  it("omits the download when the caller does not pass one", () => {
    const html = renderToStaticMarkup(
      createElement(InvitationFeaturesBlock, {
        features: featuresOf({ calendar: true }),
        facts: FACTS,
      }),
    );

    assert.equal(linksOf(html).length, 1);
    assert.doesNotMatch(html, /Descargar \.ics/);
  });
});

describe("«Escribir por WhatsApp» in the features block", () => {
  it("opens a chat with a greeting that names the celebration", () => {
    const links = linksOf(render(featuresOf({ whatsapp: { phone: "+525512345678" } })));

    assert.equal(links.length, 1);
    const href = (attributeOf(links[0] ?? "", "href") ?? "").replaceAll("&amp;", "&");

    assert.match(href, /^https:\/\/wa\.me\/525512345678\?text=/);
    assert.equal(
      new URL(href).searchParams.get("text"),
      "¡Hola! Te escribo por la invitación de Cumpleaños de Mateo.",
    );
    assert.match(links[0] ?? "", />Escribir por WhatsApp</);
    assert.match(links[0] ?? "", /aria-label="Escribir por WhatsApp sobre Cumpleaños de Mateo"/);
    assert.equal(attributeOf(links[0] ?? "", "target"), "_blank");
    assert.equal(attributeOf(links[0] ?? "", "rel"), "noopener noreferrer");
  });

  it("offers no WhatsApp button when the invitation stores no phone", () => {
    assert.doesNotMatch(render(featuresOf({ countdown: true })), /WhatsApp/);
  });
});

describe("«Escucha nuestra playlist» in the features block (F6; S7)", () => {
  const MUSIC = { url: PLAYLIST, provider: "spotify" } as const;

  it("offers one external button that names the service", () => {
    const html = render(featuresOf({ music: MUSIC }));

    assert.match(html, /data-feature="music"/);
    assert.match(html, />Escucha nuestra playlist</);
    const links = linksOf(html);

    assert.equal(links.length, 1);
    assert.match(links[0] ?? "", />Abrir en Spotify</);
    assert.equal(attributeOf(links[0] ?? "", "href"), PLAYLIST);
    assert.equal(attributeOf(links[0] ?? "", "target"), "_blank");
    assert.equal(attributeOf(links[0] ?? "", "rel"), "noopener noreferrer");
  });

  it("names each allow-listed service in its own button", () => {
    const expected: Array<[string, string]> = [
      ["spotify", "Abrir en Spotify"],
      ["apple_music", "Abrir en Apple Music"],
      ["youtube", "Abrir en YouTube"],
      ["deezer", "Abrir en Deezer"],
      ["soundcloud", "Abrir en SoundCloud"],
    ];

    for (const [provider, label] of expected) {
      const html = render(
        featuresOf({ music: { url: PLAYLIST, provider: provider as "spotify" } }),
      );

      assert.match(html, new RegExp(`>${label}<`), provider);
    }
  });

  it("embeds no player and loads no third-party script", () => {
    const html = render(featuresOf({ music: MUSIC, map: true, calendar: true }));

    assert.doesNotMatch(html, /<iframe/i);
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /spotify\.com\/embed|w\.soundcloud\.com|youtube\.com\/embed/);
  });

  it("renders no playlist section when the invitation has no link", () => {
    assert.doesNotMatch(render(featuresOf({ calendar: true })), /playlist/i);
  });

  // The card the provider's metadata makes (S2): a lazily loaded cover from the allow-listed CDN, the title it
  // named, and the same button. Without metadata the card is exactly today's card.
  const COVER = "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07";

  it("shows the cover and the title the provider answered, with the same open button", () => {
    // React reports a misspelled DOM property (such as a lower-case `referrerpolicy`) through console.error.
    const errors: unknown[][] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    let html: string;
    try {
      html = render(
        featuresOf({ music: { ...MUSIC, title: "Today’s Top Hits", coverUrl: COVER } }),
      );
    } finally {
      console.error = consoleError;
    }
    assert.deepEqual(errors, []);
    const [image] = html.match(/<img[^>]*>/) ?? [];

    assert.ok(image !== undefined, html);
    assert.equal(attributeOf(image, "src"), COVER);
    // The layout reserves the image's space and defers it, so a cover never delays the page.
    assert.equal(attributeOf(image, "width"), "300");
    assert.equal(attributeOf(image, "height"), "300");
    assert.equal(attributeOf(image, "loading"), "lazy");
    assert.equal(attributeOf(image, "alt"), "Today’s Top Hits");
    // No referrer and no cookie leave the page for the CDN.
    assert.match(image, /referrerpolicy="no-referrer"/i);
    assert.match(html, />Today’s Top Hits</);

    const links = linksOf(html);
    assert.equal(links.length, 1);
    assert.match(links[0] ?? "", />Abrir en Spotify</);
    assert.equal(attributeOf(links[0] ?? "", "href"), PLAYLIST);
    // Still no player and no script: the cover is an image, not an embed.
    assert.doesNotMatch(html, /<iframe|<script/i);
  });

  it("uses the generic alt text when the provider named no title", () => {
    const html = render(featuresOf({ music: { ...MUSIC, coverUrl: COVER } }));
    const [image] = html.match(/<img[^>]*>/) ?? [];

    assert.ok(image !== undefined, html);
    assert.equal(attributeOf(image, "alt"), "Portada de la playlist");
    assert.doesNotMatch(html, /portada de la playlist</i);
  });

  it("renders today's card, with no image, when the link has no metadata", () => {
    const html = render(featuresOf({ music: MUSIC }));

    assert.match(html, /data-feature="music"/);
    assert.doesNotMatch(html, /<img/i);
    assert.match(html, />Abrir en Spotify</);
    assert.match(html, />Escucha nuestra playlist</);
  });

  it("escapes a provider title so it cannot add markup", () => {
    const html = render(
      featuresOf({ music: { ...MUSIC, title: '<img src=x onerror="alert(1)">' } }),
    );

    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  });
});

describe("«Itinerario» in the features block (F1; L3.5)", () => {
  const MOMENTS = [
    {
      time: "17:00",
      title: "Misa",
      place: "Parroquia de San Juan",
      address: "Av. Juárez 45, Centro",
    },
    { time: "18:30", title: "Sesión de fotos", place: "Jardín de la parroquia" },
    { time: "19:30", title: "Recepción y cóctel", address: "Salón Jardín Las Rosas" },
  ] as const;

  const itineraryOnly = (moments: readonly (typeof MOMENTS)[number][] = MOMENTS) =>
    render(featuresOf({ itinerary: moments }));

  it("draws the moments in the owner's order, with their time, title, and place", () => {
    const html = itineraryOnly();

    assert.match(html, /data-feature="itinerary"/);
    assert.deepEqual(
      [...html.matchAll(/<time[^>]*>([^<]+)<\/time>/g)].map((match) => match[1]),
      ["17:00", "18:30", "19:30"],
    );
    for (const moment of MOMENTS) {
      assert.match(html, new RegExp(moment.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(html, /Parroquia de San Juan/);
    assert.match(html, /Jardín de la parroquia/);
    assert.match(html, /Itinerario/);
  });

  it("marks only the first moment, so the timeline reads as a start", () => {
    const html = itineraryOnly();
    const moments = html.match(/<li[\s>][\s\S]*?<\/li>/g) ?? [];

    assert.equal(moments.length, MOMENTS.length);
    assert.match(moments[0] ?? "", /Primer momento/);
    for (const other of moments.slice(1)) {
      assert.doesNotMatch(other, /Primer momento/);
    }
  });

  it("offers «Cómo llegar» only for a moment with an address, as a Google Maps search", () => {
    const html = itineraryOnly();
    const links = linksOf(html);
    const directions = links.filter((link) => link.includes("Cómo llegar a "));

    // Two of the three moments carry an address, so exactly two links lead to the map.
    assert.equal(directions.length, 2);
    // React escapes the `&` of the query string, which is what a browser reads as the same URL.
    assert.equal(
      attributeOf(directions[0] as string, "href"),
      `https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent("Av. Juárez 45, Centro")}`,
    );
    assert.equal(
      attributeOf(directions[1] as string, "href"),
      `https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent("Salón Jardín Las Rosas")}`,
    );
    assert.equal(
      attributeOf(directions[0] as string, "aria-label"),
      "Cómo llegar a Misa en Google Maps",
    );
    // A moment without an address asks for nothing: the title is not a destination anyone can navigate to.
    assert.equal(
      directions.some((link) => link.includes("Sesión de fotos")),
      false,
    );
  });

  it("opens every directions link in a new tab without leaking the opener", () => {
    for (const link of linksOf(itineraryOnly())) {
      assert.equal(attributeOf(link, "target"), "_blank");
      assert.equal(attributeOf(link, "rel"), "noopener noreferrer");
    }
  });

  it("renders no timeline when the invitation has no moment", () => {
    assert.equal(render(featuresOf({ itinerary: [] })), "");
    assert.doesNotMatch(render(featuresOf({ countdown: true })), /data-feature="itinerary"/);
  });

  it("escapes the moment texts so they cannot add markup", () => {
    const html = render(
      featuresOf({
        itinerary: [{ time: "17:00", title: "<img src=x onerror=alert(1)>" }],
      }),
    );

    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });
});

describe("«Hospedaje y transporte» in the features block (F4; L7.5)", () => {
  const HOTELS = [
    {
      name: "Hotel Misión",
      distance: "A 5 min",
      price: "Desde $1,450 por noche",
      groupCode: "BODA-AYL",
      bookingUrl: "https://hotelmision.example.com/reserva",
      address: "Av. Juárez 120, Centro",
    },
  ] as const;

  const lodgingOnly = (overrides: Partial<InvitationFeatures> = {}) =>
    render(
      featuresOf({
        lodging: {
          hotels: HOTELS,
          transport: "Habrá camión del hotel Misión al salón a las 19:00.",
        },
        ...overrides,
      }),
    );

  it("draws one card per hotel with its name, distance badge, address, and price", () => {
    const html = lodgingOnly();

    assert.match(html, /data-feature="lodging"/);
    assert.match(html, /Hotel Misión/);
    assert.match(html, /A 5 min/);
    assert.match(html, /Av\. Juárez 120, Centro/);
    assert.match(html, /Desde \$1,450 por noche/);
    assert.match(html, /Hospedaje/);
  });

  it("shows the group code as its own row, in the owner's words", () => {
    const html = lodgingOnly();

    assert.match(html, /data-hotel-group-code="BODA-AYL"/);
    assert.match(html, /Código de grupo/);
  });

  it("offers «Reservar» and «Cómo llegar» as new tabs that never leak the opener", () => {
    const links = linksOf(lodgingOnly());
    const booking = links.find((link) => link.includes("Reservar"));
    const directions = links.find((link) => link.includes("Cómo llegar"));

    assert.ok(booking, "a booking link");
    assert.equal(attributeOf(booking, "href"), "https://hotelmision.example.com/reserva");
    assert.ok(directions, "a directions link");
    assert.equal(
      attributeOf(directions, "href"),
      `https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent("Av. Juárez 120, Centro")}`,
    );
    for (const link of links) {
      assert.equal(attributeOf(link, "target"), "_blank");
      assert.equal(attributeOf(link, "rel"), "noopener noreferrer");
    }
  });

  it("offers no action for a hotel that carries neither link", () => {
    const html = render(
      featuresOf({ lodging: { hotels: [{ name: "City Express" }], transport: null } }),
    );

    assert.match(html, /City Express/);
    assert.equal(linksOf(html).length, 0);
  });

  it("draws the transport card after the hotels, and no card without it", () => {
    const html = lodgingOnly();

    assert.match(html, /data-feature="lodging-transport"/);
    assert.match(html, /Transporte/);
    assert.match(html, /Habrá camión del hotel Misión al salón a las 19:00\./);
    // A transport line alone still renders the section, with no hotel card (F4; L7.1).
    const transportOnly = render(
      featuresOf({ lodging: { hotels: [], transport: "Camión a las 19:00." } }),
    );

    assert.match(transportOnly, /data-feature="lodging"/);
    assert.equal(/data-hotel=/.test(transportOnly), false);
    assert.doesNotMatch(
      render(featuresOf({ lodging: { hotels: [], transport: null } })),
      /data-feature="lodging"/,
    );
  });

  it("escapes every owner text so it cannot add markup", () => {
    const html = render(
      featuresOf({
        lodging: {
          hotels: [{ name: "<img src=x onerror=alert(1)>", price: "<script>alert(2)</script>" }],
          transport: "<b>llevamos camión</b>",
        },
      }),
    );

    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<script/);
    assert.doesNotMatch(html, /<b>llevamos/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });
});

describe("«Míralo en vivo» in the features block (F9; L12.3, L12.4, L12.5)", () => {
  const LIVE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const NOTE = "Inicia a las 17:00 h";

  const livestreamOnly = (note: string | null = NOTE) =>
    render(
      featuresOf({
        livestream: { url: LIVE_URL, videoId: "dQw4w9WgXcQ", note },
      }),
    );

  it("draws the section with its heading, the note, and the fallback link", () => {
    const html = livestreamOnly();

    assert.match(html, /data-feature="livestream"/);
    assert.match(html, />Míralo en vivo</);
    assert.match(html, /Inicia a las 17:00 h/);
    assert.match(html, />Si no carga, ábrela aquí</);
  });

  it("offers the facade as a real link to the stream, so a guest without script still opens it", () => {
    const html = livestreamOnly();
    const facade = linksOf(html).find((link) => link.includes("▶"));

    assert.ok(facade !== undefined, html);
    assert.equal(attributeOf(facade, "href"), LIVE_URL);
    assert.equal(attributeOf(facade, "target"), "_blank");
    assert.equal(attributeOf(facade, "rel"), "noopener noreferrer");
    assert.equal(attributeOf(facade, "aria-label"), "Reproducir la transmisión");
    // The mark is decoration: the link's accessible name is the label above, never the glyph.
    assert.match(facade, /<span aria-hidden="true"/);
  });

  it("frames nothing before the tap: no iframe and no request to the provider", () => {
    const html = livestreamOnly();

    assert.doesNotMatch(html, /<iframe/i);
    assert.doesNotMatch(html, /youtube-nocookie\.com\/embed/);
    assert.doesNotMatch(html, /<script/i);
    // The only addresses on the page are the stream itself and its fallback, both opened as a link.
    for (const link of linksOf(html)) {
      assert.equal(attributeOf(link, "href"), LIVE_URL);
      assert.equal(attributeOf(link, "target"), "_blank");
      assert.equal(attributeOf(link, "rel"), "noopener noreferrer");
    }
  });

  it("shows only the action that opens a link this deployment does not embed", () => {
    const url = "https://us02web.zoom.us/j/123456789";
    const html = render(featuresOf({ livestream: { url, videoId: null, note: NOTE } }));
    const links = linksOf(html);

    assert.match(html, /data-feature="livestream"/);
    assert.equal(links.length, 1);
    assert.match(links[0] ?? "", />Abrir la transmisión</);
    assert.equal(attributeOf(links[0] ?? "", "href"), url);
    assert.equal(attributeOf(links[0] ?? "", "target"), "_blank");
    assert.equal(attributeOf(links[0] ?? "", "rel"), "noopener noreferrer");
    assert.match(html, /Inicia a las 17:00 h/);
    assert.doesNotMatch(html, /▶/);
    assert.doesNotMatch(html, /Si no carga/);
    assert.doesNotMatch(html, /<iframe/i);
  });

  it("draws nothing for a livestream without a link", () => {
    assert.doesNotMatch(
      render(featuresOf({ livestream: { url: "", videoId: null, note: NOTE } })),
      /data-feature="livestream"/,
    );
  });

  it("frames the provider only after the tap, with the sandbox and the title playback needs (L12.4)", () => {
    const island = featuresSources().find(({ file }) =>
      file.endsWith("livestream-player-island.ts"),
    );

    assert.ok(island !== undefined, "the island source is readable");
    // The frame is the last thing the island renders, and only once the guest tapped the facade.
    assert.match(island.source, /setLoaded\(true\)/);
    assert.match(island.source, /loaded\n?\s*\?/);
    assert.match(island.source, /src: embedUrl/);
    assert.match(island.source, /title: LIVESTREAM_IFRAME_TITLE/);
    assert.match(island.source, /sandbox: LIVESTREAM_IFRAME_SANDBOX/);
    assert.equal(LIVESTREAM_IFRAME_SANDBOX, "allow-scripts allow-same-origin allow-presentation");
    assert.equal(LIVESTREAM_IFRAME_TITLE, "Transmisión en vivo");
    // Nothing is prefetched or preconnected: the provider learns nothing before the tap.
    assert.doesNotMatch(island.source, /prefetch|preconnect|preload/);
  });

  it("escapes the owner's note so it cannot add markup", () => {
    const html = livestreamOnly("<img src=x onerror=alert(1)>");

    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });
});

describe("the envelope of the opening animation (F10; L14.2, L14.5)", () => {
  /** The island source, which is the only place the envelope's layers and their moves live. */
  function islandSource(): string {
    const island = featuresSources().find(({ file }) =>
      file.endsWith("opening-animation-island.ts"),
    );

    assert.ok(island !== undefined, "the island source is readable");
    return island.source;
  }

  /** The opening animation's keyframes, which are global because they are shared by the envelope's layers. */
  function openingKeyframes(): string {
    return readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
  }

  /** One millisecond timing of an animation the island starts, as `duration + delay`. */
  function animationEnd(source: string, name: string): number {
    const timing = new RegExp(`inv-opening-${name} (\\d+)ms .+? (\\d+)ms`).exec(source);

    assert.ok(timing !== null, `${name} has a timing`);
    return Number(timing[1]) + Number(timing[2]);
  }

  it("centers the envelope on both axes of the viewport", () => {
    const island = islandSource();
    const stage = /const STAGE = "([^"]+)"/.exec(island)?.[1] ?? "";

    assert.ok(stage.includes("items-center"), "the stage centers the envelope vertically");
    assert.ok(stage.includes("justify-center"), "the stage centers the envelope horizontally");
    // Nothing pins the body to the bottom edge, which is what left it under the vertical center before.
    assert.doesNotMatch(island, /bottom-1\/4|inset-x-4 bottom/);
  });

  it("hinges the flap on the envelope's top edge, facing away, so it opens upward", () => {
    const island = islandSource();
    const css = openingKeyframes();

    assert.match(island, /transformOrigin: "top center"/);
    assert.match(island, /backfaceVisibility: "hidden"/);
    assert.match(
      css,
      /@keyframes inv-opening-flap-open \{\s*from \{\s*transform: rotateX\(0deg\);\s*\}\s*to \{\s*transform: rotateX\(-180deg\);/,
    );
  });

  it("paints the layers in order: back, flap, card, front pocket, seal", () => {
    const island = islandSource();
    const order = ["back", "flap", "card", "front", "seal"].map((part) => {
      const index = island.indexOf(`"data-opening-animation-part": "${part}"`);

      assert.notEqual(index, -1, `${part} is drawn`);
      return index;
    });

    assert.deepEqual(
      [...order].sort((left, right) => left - right),
      order,
    );
  });

  it("starts the card below the mouth, so the closed flap hides it and it rises from inside", () => {
    const island = islandSource();
    const mouth = /const FRONT_MOUTH = "polygon\(0 0, 50% (\d+)%, 100% 0/.exec(island)?.[1] ?? "";
    const cardTop =
      /top: "(\d+)%",\s*bottom: "[^"]+",\s*borderRadius: "12px"/.exec(island)?.[1] ?? "";

    assert.ok(Number(cardTop) > Number(mouth), `card top ${cardTop}% below mouth ${mouth}%`);
    assert.match(
      openingKeyframes(),
      /@keyframes inv-opening-card-rise \{\s*from \{\s*transform: translateY\(0\);\s*\}/,
    );
  });

  it("fades the seal out and only then opens the flap, so the seal never travels with it", () => {
    const island = islandSource();
    const css = openingKeyframes();

    assert.match(
      css,
      /@keyframes inv-opening-seal-fade \{\s*from \{\s*opacity: 1;\s*\}\s*to \{\s*opacity: 0;/,
    );
    assert.ok(animationEnd(island, "seal-fade") <= animationEnd(island, "flap-open"));
    assert.ok(animationEnd(island, "flap-open") <= animationEnd(island, "card-rise"));
    assert.ok(animationEnd(island, "card-rise") <= animationEnd(island, "envelope-drop"));
    assert.ok(animationEnd(island, "envelope-drop") <= OPENING_ANIMATION_DURATION_MS);
  });

  it("drops the back, the flap and the front pocket on one shared animation, leaving no body behind", () => {
    const island = islandSource();

    assert.match(island, /const ENVELOPE_DROP = "inv-opening-envelope-drop [^"]+";/);
    assert.equal(island.match(/animation: ENVELOPE_DROP/g)?.length, 3);
  });

  it("draws every part with the theme's variables and nothing else", () => {
    const island = islandSource();
    const withoutComments = island.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    assert.doesNotMatch(withoutComments, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(withoutComments, /\b(?:rgb|rgba|hsl|hsla)\(/);
    assert.match(island, /const FLAP = `var\(\$\{THEME_VARIABLES\.decorationTwo\}\)`/);
  });
});

describe("features block rendering rules", () => {
  const ALL_ON = featuresOf({
    countdown: true,
    map: true,
    calendar: true,
    whatsapp: { phone: "+525512345678" },
    music: { url: PLAYLIST, provider: "youtube" },
    itinerary: [
      { time: "17:00", title: "Misa", place: "Parroquia de San Juan", address: "Av. Juárez 45" },
    ],
  });

  it("escapes the content it renders so it cannot add markup", () => {
    const html = render(featuresOf({ map: true, whatsapp: { phone: "+525512345678" } }), {
      title: "<script>alert(1)</script>",
      date: "2026-12-05",
      time: "16:30",
      places: [
        {
          label: '"><img src=x onerror=alert(1)>',
          field: "address",
          name: "<script>alert(2)</script>",
          address: "</p><script>alert(3)</script>",
        },
      ],
    });

    assert.doesNotMatch(html, /<script/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
    assert.match(html, /&lt;\/p&gt;&lt;script&gt;/);
  });

  it("ships no inline event handler", () => {
    const html = render(ALL_ON, BAPTISM_FACTS, new Date("2026-12-01T18:00:00Z"));

    assert.doesNotMatch(html, /\son[a-z]+=/);
  });

  it("draws every color from the theme tokens and sets no color literal", () => {
    const html = render(ALL_ON, BAPTISM_FACTS, new Date("2026-12-01T18:00:00Z"));

    assert.match(html, /bg-\(--inv-accent\)/);
    assert.match(html, /text-\(color:--inv-on-accent\)/);
    assert.match(html, /bg-\(--inv-surface\)/);
    assert.match(html, /bg-\(--inv-soft\)/);
    assert.match(html, /text-\(color:--inv-ink\)/);
    assert.match(html, /font-family:var\(--inv-display\)/);
    assert.doesNotMatch(html, /style="[^"]*#[0-9a-fA-F]{3,6}/);
    assert.doesNotMatch(html, /class="[^"]*\b(?:text|bg|border)-(?:white|black|gray|slate)\b/);
  });

  it("keeps every target at least 44 px tall and wide", () => {
    for (const link of linksOf(render(ALL_ON, BAPTISM_FACTS))) {
      const classes = classesOf(link);

      assert.ok(classes.includes("min-h-11"), `min-h-11 on ${link}`);
      assert.ok(classes.includes("min-w-11"), `min-w-11 on ${link}`);
    }
  });

  it("renders the features block from source files with no default-palette utility", () => {
    const DEFAULT_PALETTE_UTILITY =
      /(?:^|[\s"'`])(?:text|bg|border|ring|fill|stroke|outline|from|via|to|shadow|decoration|caret|accent|placeholder|divide|divide-x|divide-y)-(?:white|black|transparent|current|inherit|slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{1,3})?(?=[\s"'`]|$)/;

    const offenders = featuresSources().flatMap(({ file, source }) => {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

      return [...code.matchAll(new RegExp(DEFAULT_PALETTE_UTILITY.source, "g"))].map(
        (match) => `${file}: ${match[0].trim()}`,
      );
    });

    assert.deepEqual(offenders, []);
  });

  it("ticks the countdown every 30 to 60 seconds and never animates it", () => {
    const island = featuresSources().find(({ file }) => file.endsWith("countdown-island.ts"));

    assert.ok(island, "the island source is readable");
    const tick = /const TICK_MS = ([\d_]+);/.exec(island.source)?.[1] ?? "";
    const interval = Number(tick.replaceAll("_", ""));

    assert.ok(interval >= 30_000 && interval <= 60_000, `tick every ${interval} ms`);
    assert.match(island.source, /setInterval\(tick, TICK_MS\)/);
    assert.match(island.source, /setParts\(countdownParts\(target, new Date\(\), timeZone\)\)/);
    assert.doesNotMatch(island.source, /\banimate-|\btransition-|animation:/);
  });

  it("keeps the invitation's client components to the six deliberate islands", () => {
    const clientComponents = [...featuresSources(), ...rendererSources()].filter(({ source }) =>
      /^\s*["']use client["'];?/m.test(source),
    );

    assert.deepEqual(
      clientComponents.map(({ file }) => file.replace(/^.*\/_components\//, "_components/")),
      [
        // The companion rows of the RSVP form are the fourth island (F3; L6.3): they only show and hide the rows the
        // server already rendered, so the form works without any script.
        "_components/invitation-features/companion-rows-island.ts",
        // The CLABE copy button is one more deliberate island (F2; L4.5): the clipboard only exists in the browser, and
        // its fallback selects the text the server already rendered.
        "_components/invitation-features/copy-clabe-island.ts",
        "_components/invitation-features/countdown-island.ts",
        // The livestream player is the fifth deliberate island (F9; L12.4): it inserts the frame only after the guest
        // taps the facade, which is a real link to the stream when no script runs.
        "_components/invitation-features/livestream-player-island.ts",
        // The opening animation is the sixth deliberate island (F10; L14.2): it draws nothing on the server, decides once
        // in the browser, and covers the invitation for about three seconds or not at all.
        "_components/invitation-features/opening-animation-island.ts",
        // The map is the second deliberate island (S1, S2): it loads only when a guest scrolls it into view.
        "_components/invitation-features/place-map-island.ts",
      ],
    );
  });
});

/** Every source file of the features block and its island. */
function featuresSources(): Array<{ file: string; source: string }> {
  return readdirSync(FEATURES_DIRECTORY, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

/** Every source file of the five renderers and their theme modules. */
function rendererSources(): Array<{ file: string; source: string }> {
  return readdirSync(fileURLToPath(new URL("../../app/_components/renderers/", import.meta.url)), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

describe("«Confirma tu asistencia» in the features block (M6 G3; S4)", () => {
  /** One open RSVP block, as the guest page builds it; a test that ignores the action leaves it out. */
  const RSVP: RsvpBlockView = {
    slug: "invitacion-k7m2qx",
    partyLimit: 4,
    deadline: "2026-12-01T18:00:00.000Z",
    closed: false,
  };

  function rsvpFeatures(overrides: Partial<RsvpBlockView> = {}): InvitationFeatures {
    return featuresOf({ rsvp: { ...RSVP, ...overrides } });
  }

  /**
   * One attribute of a static tag. React 19 keeps the camelCase spelling of a few attributes (`maxLength`,
   * `autoComplete`) in static markup, and HTML attribute names are case-insensitive, so the reader is too.
   */
  function attributeAnyCase(tag: string, name: string): string | undefined {
    return new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1];
  }

  /** The controls of one rendered form, by name. */
  function controlTags(html: string): string[] {
    return html.match(/<(?:input|select|textarea)\b[^>]*>/g) ?? [];
  }

  it("offers the form in its own themed card, and renders the block for an RSVP-only invitation", () => {
    const html = render(rsvpFeatures());

    assert.match(html, /<section[^>]*data-section="features"/);
    assert.match(html, /data-feature="rsvp"/);
    assert.match(html, /<h3[^>]*>Confirma tu asistencia<\/h3>/);
    assert.match(html, /<form[^>]*data-rsvp-form/);
    assert.match(html, /<input[^>]*type="hidden"[^>]*name="slug"[^>]*value="invitacion-k7m2qx"/);
    // An invitation whose only gated feature is the RSVP still shows the block: it is not an empty render.
    assert.notEqual(render(featuresOf({ rsvp: RSVP })), "");
  });

  it("renders nothing at all when the invitation has no RSVP and no other feature", () => {
    assert.equal(render(ALL_OFF), "");
    assert.doesNotMatch(render(featuresOf({ countdown: true })), /data-feature="rsvp"/);
  });

  it("asks the name, the answer, the party size, and the two optional fields", () => {
    const html = render(rsvpFeatures());

    for (const text of [
      "Tu nombre",
      "¿Asistirás?",
      "Sí, asistiré",
      "No podré asistir",
      "¿Cuántos van contigo?",
      "Lugares para 4 personas.",
      "Nombres de tus acompañantes",
      "Acompañante 1",
      "Niño",
      "Restricciones alimentarias (opcional)",
      "Teléfono (opcional)",
      "Mensaje (opcional)",
      "Enviar respuesta",
    ]) {
      assert.ok(html.includes(text), text);
    }
    // The party limit of this card is 4, so the answer may name three companions (F3; L6.3).
    const names = controlTags(html).map((tag) => attributeOf(tag, "name"));
    assert.deepEqual(names, [
      "slug",
      "honeypot",
      "name",
      "attending",
      "attending",
      "partySize",
      "companionName-1",
      "companionChild-1",
      "companionName-2",
      "companionChild-2",
      "companionName-3",
      "companionChild-3",
      "dietaryNotes",
      "phone",
      "message",
    ]);
    assert.equal(attributeOf(controlTags(html)[3] ?? "", "value"), "si");
    assert.equal(attributeOf(controlTags(html)[4] ?? "", "value"), "no");
    assert.equal(attributeAnyCase(controlTags(html)[14] ?? "", "maxlength"), "280");
  });

  it("offers the party size from 1 to the invitation's own limit", () => {
    for (const partyLimit of [1, 4, 10]) {
      const html = render(rsvpFeatures({ partyLimit }));
      const select = /<select\b[^>]*name="partySize"[^>]*>[\s\S]*?<\/select>/.exec(html)?.[0] ?? "";

      assert.notEqual(select, "", String(partyLimit));
      assert.deepEqual(
        [...select.matchAll(/<option[^>]*value="(\d+)"/g)].map((match) => Number(match[1])),
        Array.from({ length: partyLimit }, (_unused, index) => index + 1),
        String(partyLimit),
      );
    }
  });

  it("gives every field an accessible label", () => {
    const html = render(rsvpFeatures());
    const ids = new Set(
      [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)].map(
        (match) => match[1],
      ),
    );
    const labelled = [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((match) => match[1]);

    assert.ok(labelled.length >= 5);
    for (const target of labelled) {
      assert.ok(ids.has(target), target);
    }
  });

  it("hides the honeypot off-screen, out of the tab order, and away from autofill", () => {
    const html = render(rsvpFeatures());
    const honeypot = controlTags(html).find((tag) => attributeOf(tag, "name") === "honeypot") ?? "";

    assert.equal(attributeOf(honeypot, "type"), "text");
    assert.equal(attributeOf(honeypot, "tabindex"), "-1");
    assert.equal(attributeAnyCase(honeypot, "autocomplete"), "off");
    assert.equal(attributeOf(honeypot, "aria-hidden"), "true");
    assert.equal(attributeOf(honeypot, "required"), undefined);
    assert.match(html, /<div[^>]*aria-hidden="true"[^>]*class="[^"]*(?:absolute|-left-\[9999px\])/);
  });

  it("names the deadline in the invitation's zone when the creator set one", () => {
    assert.match(render(rsvpFeatures()), /Confirma antes del 1 de diciembre de 2026 a las 12:00/);
    assert.doesNotMatch(render(rsvpFeatures({ deadline: null })), /Confirma antes del/);
  });

  it("shows a closed note instead of the form once the deadline has passed", () => {
    const html = render(rsvpFeatures({ closed: true }));

    assert.doesNotMatch(html, /<form/);
    assert.doesNotMatch(html, /name="attending"/);
    // Nothing invites an answer the invitation no longer accepts.
    assert.doesNotMatch(html, /Cuéntanos si podrás acompañarnos/);
    assert.match(
      html,
      /La confirmación de asistencia cerró el 1 de diciembre de 2026 a las 12:00\./,
    );
  });

  it("renders one companion row per extra person, none for a party of one (F3; L6.3)", () => {
    for (const partyLimit of [1, 2, 4, 10]) {
      const html = render(rsvpFeatures({ partyLimit }));
      const rows = [...html.matchAll(/data-companion-row="(\d+)"/g)].map((match) =>
        Number(match[1]),
      );

      assert.deepEqual(
        rows,
        Array.from({ length: partyLimit - 1 }, (_unused, index) => index + 1),
        String(partyLimit),
      );
      // Each row carries its own name field and its own «Niño» mark, so the two can never be paired by mistake.
      for (const row of rows) {
        assert.match(html, new RegExp(`name="companionName-${row}"`));
        assert.match(html, new RegExp(`name="companionChild-${row}"`));
      }
      assert.equal(
        [...html.matchAll(/data-companion-rows/g)].length,
        partyLimit > 1 ? 1 : 0,
        String(partyLimit),
      );
    }
  });

  it("bounds the companion name and the dietary notes, and labels every one of them (F3; L6.1)", () => {
    const html = render(rsvpFeatures());
    const companion = controlTags(html).find(
      (tag) => attributeOf(tag, "name") === "companionName-1",
    );
    const dietary = controlTags(html).find((tag) => attributeOf(tag, "name") === "dietaryNotes");

    assert.equal(attributeAnyCase(companion ?? "", "maxlength"), "60");
    assert.equal(attributeAnyCase(dietary ?? "", "maxlength"), "300");
    assert.match(dietary ?? "", /^<textarea/);

    const ids = new Set(
      controlTags(html).flatMap((tag) => {
        const id = attributeOf(tag, "id");

        return id === undefined ? [] : [id];
      }),
    );
    const labelled = [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((match) => match[1]);

    for (const target of labelled) {
      assert.ok(ids.has(target ?? ""), target ?? "");
    }
    // The «Niño» mark is a checkbox with its own label, and the child row is a text field, never colour alone.
    const child = controlTags(html).find((tag) => attributeOf(tag, "name") === "companionChild-1");
    assert.equal(attributeOf(child ?? "", "type"), "checkbox");
    assert.match(html, />Niño</);
  });

  it("starts the guest's own rows from the answer they already gave (F3; L6.1)", () => {
    const html = render(
      featuresOf({
        guest: {
          greeting: "Hola, Ana",
          seats: "Tienes 3 lugares reservados a tu nombre.",
          rsvp: {
            slug: SLUG_FOR_GUEST,
            token: "AbCdEfGhIjKlMnOpQrStUv",
            seats: 3,
            partySizes: [1, 2, 3],
            answer: { attending: true, partySize: 3 },
            companions: [
              { name: "Jorge", child: false },
              { name: "Sofía", child: true },
            ],
            dietaryNotes: "Sin nueces",
            message: "",
            deadline: null,
            closed: false,
          },
        },
      }),
    );

    assert.match(html, /data-feature="guest-rsvp"/);
    assert.match(html, /name="companionName-1"[^>]*value="Jorge"/);
    assert.match(html, /name="companionName-2"[^>]*value="Sofía"/);
    assert.match(html, /name="companionChild-2"[^>]*checked/);
    assert.match(html, /<textarea[^>]*name="dietaryNotes"[^>]*>Sin nueces<\/textarea>/);
    // The guest's card offers exactly the rows their seats cover: three seats, two companions.
    assert.deepEqual(
      [...html.matchAll(/data-companion-row="(\d+)"/g)].map((match) => Number(match[1])),
      [1, 2],
    );
  });

  it("ships no client script of its own and no inline handler", () => {
    const html = render(rsvpFeatures({ partyLimit: 10 }));

    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /\son[a-z]+=/);
  });

  it("draws the form from the theme's variables and keeps the submit a 44 px target", () => {
    const html = render(rsvpFeatures());
    const button = /<button\b[^>]*>[\s\S]*?<\/button>/.exec(html)?.[0] ?? "";

    assert.match(html, /bg-\(--inv-surface\)/);
    assert.match(html, /text-\(color:--inv-ink\)/);
    assert.match(html, /text-\(color:--inv-accent\)/);
    assert.match(html, /border-\(--inv-accent\)/);
    assert.equal(attributeOf(button, "type"), "submit");
    assert.ok(classesOf(button).includes("min-h-11"), button);
    assert.doesNotMatch(html, /style="[^"]*#[0-9a-fA-F]{3,6}/);
  });
});

// The gallery of the guest page (M8 S3, S4): the shared block renders «Galería» only when the API answered photos, as a
// responsive grid of `<img>` elements that reserve the API's dimensions, load lazily, decode off the main thread, and
// link to the full image in a new tab. No client script, and every color from the theme's own variables.
const GALLERY = [
  {
    url: "http://localhost:3001/media/9b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e19",
    width: 1200,
    height: 800,
    alt: "Los novios en el jardín",
  },
  {
    url: "http://localhost:3001/media/8b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e18",
    width: 800,
    height: 1200,
    alt: null,
  },
];

function galleryHtml(photos = GALLERY): string {
  return render(featuresOf({ gallery: photos }));
}

describe("gallery in the features block", () => {
  it("renders nothing when the invitation has no photos", () => {
    assert.equal(galleryHtml([]), "");
    assert.doesNotMatch(render(featuresOf({ calendar: true })), /data-feature="gallery"/);
  });

  it("renders every photo in the API's order", () => {
    const html = galleryHtml();
    const sources = [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((match) => match[1]);

    assert.equal(sources.length, 2);
    assert.deepEqual(
      sources,
      GALLERY.map((photo) => photo.url),
    );
    assert.match(html, /data-feature="gallery"/);
    assert.match(html, />Galería</);
  });

  it("links each photo to the full image in a new tab, without leaking the opener", () => {
    const html = galleryHtml();
    const links = linksOf(html);

    assert.equal(links.length, 2);
    for (const [index, link] of links.entries()) {
      assert.equal(attributeOf(link, "href"), GALLERY[index]?.url);
      assert.equal(attributeOf(link, "target"), "_blank");
      assert.equal(attributeOf(link, "rel"), "noopener noreferrer");
    }
  });

  it("reserves the API's dimensions and defers every photo", () => {
    const html = galleryHtml();
    const images = html.match(/<img\b[^>]*>/g) ?? [];

    assert.equal(images.length, 2);
    for (const [index, image] of images.entries()) {
      assert.equal(attributeOf(image, "width"), String(GALLERY[index]?.width), image);
      assert.equal(attributeOf(image, "height"), String(GALLERY[index]?.height), image);
      assert.equal(attributeOf(image, "loading"), "lazy", image);
      assert.equal(attributeOf(image, "decoding"), "async", image);
    }
  });

  it("uses the creator's alt text and a generic description when there is none", () => {
    const html = galleryHtml();
    const images = html.match(/<img\b[^>]*>/g) ?? [];

    assert.equal(attributeOf(images[0] ?? "", "alt"), "Los novios en el jardín");
    assert.equal(attributeOf(images[1] ?? "", "alt"), "Foto de la galería");
  });

  it("is a two-column grid on phones and three columns on wide screens, drawn from the theme", () => {
    const html = galleryHtml();
    const grid = /<div[^>]*data-gallery-grid[^>]*>/.exec(html)?.[0] ?? "";

    assert.ok(classesOf(grid).includes("grid-cols-2"), grid);
    assert.ok(classesOf(grid).includes("sm:grid-cols-3"), grid);
    assert.match(html, /bg-\(--inv-surface\)/);
    assert.match(html, /text-\(color:--inv-ink\)/);
    assert.match(html, /text-\(color:--inv-accent\)/);
    assert.doesNotMatch(html, /style="[^"]*#[0-9a-fA-F]{3,6}/);
  });

  it("ships no client script and no inline handler", () => {
    const html = galleryHtml();

    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /\son[a-z]+=/);
  });
});

// The confirmed point of each place (S1, S2): a place carries the content field its address comes from, so the block
// attaches the stored point of that field and both links ask for the coordinates. The map is the lazy island beside
// them; the links stay the way to the place with no script at all.

const PARROQUIA = {
  label: "Calle Hidalgo 45, Centro, Querétaro",
  lat: 20.588793,
  lng: -100.389888,
};

describe("the confirmed point of a place (S1, S2)", () => {
  it("keeps the text search and renders no map when no field has a point", () => {
    const html = render(featuresOf({ map: true }));

    assert.doesNotMatch(html, /data-place-map/);
    assert.match(linksOf(html)[0] ?? "", /\?api=1&amp;query=Jard%C3%ADn%20Los%20Arcos/);
    assert.match(linksOf(html)[1] ?? "", /ul\?q=Jard%C3%ADn%20Los%20Arcos/);
  });

  it("asks both services for the coordinates a confirmed address stored", () => {
    const html = render(
      featuresOf({ map: true, places: { ceremonyAddress: PARROQUIA } }),
      BAPTISM_FACTS,
    );
    const links = linksOf(html);

    assert.equal(links.length, 4);
    assert.equal(
      new URL(
        (attributeOf(links[0] ?? "", "href") ?? "").replaceAll("&amp;", "&"),
      ).searchParams.get("query"),
      "20.588793,-100.389888",
    );
    assert.equal(
      new URL(
        (attributeOf(links[1] ?? "", "href") ?? "").replaceAll("&amp;", "&"),
      ).searchParams.get("ll"),
      "20.588793,-100.389888",
    );
    // The reception has no point of its own, so it keeps the text search: one confirmed place never invents another.
    assert.equal(
      new URL(
        (attributeOf(links[2] ?? "", "href") ?? "").replaceAll("&amp;", "&"),
      ).searchParams.get("query"),
      "Casa de los abuelos, Av. de los Fresnos 210, Querétaro",
    );
  });

  it("renders the map island beside the links, with the attribution the data asks for", () => {
    const html = render(
      featuresOf({ map: true, places: { ceremonyAddress: PARROQUIA } }),
      BAPTISM_FACTS,
    );

    assert.match(html, /data-place-map/);
    assert.match(html, /© OpenStreetMap contributors/);
    assert.match(html, /OpenFreeMap/);
    // The canvas is decorative; the places it draws are named for a reader who cannot see it.
    assert.match(html, /aria-hidden="true"/);
    // Only the place with a confirmed point is drawn, and the line names exactly that one.
    assert.match(html, /Mapa de Parroquia San Miguel\./);
    assert.doesNotMatch(html, /Mapa de .*Recepción/);
    // The links are still there, so a failed map never strands a guest.
    assert.equal(linksOf(html).length, 4);
  });

  it("reserves the height of the box before the map exists, so nothing jumps", () => {
    const html = render(featuresOf({ map: true, places: { address: PARROQUIA } }));

    // The height is the box's own class, so it is painted before MapLibre is ever imported.
    assert.match(html, /class="relative h-56 w-full overflow-hidden rounded-xl/);
    // The attribution is outside the box, so its clip never hides it.
    assert.match(
      html,
      /class="relative h-56 w-full overflow-hidden rounded-xl[^"]*"><div class="h-56 w-full"><\/div><\/div><p class="sr-only/,
    );
  });

  it("renders no map for a package without MAP, even when a point is stored", () => {
    const html = render(featuresOf({ places: { address: PARROQUIA } }));

    assert.doesNotMatch(html, /data-place-map/);
    assert.equal(html, "");
  });
});

/** One registry, as the API answers it (F2; L4.3): two stores, a transfer, the envelopes line, and a note. */
const GIFT_REGISTRY = {
  stores: [
    {
      name: "Liverpool",
      reference: "Evento 51234567",
      url: "https://mesaderegalos.liverpool.com.mx/milestaderegalos/51234567",
    },
    { name: "Amazon", url: "https://www.amazon.com.mx/wedding/ana-y-luis" },
  ],
  transfer: { bank: "BBVA", holder: "Ana Martínez", clabe: "012180000123456782" },
  envelopes: true,
  note: "Gracias por acompañarnos.",
} as const;

describe("the gift registry of a guest page (F2; L4.5)", () => {
  /** The block rendered from one registry, with nothing else gated on. */
  function renderRegistry(registry: InvitationFeatures["giftRegistryDetails"]): string {
    return render(
      featuresOf(
        registry === undefined
          ? { giftRegistry: true }
          : { giftRegistry: true, giftRegistryDetails: registry },
      ),
    );
  }

  it("draws one row per store, in the owner's order, with its reference and a «Ver mesa» link", () => {
    const html = renderRegistry(GIFT_REGISTRY);
    const rows = html.match(/<li[^>]*data-gift-store="[^"]*"[\s\S]*?<\/li>/g) ?? [];

    assert.equal(rows.length, 2);
    assert.match(rows[0] ?? "", /Liverpool/);
    assert.match(rows[0] ?? "", /Evento 51234567/);
    assert.match(rows[1] ?? "", /Amazon/);
    assert.equal(html.indexOf("Liverpool") < html.indexOf("Amazon"), true);
    // The card names itself once, with the artboard's own sentence.
    assert.match(html, /data-feature="gift-registry"/);
    assert.match(html, /Mesa de regalos/);
    assert.match(html, /Tu presencia es nuestro mejor regalo/);
  });

  it("opens every store in a new tab without handing it the opener", () => {
    const links = linksOf(renderRegistry(GIFT_REGISTRY));

    assert.equal(links.length, 2);
    for (const [index, link] of links.entries()) {
      assert.equal(attributeOf(link, "target"), "_blank");
      assert.equal(attributeOf(link, "rel"), "noopener noreferrer");
      assert.equal(attributeOf(link, "href"), GIFT_REGISTRY.stores[index]?.url as string);
      // The action is text, never an icon alone: «Ver mesa →» inside the link.
      assert.match(link, /Ver mesa/);
      assert.match(link, /→/);
      // A reader that cannot see it hears which store it opens.
      assert.equal(
        attributeOf(link, "aria-label"),
        `Ver mesa de ${GIFT_REGISTRY.stores[index]?.name} en una pestaña nueva`,
      );
    }
  });

  it("draws the transfer data with the CLABE grouped for reading and the copy button's own value", () => {
    const html = renderRegistry(GIFT_REGISTRY);

    assert.match(html, /data-gift-transfer/);
    assert.match(html, /BBVA/);
    assert.match(html, /Ana Martínez/);
    // The artboard groups the digits: four, four, four, and the last two.
    assert.match(html, /0121 8000 0123 4567 82/);
    // The island receives the compact number and the id of the element its fallback selects.
    assert.match(html, /data-copy-clabe="012180000123456782"/);
    assert.match(html, /Copiar CLABE/);
    assert.match(html, /aria-live="polite"/);
  });

  it("draws the envelopes line and the note only when the owner wrote them", () => {
    const html = renderRegistry(GIFT_REGISTRY);

    assert.match(html, /Lluvia|en un sobre/);
    assert.match(html, /Gracias por acompañarnos\./);

    const bare = renderRegistry({
      stores: [{ name: "Liverpool", url: "https://x.mx/1" }],
      transfer: null,
      envelopes: false,
      note: null,
    });

    assert.doesNotMatch(bare, /en un sobre/);
    assert.doesNotMatch(bare, /Gracias por acompañarnos/);
    assert.doesNotMatch(bare, /Copiar CLABE/);
    assert.doesNotMatch(bare, /data-gift-transfer/);
  });

  it("escapes every owner text instead of turning it into markup", () => {
    const html = renderRegistry({
      stores: [
        {
          name: "<script>alert('Liverpool')</script>",
          reference: "<img src=x onerror=alert(1)>",
          url: "https://x.mx/1?a=%22%3E%3Cscript%3E",
        },
      ],
      transfer: { bank: "<b>BBVA</b>", holder: "Ana & Luis", clabe: "012180000123456782" },
      envelopes: true,
      note: '<a href="https://evil.test">regalo</a>',
    });

    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<b>BBVA<\/b>/);
    assert.doesNotMatch(html, /<a href="https:\/\/evil\.test">/);
    // The text is there, escaped, so nothing the owner typed disappears either.
    assert.match(html, /&lt;script&gt;alert\(&#x27;Liverpool&#x27;\)&lt;\/script&gt;/);
    assert.match(html, /Ana &amp; Luis/);
    assert.match(html, /&lt;b&gt;BBVA&lt;\/b&gt;/);
  });

  it("draws the registry after the plan of the day and before the map", () => {
    const html = render(
      featuresOf({
        giftRegistry: true,
        giftRegistryDetails: GIFT_REGISTRY,
        itinerary: [{ time: "17:00", title: "Misa" }],
        map: true,
      }),
    );

    assert.equal(
      html.indexOf('data-feature="itinerary"') < html.indexOf('data-feature="gift-registry"'),
      true,
    );
    assert.equal(
      html.indexOf('data-feature="gift-registry"') < html.indexOf('data-feature="map"'),
      true,
    );
  });
});

/** One guest page's own block, with the pass of a confirmed guest (F5; L8.4). */
function guestFeatures(pass: GuestPassBlockView | undefined): InvitationFeatures {
  return featuresOf({
    guest: {
      greeting: "Hola, Ana",
      seats: "Tienes 4 lugares reservados a tu nombre.",
      ...(pass === undefined ? {} : { pass }),
    },
  });
}

const CHECK_IN_URL = "http://localhost:3000/cuenta/acceso/invitacion-k7m2qx/AbCdEfGhIjKlMnOpQrStUv";

describe("the access pass of a guest page (F5; L8.4)", () => {
  it("draws the ticket with the QR, the table in the accent, and the confirmed people", () => {
    const html = render(
      guestFeatures({
        checkInUrl: CHECK_IN_URL,
        name: "Familia Gómez",
        tableLabel: "7",
        people: 3,
      }),
    );

    assert.match(html, /data-feature="pass"/);
    // The artboard's kicker and the guest's own name head the ticket.
    assert.match(html, /Pase de acceso/);
    assert.match(html, /Familia Gómez/);
    // The QR stays a server-drawn image document, never inline markup.
    assert.match(html, /src="data:image\/svg\+xml/);
    // The table is readable as text next to its own label, never by color alone.
    assert.match(html, /<dt[^>]*>Mesa<\/dt>/);
    assert.match(html, /<dd[^>]*>7<\/dd>/);
    assert.match(html, /<dt[^>]*>Personas<\/dt>/);
    assert.match(html, /<dd[^>]*>3<\/dd>/);
    // The large value takes the theme's accent, with the label carrying the meaning.
    const mesaValue = /<dd[^>]*class="[^"]*--inv-accent[^"]*"[^>]*>7<\/dd>/.test(html);
    assert.equal(mesaValue, true, html);
  });

  it("separates the ticket from its hint with a dashed tear line and names the venue", () => {
    const html = render(
      guestFeatures({
        checkInUrl: CHECK_IN_URL,
        name: "Familia Gómez",
        tableLabel: "7",
        people: 3,
      }),
    );

    assert.match(html, /border-dashed/);
    // The venue is the last place the invitation shows: the reception when there is one.
    assert.match(html, /Muestra este código en la entrada · Jardín Los Arcos/);

    const baptism = render(
      guestFeatures({
        checkInUrl: CHECK_IN_URL,
        name: "Emilia",
        tableLabel: "Principal",
        people: 1,
      }),
      BAPTISM_FACTS,
    );
    assert.match(baptism, /Casa de los abuelos/);
  });

  it("shows only the people count when the owner assigned no table", () => {
    const html = render(
      guestFeatures({
        checkInUrl: CHECK_IN_URL,
        name: "Familia Gómez",
        tableLabel: null,
        people: 3,
      }),
    );

    assert.match(html, /data-feature="pass"/);
    assert.doesNotMatch(html, /<dt[^>]*>Mesa<\/dt>/);
    assert.doesNotMatch(html, /<dt[^>]*>Mesa<\/dt>[\s\S]*Principal/);
    assert.match(html, /<dt[^>]*>Personas<\/dt>/);
    assert.match(html, /<dd[^>]*>3<\/dd>/);
  });

  it("escapes the guest's name and the table instead of turning them into markup", () => {
    const html = render(
      guestFeatures({
        checkInUrl: CHECK_IN_URL,
        name: "<script>alert('Ana')</script>",
        tableLabel: "<b>7</b>",
        people: 1,
      }),
    );

    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /<b>7<\/b>/);
    assert.match(html, /&lt;b&gt;7&lt;\/b&gt;/);
  });
});

describe("the guestbook wall of the features block (F7; S2.7, L10.5)", () => {
  const ENTRIES = [
    { authorName: "Tía Rosa", message: "¡Que este día sea tan hermoso como tú!" },
    { authorName: "Sofía y Jorge", message: "Nos vemos en la pista." },
  ];

  it("draws the wall and its form, with «Firmar el libro» below the messages", () => {
    const html = render(
      featuresOf({ guestbook: { slug: SLUG_FOR_GUEST, entries: ENTRIES, closed: false } }),
    );

    assert.match(html, /data-feature="guestbook"/);
    assert.match(html, /Libro de firmas/);
    for (const entry of ENTRIES) {
      assert.match(html, new RegExp(entry.message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(html, new RegExp(entry.authorName));
    }
    // The form of the wall: the name, the message, the hidden honeypot, and its one action (L10.5).
    assert.match(html, /<form[^>]*data-guestbook-form/);
    assert.match(html, /name="slug" value="invitacion-k7m2qx"/);
    assert.match(html, /name="authorName"/);
    assert.match(html, /<textarea[^>]*name="message"/);
    assert.match(html, /name="honeypot"/);
    assert.match(html, />Firmar el libro</);
  });

  it("keeps the wall and closes the form when the invitation expired", () => {
    const html = render(
      featuresOf({ guestbook: { slug: SLUG_FOR_GUEST, entries: ENTRIES, closed: true } }),
    );

    assert.match(html, /data-feature="guestbook"/);
    assert.match(html, /El libro de firmas se cerró cuando terminó la invitación\./);
    assert.doesNotMatch(html, /data-guestbook-form/);
    assert.doesNotMatch(html, /Firmar el libro/);
  });

  it("invites the first signature of a granted wall with no message", () => {
    const html = render(
      featuresOf({ guestbook: { slug: SLUG_FOR_GUEST, entries: [], closed: false } }),
    );

    assert.match(html, /Todavía no hay mensajes/);
    assert.match(html, /data-guestbook-form/);
  });

  it("renders every message as text: markup and links stay characters", () => {
    const html = render(
      featuresOf({
        guestbook: {
          slug: SLUG_FOR_GUEST,
          entries: [
            {
              authorName: "<b>Rosa</b>",
              message: "<script>alert(1)</script> https://spam.example",
            },
          ],
          closed: false,
        },
      }),
    );

    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /<b>Rosa<\/b>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; https:\/\/spam\.example/);
    // The only link of a wall is none: a URL a guest typed never becomes clickable (L10.3).
    assert.deepEqual(linksOf(html), []);
  });

  it("comes after the invitation's other cards, so the wall closes the features block", () => {
    const html = render(
      featuresOf({
        calendar: true,
        guestbook: { slug: SLUG_FOR_GUEST, entries: ENTRIES, closed: false },
      }),
    );
    const sections = [...html.matchAll(/data-feature="([^"]+)"/g)].map((match) => match[1]);

    assert.deepEqual(sections, ["calendar", "guestbook"]);
  });
});

// The album of the guests' photos (F8; S2.8, L11.5): the artboard's «Nuestras fotos» card — the count line, «Subir mis
// fotos» as a plain multipart form that works with no client script, and the grid of the photos the owner published.
const ALBUM_PHOTO = {
  url: `http://localhost:3001/media/${SLUG_FOR_GUEST}-1`,
  uploaderName: "Tía Rosa",
};
const ALBUM_PHOTO_ANONYMOUS = {
  url: `http://localhost:3001/media/${SLUG_FOR_GUEST}-2`,
  uploaderName: null,
};

/** The links one rendered block carries, which is what tells a refreshable image from a link a guest typed. */
function imageSourcesOf(html: string): string[] {
  return [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((match) => decodeHtml(match[1] ?? ""));
}

/** React escapes attribute values; a source is compared as the URL the block received. */
function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

describe("the album of the guests' photos in the features block (F8; S2.8, L11.5)", () => {
  it("draws the published photos with their served URLs and their alt text, and the count line", () => {
    const html = render(
      featuresOf({
        guestAlbum: {
          slug: SLUG_FOR_GUEST,
          photos: [ALBUM_PHOTO, ALBUM_PHOTO_ANONYMOUS],
          count: 12,
          closed: false,
        },
      }),
    );

    assert.match(html, /data-feature="guestAlbum"/);
    assert.deepEqual(imageSourcesOf(html), [ALBUM_PHOTO.url, ALBUM_PHOTO_ANONYMOUS.url]);
    assert.match(html, /alt="Foto que subió Tía Rosa"/);
    assert.match(html, /alt="Foto del álbum de invitados"/);
    assert.match(html, /12 fotos publicadas/);
    assert.match(html, /Nuestras fotos/);
  });

  it("escapes an uploader name so it can never add markup to the guest page (F8; L11 approval)", () => {
    const html = render(
      featuresOf({
        guestAlbum: {
          slug: SLUG_FOR_GUEST,
          photos: [{ ...ALBUM_PHOTO, uploaderName: '<img src=x onerror="alert(1)">' }],
          count: 1,
          closed: false,
        },
      }),
    );

    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  });

  it("offers «Subir mis fotos» as a multipart form that works with no client script", () => {
    const html = render(
      featuresOf({
        guestAlbum: { slug: SLUG_FOR_GUEST, photos: [], count: 0, closed: false },
      }),
    );

    assert.match(html, /<form[^>]*data-guest-album-form/);
    assert.match(html, /<form[^>]*encType="multipart\/form-data"/i);
    assert.match(html, /method="post"/);
    assert.match(html, /type="hidden" name="slug" value="invitacion-k7m2qx"/);
    assert.match(html, /type="file"/);
    assert.match(html, /name="file"/);
    assert.match(html, /name="uploaderName"/);
    assert.match(html, /maxlength="60"/i);
    assert.match(html, />Subir mis fotos</);
    // No script of its own: the block is server-rendered and the form posts to a server action (L11.5).
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /Todavía no hay fotos publicadas/);
  });

  it("keeps the photos and closes the form when the invitation expired", () => {
    const html = render(
      featuresOf({
        guestAlbum: {
          slug: SLUG_FOR_GUEST,
          photos: [ALBUM_PHOTO],
          count: 1,
          closed: true,
        },
      }),
    );

    assert.match(html, /data-feature="guestAlbum"/);
    assert.match(html, /1 foto publicada/);
    assert.match(html, /El álbum de fotos se cerró cuando terminó la invitación\./);
    assert.doesNotMatch(html, /encType="multipart\/form-data"/i);
    assert.doesNotMatch(html, /Subir mis fotos/);
  });

  it("renders every uploader name as text: markup and links stay characters", () => {
    const html = render(
      featuresOf({
        guestAlbum: {
          slug: SLUG_FOR_GUEST,
          photos: [{ url: `${ALBUM_PHOTO.url}?x=1`, uploaderName: "<b>Rosa</b>" }],
          count: 1,
          closed: false,
        },
      }),
    );

    assert.doesNotMatch(html, /<b>Rosa<\/b>/);
    assert.match(html, /alt="Foto que subió &lt;b&gt;Rosa&lt;\/b&gt;"/);
  });

  it("comes after the other cards a guest reads and before the wall that closes the block", () => {
    const html = render(
      featuresOf({
        calendar: true,
        guestAlbum: {
          slug: SLUG_FOR_GUEST,
          photos: [ALBUM_PHOTO],
          count: 1,
          closed: false,
        },
        guestbook: {
          slug: SLUG_FOR_GUEST,
          entries: [{ authorName: "Rosa", message: "Felicidades" }],
          closed: false,
        },
      }),
    );
    const sections = [...html.matchAll(/data-feature="([^"]+)"/g)].map((match) => match[1]);

    assert.deepEqual(sections, ["calendar", "guestAlbum", "guestbook"]);
  });
});
