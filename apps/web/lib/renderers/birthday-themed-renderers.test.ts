import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Motif } from "../../app/_components/renderers/birthday/motif.ts";
import { THEME_VARIABLES } from "../../app/_components/renderers/birthday/theme.ts";
import { BirthdayMapRenderer } from "../../app/_components/renderers/birthday-map-01/birthday-map-renderer.ts";
import { BirthdayPosterRenderer } from "../../app/_components/renderers/birthday-poster-01/birthday-poster-renderer.ts";
import { BirthdayStoryRenderer } from "../../app/_components/renderers/birthday-story-01/birthday-story-renderer.ts";
import { themeIllustration } from "../../app/_components/renderers/illustrations/registry.ts";
import { ILLUSTRATION_PARTS } from "../../app/_components/renderers/illustrations/types.ts";
import type { InvitationFeatures } from "../invitation-features/invitation-features.ts";
import { BIRTHDAY_THEME, BIRTHDAY_THEMES, THEME_COLOR_ROLES } from "./birthday-themes.ts";

// The three themed birthday layouts (T6b; S2, S3, S5, S7, S8): each is a server component with no client
// script, its structure follows the chosen artboard in `design/birthday-adventure-v2/`, and the theme is
// applied through CSS variables so one layout serves every palette, font, and motif.

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

interface LayoutCase {
  readonly key: string;
  readonly Renderer: (props: { configuration: unknown; content: unknown }) => ReactElement;
  readonly sections: readonly string[];
  readonly age: RegExp;
  readonly time: RegExp;
  readonly structure: readonly RegExp[];
}

const LAYOUTS = [
  {
    key: "birthday-map-01",
    Renderer: BirthdayMapRenderer,
    sections: ["hero", "route", "message"],
    age: /Cumple 7 años/,
    time: /16:30 h/,
    structure: [
      /La ruta de la fiesta/,
      /¿Cuándo\?/,
      /¿A qué hora\?/,
      /¿Dónde\?/,
      /¡Gran expedición!/,
    ],
  },
  {
    key: "birthday-poster-01",
    Renderer: BirthdayPosterRenderer,
    sections: ["hero", "details", "message"],
    age: /Cumple 7 años/,
    time: /16:30/,
    structure: [/¡Es mi fiesta!/, /Tu boleto de entrada/, /¡Mateo!/],
  },
  {
    key: "birthday-story-01",
    Renderer: BirthdayStoryRenderer,
    sections: ["hero", "details", "place", "message"],
    age: /cumple <b[^>]*>7 años<\/b>/,
    time: /16:30 h/,
    structure: [
      /Había una vez/,
      /Capítulo 1 · Detalles/,
      /Capítulo 2 · Lugar/,
      /Capítulo 3 · Mensaje/,
      /y la fiesta continúa contigo/,
    ],
  },
] as const satisfies readonly LayoutCase[];

function render(
  layout: LayoutCase,
  theme: string,
  contentOverrides: Record<string, unknown> = {},
): string {
  return renderToStaticMarkup(
    createElement(layout.Renderer, {
      configuration: { componentKey: layout.key, theme },
      content: { ...CONTENT, ...contentOverrides },
    }),
  );
}

/** The `data-section` values in document order. */
function sectionsOf(html: string): string[] {
  return [...html.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1] as string);
}

describe("themed birthday layouts", () => {
  for (const layout of LAYOUTS) {
    it(`${layout.key} renders every field for all eight themes`, () => {
      assert.equal(BIRTHDAY_THEMES.length, 8);
      for (const theme of BIRTHDAY_THEMES) {
        const html = render(layout, theme);

        assert.deepEqual(sectionsOf(html), [...layout.sections], `${theme} sections`);
        assert.match(html, /Mateo/, `${theme} name`);
        assert.match(html, layout.age, `${theme} age`);
        assert.match(html, /5 de diciembre de 2026/, `${theme} date`);
        assert.match(html, layout.time, `${theme} time`);
        assert.match(html, /Jardín Los Pinos/, `${theme} location`);
        assert.match(html, /Calle Reforma 123, Guadalajara/, `${theme} address`);
        assert.match(html, /Ven a celebrar conmigo\./, `${theme} message`);
        assert.match(
          html,
          /<img[^>]*src="https:\/\/example\.com\/mateo\.jpg"[^>]*alt="Foto de Mateo"/,
          `${theme} photo`,
        );
        assert.match(html, new RegExp(`data-theme="${theme}"`), `${theme} theme attribute`);
      }
    });

    it(`${layout.key} follows the structure of its artboard`, () => {
      const html = render(layout, "ice-kingdom");

      for (const pattern of layout.structure) {
        assert.match(html, pattern, String(pattern));
      }
      assert.match(html, /<article[^>]*aria-label="Invitación de cumpleaños de Mateo"/);
    });

    it(`${layout.key} applies the theme through CSS variables and a display font`, () => {
      assert.notEqual(render(layout, "ice-kingdom"), render(layout, "dinosaurs"));

      for (const theme of BIRTHDAY_THEMES) {
        const html = render(layout, theme);
        const tokens = BIRTHDAY_THEME[theme].colors;

        for (const role of THEME_COLOR_ROLES) {
          assert.ok(
            html.includes(`${THEME_VARIABLES[role]}:${tokens[role]}`),
            `${theme} sets ${THEME_VARIABLES[role]} to ${tokens[role]}`,
          );
        }
        assert.ok(
          html.includes(`--inv-display:var(${BIRTHDAY_THEME[theme].fontVariable}`),
          `${theme} uses ${BIRTHDAY_THEME[theme].fontVariable}`,
        );
      }
    });

    it(`${layout.key} draws a decorative motif or illustration that carries no meaning`, () => {
      for (const theme of BIRTHDAY_THEMES) {
        const html = render(layout, theme);

        // A theme with a paper-cut illustration draws that instead of its motif strip (I3a; S4); either way
        // the decoration is one `aria-hidden` SVG.
        assert.match(
          html,
          themeIllustration(theme) === undefined
            ? /<svg[^>]*aria-hidden="true"[^>]*data-motif="[a-z]+"/
            : /<svg[^>]*aria-hidden="true"[^>]*data-illustration="scene"/,
          `${theme} decoration is hidden from assistive technology`,
        );
      }
    });

    it(`${layout.key} ships no client script and no inline event handler`, () => {
      const html = render(layout, "spider-hero");

      assert.doesNotMatch(html, /<script/);
      assert.doesNotMatch(html, /\son[a-z]+=/);
    });

    it(`${layout.key} escapes content so it cannot add markup`, () => {
      const html = render(layout, "classic-mouse", {
        celebrantName: "<script>alert(1)</script>",
        location: '"><img src=x onerror=alert(1)>',
        address: "Tom & Jerry's <b>place</b>",
        message: "</p><script>alert(2)</script>",
        mainPhoto: "https://example.com/a.jpg?x=1&y=2",
      });

      assert.doesNotMatch(html, /<script/);
      assert.doesNotMatch(html, /<b>/);
      assert.doesNotMatch(html, /<img src=x/);
      assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      assert.match(html, /Tom &amp; Jerry&#x27;s &lt;b&gt;place&lt;\/b&gt;/);
      assert.match(html, /src="https:\/\/example\.com\/a\.jpg\?x=1&amp;y=2"/);
    });

    it(`${layout.key} throws for props it cannot render`, () => {
      const Renderer = layout.Renderer;

      assert.throws(
        () =>
          renderToStaticMarkup(
            createElement(Renderer, {
              configuration: { componentKey: layout.key, theme: "neon" },
              content: CONTENT,
            }),
          ),
        { name: "RendererPropsError" },
      );
      assert.throws(
        () =>
          renderToStaticMarkup(
            createElement(Renderer, {
              configuration: { componentKey: layout.key, theme: "ice-kingdom" },
              content: { ...CONTENT, age: "siete" },
            }),
          ),
        { name: "RendererPropsError" },
      );
    });
  }
});

/*
 * Defects the 390 × 844 browser check found in the first version of these layouts (T6c), pinned here so the
 * same page cannot regress: the theme background must paint the page, accent surfaces must use the on-accent
 * token instead of a Tailwind default-palette color the reset palette does not emit, the motifs must not
 * distort, must not sit behind text, and must not repeat React keys, the ticket must not clip the time, the
 * polaroid caption must grow its frame, and the artboards' scroll rods, bubble tail, and compass knockouts
 * must be drawn.
 */

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

  visit(root, "svg");
  return duplicates;
}

const RENDERERS_DIRECTORY = fileURLToPath(
  new URL("../../app/_components/renderers/", import.meta.url),
);

/** Every themed renderer source under `app/_components/renderers/`. */
function themedRendererSources(): Array<{ file: string; source: string }> {
  return readdirSync(RENDERERS_DIRECTORY, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

/**
 * A Tailwind color utility from the default palette. `globals.css` resets `--color-*`, so these compile to
 * nothing and the element silently inherits or falls back. The themed layouts take every color from a theme
 * variable instead.
 */
const DEFAULT_PALETTE_UTILITY =
  /(?:^|[\s"'`])(?:text|bg|border|ring|fill|stroke|outline|from|via|to|shadow|decoration|caret|accent|placeholder|divide|divide-x|divide-y)-(?:white|black|transparent|current|inherit|slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{1,3})?(?=[\s"'`]|$)/;

/** The first HTML tag that carries `attribute`, as text. */
function tagWith(html: string, attribute: string): string {
  const tag = new RegExp(`<[a-z]+[^>]*${attribute}[^>]*>`).exec(html)?.[0];

  assert.ok(tag, `rendered markup carries ${attribute}`);
  return tag;
}

/** The class list of a tag. */
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

/** The decoration strip and everything inside it; it must hold the motif and no text at all. */
function decorationBlock(html: string): string {
  const block = /<div[^>]*data-decoration[^>]*>([\s\S]*?)<\/div>/.exec(html);

  assert.ok(block, "the layout places its motif in a data-decoration strip");
  return block[0];
}

/** The visible text of a fragment. */
function textOf(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/gi, "x")
    .trim();
}

describe("themed layout defects found by the browser check", () => {
  for (const layout of LAYOUTS) {
    it(`${layout.key} paints the theme background behind the whole page`, () => {
      for (const theme of BIRTHDAY_THEMES) {
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
      for (const theme of BIRTHDAY_THEMES) {
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
      for (const theme of BIRTHDAY_THEMES) {
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

    it(`${layout.key} renders every motif and illustration with unique React keys`, () => {
      const messages: string[] = [];
      const original = console.error;

      console.error = (...arguments_: unknown[]) => {
        messages.push(arguments_.map(String).join(" "));
      };
      try {
        for (const theme of BIRTHDAY_THEMES) {
          const motif = BIRTHDAY_THEME[theme].motif;
          const illustration = themeIllustration(theme);

          // A repeated key among siblings makes React reconcile the wrong node, and the browser console
          // reports it on every guest page. React 19 does not warn while rendering to a string, so the
          // element tree the component returns is inspected directly.
          assert.deepEqual(duplicateKeys(Motif({ motif })), [], `${theme} motif keys`);
          for (const part of ILLUSTRATION_PARTS) {
            const drawing = illustration?.[part].draw((name) => `inv-test-${name}`);

            assert.deepEqual(duplicateKeys(drawing), [], `${theme} ${part} keys`);
          }
          render(layout, theme);
        }
      } finally {
        console.error = original;
      }
      assert.deepEqual(
        messages.filter((message) => /key/i.test(message)),
        [],
        "no key warning",
      );
    });

    it(`${layout.key} uses no Tailwind default-palette color utility`, () => {
      const offenders = themedRendererSources().flatMap(({ file, source }) => {
        // Comments may name the forbidden utilities to explain the rule; only code is scanned.
        const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

        return [...code.matchAll(new RegExp(DEFAULT_PALETTE_UTILITY.source, "g"))].map(
          (match) => `${file}: ${match[0].trim()}`,
        );
      });

      assert.deepEqual(offenders, []);
    });
  }

  it("keeps the accent surfaces on the on-accent token", () => {
    for (const theme of BIRTHDAY_THEMES) {
      for (const layout of [LAYOUTS[0], LAYOUTS[1]] as const) {
        const html = render(layout, theme);

        assert.match(
          html,
          /--inv-on-accent:#ffffff/,
          `${layout.key} ${theme} exposes the on-accent color`,
        );
      }
    }
    assert.match(render(LAYOUTS[1], "classic-mouse"), /text-\(color:--inv-on-accent\)/);
    assert.match(render(LAYOUTS[0], "classic-mouse"), /text-\(color:--inv-on-accent\)/);
  });

  it("poster does not clip the time stub for any theme", () => {
    for (const theme of BIRTHDAY_THEMES) {
      const stub = tagWith(render(LAYOUTS[1], theme), "data-time-stub");
      const classes = classesOf(stub);

      assert.ok(classes.includes("whitespace-nowrap"), `${theme} time does not wrap`);
      assert.ok(!classes.includes("w-24"), `${theme} time stub is not a fixed width`);
      assert.ok(!classes.includes("overflow-hidden"), `${theme} time stub does not clip`);
    }
  });

  it("poster keeps its motif in flow above the hero, clear of the polaroid overlap", () => {
    for (const theme of BIRTHDAY_THEMES) {
      const html = render(LAYOUTS[1], theme);
      const strip = tagWith(html, "data-decoration");

      assert.ok(!classesOf(strip).includes("absolute"), `${theme} motif strip is in flow`);
      assert.ok(
        html.indexOf("data-decoration") < html.indexOf('data-section="hero"'),
        `${theme} motif strip precedes the hero text`,
      );
    }
  });

  it("poster keeps the polaroid caption in normal flow under the photo", () => {
    const html = render(LAYOUTS[1], "classic-mouse", {
      celebrantName: "Mateo Alejandro de la Santísima Trinidad y Todos los Santos del Valle",
    });
    const caption = /<figcaption([^>]*)>([\s\S]*?)<\/figcaption>/.exec(html);

    assert.ok(caption, "the poster draws a caption");
    assert.doesNotMatch(
      caption[1] ?? "",
      /absolute/,
      "the caption is not positioned over the photo",
    );
    assert.match(html, /<img[^>]*>[\s\S]*<figcaption/, "the caption follows the photo");
    assert.match(
      caption[2] ?? "",
      /Todos los Santos del Valle/,
      "the whole name is in the caption and wraps in flow",
    );
  });

  it("map draws the scroll rods and the compass knockouts", () => {
    const html = render(LAYOUTS[0], "under-the-sea");

    assert.equal([...html.matchAll(/data-scroll-rod/g)].length, 2, "two scroll rods");
    assert.equal([...html.matchAll(/data-knockout/g)].length, 4, "four compass knockouts");
  });

  it("poster draws the message bubble tail and the ticket notches", () => {
    const html = render(LAYOUTS[1], "dinosaurs");

    assert.equal([...html.matchAll(/data-bubble-tail/g)].length, 1, "one bubble tail");
    assert.equal([...html.matchAll(/data-ticket-notch/g)].length, 2, "two ticket notches");
  });
});

describe("the birthday layouts and the gift registry (F7; S7)", () => {
  // The gate the API sends for a birthday invitation. A birthday layout declares no gift registry field, so a
  // content key of that name is dropped by its parser and nothing renders: the block stays an occasion of the
  // baby shower, baptism, XV años, and wedding layouts.
  const GATE_ON: InvitationFeatures = {
    timeZone: "America/Mexico_City",
    countdown: false,
    map: false,
    calendar: false,
    whatsapp: null,
    music: null,
    giftRegistry: true,
  };

  for (const layout of LAYOUTS) {
    it(`${layout.key} renders no gift registry, even gated on and with a stored value`, () => {
      const html = renderToStaticMarkup(
        createElement(layout.Renderer, {
          configuration: { componentKey: layout.key, theme: BIRTHDAY_THEMES[0] },
          content: { ...CONTENT, giftRegistry: "Mesa de regalos · Código 5123 4471" },
          features: GATE_ON,
        }),
      );

      assert.doesNotMatch(html, /Mesa de regalos/);
      assert.doesNotMatch(html, /5123 4471/);
    });
  }
});
