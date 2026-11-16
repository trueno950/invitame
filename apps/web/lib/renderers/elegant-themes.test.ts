import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { contrastRatio } from "../theme/contrast.ts";
import {
  ARCH_SCRIM_INK_PERCENT,
  ELEGANT_ORNAMENTS,
  ELEGANT_THEME,
  ELEGANT_THEMES,
  type ElegantThemeKey,
  isElegantTheme,
  scrimColorOver,
} from "./elegant-themes.ts";
import { THEME_COLOR_ROLES } from "./theme-tokens.ts";

// The eight elegant themes the owner approved (E3c; S4), taken from
// `design/elegant-line/04-tablero-temas-elegantes.html`. A theme is a palette of seven colors, one licensed
// display font at the single weight `app/layout.tsx` declares for it, and one original fine-line ornament.
// Every text pair reaches 4.5:1, and the arch scrim keeps the name readable over the worst-case photo.

/** Each palette as the board shows it: background, surface, soft, ink, accent, decoration 1, decoration 2. */
const HEX = /^#[0-9a-f]{6}$/;

interface ExpectedTheme {
  displayName: string;
  fontVariable: string;
  titleWeight: string;
  ornament: string;
  colors: readonly [string, string, string, string, string, string, string];
}

const ELEGANT: Readonly<Record<ElegantThemeKey, ExpectedTheme>> = {
  "blush-gold": {
    displayName: "Rosa empolvado y oro",
    fontVariable: "--font-playfair-display",
    titleWeight: "700",
    ornament: "rose",
    colors: ["#faf0ee", "#fffdfc", "#f3dcdf", "#2b1f22", "#8a3e52", "#c99a62", "#e3b7be"],
  },
  "ivory-black": {
    displayName: "Marfil y negro",
    fontVariable: "--font-bodoni-moda",
    titleWeight: "500",
    ornament: "rules",
    colors: ["#f3f0e9", "#fbfaf6", "#e4dfd3", "#16150f", "#4a4238", "#a98f5e", "#8c8578"],
  },
  "midnight-gold": {
    displayName: "Azul medianoche y oro",
    fontVariable: "--font-cinzel-decorative",
    titleWeight: "400",
    ornament: "star",
    colors: ["#eef1f5", "#ffffff", "#dde3ec", "#101a2b", "#1e3355", "#c6a15b", "#8fa3be"],
  },
  "olive-cream": {
    displayName: "Verde olivo y crema",
    fontVariable: "--font-lora",
    titleWeight: "700",
    ornament: "olive",
    colors: ["#f5f2e8", "#fffdf7", "#e5e3ce", "#23281c", "#4a5a34", "#a8b48a", "#c7b98d"],
  },
  champagne: {
    displayName: "Champaña",
    fontVariable: "--font-cormorant-garamond",
    titleWeight: "500",
    ornament: "laurel",
    colors: ["#f7f0df", "#fffcf2", "#efe2c6", "#2a2318", "#6a4a16", "#b08a3c", "#d8c48e"],
  },
  "lavender-silver": {
    displayName: "Lavanda y plata",
    fontVariable: "--font-italiana",
    titleWeight: "400",
    ornament: "lavender",
    colors: ["#f4f2f7", "#ffffff", "#e5e0ee", "#221e2b", "#4c3d63", "#a9a2b8", "#c8bfd9"],
  },
  "terracotta-sage": {
    displayName: "Terracota y salvia",
    fontVariable: "--font-josefin-sans",
    titleWeight: "600",
    ornament: "arch",
    colors: ["#faf3ee", "#fffdfb", "#f0e1d7", "#2c211d", "#8a4a2f", "#a9b39b", "#c98e6e"],
  },
  "burgundy-gold": {
    displayName: "Borgoña y oro",
    fontVariable: "--font-great-vibes",
    titleWeight: "400",
    ornament: "volutes",
    colors: ["#f8f0f0", "#fffcfc", "#eedcdc", "#241417", "#6b1f33", "#c09a5a", "#b0808c"],
  },
};

/**
 * The single weight `app/layout.tsx` declares for each display family. A theme title sets exactly its
 * family's weight: a face loaded at one weight would otherwise be synthetically emboldened.
 */
const DECLARED_WEIGHTS: Readonly<Record<string, readonly string[]>> = {
  "--font-playfair-display": ["700"],
  "--font-bodoni-moda": ["500"],
  "--font-cinzel-decorative": ["400"],
  "--font-lora": ["700"],
  "--font-cormorant-garamond": ["500", "600"],
  "--font-italiana": ["400"],
  "--font-josefin-sans": ["600"],
  "--font-great-vibes": ["400"],
};

/** The theme the API allow-list must name, read as text so the web never imports API code (S4). */
const API_RENDERERS_DIRECTORY = new URL(
  "../../../api/src/catalog/domain/renderers/",
  import.meta.url,
);

function apiThemeKeys(file: string, constant: string): string[] {
  const source = readFileSync(new URL(file, API_RENDERERS_DIRECTORY), "utf8");
  const list = new RegExp(`export const ${constant}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`).exec(
    source,
  );

  assert.ok(list, `the API allow-list is \`export const ${constant} = [ ... ] as const\``);
  return [...(list[1] ?? "").matchAll(/"([^"]*)"/g)].map((match) => match[1] as string);
}

describe("elegant themes", () => {
  it("lists the eight themes in the order of the board", () => {
    assert.deepEqual(
      [...ELEGANT_THEMES],
      [
        "blush-gold",
        "ivory-black",
        "midnight-gold",
        "olive-cream",
        "champagne",
        "lavender-silver",
        "terracotta-sage",
        "burgundy-gold",
      ],
    );
    assert.equal(new Set(ELEGANT_THEMES).size, 8, "no duplicate theme");
  });

  it("exposes the board's name, display font, weight, and ornament for each theme", () => {
    for (const [key, expected] of Object.entries(ELEGANT)) {
      const theme = ELEGANT_THEME[key as ElegantThemeKey];

      assert.equal(theme.displayName, expected.displayName, key);
      assert.equal(theme.fontVariable, expected.fontVariable, key);
      assert.equal(theme.titleWeight, expected.titleWeight, key);
      assert.equal(theme.ornament, expected.ornament, key);
      assert.match(theme.fontFallback, /^[^:;]+$/, `${key} fallback is a font stack`);
      assert.match(theme.titleSize, /^clamp\([^)]*\)$/, `${key} title size`);
      assert.equal(
        DECLARED_WEIGHTS[theme.fontVariable]?.includes(theme.titleWeight ?? ""),
        true,
        `${key} uses a weight its family declares`,
      );
    }
    assert.equal(new Set(ELEGANT_ORNAMENTS).size, 8, "each theme has its own ornament");
    assert.deepEqual(
      ELEGANT_THEMES.map((theme) => ELEGANT_THEME[theme].ornament),
      [...ELEGANT_ORNAMENTS],
    );
  });

  it("defines the board's seven colors, in its order, as hex values", () => {
    assert.deepEqual(
      [...THEME_COLOR_ROLES],
      ["background", "surface", "soft", "ink", "accent", "decorationOne", "decorationTwo"],
    );
    for (const [key, expected] of Object.entries(ELEGANT)) {
      const { colors } = ELEGANT_THEME[key as ElegantThemeKey];

      assert.deepEqual(Object.keys(colors), [...THEME_COLOR_ROLES], key);
      for (const role of THEME_COLOR_ROLES) {
        assert.match(colors[role], HEX, `${key} ${role}`);
      }
      assert.deepEqual(
        THEME_COLOR_ROLES.map((role) => colors[role]),
        expected.colors,
        key,
      );
    }
  });

  it("keeps every text pair at 4.5:1", () => {
    for (const [key, expected] of Object.entries(ELEGANT)) {
      const { colors } = ELEGANT_THEME[key as ElegantThemeKey];
      const surfaces = [colors.background, colors.surface, colors.soft];

      for (const ink of [colors.ink, colors.accent]) {
        for (const surface of surfaces) {
          assert.ok(
            contrastRatio(ink, surface) >= 4.5,
            `${key}: ${ink} on ${surface} is ${contrastRatio(ink, surface).toFixed(2)}:1`,
          );
        }
      }
      assert.ok(
        contrastRatio("#ffffff", colors.accent) >= 4.5,
        `${key}: white on ${colors.accent} is ${contrastRatio("#ffffff", colors.accent).toFixed(2)}:1`,
      );
      assert.equal(expected.colors.length, 7);
    }
  });

  it("keeps the name on the arch scrim at 4.5:1 over the worst-case photo", () => {
    assert.equal(ARCH_SCRIM_INK_PERCENT, 80);

    for (const key of ELEGANT_THEMES) {
      const { colors } = ELEGANT_THEME[key];

      // A photo may be pure white behind the scrim, and the scrim is the ink at 80 % over it. The name is
      // the on-accent white, so this is the worst pair the arch can produce.
      for (const underneath of ["#ffffff", colors.surface, colors.soft]) {
        const scrim = scrimColorOver(colors.ink, underneath);
        assert.ok(
          contrastRatio("#ffffff", scrim) >= 4.5,
          `${key}: white on the scrim over ${underneath} is ${contrastRatio("#ffffff", scrim).toFixed(2)}:1`,
        );
      }
    }
  });

  it("reads an unknown theme as not allowed, without prototype lookups", () => {
    for (const key of ELEGANT_THEMES) {
      assert.equal(isElegantTheme(key), true, key);
    }
    for (const key of [
      "__proto__",
      "constructor",
      "toString",
      "BLUSH-GOLD",
      "",
      "blush-gold-02",
      "dove-olive",
    ]) {
      assert.equal(isElegantTheme(key), false, key);
    }
    assert.equal(isElegantTheme(undefined), false);
    assert.equal(isElegantTheme(7), false);
  });

  it("names the same themes, in the same order, as the API allow-list", () => {
    assert.deepEqual(apiThemeKeys("elegant-themes.ts", "ELEGANT_THEMES"), [...ELEGANT_THEMES]);
  });
});
