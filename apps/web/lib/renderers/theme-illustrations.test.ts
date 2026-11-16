import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BabyShowerClassicRenderer } from "../../app/_components/renderers/baby-shower-classic-01/baby-shower-classic-renderer.ts";
import { BaptismClassicRenderer } from "../../app/_components/renderers/baptism-classic-01/baptism-classic-renderer.ts";
import { Motif } from "../../app/_components/renderers/birthday/motif.ts";
import { BirthdayMapRenderer } from "../../app/_components/renderers/birthday-map-01/birthday-map-renderer.ts";
import { BirthdayPosterRenderer } from "../../app/_components/renderers/birthday-poster-01/birthday-poster-renderer.ts";
import { BirthdayStoryRenderer } from "../../app/_components/renderers/birthday-story-01/birthday-story-renderer.ts";
import { DecorationZone } from "../../app/_components/renderers/illustrations/decoration.ts";
import { IllustrationVignette } from "../../app/_components/renderers/illustrations/frame.ts";
import {
  illustratedThemes,
  THEME_ILLUSTRATIONS,
  themeIllustration,
} from "../../app/_components/renderers/illustrations/registry.ts";
import {
  ILLUSTRATION_PARTS,
  type IllustrationPart,
  type ThemeIllustration,
} from "../../app/_components/renderers/illustrations/types.ts";
import { CelebrationMotif } from "../../app/_components/renderers/themed/celebration-motif.ts";
import {
  BABY_SHOWER_THEME,
  BABY_SHOWER_THEMES,
  type BabyShowerMotif,
} from "./baby-shower-themes.ts";
import { BAPTISM_THEME, BAPTISM_THEMES } from "./baptism-themes.ts";
import { BIRTHDAY_THEME, BIRTHDAY_THEMES, type BirthdayMotif } from "./birthday-themes.ts";

/*
 * The paper-cut illustration system (I3a; S1-S4) and its placement in the five themed layouts. A theme may
 * carry an original drawing of layered flat sheets — a header diorama, a torn divider, and a footer strip —
 * coloured only through the theme's CSS variables, so one drawing re-colours with its theme. A theme without
 * an illustration keeps exactly the motif strip the layouts drew before, which is why the fallback cases here
 * compare against the motif component rendered in the same test rather than against git history.
 *
 * The technique is the owner's chosen artboard, `design/theme-illustrations/01-papel-recortado.html` (S4):
 * every element is its own cut sheet with a short offset shadow, the top edge is torn rather than cut, and one
 * grain filter is multiplied over the scene. It is mapped to this project's renderer style, never copied.
 */

const CONTENT = {
  celebrantName: "Mateo",
  age: 7,
  date: "2026-12-05",
  time: "16:30",
  location: "Jardín Los Pinos",
  address: "Calle Reforma 123, Guadalajara",
  mainPhoto: "https://example.com/mateo.jpg",
  message: "Ven a celebrar conmigo.",
};

const BABY_SHOWER_CONTENT = {
  hosts: "Mariana y Lucía Ruiz",
  date: "2027-03-13",
  time: "12:00",
  location: "Jardín Las Palmas",
  address: "Av. de los Cedros 88, Ciudad de México",
  rsvpContact: "Confirma con Mariana al 55 1234 5678",
  message: "¡Te esperamos para celebrar!",
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
  rsvpContact: "Confirma con Valentina al 55 9876 5432",
  message: "Acompáñanos a dar la bienvenida a Emilia.",
};

/** The theme keys of the three occasions; `distinct strings` is what lets one registry serve all of them. */
const ALL_THEME_KEYS: readonly string[] = [
  ...BIRTHDAY_THEMES,
  ...BABY_SHOWER_THEMES,
  ...BAPTISM_THEMES,
];

/** The eight colors a drawing may use: the seven theme tokens plus the on-accent contrast partner. */
const THEME_PAINTS = [
  "var(--inv-background)",
  "var(--inv-surface)",
  "var(--inv-soft)",
  "var(--inv-ink)",
  "var(--inv-accent)",
  "var(--inv-decoration-one)",
  "var(--inv-decoration-two)",
  "var(--inv-on-accent)",
] as const;

/** A paint a drawing may write: a theme variable, or one of the three that carry no color of their own. */
const ALLOWED_PAINT = /^(?:none|transparent|currentColor|var\(--inv-[a-z-]+\))$/;

/** The markup budget of one theme's three parts (S4, raised for richer scenes in L6): still cheap to ship inline. */
const MARKUP_BUDGET = 40 * 1024;

function renderElement(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

function renderLayout(
  Renderer: (props: { configuration: unknown; content: unknown }) => ReactElement,
  key: string,
  theme: string,
  content: Record<string, unknown> = CONTENT,
): string {
  return renderElement(
    createElement(Renderer, { configuration: { componentKey: key, theme }, content }),
  );
}

/** The markup of one illustration part, through the frame a layout renders it with. */
function renderPart(illustration: ThemeIllustration, part: IllustrationPart): string {
  return renderElement(createElement(IllustrationVignette, { illustration, part }));
}

/** Every `data-decoration` zone: its index in the document and its own markup. */
function decorationZones(html: string): Array<{ index: number; markup: string }> {
  return [...html.matchAll(/<div[^>]*data-decoration[^>]*>[\s\S]*?<\/div>/g)].map((match) => ({
    index: match.index ?? 0,
    markup: match[0],
  }));
}

/** The top-level `data-section` elements: name, and the index range each one occupies. */
function sectionRanges(html: string): Array<{ name: string; start: number; end: number }> {
  const ranges: Array<{ name: string; start: number; end: number }> = [];
  let open = -1;
  let name = "";

  for (const match of html.matchAll(/<section[^>]*data-section="([^"]+)"[^>]*>|<\/section>/g)) {
    if (match[0].startsWith("</")) {
      ranges.push({ name, start: open, end: (match.index ?? 0) + match[0].length });
      open = -1;
    } else {
      open = match.index ?? 0;
      name = match[1] as string;
    }
  }
  return ranges;
}

/** The visible text of a fragment. */
function textOf(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, "x")
    .trim();
}

/** Whether a value is a React element this walk can inspect. */
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

  visit(root, "drawing");
  return duplicates;
}

const ILLUSTRATIONS_DIRECTORY = fileURLToPath(
  new URL("../../app/_components/renderers/illustrations/", import.meta.url),
);

describe("the theme illustration registry", () => {
  it("holds exactly the 22 catalog theme keys — 8 birthday, 8 baby shower, 6 baptism — and nothing else", () => {
    const catalog = [...BIRTHDAY_THEMES, ...BABY_SHOWER_THEMES, ...BAPTISM_THEMES];

    assert.equal(BIRTHDAY_THEMES.length, 8, "birthday themes");
    assert.equal(BABY_SHOWER_THEMES.length, 8, "baby shower themes");
    assert.equal(BAPTISM_THEMES.length, 6, "baptism themes");
    assert.equal(catalog.length, 22, "the catalog holds 22 guest themes");
    assert.deepEqual(
      [...illustratedThemes()].sort(),
      [...catalog].sort(),
      "every catalog theme has a drawing, and no other key is registered",
    );
    for (const theme of catalog) {
      assert.equal(themeIllustration(theme)?.theme, theme, `${theme} is filed under its own key`);
    }
  });

  it("answers undefined for a theme key it does not hold, never a prototype value", () => {
    for (const key of ["", "no-such-theme", "constructor", "__proto__", "toString"]) {
      assert.equal(themeIllustration(key), undefined, key);
      assert.equal(Object.hasOwn(THEME_ILLUSTRATIONS, key), false, key);
    }
  });

  it("only keys illustrations by a theme the catalog knows", () => {
    for (const theme of illustratedThemes()) {
      assert.ok(ALL_THEME_KEYS.includes(theme), `${theme} is a catalog theme key`);
      assert.equal(themeIllustration(theme)?.theme, theme, `${theme} is filed under its own key`);
    }
    assert.equal(new Set(ALL_THEME_KEYS).size, ALL_THEME_KEYS.length, "theme keys are distinct");
  });

  it("holds one file per theme, and registers every theme file it holds", () => {
    const files = readdirSync(ILLUSTRATIONS_DIRECTORY)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => file.slice(0, -".ts".length));

    for (const theme of illustratedThemes()) {
      assert.ok(
        files.includes(theme),
        `the illustration of ${theme} lives in its own ${theme}.ts (one file per theme)`,
      );
    }
    for (const file of files) {
      if (ALL_THEME_KEYS.includes(file)) {
        assert.ok(
          illustratedThemes().includes(file),
          `${file}.ts is a theme drawing, so the registry lists it`,
        );
      }
    }
  });
});

describe("a theme illustration", () => {
  for (const theme of illustratedThemes()) {
    it(`${theme} draws a scene, a divider, and a footer, each hidden from assistive technology`, () => {
      const illustration = themeIllustration(theme);

      assert.ok(illustration, theme);
      for (const part of ILLUSTRATION_PARTS) {
        const markup = renderPart(illustration, part);

        assert.match(
          markup,
          new RegExp(`^<svg aria-hidden="true" focusable="false" data-illustration="${part}"`),
          `${theme} ${part} is decoration`,
        );
        assert.equal(textOf(markup), "", `${theme} ${part} carries no text`);
        assert.doesNotMatch(markup, /<script/, `${theme} ${part} ships no script`);
      }
    });

    it(`${theme} uses the theme variables and no literal color`, () => {
      const illustration = themeIllustration(theme);

      assert.ok(illustration, theme);
      for (const part of ILLUSTRATION_PARTS) {
        const markup = renderPart(illustration, part);
        const paints = [...markup.matchAll(/\s(?:fill|stroke)="([^"]*)"/g)].map(
          (match) => match[1] as string,
        );

        assert.ok(paints.length > 0, `${theme} ${part} paints its sheets`);
        for (const paint of paints) {
          assert.match(paint, ALLOWED_PAINT, `${theme} ${part} paint ${paint}`);
          assert.ok(
            (THEME_PAINTS as readonly string[]).includes(paint) || !paint.startsWith("var("),
            `${theme} ${part} ${paint} is one of the eight theme variables`,
          );
        }
        assert.doesNotMatch(markup, /#[0-9a-fA-F]{3}/, `${theme} ${part} carries no hex color`);
        assert.doesNotMatch(markup, /\brgba?\(|\bhsla?\(/, `${theme} ${part} carries no rgb color`);
      }
    });

    it(`${theme} keeps its markup under the budget of one theme`, () => {
      const illustration = themeIllustration(theme);

      assert.ok(illustration, theme);
      const markup = ILLUSTRATION_PARTS.map((part) => renderPart(illustration, part)).join("");

      assert.ok(
        Buffer.byteLength(markup, "utf8") <= MARKUP_BUDGET,
        `${theme} illustration is ${Buffer.byteLength(markup, "utf8")} bytes, budget ${MARKUP_BUDGET}`,
      );
    });

    it(`${theme} repeats no React key in any part`, () => {
      const illustration = themeIllustration(theme);

      assert.ok(illustration, theme);
      for (const part of ILLUSTRATION_PARTS) {
        const drawing = illustration[part].draw((name) => `inv-test-${name}`);

        assert.deepEqual(duplicateKeys(drawing), [], `${theme} ${part} keys`);
      }
    });

    it(`${theme} draws its grain filter once and with an id the frame makes unique`, () => {
      const illustration = themeIllustration(theme);

      assert.ok(illustration, theme);
      const markup = renderPart(illustration, "scene");
      const filterIds = [...markup.matchAll(/<filter id="([^"]+)"/g)].map(
        (match) => match[1] as string,
      );

      assert.ok(filterIds.length >= 1, `${theme} scene carries the paper grain`);
      for (const id of filterIds) {
        assert.match(id, /^inv-[A-Za-z0-9_-]+-/, `${id} is prefixed by the render`);
        assert.ok(markup.includes(`url(#${id})`), `${id} is used by the scene`);
      }
    });
  }

  it("gives two invitations on one page their own filter ids", () => {
    // Two invitations render inside one React tree on a page that shows samples, so the frame's ids must not
    // collide: a shared id would make one invitation's grain use the other's filter.
    const html = renderElement(
      createElement(
        "div",
        null,
        createElement(BirthdayPosterRenderer, {
          configuration: { componentKey: "birthday-poster-01", theme: "dinosaurs" },
          content: CONTENT,
        }),
        createElement(BirthdayPosterRenderer, {
          configuration: { componentKey: "birthday-poster-01", theme: "dinosaurs" },
          content: CONTENT,
        }),
      ),
    );
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1] as string);
    const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);

    assert.equal(ids.length, new Set(ids).size, `repeated ids: ${repeated.join(", ")}`);
    for (const reference of html.matchAll(/(?:url\(#|href="#)([^)"]+)/g)) {
      assert.ok(ids.includes(reference[1] as string), `${reference[1]} exists in the page`);
    }
  });
});

interface FallbackShape {
  /** The layout shape a motif strip belongs to; the two celebration layouts share one shape. */
  readonly shape: string;
  /** The zone classes that strip has always carried, verbatim. */
  readonly className: string;
  /** The motif that strip hangs, rendered by the layout's own motif component. */
  readonly motif: (motif: string) => ReactElement;
}

/** The fallback strip of the Cartel layout: the motif sits in the accent band's empty top row. */
const POSTER_STRIP: FallbackShape = {
  shape: "poster accent strip",
  className: "pointer-events-none flex h-16 justify-center px-6 pt-4",
  motif: (motif) => createElement(Motif, { motif: motif as BirthdayMotif, tone: "accent" }),
};

/** The fallback strip of the Mapa layout: a tall motif row above the hero. */
const MAP_STRIP: FallbackShape = {
  shape: "map motif row",
  className: "pointer-events-none flex h-24 justify-center",
  motif: (motif) => createElement(Motif, { motif: motif as BirthdayMotif, tone: "paper" }),
};

/** The fallback strip of the Cuento layout: the motif at the foot of the page sheet. */
const STORY_STRIP: FallbackShape = {
  shape: "story foot strip",
  className: "pointer-events-none mt-6 flex h-20 justify-center",
  motif: (motif) => createElement(Motif, { motif: motif as BirthdayMotif, tone: "paper" }),
};

/** The fallback strip of the two celebration layouts: the motif row above their accent band. */
const CELEBRATION_STRIP: FallbackShape = {
  shape: "celebration motif row",
  className: "pointer-events-none flex h-20 justify-center",
  motif: (motif) =>
    createElement(CelebrationMotif, { motif: motif as BabyShowerMotif, tone: "paper" }),
};

/** One fallback case per layout shape: the poster strip, the map, the story, and the celebration. */
const FALLBACK_SHAPES: readonly FallbackShape[] = [
  POSTER_STRIP,
  MAP_STRIP,
  STORY_STRIP,
  CELEBRATION_STRIP,
];

interface LayoutCase {
  readonly key: string;
  readonly Renderer: (props: { configuration: unknown; content: unknown }) => ReactElement;
  readonly themes: readonly string[];
  readonly content: Record<string, unknown>;
  /** A real theme whose drawing the fallback test removes for one render, to reach the layout's strip. */
  readonly fallbackTheme: string;
  /** The shape whose strip this layout hangs when its theme has no drawing. */
  readonly fallbackShape: FallbackShape;
  /** The section that holds the details, which the paper-cut divider follows. */
  readonly detailsSection: string;
}

const LAYOUTS: readonly LayoutCase[] = [
  {
    key: "birthday-map-01",
    Renderer: BirthdayMapRenderer,
    themes: BIRTHDAY_THEMES,
    content: CONTENT,
    fallbackTheme: "ice-kingdom",
    fallbackShape: MAP_STRIP,
    detailsSection: "route",
  },
  {
    key: "birthday-poster-01",
    Renderer: BirthdayPosterRenderer,
    themes: BIRTHDAY_THEMES,
    content: CONTENT,
    fallbackTheme: "ice-kingdom",
    fallbackShape: POSTER_STRIP,
    detailsSection: "details",
  },
  {
    key: "birthday-story-01",
    Renderer: BirthdayStoryRenderer,
    themes: BIRTHDAY_THEMES,
    content: CONTENT,
    fallbackTheme: "ice-kingdom",
    fallbackShape: STORY_STRIP,
    detailsSection: "place",
  },
  {
    key: "baby-shower-classic-01",
    Renderer: BabyShowerClassicRenderer,
    themes: BABY_SHOWER_THEMES,
    content: BABY_SHOWER_CONTENT,
    fallbackTheme: "teddy-honey",
    fallbackShape: CELEBRATION_STRIP,
    detailsSection: "details",
  },
  {
    key: "baptism-classic-01",
    Renderer: BaptismClassicRenderer,
    themes: BAPTISM_THEMES,
    content: BAPTISM_CONTENT,
    fallbackTheme: "dove-olive",
    fallbackShape: CELEBRATION_STRIP,
    detailsSection: "reception",
  },
];

/** The motif a theme draws, read from the record the layout itself reads. */
function motifOf(theme: string): string {
  const record: Readonly<Record<string, { readonly motif: string }>> = {
    ...BIRTHDAY_THEME,
    ...BABY_SHOWER_THEME,
    ...BAPTISM_THEME,
  };
  const found = record[theme];

  assert.ok(found, `${theme} is a theme`);
  return found.motif;
}

/**
 * The registry with one theme's drawing removed for the duration of `run`, and put back in `finally`. Every
 * catalog theme has a drawing today, so a layout can only reach its fallback strip with a key the registry does
 * not hold; removing the entry for one render lets a real theme key still exercise that path.
 */
function withoutIllustration<T>(theme: string, run: () => T): T {
  const registry = THEME_ILLUSTRATIONS as Record<string, ThemeIllustration | undefined>;
  const drawing = registry[theme];

  assert.ok(drawing, `${theme} has a drawing to remove`);
  delete registry[theme];
  try {
    return run();
  } finally {
    registry[theme] = drawing;
  }
}

describe("the motif strip a theme without an illustration keeps", () => {
  // No catalog theme is without a drawing any more, so the zone is rendered directly with an unregistered key
  // and each layout shape's own fallback: the strip must stay byte-identical to the motif component.
  for (const shape of FALLBACK_SHAPES) {
    it(`DecorationZone draws the ${shape.shape} for a theme with no drawing`, () => {
      const theme = "no-such-theme";
      const motif = "dino";

      assert.equal(themeIllustration(theme), undefined, `${theme} has no drawing`);
      const zone = renderElement(
        createElement(DecorationZone, {
          theme,
          part: "scene",
          illustrationClassName: "pointer-events-none block",
          fallback: { node: shape.motif(motif), className: shape.className },
        }),
      );

      assert.equal(
        zone,
        `<div aria-hidden="true" data-decoration="" class="${shape.className}">` +
          `${renderElement(shape.motif(motif))}</div>`,
        `${shape.shape} fallback markup`,
      );
      assert.doesNotMatch(zone, /data-illustration=/, `${shape.shape} draws no illustration`);
    });
  }

  for (const layout of LAYOUTS) {
    it(`${layout.key} renders the same motif strip it rendered before the illustrations`, () => {
      const html = withoutIllustration(layout.fallbackTheme, () =>
        renderLayout(layout.Renderer, layout.key, layout.fallbackTheme, layout.content),
      );
      const zone = decorationZones(html)[0];

      assert.ok(zone, `${layout.key} draws its motif strip`);
      assert.equal(
        zone.markup,
        `<div aria-hidden="true" data-decoration="" class="${layout.fallbackShape.className}">` +
          `${renderElement(layout.fallbackShape.motif(motifOf(layout.fallbackTheme)))}</div>`,
        `${layout.key} fallback markup`,
      );
      assert.doesNotMatch(html, /data-illustration=/, `${layout.key} draws no illustration`);
    });
  }
});

describe("every decoration zone stays out of the text", () => {
  for (const layout of LAYOUTS) {
    it(`${layout.key} keeps its decoration outside every section, for every theme`, () => {
      for (const theme of layout.themes) {
        const html = renderLayout(layout.Renderer, layout.key, theme, layout.content);
        const ranges = sectionRanges(html);
        const zones = decorationZones(html);

        assert.ok(zones.length >= 1, `${layout.key} ${theme} draws decoration`);
        assert.equal(
          ranges.length,
          [...html.matchAll(/<section[^>]*data-section=/g)].length,
          `${layout.key} ${theme} sections pair up`,
        );
        for (const zone of zones) {
          for (const range of ranges) {
            assert.ok(
              zone.index < range.start || zone.index >= range.end,
              `${layout.key} ${theme} decoration overlaps the ${range.name} section`,
            );
          }
          assert.equal(
            textOf(zone.markup),
            "",
            `${layout.key} ${theme} decoration carries no text`,
          );
          assert.match(zone.markup, /aria-hidden="true"/, `${layout.key} ${theme} is aria-hidden`);
        }
      }
    });
  }
});

describe("the paper-cut illustration in the layouts", () => {
  for (const layout of LAYOUTS) {
    const theme = layout.themes[0] as string;

    it(`${layout.key} draws the scene, the divider, and the footer for ${theme}`, () => {
      const html = renderLayout(layout.Renderer, layout.key, theme, layout.content);
      const parts = [...html.matchAll(/data-illustration="([a-z]+)"/g)].map(
        (match) => match[1] as string,
      );

      assert.deepEqual(parts, ["scene", "divider", "footer"], `${layout.key} parts`);
      assert.doesNotMatch(html, /data-motif=/, `${layout.key} replaces the motif strip`);

      const ranges = sectionRanges(html);
      const scene = html.indexOf('data-illustration="scene"');
      const divider = html.indexOf('data-illustration="divider"');
      const footer = html.indexOf('data-illustration="footer"');
      const details = ranges.find((range) => range.name === layout.detailsSection);
      const message = ranges.find((range) => range.name === "message");
      const first = ranges[0];
      const last = ranges[ranges.length - 1];

      assert.ok(first, `${layout.key} has a first section`);
      assert.ok(details, `${layout.key} has its ${layout.detailsSection} section`);
      assert.ok(message, `${layout.key} has its message section`);
      assert.ok(last, `${layout.key} has sections`);
      assert.ok(scene < first.start, `${layout.key} scene precedes the hero`);
      assert.ok(divider > details.end, `${layout.key} divider follows the ${details.name} section`);
      assert.ok(divider < message.start, `${layout.key} divider precedes the message`);
      assert.ok(footer > last.end, `${layout.key} footer closes the page`);
    });

    it(`${layout.key} keeps the scene out of the way of the text for ${theme}`, () => {
      const html = renderLayout(layout.Renderer, layout.key, theme, layout.content);
      const scene = decorationZones(html)[0];

      assert.ok(scene, `${layout.key} scene zone`);
      assert.match(
        scene.markup,
        /preserveAspectRatio="xMidYMid slice"/,
        `${layout.key} scene fills`,
      );
      assert.doesNotMatch(scene.markup, /preserveAspectRatio="none"/, `${layout.key} scene holds`);
    });

    it(`${layout.key} ships no client script for the illustrations`, () => {
      const html = renderLayout(layout.Renderer, layout.key, theme, layout.content);

      assert.doesNotMatch(html, /<script/);
      assert.doesNotMatch(html, /\son[a-z]+=/);
    });
  }
});

describe("the illustration sources", () => {
  const sources = readdirSync(ILLUSTRATIONS_DIRECTORY)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => ({
      file,
      // Comments may name a hex color to explain the rule; only code is scanned.
      code: readFileSync(join(ILLUSTRATIONS_DIRECTORY, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, ""),
    }));

  it("never writes a literal color", () => {
    for (const { file, code } of sources) {
      assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b/, `${file} hex color`);
      assert.doesNotMatch(code, /\brgba?\(|\bhsla?\(/, `${file} functional color`);
    }
  });

  it("never writes a Tailwind default-palette utility", () => {
    const defaultPalette =
      /(?:^|[\s"'`])(?:text|bg|border|ring|fill|stroke|outline|from|via|to|shadow|decoration|caret|accent|placeholder|divide)-(?:white|black|transparent|current|inherit|slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{1,3})?(?=[\s"'`]|$)/;

    for (const { file, code } of sources) {
      assert.deepEqual(
        [...code.matchAll(new RegExp(defaultPalette.source, "g"))].map((match) => match[0]),
        [],
        file,
      );
    }
  });
});
