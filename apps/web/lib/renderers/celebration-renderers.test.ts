import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BabyShowerClassicRenderer } from "../../app/_components/renderers/baby-shower-classic-01/baby-shower-classic-renderer.ts";
import { BaptismClassicRenderer } from "../../app/_components/renderers/baptism-classic-01/baptism-classic-renderer.ts";
import { themeIllustration } from "../../app/_components/renderers/illustrations/registry.ts";
import { CelebrationMotif } from "../../app/_components/renderers/themed/celebration-motif.ts";
import { THEME_VARIABLES } from "../../app/_components/renderers/themed/theme.ts";
import { BABY_SHOWER_THEME, BABY_SHOWER_THEMES } from "./baby-shower-themes.ts";
import { BAPTISM_THEME, BAPTISM_THEMES } from "./baptism-themes.ts";
import { THEME_COLOR_ROLES } from "./theme-tokens.ts";

// The two celebration layouts (T7c; S2, S3, S13): `baby-shower-classic-01` and `baptism-classic-01`, each a
// server component with no client script, following its board's full-page form. The theme supplies palette,
// licensed display font, and motif through CSS variables, so one layout serves every palette.

const BABY_SHOWER_CONTENT = {
  hosts: "Mariana y Lucía Ruiz",
  babyName: "Sofía",
  genderReveal: true,
  date: "2027-03-13",
  time: "12:00",
  location: "Jardín Las Palmas",
  address: "Av. de los Cedros 88, Ciudad de México",
  giftRegistry: "Mesa de regalos · Código 5123 4471",
  rsvpContact: "Confirma con Mariana al 55 1234 5678",
  message: "¡Te esperamos para celebrar la llegada de Sofía!",
  mainPhoto: "https://example.com/sofia.jpg",
};

const BAPTISM_CONTENT = {
  celebrantName: "Emilia",
  date: "2027-04-11",
  parents: "Diego y Valentina Ortiz",
  godparents: "Andrés Ortiz y Camila Reyes",
  ceremonyPlace: "Parroquia San Miguel",
  ceremonyAddress: "Calle Hidalgo 45, Centro, Querétaro",
  ceremonyTime: "11:00",
  receptionPlace: "Casa de los abuelos",
  receptionAddress: "Av. de los Fresnos 210, Querétaro",
  receptionTime: "13:30",
  giftRegistry: "Mesa de regalos · Código 7781 2205",
  rsvpContact: "Confirma con Valentina al 55 9876 5432",
  message: "Acompáñanos a dar la bienvenida a Emilia.",
  mainPhoto: "https://example.com/emilia.jpg",
};

/** The theme data a layout reads back from its own record, as the test inspects it. */
interface ThemeData {
  readonly colors: Readonly<Record<string, string>>;
  readonly fontVariable: string;
  readonly titleWeight?: string;
}

interface LayoutCase {
  readonly key: string;
  readonly Renderer: (props: { configuration: unknown; content: unknown }) => ReactElement;
  readonly themes: readonly string[];
  readonly themeRecord: Readonly<Record<string, unknown>>;
  readonly full: Record<string, unknown>;
  /** The content with only the required fields, which is what a partial draft may publish. */
  readonly minimal: Record<string, unknown>;
  readonly sections: readonly string[];
  readonly minimalSections: readonly string[];
  readonly structure: readonly RegExp[];
  readonly minimalStructure: readonly RegExp[];
  readonly name: string;
}

/** The theme a layout record holds, so a case reads as its own palette and weight. */
function themeOf(layout: LayoutCase, theme: string): ThemeData {
  const found = layout.themeRecord[theme] as ThemeData | undefined;

  assert.ok(found, `${layout.key} ${theme}`);
  return found;
}

const LAYOUTS = [
  {
    key: "baby-shower-classic-01",
    Renderer: BabyShowerClassicRenderer,
    themes: BABY_SHOWER_THEMES,
    themeRecord: BABY_SHOWER_THEME,
    full: BABY_SHOWER_CONTENT,
    minimal: {
      hosts: "Mariana y Lucía Ruiz",
      date: "2027-03-13",
      time: "12:00",
      location: "Jardín Las Palmas",
      address: "Av. de los Cedros 88, Ciudad de México",
      rsvpContact: "Confirma con Mariana al 55 1234 5678",
      message: "¡Te esperamos para celebrar!",
    },
    sections: ["hero", "details", "photo", "message", "rsvp"],
    minimalSections: ["hero", "details", "message", "rsvp"],
    structure: [
      /Baby shower de/,
      /Anfitriones/,
      /Mesa de regalos/,
      /Revelación de género/,
      /Confirma tu asistencia/,
      /12:00 h/,
      /13 de marzo de 2027/,
    ],
    minimalStructure: [
      /Mariana y Lucía Ruiz/,
      /Anfitriones/,
      /Jardín Las Palmas/,
      /Av. de los Cedros 88/,
      /12:00 h/,
      /13 de marzo de 2027/,
      /Confirma tu asistencia/,
    ],
    name: "Sofía",
  },
  {
    key: "baptism-classic-01",
    Renderer: BaptismClassicRenderer,
    themes: BAPTISM_THEMES,
    themeRecord: BAPTISM_THEME,
    full: BAPTISM_CONTENT,
    minimal: {
      celebrantName: "Emilia",
      date: "2027-04-11",
      parents: "Diego y Valentina Ortiz",
      godparents: "Andrés Ortiz y Camila Reyes",
      ceremonyPlace: "Parroquia San Miguel",
      ceremonyAddress: "Calle Hidalgo 45, Centro, Querétaro",
      ceremonyTime: "11:00",
      receptionPlace: "Casa de los abuelos",
      receptionAddress: "Av. de los Fresnos 210, Querétaro",
      receptionTime: "13:30",
      rsvpContact: "Confirma con Valentina al 55 9876 5432",
      message: "Acompáñanos a dar la bienvenida a Emilia.",
    },
    sections: ["hero", "details", "ceremony", "reception", "photo", "message", "rsvp"],
    minimalSections: ["hero", "details", "ceremony", "reception", "message", "rsvp"],
    structure: [
      /Bautizo de/,
      /Padres/,
      /Padrinos/,
      /Ceremonia/,
      /Recepción/,
      /Parroquia San Miguel/,
      /11:00 h/,
      /13:30 h/,
      /Confirma tu asistencia/,
    ],
    minimalStructure: [
      /Bautizo de/,
      /Padres/,
      /Padrinos/,
      /Ceremonia/,
      /Recepción/,
      /Parroquia San Miguel/,
      /11:00 h/,
      /13:30 h/,
      /Confirma tu asistencia/,
    ],
    name: "Emilia",
  },
] as const satisfies readonly LayoutCase[];

function render(
  layout: LayoutCase,
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

describe("celebration layouts", () => {
  for (const layout of LAYOUTS) {
    it(`${layout.key} renders every field for all of its themes`, () => {
      for (const theme of layout.themes) {
        const html = render(layout, theme);

        assert.deepEqual(sectionsOf(html), [...layout.sections], `${theme} sections`);
        for (const pattern of layout.structure) {
          assert.match(html, pattern, `${theme} ${String(pattern)}`);
        }
        assert.match(
          html,
          new RegExp(`<img[^>]*src="[^"]+"[^>]*alt="Foto de ${layout.name}"`),
          `${theme} photo with alt text`,
        );
        assert.match(html, new RegExp(`data-theme="${theme}"`), `${theme} theme attribute`);
      }
    });

    it(`${layout.key} renders nothing for the optional fields a minimal invitation lacks`, () => {
      const html = render(layout, layout.themes[0] as string, layout.minimal);

      assert.deepEqual(sectionsOf(html), [...layout.minimalSections]);
      assert.doesNotMatch(html, /<img/);
      assert.doesNotMatch(html, /Mesa de regalos/);
      assert.doesNotMatch(html, /Revelación de género/);
    });

    it(`${layout.key} keeps its required content in a minimal invitation`, () => {
      const html = render(layout, layout.themes[0] as string, layout.minimal);

      for (const pattern of layout.minimalStructure) {
        assert.match(html, pattern, String(pattern));
      }
    });

    it(`${layout.key} applies the theme through CSS variables and its display font`, () => {
      assert.notEqual(
        render(layout, layout.themes[0] as string),
        render(layout, layout.themes[1] as string),
      );

      for (const theme of layout.themes) {
        const html = render(layout, theme);
        const tokens = themeOf(layout, theme).colors;

        for (const role of THEME_COLOR_ROLES) {
          assert.ok(
            html.includes(`${THEME_VARIABLES[role]}:${tokens[role]}`),
            `${theme} sets ${THEME_VARIABLES[role]}`,
          );
        }
        assert.ok(
          html.includes(`--inv-display:var(${themeOf(layout, theme).fontVariable}`),
          `${theme} display font`,
        );
      }
    });

    it(`${layout.key} sets each title weight to the single weight its family declares`, () => {
      for (const theme of layout.themes) {
        const html = render(layout, theme);
        const weight = themeOf(layout, theme).titleWeight;

        assert.ok(weight, `${theme} declares a title weight`);
        assert.ok(
          html.includes(`font-weight:${weight}`),
          `${theme} titles use font-weight:${weight}`,
        );
        assert.doesNotMatch(html, /font-weight:bold/, `${theme} never synthesizes bold`);
      }
    });

    it(`${layout.key} draws a decorative motif or illustration that carries no meaning`, () => {
      for (const theme of layout.themes) {
        const html = render(layout, theme);

        // A theme with a paper-cut illustration draws that instead of its motif strip (I3a; S4); either way
        // the decoration is one `aria-hidden` SVG.
        assert.match(
          html,
          themeIllustration(theme) === undefined
            ? /<svg[^>]*aria-hidden="true"[^>]*data-motif="[a-z-]+"/
            : /<svg[^>]*aria-hidden="true"[^>]*data-illustration="scene"/,
          `${theme} decoration is hidden from assistive technology`,
        );
      }
    });

    it(`${layout.key} ships no client script and no inline event handler`, () => {
      const html = render(layout, layout.themes[0] as string);

      assert.doesNotMatch(html, /<script/);
      assert.doesNotMatch(html, /\son[a-z]+=/);
    });

    it(`${layout.key} escapes content so it cannot add markup`, () => {
      const html = render(layout, layout.themes[0] as string, {
        ...layout.full,
        ...(layout.key === "baby-shower-classic-01"
          ? { babyName: "<script>alert(1)</script>", hosts: '"><img src=x onerror=alert(1)>' }
          : { celebrantName: "<script>alert(1)</script>" }),
        ceremonyPlace: '"><img src=x onerror=alert(1)>',
        location: '"><img src=x onerror=alert(1)>',
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
              configuration: { componentKey: layout.key, theme: layout.themes[0] },
              content: { ...layout.minimal, date: "2027-02-30" },
            }),
          ),
        { name: "RendererPropsError" },
      );
    });
  }
});

/*
 * Defects the birthday browser check found in T6c, pinned here for the celebration layouts before a browser
 * ever renders them: the theme background must paint the page, accent surfaces use the on-accent token, the
 * motif keeps its proportions, sits outside the text, and repeats no React key, and no component uses a
 * Tailwind default-palette utility the reset palette does not emit.
 */

function isElement(
  value: unknown,
): value is { readonly key: string | null; readonly props: unknown } {
  return typeof value === "object" && value !== null && "props" in value && "$$typeof" in value;
}

/** The sibling key lists that repeat a key, with their path, in the element tree of `root`. */
function duplicateKeys(root: unknown): string[] {
  const duplicates: string[] = [];

  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      const keys = node
        .filter(isElement)
        .map((element, index, elements) => element.key ?? `index:${index}:${elements.length}`);
      const repeated = keys.filter((key, index) => keys.indexOf(key) !== index);

      if (repeated.length > 0) {
        duplicates.push(`${path}: ${[...new Set(repeated)].join(", ")}`);
      }
      node.forEach((child, index) => {
        visit(child, `${path}[${index}]`);
      });
      return;
    }
    if (isElement(node)) {
      visit((node.props as { children?: unknown }).children, path);
    }
  };

  visit(root, "svg");
  return duplicates;
}

const RENDERERS_DIRECTORY = fileURLToPath(
  new URL("../../app/_components/renderers/", import.meta.url),
);

function themedRendererSources(): Array<{ file: string; source: string }> {
  return readdirSync(RENDERERS_DIRECTORY, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

const DEFAULT_PALETTE_UTILITY =
  /(?:^|[\s"'`])(?:text|bg|border|ring|fill|stroke|outline|from|via|to|shadow|decoration|caret|accent|placeholder|divide|divide-x|divide-y)-(?:white|black|transparent|current|inherit|slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{1,3})?(?=[\s"'`]|$)/;

function tagWith(html: string, attribute: string): string {
  const tag = new RegExp(`<[a-z]+[^>]*${attribute}[^>]*>`).exec(html)?.[0];

  assert.ok(tag, `rendered markup carries ${attribute}`);
  return tag;
}

function classesOf(tag: string): string[] {
  const classes = /class="([^"]*)"/.exec(tag)?.[1] ?? "";

  return classes.split(/\s+/).filter(Boolean);
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

function decorationBlock(html: string): string {
  const block = /<div[^>]*data-decoration[^>]*>([\s\S]*?)<\/div>/.exec(html);

  assert.ok(block, "the layout places its motif in a data-decoration strip");
  return block[0];
}

function textOf(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, "x")
    .trim();
}

describe("celebration layout defects pinned before the browser check", () => {
  for (const layout of LAYOUTS) {
    it(`${layout.key} paints the theme background behind the whole page`, () => {
      for (const theme of layout.themes) {
        const html = render(layout, theme);
        const classes = classesOf(tagWith(html, "data-invitation-background"));

        assert.ok(classes.includes("fixed"), `${theme} background is viewport-sized`);
        assert.ok(classes.includes("inset-0"), `${theme} background covers the viewport`);
        assert.ok(classes.includes("-z-10"), `${theme} background stays behind the content`);
        assert.ok(
          classes.includes("bg-(--inv-background)"),
          `${theme} background paints the theme background token`,
        );
        assert.match(html, /<article[^>]*>\s*<div[^>]*data-invitation-background/);
      }
    });

    it(`${layout.key} never distorts its decoration`, () => {
      for (const theme of layout.themes) {
        const html = render(layout, theme);
        const illustrations = [...html.matchAll(/<svg[^>]*data-illustration="[a-z]+"[^>]*>/g)].map(
          (match) => match[0],
        );
        const decorations =
          illustrations.length > 0 ? illustrations : [tagWith(html, "data-motif")];

        for (const decoration of decorations) {
          assert.match(
            decoration,
            /preserveAspectRatio="xMidYMid (?:meet|slice)"/,
            `${theme} decoration keeps its aspect`,
          );
          assert.doesNotMatch(
            decoration,
            /preserveAspectRatio="none"/,
            `${theme} decoration is not stretched`,
          );
        }
      }
    });

    it(`${layout.key} keeps every decoration zone out of the text sections`, () => {
      for (const theme of layout.themes) {
        const html = render(layout, theme);
        const zones = [...html.matchAll(/<div[^>]*data-decoration[^>]*>[\s\S]*?<\/div>/g)];

        assert.ok(zones.length >= 1, `${theme} decoration zones`);
        for (const zone of zones) {
          const index = zone.index ?? 0;

          for (const [start, end] of sectionRanges(html)) {
            assert.ok(
              index < start || index >= end,
              `${theme} decoration sits outside the section at ${start}`,
            );
          }
          assert.equal(textOf(zone[0]), "", `${theme} decoration carries no text`);
        }
        assert.equal(textOf(decorationBlock(html)), "", `${theme} decoration carries no text`);
      }
    });

    it(`${layout.key} uses no Tailwind default-palette color utility`, () => {
      const offenders = themedRendererSources().flatMap(({ file, source }) => {
        const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

        return [...code.matchAll(new RegExp(DEFAULT_PALETTE_UTILITY.source, "g"))].map(
          (match) => `${file}: ${match[0].trim()}`,
        );
      });

      assert.deepEqual(offenders, []);
    });

    it(`${layout.key} keeps the accent surfaces on the on-accent token`, () => {
      for (const theme of layout.themes) {
        const html = render(layout, theme);

        assert.match(html, /--inv-on-accent:#ffffff/, `${theme} exposes the on-accent color`);
        assert.match(html, /text-\(color:--inv-on-accent\)/, `${theme} uses the on-accent token`);
      }
    });
  }

  it("draws every celebration motif with unique React keys", () => {
    const motifs = [
      ...BABY_SHOWER_THEMES.map((theme) => BABY_SHOWER_THEME[theme].motif),
      ...BAPTISM_THEMES.map((theme) => BAPTISM_THEME[theme].motif),
    ];

    assert.equal(motifs.length, 14);
    for (const motif of motifs) {
      for (const tone of ["accent", "paper"] as const) {
        assert.deepEqual(
          duplicateKeys(CelebrationMotif({ motif, tone })),
          [],
          `${motif} ${tone} motif keys`,
        );
      }
    }
  });
});
