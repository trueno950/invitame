import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvitationFeaturesBlock } from "../../app/_components/invitation-features/invitation-features-block.ts";
import type { EventFacts } from "./event-facts.ts";
import type { InvitationFeatures, RsvpBlockView } from "./invitation-features.ts";

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
    const html = render(
      featuresOf({ music: { ...MUSIC, title: "Today’s Top Hits", coverUrl: COVER } }),
    );
    const [image] = html.match(/<img[^>]*>/) ?? [];

    assert.ok(image !== undefined, html);
    assert.equal(attributeOf(image, "src"), COVER);
    // The layout reserves the image's space and defers it, so a cover never delays the page.
    assert.equal(attributeOf(image, "width"), "300");
    assert.equal(attributeOf(image, "height"), "300");
    assert.equal(attributeOf(image, "loading"), "lazy");
    assert.equal(attributeOf(image, "alt"), "Today’s Top Hits");
    // No referrer and no cookie leave the page for the CDN.
    assert.match(image, /referrerpolicy="no-referrer"/);
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

describe("features block rendering rules", () => {
  const ALL_ON = featuresOf({
    countdown: true,
    map: true,
    calendar: true,
    whatsapp: { phone: "+525512345678" },
    music: { url: PLAYLIST, provider: "youtube" },
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

  it("keeps the countdown island the only client component of the invitation", () => {
    const clientComponents = [...featuresSources(), ...rendererSources()].filter(({ source }) =>
      /^\s*["']use client["'];?/m.test(source),
    );

    assert.deepEqual(
      clientComponents.map(({ file }) => file.replace(/^.*\/_components\//, "_components/")),
      [
        "_components/invitation-features/countdown-island.ts",
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
      "Número de personas",
      "Teléfono (opcional)",
      "Mensaje (opcional)",
      "Enviar respuesta",
    ]) {
      assert.ok(html.includes(text), text);
    }
    const names = controlTags(html).map((tag) => attributeOf(tag, "name"));
    assert.deepEqual(names, [
      "slug",
      "honeypot",
      "name",
      "attending",
      "attending",
      "partySize",
      "phone",
      "message",
    ]);
    assert.equal(attributeOf(controlTags(html)[3] ?? "", "value"), "si");
    assert.equal(attributeOf(controlTags(html)[4] ?? "", "value"), "no");
    assert.equal(attributeAnyCase(controlTags(html)[7] ?? "", "maxlength"), "280");
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
