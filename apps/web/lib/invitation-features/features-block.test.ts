import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvitationFeaturesBlock } from "../../app/_components/invitation-features/invitation-features-block.ts";
import type { EventFacts } from "./event-facts.ts";
import type { InvitationFeatures } from "./invitation-features.ts";

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
};

const FACTS: EventFacts = {
  title: "Cumpleaños de Mateo",
  date: "2026-12-05",
  time: "16:30",
  places: [
    {
      label: "Lugar",
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
      name: "Parroquia San Miguel",
      address: "Calle Hidalgo 45, Centro, Querétaro",
    },
    {
      label: "Recepción",
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
    for (const feature of ["countdown", "map", "calendar", "whatsapp"] as const) {
      const html = render(
        featuresOf(
          feature === "whatsapp" ? { whatsapp: { phone: "+525512345678" } } : { [feature]: true },
        ),
      );

      assert.match(html, new RegExp(`data-feature="${feature}"`), feature);
      for (const other of ["countdown", "map", "calendar", "whatsapp"]) {
        if (other !== feature) {
          assert.doesNotMatch(html, new RegExp(`data-feature="${other}"`), `${feature} only`);
        }
      }
    }
  });

  it("renders exactly the features the invitation has, for every combination of flags", () => {
    for (const countdown of [false, true]) {
      for (const map of [false, true]) {
        for (const calendar of [false, true]) {
          for (const whatsapp of [false, true]) {
            const features: InvitationFeatures = {
              timeZone: "America/Mexico_City",
              countdown,
              map,
              calendar,
              whatsapp: whatsapp ? { phone: "+525512345678" } : null,
            };
            const expected = [
              ...(countdown ? ["countdown"] : []),
              ...(map ? ["map"] : []),
              ...(calendar ? ["calendar"] : []),
              ...(whatsapp ? ["whatsapp"] : []),
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

describe("features block rendering rules", () => {
  const ALL_ON = featuresOf({
    countdown: true,
    map: true,
    calendar: true,
    whatsapp: { phone: "+525512345678" },
  });

  it("escapes the content it renders so it cannot add markup", () => {
    const html = render(featuresOf({ map: true, whatsapp: { phone: "+525512345678" } }), {
      title: "<script>alert(1)</script>",
      date: "2026-12-05",
      time: "16:30",
      places: [
        {
          label: '"><img src=x onerror=alert(1)>',
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
      ["_components/invitation-features/countdown-island.ts"],
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
