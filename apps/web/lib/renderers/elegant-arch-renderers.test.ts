import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BaptismArchRenderer } from "../../app/_components/renderers/baptism-arch-01/baptism-arch-renderer.ts";
import { ElegantOrnament } from "../../app/_components/renderers/elegant-arch/elegant-ornament.ts";
import { WeddingArchRenderer } from "../../app/_components/renderers/wedding-arch-01/wedding-arch-renderer.ts";
import { XVArchRenderer } from "../../app/_components/renderers/xv-arch-01/xv-arch-renderer.ts";
import {
  ARCH_SCRIM_INK_PERCENT,
  ELEGANT_ORNAMENTS,
  ELEGANT_THEME,
  ELEGANT_THEMES,
} from "./elegant-themes.ts";
import { THEME_COLOR_ROLES } from "./theme-tokens.ts";

/*
 * The three arch layouts of the elegant line (E3c; S3, S4): `xv-arch-01`, `wedding-arch-01`, and
 * `baptism-arch-01`, one visual layout shared by three content schemas. A server component with no client
 * script: the theme supplies the palette, the display font, and the ornament through CSS variables, and the
 * name sits on a measured scrim over the arch photo or over a theme-colored wash.
 */

const XV_FULL = {
  celebrantName: "Valentina Ramírez",
  date: "2026-08-15",
  parents: "Miguel Ramírez Alcántara\nAdriana Solís de Ramírez",
  honorSponsors: "Joaquín Esquivel del Valle\nMariana Robles de Esquivel",
  chambelanes: "Diego Fuentes\nRodrigo Salas",
  ceremonyPlace: "Parroquia de San Agustín",
  ceremonyAddress: "Calle de los Fresnos 132, San Pedro de los Pinos, Ciudad de México",
  ceremonyTime: "18:00",
  receptionPlace: "Jardín de los Olivos",
  receptionAddress: "Camino Real a Santa Fe 41, Santa Fe, Ciudad de México",
  receptionTime: "20:30",
  dressCode: "Formal · etiqueta",
  message: "Hay días que se esperan toda una vida.",
  rsvpContact: "Adriana Solís · 55 8120 4471",
  giftRegistry: "Liverpool 50894421",
  mainPhoto: "https://example.com/valentina.jpg",
};

const XV_MINIMAL = {
  celebrantName: "Valentina Ramírez",
  date: "2026-08-15",
  parents: "Miguel Ramírez Alcántara\nAdriana Solís de Ramírez",
  honorSponsors: "Joaquín Esquivel del Valle\nMariana Robles de Esquivel",
  ceremonyPlace: "Parroquia de San Agustín",
  ceremonyAddress: "Calle de los Fresnos 132, San Pedro de los Pinos, Ciudad de México",
  ceremonyTime: "18:00",
  receptionPlace: "Jardín de los Olivos",
  receptionAddress: "Camino Real a Santa Fe 41, Santa Fe, Ciudad de México",
  receptionTime: "20:30",
  dressCode: "Formal · etiqueta",
  message: "Hay días que se esperan toda una vida.",
  rsvpContact: "Adriana Solís · 55 8120 4471",
};

const WEDDING_FULL = {
  coupleNameOne: "Ana Sofía",
  coupleNameTwo: "Daniel",
  date: "2026-09-12",
  firstFamilyParents: "Roberto Sánchez y Elena Vargas",
  secondFamilyParents: "Jorge Medina y Lucía Peña",
  weddingSponsors: "Andrés Reyes\nCamila Reyes",
  ceremonyPlace: "Parroquia de Santa Ana",
  ceremonyAddress: "Av. Juárez 120, Centro, Querétaro",
  ceremonyTime: "17:00",
  receptionPlace: "Hacienda San Gabriel",
  receptionAddress: "Camino a la Hacienda 8, Querétaro",
  receptionTime: "19:30",
  dressCode: "Formal",
  message: "Nos encantaría celebrar contigo.",
  rsvpContact: "Confirma con Ana Sofía al 55 1234 5678",
  giftRegistry: "Mesa de regalos · Código 4471 2205",
  hashtag: "#AnaYDaniel",
  mainPhoto: "https://example.com/ana-y-daniel.jpg",
};

const WEDDING_MINIMAL = {
  coupleNameOne: "Ana Sofía",
  coupleNameTwo: "Daniel",
  date: "2026-09-12",
  ceremonyPlace: "Parroquia de Santa Ana",
  ceremonyAddress: "Av. Juárez 120, Centro, Querétaro",
  ceremonyTime: "17:00",
  receptionPlace: "Hacienda San Gabriel",
  receptionAddress: "Camino a la Hacienda 8, Querétaro",
  receptionTime: "19:30",
  dressCode: "Formal",
  message: "Nos encantaría celebrar contigo.",
  rsvpContact: "Confirma con Ana Sofía al 55 1234 5678",
};

const BAPTISM_FULL = {
  celebrantName: "Emilia",
  date: "2027-04-11",
  parents: "Diego y Valentina Ortiz",
  godparents: "Andrés Ortiz y Camila Reyes",
  ceremonyPlace: "Parroquia San Miguel",
  ceremonyAddress: "Calle Hidalgo 45, Centro, Querétaro",
  ceremonyTime: "11:00",
  receptionPlace: "Casa de los abuelos",
  receptionAddress: "Av. de los Fresnos 210, Col. Álamos, Querétaro",
  receptionTime: "13:30",
  giftRegistry: "Mesa de regalos · Código 7781 2205",
  rsvpContact: "Confirma con Valentina al 55 9876 5432",
  message: "Acompáñanos a dar la bienvenida a Emilia.",
  mainPhoto: "https://example.com/emilia.jpg",
};

const BAPTISM_MINIMAL = {
  celebrantName: "Emilia",
  date: "2027-04-11",
  parents: "Diego y Valentina Ortiz",
  godparents: "Andrés Ortiz y Camila Reyes",
  ceremonyPlace: "Parroquia San Miguel",
  ceremonyAddress: "Calle Hidalgo 45, Centro, Querétaro",
  ceremonyTime: "11:00",
  receptionPlace: "Casa de los abuelos",
  receptionAddress: "Av. de los Fresnos 210, Col. Álamos, Querétaro",
  receptionTime: "13:30",
  rsvpContact: "Confirma con Valentina al 55 9876 5432",
  message: "Acompáñanos a dar la bienvenida a Emilia.",
};

interface ArchCase {
  readonly key: string;
  readonly Renderer: (props: { configuration: unknown; content: unknown }) => ReactElement;
  readonly full: Record<string, unknown>;
  readonly minimal: Record<string, unknown>;
  readonly sections: readonly string[];
  readonly minimalSections: readonly string[];
  readonly structure: readonly RegExp[];
  readonly minimalStructure: readonly RegExp[];
  readonly ariaLabel: string;
  readonly photoAlt: string;
  /** The names the layout must show one per line, in document order. */
  readonly nameLines: readonly string[];
}

const LAYOUTS: readonly ArchCase[] = [
  {
    key: "xv-arch-01",
    Renderer: XVArchRenderer,
    full: XV_FULL,
    minimal: XV_MINIMAL,
    sections: ["hero", "family", "ceremony", "reception", "details", "message", "rsvp"],
    minimalSections: ["hero", "family", "ceremony", "reception", "details", "message", "rsvp"],
    structure: [
      /Mis XV años/,
      /Padres/,
      /Padrinos de honor/,
      /Chambelanes/,
      /Misa/,
      /Parroquia de San Agustín/,
      /18:00 h/,
      /Recepción/,
      /20:30 h/,
      /Vestimenta/,
      /Formal · etiqueta/,
      /Mesa de regalos/,
      /Liverpool 50894421/,
      /Mensaje/,
      /Confirma tu asistencia/,
      /15 de agosto de 2026/,
    ],
    minimalStructure: [
      /Mis XV años/,
      /Padres/,
      /Padrinos de honor/,
      /Misa/,
      /Recepción/,
      /Vestimenta/,
      /Confirma tu asistencia/,
      /15 de agosto de 2026/,
    ],
    ariaLabel: "Invitación de XV años de Valentina Ramírez",
    photoAlt: "Foto de Valentina Ramírez",
    nameLines: [
      "Miguel Ramírez Alcántara",
      "Adriana Solís de Ramírez",
      "Joaquín Esquivel del Valle",
      "Mariana Robles de Esquivel",
      "Diego Fuentes",
      "Rodrigo Salas",
    ],
  },
  {
    key: "wedding-arch-01",
    Renderer: WeddingArchRenderer,
    full: WEDDING_FULL,
    minimal: WEDDING_MINIMAL,
    sections: ["hero", "family", "ceremony", "reception", "details", "message", "rsvp"],
    minimalSections: ["hero", "ceremony", "reception", "details", "message", "rsvp"],
    structure: [
      /Nuestra boda/,
      /Ana Sofía/,
      /Daniel/,
      /Familia de Ana Sofía/,
      /Familia de Daniel/,
      /Padrinos/,
      /Ceremonia/,
      /17:00 h/,
      /Recepción/,
      /19:30 h/,
      /Vestimenta/,
      /Mesa de regalos/,
      /#AnaYDaniel/,
      /12 de septiembre de 2026/,
    ],
    minimalStructure: [
      /Nuestra boda/,
      /Ana Sofía/,
      /Daniel/,
      /Ceremonia/,
      /Recepción/,
      /Vestimenta/,
      /Confirma tu asistencia/,
      /12 de septiembre de 2026/,
    ],
    ariaLabel: "Invitación de boda de Ana Sofía y Daniel",
    photoAlt: "Foto de Ana Sofía y Daniel",
    nameLines: [
      "Roberto Sánchez y Elena Vargas",
      "Jorge Medina y Lucía Peña",
      "Andrés Reyes",
      "Camila Reyes",
    ],
  },
  {
    key: "baptism-arch-01",
    Renderer: BaptismArchRenderer,
    full: BAPTISM_FULL,
    minimal: BAPTISM_MINIMAL,
    sections: ["hero", "family", "ceremony", "reception", "details", "message", "rsvp"],
    minimalSections: ["hero", "family", "ceremony", "reception", "message", "rsvp"],
    structure: [
      /Bautizo de/,
      /Emilia/,
      /Padres/,
      /Padrinos/,
      /Ceremonia/,
      /11:00 h/,
      /Recepción/,
      /13:30 h/,
      /Mesa de regalos/,
      /11 de abril de 2027/,
    ],
    minimalStructure: [
      /Bautizo de/,
      /Emilia/,
      /Padres/,
      /Padrinos/,
      /Ceremonia/,
      /Recepción/,
      /Confirma tu asistencia/,
      /11 de abril de 2027/,
    ],
    ariaLabel: "Invitación de bautizo de Emilia",
    photoAlt: "Foto de Emilia",
    nameLines: ["Diego y Valentina Ortiz", "Andrés Ortiz y Camila Reyes"],
  },
];

function render(
  layout: ArchCase,
  theme: string,
  content: Record<string, unknown> = layout.full,
): string {
  return renderToStaticMarkup(
    createElement(layout.Renderer, {
      configuration: { componentKey: layout.key, theme },
      content,
    }),
  );
}

/** The `data-section` values in document order. */
function sectionsOf(html: string): string[] {
  return [...html.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1] as string);
}

/** The theme data a layout reads back from its own record, as the test inspects it. */
function themeOf(theme: string) {
  const found = ELEGANT_THEME[theme as (typeof ELEGANT_THEMES)[number]];

  assert.ok(found, theme);
  return found;
}

function tagWith(html: string, attribute: string): string {
  const tag = new RegExp(`<[a-z]+[^>]*${attribute}[^>]*>`).exec(html)?.[0];

  assert.ok(tag, `rendered markup carries ${attribute}`);
  return tag;
}

/** The index ranges of the top-level `<section>` elements of a rendered invitation. */
function sectionRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let open = -1;

  for (const match of html.matchAll(/<section[^>]*>|<\/section>/g)) {
    if (match[0].startsWith("</")) {
      ranges.push([open, (match.index ?? 0) + match[0].length]);
      open = -1;
    } else {
      open = match.index ?? 0;
    }
  }
  return ranges;
}

function textOf(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, "x")
    .trim();
}

const RENDERERS_DIRECTORY = fileURLToPath(
  new URL("../../app/_components/renderers/", import.meta.url),
);

const DEFAULT_PALETTE_UTILITY =
  /(?:^|[\s"'`])(?:text|bg|border|ring|fill|stroke|outline|from|via|to|shadow|decoration|caret|accent|placeholder|divide|divide-x|divide-y)-(?:white|black|transparent|current|inherit|slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{1,3})?(?=[\s"'`]|$)/;

/** The source of every elegant-arch component, so a stray literal color or palette utility is caught. */
function elegantSources(): Array<{ file: string; source: string }> {
  return readdirSync(RENDERERS_DIRECTORY, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => /(?:elegant-arch|[a-z]+-arch-01)/.test(file))
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

describe("the arch layouts", () => {
  for (const layout of LAYOUTS) {
    it(`${layout.key} renders every field for all eight themes`, () => {
      for (const theme of ELEGANT_THEMES) {
        const html = render(layout, theme);

        assert.deepEqual(sectionsOf(html), [...layout.sections], `${theme} sections`);
        for (const pattern of layout.structure) {
          assert.match(html, pattern, `${theme} ${String(pattern)}`);
        }
        assert.match(html, new RegExp(`data-theme="${theme}"`), `${theme} theme attribute`);
        assert.match(
          html,
          new RegExp(`<img[^>]*src="[^"]+"[^>]*alt="${layout.photoAlt}"`),
          `${theme} photo with alt text`,
        );
        assert.ok(html.includes(`aria-label="${layout.ariaLabel}"`), `${theme} accessible name`);
        assert.match(
          html,
          new RegExp(`data-ornament="${themeOf(theme).ornament}"`),
          `${theme} ornament`,
        );
      }
    });

    it(`${layout.key} renders nothing for the optional fields a minimal invitation lacks`, () => {
      const html = render(layout, ELEGANT_THEMES[0], layout.minimal);

      assert.deepEqual(sectionsOf(html), [...layout.minimalSections]);
      assert.doesNotMatch(html, /<img/);
      assert.doesNotMatch(html, /Mesa de regalos/);
      assert.doesNotMatch(html, /Chambelanes/);
      assert.doesNotMatch(html, /Familia de/);
      assert.doesNotMatch(html, /#AnaYDaniel/);
    });

    it(`${layout.key} keeps its required content in a minimal invitation`, () => {
      const html = render(layout, ELEGANT_THEMES[0], layout.minimal);

      for (const pattern of layout.minimalStructure) {
        assert.match(html, pattern, String(pattern));
      }
    });

    it(`${layout.key} draws a theme-colored wash with the ornament when there is no photo`, () => {
      const html = render(layout, ELEGANT_THEMES[0], layout.minimal);

      assert.match(html, /data-hero-wash=""/);
      assert.doesNotMatch(html, /data-hero-photo/);
      // The wash carries the theme ornament, and the closing rule of the page its own copy.
      assert.equal((html.match(/data-ornament="/g) ?? []).length, 2);
      assert.match(html, /data-ornament="rose"/);
    });

    it(`${layout.key} draws the photo in the arch instead of the wash`, () => {
      const html = render(layout, ELEGANT_THEMES[0]);

      assert.match(html, /data-hero-photo=""/);
      assert.doesNotMatch(html, /data-hero-wash=""/);
      // Only the closing rule is drawn: the photo takes the arch on its own.
      assert.equal((html.match(/data-ornament="/g) ?? []).length, 1);
    });

    it(`${layout.key} renders one name per line for its lists`, () => {
      const html = render(layout, ELEGANT_THEMES[0]);
      const lines = [...html.matchAll(/<span[^>]*data-name-line=""[^>]*>([^<]*)<\/span>/g)].map(
        (match) => match[1],
      );

      assert.deepEqual(lines, [...layout.nameLines]);
    });

    it(`${layout.key} applies the theme through CSS variables and its display font`, () => {
      assert.notEqual(render(layout, ELEGANT_THEMES[0]), render(layout, ELEGANT_THEMES[1]));

      for (const theme of ELEGANT_THEMES) {
        const html = render(layout, theme);
        const data = themeOf(theme);

        for (const role of THEME_COLOR_ROLES) {
          assert.ok(
            html.includes(
              `--inv-${role.replace(/([A-Z])/g, "-$1").toLowerCase()}:${data.colors[role]}`,
            ),
            `${theme} sets the ${role} token`,
          );
        }
        assert.ok(html.includes(`--inv-display:var(${data.fontVariable}`), `${theme} display font`);
        assert.ok(
          html.includes(`font-weight:${data.titleWeight}`),
          `${theme} titles use font-weight:${data.titleWeight}`,
        );
      }
    });

    it(`${layout.key} measures the name against the scrim, not against the photo`, () => {
      for (const theme of ELEGANT_THEMES) {
        const html = render(layout, theme);
        const scrim = tagWith(html, "data-arch-scrim");

        assert.ok(
          scrim.includes(`var(--inv-ink) ${ARCH_SCRIM_INK_PERCENT}%`),
          `${theme} scrim is the ink at ${ARCH_SCRIM_INK_PERCENT}%`,
        );
        assert.match(html, /--inv-on-accent:#ffffff/, `${theme} exposes the on-accent color`);
        assert.match(
          html,
          /text-\(color:--inv-on-accent\)/,
          `${theme} name uses the on-accent token`,
        );
        assert.match(html, /data-lockup=""/, `${theme} lockup`);
      }
    });

    it(`${layout.key} keeps its decoration out of the text sections`, () => {
      for (const theme of ELEGANT_THEMES) {
        const html = render(layout, theme, layout.minimal);

        for (const zone of html.matchAll(/<div[^>]*data-decoration=""[^>]*>[\s\S]*?<\/div>/g)) {
          const index = zone.index ?? 0;

          for (const [start, end] of sectionRanges(html)) {
            assert.ok(
              index < start || index >= end,
              `${theme} decoration outside the section at ${start}`,
            );
          }
          assert.equal(textOf(zone[0]), "", `${theme} decoration carries no text`);
        }

        const ornament = html.indexOf("data-ornament=");
        const lockup = html.indexOf("data-lockup=");

        assert.ok(ornament >= 0 && lockup >= 0, `${theme} ornament and lockup`);
        assert.ok(ornament < lockup, `${theme} ornament never sits behind the name`);
        const ornamentBlock = /<svg[^>]*data-ornament="[^"]*"[^>]*>([\s\S]*?)<\/svg>/.exec(html);
        assert.ok(ornamentBlock, `${theme} ornament block`);
        assert.equal(textOf(ornamentBlock[0]), "", `${theme} ornament carries no text`);
      }
    });

    it(`${layout.key} ships no client script and no inline event handler`, () => {
      const html = render(layout, ELEGANT_THEMES[0]);

      assert.doesNotMatch(html, /<script/);
      assert.doesNotMatch(html, /\son[a-z]+=/);
    });

    it(`${layout.key} escapes content so it cannot add markup`, () => {
      const html = render(layout, ELEGANT_THEMES[0], {
        ...layout.full,
        celebrantName: "<script>alert(1)</script>",
        coupleNameOne: "<script>alert(1)</script>",
        coupleNameTwo: '"><img src=x onerror=alert(1)>',
        parents: "</p><script>alert(2)</script>",
        ceremonyPlace: '"><img src=x onerror=alert(1)>',
        message: "</p><script>alert(2)</script>",
        mainPhoto: "https://example.com/a.jpg?x=1&y=2",
      });

      assert.doesNotMatch(html, /<script/);
      assert.doesNotMatch(html, /<img src=x/);
      assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      assert.match(html, /src="https:\/\/example\.com\/a\.jpg\?x=1&amp;y=2"/);
    });

    it(`${layout.key} throws for props it cannot render`, () => {
      const Renderer = layout.Renderer;

      assert.throws(
        () =>
          renderToStaticMarkup(
            createElement(Renderer, {
              configuration: { componentKey: layout.key, theme: "neon" },
              content: layout.full,
            }),
          ),
        { name: "RendererPropsError" },
      );
      assert.throws(
        () =>
          renderToStaticMarkup(
            createElement(Renderer, {
              configuration: { componentKey: layout.key, theme: ELEGANT_THEMES[0] },
              content: { ...layout.minimal, date: "2027-02-30" },
            }),
          ),
        { name: "RendererPropsError" },
      );
    });
  }
});

describe("the elegant ornaments", () => {
  it("draws every ornament in the theme's own colors, hidden from assistive technology", () => {
    assert.equal(ELEGANT_ORNAMENTS.length, 8);

    for (const ornament of ELEGANT_ORNAMENTS) {
      const html = renderToStaticMarkup(createElement(ElegantOrnament, { ornament }));

      assert.match(html, new RegExp(`data-ornament="${ornament}"`), ornament);
      assert.match(html, /aria-hidden="true"/, ornament);
      assert.match(html, /preserveAspectRatio="xMidYMid meet"/, ornament);
      assert.match(html, /stroke="var\(--inv-decoration-(?:one|two)\)"/, ornament);
      // Colors only through the theme: no literal color value may reach an ornament.
      assert.doesNotMatch(html, /#[0-9a-f]{3,8}\b/i, ornament);
      assert.doesNotMatch(html, /\b(?:rgb|hsl)a?\(/i, ornament);
    }
  });

  it("draws only original fine-line shapes: one stroke, no fill, no text", () => {
    for (const ornament of ELEGANT_ORNAMENTS) {
      const html = renderToStaticMarkup(createElement(ElegantOrnament, { ornament }));

      assert.doesNotMatch(html, /<text/, ornament);
      assert.doesNotMatch(html, /fill="#/i, ornament);
      assert.doesNotMatch(html, /<image\b/, ornament);
      assert.match(html, /stroke-width="1(?:\.\d+)?"/, ornament);
    }
  });
});

describe("elegant layout defects pinned before the browser check", () => {
  it("uses no Tailwind default-palette color utility", () => {
    const offenders = elegantSources().flatMap(({ file, source }) => {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

      return [...code.matchAll(new RegExp(DEFAULT_PALETTE_UTILITY.source, "g"))].map(
        (match) => `${file}: ${match[0].trim()}`,
      );
    });

    assert.deepEqual(offenders, []);
  });

  it("paints the theme background behind the whole page", () => {
    for (const layout of LAYOUTS) {
      for (const theme of ELEGANT_THEMES) {
        const html = render(layout, theme);
        const classes = (
          /(?:class=")([^"]*)"/.exec(tagWith(html, "data-invitation-background"))?.[1] ?? ""
        )
          .split(/\s+/)
          .filter(Boolean);

        assert.ok(classes.includes("fixed"), `${theme} background is viewport-sized`);
        assert.ok(classes.includes("inset-0"), `${theme} background covers the viewport`);
        assert.ok(classes.includes("-z-10"), `${theme} background stays behind the content`);
        assert.ok(classes.includes("bg-(--inv-background)"), `${theme} paints the token`);
        assert.match(html, /<article[^>]*>\s*<div[^>]*data-invitation-background/);
      }
    }
  });

  it("keeps the arch photo and its ornaments in proportion", () => {
    for (const layout of LAYOUTS) {
      for (const theme of ELEGANT_THEMES) {
        const html = render(layout, theme, layout.minimal);
        const ornament = tagWith(html, "data-ornament");

        assert.match(
          ornament,
          /preserveAspectRatio="xMidYMid meet"/,
          `${theme} ornament keeps its aspect`,
        );
        assert.doesNotMatch(
          ornament,
          /preserveAspectRatio="none"/,
          `${theme} ornament is not stretched`,
        );
      }
    }
  });
});
