import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { contrastRatio } from "../theme/contrast.ts";
import {
  BIRTHDAY_THEME,
  BIRTHDAY_THEMES,
  type BirthdayThemeKey,
  isBirthdayTheme,
  THEME_COLOR_ROLES,
  THEMED_LAYOUT_KEYS,
} from "./birthday-themes.ts";

// The eight children's birthday themes the owner chose (T6b; S2, S5, S7, S8), taken from
// `design/kids-themes/01-tablero-temas.html`. A theme is a palette, a licensed display font, and an original
// motif; the palette is the only source of color, and its text pairs must reach 4.5:1.

/** The eight palettes of the theme board, exactly as `design/kids-themes/01-tablero-temas.html` shows them. */
const EXPECTED_COLORS: Readonly<Record<BirthdayThemeKey, readonly string[]>> = {
  "ice-kingdom": ["#eef5fc", "#ffffff", "#d9e8f7", "#162544", "#2c5aa0", "#b9a8e3", "#8fd0f2"],
  "rescue-team": ["#fff8e7", "#ffffff", "#ffe8ad", "#14213d", "#b5121b", "#1f5fbf", "#f6c312"],
  "spider-hero": ["#f3f5fb", "#ffffff", "#dde5f5", "#0f172a", "#b91c1c", "#1d4ed8", "#0f172a"],
  "classic-mouse": ["#fff9ec", "#ffffff", "#fde9b4", "#1a1a1a", "#b5121b", "#f5c400", "#1a1a1a"],
  dinosaurs: ["#f1f6e8", "#ffffff", "#ddebc6", "#1f2d16", "#3b6a1c", "#e07a1f", "#a3c06b"],
  "under-the-sea": ["#eafaf7", "#ffffff", "#c9eee8", "#0d3340", "#0f6d66", "#8a6bd1", "#f2a7c3"],
  "fairytale-princess": [
    "#fff3f7",
    "#ffffff",
    "#fadbe7",
    "#3a1230",
    "#a32b65",
    "#e9b6d2",
    "#d4af37",
  ],
  "blocks-and-pixels": [
    "#f0f4ea",
    "#ffffff",
    "#d8e6c6",
    "#1f2a1a",
    "#3a6f27",
    "#8b5a2b",
    "#6fb3d2",
  ],
};

const HEX = /^#[0-9a-f]{6}$/;

/** What the theme board shows, in its order; a name, font, or motif change is a deliberate edit here. */
const EXPECTED: ReadonlyArray<{
  key: BirthdayThemeKey;
  displayName: string;
  fontVariable: string;
  motif: string;
}> = [
  {
    key: "ice-kingdom",
    displayName: "Reino de hielo",
    fontVariable: "--font-cinzel-decorative",
    motif: "flakes",
  },
  {
    key: "rescue-team",
    displayName: "Equipo de rescate",
    fontVariable: "--font-luckiest-guy",
    motif: "paws",
  },
  {
    key: "spider-hero",
    displayName: "Héroe arácnido",
    fontVariable: "--font-bangers",
    motif: "web",
  },
  {
    key: "classic-mouse",
    displayName: "Ratón clásico",
    fontVariable: "--font-chewy",
    motif: "dots",
  },
  {
    key: "dinosaurs",
    displayName: "Dinosaurios",
    fontVariable: "--font-lilita-one",
    motif: "dino",
  },
  {
    key: "under-the-sea",
    displayName: "Bajo el mar",
    fontVariable: "--font-pacifico",
    motif: "bubbles",
  },
  {
    key: "fairytale-princess",
    displayName: "Princesa de cuento",
    fontVariable: "--font-great-vibes",
    motif: "crown",
  },
  {
    key: "blocks-and-pixels",
    displayName: "Bloques y píxeles",
    fontVariable: "--font-press-start-2p",
    motif: "blocks",
  },
];

/** The theme the API allow-list must name, read as text so the web never imports API code (S8). */
const API_THEMES_FILE = new URL(
  "../../../api/src/catalog/domain/renderers/birthday-themes.ts",
  import.meta.url,
);

function apiThemeKeys(): string[] {
  const source = readFileSync(API_THEMES_FILE, "utf8");
  const list = /export const BIRTHDAY_THEMES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(source);

  assert.ok(list, "the API allow-list is `export const BIRTHDAY_THEMES = [ ... ] as const`");
  return [...(list[1] ?? "").matchAll(/"([^"]*)"/g)].map((match) => match[1] as string);
}

describe("birthday themes", () => {
  it("lists the eight themes in the order of the theme board", () => {
    assert.deepEqual(
      [...BIRTHDAY_THEMES],
      EXPECTED.map((theme) => theme.key),
    );
    assert.equal(new Set(BIRTHDAY_THEMES).size, BIRTHDAY_THEMES.length, "no duplicate theme");
  });

  it("exposes the name, display font, and motif the board shows for each theme", () => {
    for (const expected of EXPECTED) {
      const theme = BIRTHDAY_THEME[expected.key];

      assert.equal(theme.displayName, expected.displayName, expected.key);
      assert.equal(theme.fontVariable, expected.fontVariable, expected.key);
      assert.equal(theme.motif, expected.motif, expected.key);
      assert.match(theme.titleSize, /^clamp\([^)]*\)$/, `${expected.key} title size`);
    }
    assert.equal(
      new Set(EXPECTED.map((theme) => theme.motif)).size,
      8,
      "each theme has its own motif",
    );
  });

  it("reads an unknown theme as not allowed, without prototype lookups", () => {
    for (const key of BIRTHDAY_THEMES) {
      assert.equal(isBirthdayTheme(key), true, key);
    }
    for (const key of ["__proto__", "constructor", "toString", "ICE-KINGDOM", "", "dinosaurs-02"]) {
      assert.equal(isBirthdayTheme(key), false, key);
    }
    assert.equal(isBirthdayTheme(undefined), false);
    assert.equal(isBirthdayTheme(7), false);
  });

  it("defines the seven colors of the board, in its order, as hex values", () => {
    assert.deepEqual(
      [...THEME_COLOR_ROLES],
      ["background", "surface", "soft", "ink", "accent", "decorationOne", "decorationTwo"],
    );
    for (const expected of EXPECTED) {
      const { colors } = BIRTHDAY_THEME[expected.key];

      assert.deepEqual(Object.keys(colors), [...THEME_COLOR_ROLES], expected.key);
      for (const role of THEME_COLOR_ROLES) {
        assert.match(colors[role], HEX, `${expected.key} ${role}`);
      }
      assert.deepEqual(
        [
          colors.background,
          colors.surface,
          colors.soft,
          colors.ink,
          colors.accent,
          colors.decorationOne,
          colors.decorationTwo,
        ],
        EXPECTED_COLORS[expected.key],
        expected.key,
      );
    }
  });

  it("keeps ink and accent at 4.5:1 on every text surface and white on accent", () => {
    for (const expected of EXPECTED) {
      const { colors } = BIRTHDAY_THEME[expected.key];
      const surfaces = [colors.background, colors.surface, colors.soft];

      for (const ink of [colors.ink, colors.accent]) {
        for (const surface of surfaces) {
          assert.ok(
            contrastRatio(ink, surface) >= 4.5,
            `${expected.key}: ${ink} on ${surface} is ${contrastRatio(ink, surface).toFixed(2)}:1`,
          );
        }
      }
      assert.ok(
        contrastRatio("#ffffff", colors.accent) >= 4.5,
        `${expected.key}: white on ${colors.accent} is ${contrastRatio("#ffffff", colors.accent).toFixed(2)}:1`,
      );
    }
  });

  it("registers exactly the three themed layouts", () => {
    assert.deepEqual(
      [...THEMED_LAYOUT_KEYS],
      ["birthday-map-01", "birthday-poster-01", "birthday-story-01"],
    );
  });

  it("names the same themes, in the same order, as the API allow-list", () => {
    assert.deepEqual(apiThemeKeys(), [...BIRTHDAY_THEMES]);
  });
});
