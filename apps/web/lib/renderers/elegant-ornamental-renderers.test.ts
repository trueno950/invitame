import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BaptismOrnamentalRenderer } from "../../app/_components/renderers/baptism-ornamental-01/baptism-ornamental-renderer.ts";
import { WeddingOrnamentalRenderer } from "../../app/_components/renderers/wedding-ornamental-01/wedding-ornamental-renderer.ts";
import { XVOrnamentalRenderer } from "../../app/_components/renderers/xv-ornamental-01/xv-ornamental-renderer.ts";
import type { InvitationFeatures } from "../invitation-features/invitation-features.ts";
import {
  ELEGANT_ORNAMENTS,
  ELEGANT_THEME,
  ELEGANT_THEMES,
  ORNAMENTAL_NAME_FONT,
} from "./elegant-themes.ts";
import { THEME_COLOR_ROLES } from "./theme-tokens.ts";

/*
 * The three ornamental layouts of the elegant line (E4b; S5): `xv-ornamental-01`, `wedding-ornamental-01`,
 * and `baptism-ornamental-01`, the second visual direction over the content contracts of «Arco y foto»
 * (S4). Papelería clásica: a centered card with a double rule over textured paper, an original laurel
 * monogram, foil-like hairlines, the name in script, and the photo reduced to a cameo. One shared layout
 * serves the three occasions and all eight themes; each renderer only maps its own content.
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

interface OrnamentalCase {
  readonly key: string;
  readonly Renderer: (props: {
    configuration: unknown;
    content: unknown;
    features?: InvitationFeatures;
    calendarHref?: string;
  }) => ReactElement;
  readonly full: Record<string, unknown>;
  readonly minimal: Record<string, unknown>;
  readonly sections: readonly string[];
  readonly minimalSections: readonly string[];
  readonly structure: readonly RegExp[];
  readonly minimalStructure: readonly RegExp[];
  readonly ariaLabel: string;
  readonly photoAlt: string;
  /** The names the layout shows one per line, in document order. */
  readonly nameLines: readonly string[];
}

const LAYOUTS: readonly OrnamentalCase[] = [
  {
    key: "xv-ornamental-01",
    Renderer: XVOrnamentalRenderer,
    full: XV_FULL,
    minimal: XV_MINIMAL,
    sections: ["hero", "cameo", "family", "ceremony", "reception", "details", "message", "rsvp"],
    minimalSections: [
      "hero",
      "cameo",
      "family",
      "ceremony",
      "reception",
      "details",
      "message",
      "rsvp",
    ],
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
    key: "wedding-ornamental-01",
    Renderer: WeddingOrnamentalRenderer,
    full: WEDDING_FULL,
    minimal: WEDDING_MINIMAL,
    sections: ["hero", "cameo", "family", "ceremony", "reception", "details", "message", "rsvp"],
    minimalSections: ["hero", "cameo", "ceremony", "reception", "details", "message", "rsvp"],
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
    key: "baptism-ornamental-01",
    Renderer: BaptismOrnamentalRenderer,
    full: BAPTISM_FULL,
    minimal: BAPTISM_MINIMAL,
    sections: ["hero", "cameo", "family", "ceremony", "reception", "details", "message", "rsvp"],
    minimalSections: ["hero", "cameo", "family", "ceremony", "reception", "message", "rsvp"],
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
  layout: OrnamentalCase,
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

/** The attributes and classes of the first tag carrying `attribute`. */
function tagWith(html: string, attribute: string): string {
  const tag = new RegExp(`<[a-z]+[^>]*${attribute}[^>]*>`).exec(html)?.[0];

  assert.ok(tag, `rendered markup carries ${attribute}`);
  return tag;
}

function classesOf(tag: string): string[] {
  return (/class="([^"]*)"/.exec(tag)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

function styleOf(tag: string): string {
  return /style="([^"]*)"/.exec(tag)?.[1] ?? "";
}

function textOf(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, "x")
    .trim();
}

/** The top-level `<section>` elements of a rendered invitation: start, end, and whether they show text. */
function sectionRanges(html: string): Array<{ start: number; end: number; text: string }> {
  const ranges: Array<{ start: number; end: number; text: string }> = [];

  for (const match of html.matchAll(/<section[^>]*>/g)) {
    const start = match.index ?? 0;
    let depth = 0;
    let end = html.length;

    for (const inner of html.slice(start).matchAll(/<section[^>]*>|<\/section>/g)) {
      depth += inner[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        end = start + (inner.index ?? 0) + inner[0].length;
        break;
      }
    }
    ranges.push({ start, end, text: textOf(html.slice(start, end)) });
  }
  return ranges;
}

const RENDERERS_DIRECTORY = fileURLToPath(
  new URL("../../app/_components/renderers/", import.meta.url),
);

const DEFAULT_PALETTE_UTILITY =
  /(?:^|[\s"'`])(?:text|bg|border|ring|fill|stroke|outline|from|via|to|shadow|decoration|caret|accent|placeholder|divide|divide-x|divide-y)-(?:white|black|transparent|current|inherit|slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{1,3})?(?=[\s"'`]|$)/;

/** Every component source of the ornamental layouts, so a stray literal color is caught. */
function ornamentalSources(): Array<{ file: string; source: string }> {
  return readdirSync(RENDERERS_DIRECTORY, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => /elegant-ornamental|[a-z]+-ornamental-01/.test(file))
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

const FEATURES: InvitationFeatures = {
  countdown: true,
  map: true,
  calendar: true,
  whatsapp: { phone: "+525581204471" },
  music: null,
  giftRegistry: true,
  timeZone: "America/Mexico_City",
};

describe("the ornamental layouts", () => {
  for (const layout of LAYOUTS) {
    it(`${layout.key} renders every field for all eight themes`, () => {
      for (const theme of ELEGANT_THEMES) {
        const html = render(layout, theme);

        assert.deepEqual(sectionsOf(html), [...layout.sections], `${theme} sections`);
        for (const pattern of layout.structure) {
          assert.match(html, pattern, `${theme} ${String(pattern)}`);
        }
        assert.match(html, new RegExp(`data-theme="${theme}"`), `${theme} theme attribute`);
        assert.equal(
          tagWith(html, "data-component-key").includes(`data-component-key="${layout.key}"`),
          true,
          `${theme} component key`,
        );
        assert.match(
          html,
          new RegExp(`<img[^>]*src="[^"]+"[^>]*alt="${layout.photoAlt}"`),
          `${theme} cameo photo with alt text`,
        );
        assert.equal(html.includes(`aria-label="${layout.ariaLabel}"`), true, `${theme} name`);
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

    it(`${layout.key} mounts the photo as an oval cameo, or an oval wash with the theme ornament`, () => {
      const withPhoto = render(layout, ELEGANT_THEMES[0]);

      assert.match(withPhoto, /data-cameo-photo=""/);
      assert.doesNotMatch(withPhoto, /data-cameo-wash=""/);
      const frame = tagWith(withPhoto, "data-cameo-frame");

      assert.match(styleOf(frame), /border-radius:50% \/ 46%/, "the cameo is an oval");
      assert.match(styleOf(frame), /overflow:hidden/, "the photo stays inside the oval");

      // Without a photo the cameo shows a theme-colored wash with the theme's own ornament.
      const without = render(layout, ELEGANT_THEMES[0], layout.minimal);

      assert.match(without, /data-cameo-wash=""/);
      assert.doesNotMatch(without, /data-cameo-photo/);
      assert.equal((without.match(/data-ornament="/g) ?? []).length, 2, "cameo and closing rule");
      assert.match(without, /data-ornament="rose"/);
      assert.equal((withPhoto.match(/data-ornament="/g) ?? []).length, 1, "closing rule only");
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
          assert.equal(
            html.includes(
              `--inv-${role.replace(/([A-Z])/g, "-$1").toLowerCase()}:${data.colors[role]}`,
            ),
            true,
            `${theme} sets the ${role} token`,
          );
        }
        assert.equal(
          html.includes(`--inv-display:var(${data.fontVariable}`),
          true,
          `${theme} display font`,
        );
        assert.equal(
          html.includes(`font-weight:${data.titleWeight}`),
          true,
          `${theme} titles use font-weight:${data.titleWeight}`,
        );
      }
    });

    it(`${layout.key} keeps its decoration out of the text it frames`, () => {
      for (const theme of ELEGANT_THEMES) {
        const html = render(layout, theme, layout.minimal);

        const decorations = [...html.matchAll(/<[a-z]+[^>]*data-decoration="[^"]*"[^>]*>/g)];

        assert.notEqual(decorations.length, 0, `${theme} draws decoration`);
        for (const decoration of decorations) {
          const index = decoration.index ?? 0;
          const tag = decoration[0];

          assert.match(tag, /aria-hidden="true"/, `${theme} decoration is hidden`);
          for (const section of sectionRanges(html)) {
            if (section.text === "") {
              continue;
            }
            assert.ok(
              index < section.start || index >= section.end,
              `${theme} decoration outside the text section at ${section.start}`,
            );
          }
        }

        // The whole ornament itself carries no text: only theme variables reach its strokes.
        for (const svg of html.matchAll(/<svg[^>]*data-ornament="[^"]*"[^>]*>([\s\S]*?)<\/svg>/g)) {
          assert.equal(textOf(svg[0]), "", `${theme} ornament carries no text`);
          assert.doesNotMatch(svg[0], /#[0-9a-f]{3,8}\b/i, `${theme} ornament color literal`);
        }
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

    it(`${layout.key} renders without a React key warning for every theme and content`, () => {
      const errors: unknown[][] = [];
      const original = console.error;

      console.error = (...args: unknown[]) => {
        errors.push(args);
      };
      try {
        for (const theme of ELEGANT_THEMES) {
          render(layout, theme);
          render(layout, theme, layout.minimal);
        }
      } finally {
        console.error = original;
      }
      assert.deepEqual(errors, []);
    });

    it(`${layout.key} places the shared features block after the details`, () => {
      const without = render(layout, ELEGANT_THEMES[0]);
      const withFeatures = renderToStaticMarkup(
        createElement(layout.Renderer, {
          configuration: { componentKey: layout.key, theme: ELEGANT_THEMES[0] },
          content: layout.full,
          features: FEATURES,
          calendarHref: "/i/abc/calendario.ics",
        }),
      );

      assert.doesNotMatch(without, /data-feature="countdown"/);
      assert.match(withFeatures, /data-feature="countdown"/);
      assert.match(withFeatures, /Escribir por WhatsApp/);
      assert.match(withFeatures, /Cómo llegar/);

      const details = withFeatures.indexOf('data-section="details"');
      const features = withFeatures.indexOf('data-feature="countdown"');
      const message = withFeatures.indexOf('data-section="message"');

      assert.ok(
        details >= 0 && features > details && message > features,
        "details, features, message",
      );
    });
  }
});

describe("the ornamental stationery", () => {
  it("frames the invitation in one centered card with a double rule", () => {
    for (const layout of LAYOUTS) {
      const html = render(layout, ELEGANT_THEMES[0]);
      const card = tagWith(html, "data-ornamental-card");
      const outer = tagWith(html, 'data-card-rule="outer"');
      const inner = tagWith(html, 'data-card-rule="inner"');

      assert.match(
        classesOf(card).join(" "),
        /bg-\(--inv-surface\)/,
        "the card is the theme surface",
      );
      assert.equal(classesOf(card).includes("text-center"), true, "one centered column");
      for (const rule of [outer, inner]) {
        assert.match(rule, /aria-hidden="true"/);
        assert.match(classesOf(rule).join(" "), /absolute/, "the rules sit at the card edge");
        assert.match(classesOf(rule).join(" "), /inset-/, "the rules are inset");
        assert.match(classesOf(rule).join(" "), /border/, "the rules are hairline borders");
      }
      assert.match(classesOf(outer).join(" "), /border-\(--inv-decoration-one\)/);
      assert.match(classesOf(inner).join(" "), /border-\(--inv-decoration-two\)/);
      assert.notEqual(
        styleOf(outer) === styleOf(inner) && outer === inner,
        true,
        "two different rules",
      );
      assert.ok(
        (outer.match(/inset-\[([\d.]+)rem\]/)?.[1] ?? "0") <
          (inner.match(/inset-\[([\d.]+)rem\]/)?.[1] ?? "0"),
        "the inner rule is inset further than the outer one",
      );
    }
  });

  it("paints textured paper from the theme's own colors", () => {
    for (const layout of LAYOUTS) {
      for (const theme of ELEGANT_THEMES) {
        const html = render(layout, theme);
        const background = tagWith(html, "data-invitation-background");
        const style = styleOf(background);

        assert.equal(classesOf(background).includes("bg-(--inv-background)"), true, theme);
        assert.match(style, /repeating-linear-gradient/, `${theme} paper fibre`);
        assert.equal((style.match(/radial-gradient/g) ?? []).length, 2, `${theme} paper washes`);
        for (const token of ["--inv-surface", "--inv-soft", "--inv-decoration-two"]) {
          assert.equal(style.includes(token), true, `${theme} paper uses ${token}`);
        }
        // No color literal ever reaches the markup: only the theme variables do.
        assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i, `${theme} paper color literal`);
        assert.doesNotMatch(style, /\b(?:rgb|hsl)a?\(/i, `${theme} paper color literal`);
      }
    }
  });

  it("draws the laurel monogram above the name, never behind it", () => {
    for (const layout of LAYOUTS) {
      for (const theme of ELEGANT_THEMES) {
        const html = render(layout, theme);
        const monogram = html.indexOf("data-monogram=");
        const name = html.indexOf("data-name-lockup=");

        assert.ok(monogram >= 0 && name >= 0, `${theme} monogram and name`);
        assert.ok(monogram < name, `${theme} monogram above the name`);
        assert.match(html, /data-laurel="left"/, `${theme} left laurel`);
        assert.match(html, /data-laurel="right"/, `${theme} right laurel`);

        const initial = tagWith(html, "data-monogram-initial");
        const initialText = textOf(
          /<[a-z]+[^>]*data-monogram-initial[^>]*>([\s\S]*?)<\/[a-z]+>/.exec(html)?.[0] ?? "",
        );

        assert.match(
          initialText,
          /^[A-ZÁÉÍÓÚÑ](?:·[A-ZÁÉÍÓÚÑ])*$/,
          `${theme} one glyph per name, joined by «·»`,
        );
        assert.match(styleOf(initial), /font-family:var\(--inv-display\)/);
      }
    }
  });

  it("sets the name in the script face every theme gets, and documents the choice per theme", () => {
    assert.deepEqual(Object.keys(ORNAMENTAL_NAME_FONT), [...ELEGANT_THEMES]);

    for (const theme of ELEGANT_THEMES) {
      const script = ORNAMENTAL_NAME_FONT[theme];

      // Great Vibes is the only script face the elegant line licenses, so it is the name of every theme;
      // `burgundy-gold` already sets its display font in it.
      assert.equal(script.fontVariable, "--font-great-vibes", theme);
      assert.match(script.fontFallback, /^[^:;]+$/, theme);

      for (const layout of LAYOUTS) {
        const html = render(layout, theme);
        const name = tagWith(html, "data-name-lockup");
        const style = styleOf(name);

        assert.equal(style.includes(`font-family:var(${script.fontVariable})`), true, theme);
        assert.match(style, /font-weight:400/, `${theme} script is never synthetically bold`);
        assert.ok(/font-size:clamp\(/.test(style), `${theme} the name scales with the viewport`);
      }

      const display = ELEGANT_THEME[theme];

      assert.equal(
        display.fontVariable === "--font-great-vibes" ||
          ORNAMENTAL_NAME_FONT[theme].fontVariable === "--font-great-vibes",
        true,
        `${theme} names the script it uses`,
      );
    }
  });

  it("draws foil-like hairlines as flat theme color with a subtle gradient", () => {
    for (const layout of LAYOUTS) {
      const html = render(layout, ELEGANT_THEMES[0]);
      const rules = [...html.matchAll(/<[a-z]+[^>]*data-foil-rule="[^"]*"[^>]*>[\s\S]*?<\/div>/g)];

      assert.notEqual(rules.length, 0, "a foil hairline is drawn");
      for (const rule of rules) {
        assert.equal(textOf(rule[0]), "", "a foil hairline carries no text");
        assert.match(styleOf(rule[0]), /linear-gradient/, "the foil is a gradient of the tokens");
        assert.match(styleOf(rule[0]), /--inv-decoration-one/);
        assert.match(styleOf(rule[0]), /--inv-decoration-two/);
        assert.doesNotMatch(styleOf(rule[0]), /#[0-9a-f]{3,8}\b/i, "no color literal");
      }
    }
  });

  it("keeps the lockup and the cameo inside the card's frame", () => {
    for (const layout of LAYOUTS) {
      const html = render(layout, ELEGANT_THEMES[0]);
      const card = html.indexOf("data-ornamental-card=");

      for (const part of [
        "data-name-lockup=",
        'data-section="cameo"',
        'data-section="family"',
        'data-section="ceremony"',
        'data-section="reception"',
        'data-section="message"',
        'data-section="rsvp"',
      ]) {
        assert.ok(html.indexOf(part) > card, `${part} inside the card`);
      }
    }
  });

  it("names the couple in two names joined by «y»", () => {
    const html = render(LAYOUTS[1] as OrnamentalCase, ELEGANT_THEMES[0]);
    const lockup = /<h1[^>]*data-name-lockup[\s\S]*?<\/h1>/.exec(html)?.[0] ?? "";

    assert.match(lockup, /Ana Sofía/);
    assert.match(lockup, /Daniel/);
    assert.match(lockup, />y</);
  });
});

describe("ornamental layout defects pinned before the browser check", () => {
  it("uses no Tailwind default-palette color utility", () => {
    const offenders = ornamentalSources().flatMap(({ file, source }) => {
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
        const classes = classesOf(tagWith(html, "data-invitation-background"));

        assert.equal(classes.includes("fixed"), true, `${theme} background is viewport-sized`);
        assert.equal(classes.includes("inset-0"), true, `${theme} background covers the viewport`);
        assert.equal(classes.includes("-z-10"), true, `${theme} background stays behind`);
        assert.equal(classes.includes("bg-(--inv-background)"), true, `${theme} paints the token`);
        assert.match(html, /<article[^>]*>\s*<div[^>]*data-invitation-background/);
      }
    }
  });

  it("keeps every ornament in proportion", () => {
    for (const layout of LAYOUTS) {
      for (const theme of ELEGANT_THEMES) {
        const html = render(layout, theme, layout.minimal);

        for (const svg of html.matchAll(/<svg[^>]*data-ornament="[^"]*"[^>]*>/g)) {
          assert.match(svg[0], /preserveAspectRatio="xMidYMid meet"/, theme);
          assert.doesNotMatch(svg[0], /preserveAspectRatio="none"/, theme);
        }
      }
    }
  });

  it("draws only original fine-line artwork with the theme's own variables", () => {
    const sources = ornamentalSources().filter(({ file }) => /ornamental-art\.ts$/.test(file));

    assert.equal(sources.length, 1, "one artwork module");
    for (const { source } of sources) {
      assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, "no color literal in the artwork");
      assert.doesNotMatch(source, /\b(?:rgb|hsl)a?\(/i, "no color literal in the artwork");
      assert.doesNotMatch(source, /<image\b|href="https?:/i, "no external image");
      assert.match(source, /var\(--inv-decoration-(?:one|two)\)/, "strokes use the tokens");
      assert.equal(ELEGANT_ORNAMENTS.length, 8);
    }
  });
});

describe("gift registry gating in the ornamental layouts (F7; S7)", () => {
  const GATE_OFF: InvitationFeatures = {
    timeZone: "America/Mexico_City",
    countdown: false,
    map: false,
    calendar: false,
    whatsapp: null,
    music: null,
    giftRegistry: false,
  };
  const GATE_ON: InvitationFeatures = { ...GATE_OFF, giftRegistry: true };
  /** The code of each layout's own gift registry value, so the check cannot match the label alone. */
  const GIFT_CODE: Readonly<Record<string, RegExp>> = {
    "xv-ornamental-01": /50894421/,
    "wedding-ornamental-01": /4471 2205/,
    "baptism-ornamental-01": /7781 2205/,
  };

  function renderGated(
    layout: OrnamentalCase,
    features: InvitationFeatures,
    content: Record<string, unknown> = layout.full,
  ): string {
    return renderToStaticMarkup(
      createElement(layout.Renderer, {
        configuration: { componentKey: layout.key, theme: ELEGANT_THEMES[0] },
        content,
        features,
      }),
    );
  }

  for (const layout of LAYOUTS) {
    const code = GIFT_CODE[layout.key] as RegExp;

    it(`${layout.key} renders its gift registry only when the gate is on`, () => {
      assert.match(renderGated(layout, GATE_ON), code);
      const gatedOff = renderGated(layout, GATE_OFF);

      assert.doesNotMatch(gatedOff, code);
      assert.doesNotMatch(gatedOff, /Mesa de regalos/);
    });

    it(`${layout.key} keeps today's rendering when no features prop is given`, () => {
      // The chooser previews and the samples render a layout with no features at all (F7).
      assert.match(render(layout, ELEGANT_THEMES[0]), code);
    });

    it(`${layout.key} renders no gift registry when the content has no value, whatever the gate says`, () => {
      const withoutGift: Record<string, unknown> = { ...layout.full };
      delete withoutGift.giftRegistry;

      assert.doesNotMatch(renderGated(layout, GATE_ON, withoutGift), /Mesa de regalos/);
    });
  }
});
