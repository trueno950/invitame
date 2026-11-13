import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { contrastRatio } from "../theme/contrast.ts";
import {
  BABY_SHOWER_MOTIFS,
  BABY_SHOWER_THEME,
  BABY_SHOWER_THEMES,
  type BabyShowerThemeKey,
  isBabyShowerTheme,
} from "./baby-shower-themes.ts";
import {
  BAPTISM_MOTIFS,
  BAPTISM_THEME,
  BAPTISM_THEMES,
  type BaptismThemeKey,
  isBaptismTheme,
} from "./baptism-themes.ts";
import { THEME_COLOR_ROLES } from "./theme-tokens.ts";

// The eight baby shower and six themed baptism themes the owner approved (T7c; S13), taken from
// `design/celebration-themes/01-baby-shower.html` and `02-bautizo-tematico.html`. A theme is a palette, one
// licensed display font at the single weight `app/layout.tsx` declares for it, and an original motif. Each
// palette reaches 4.5:1 on every text pair, as on the board.

/** Each palette as the board shows it: background, surface, soft, ink, accent, decoration 1, decoration 2. */
const HEX = /^#[0-9a-f]{6}$/;

interface ExpectedTheme {
  displayName: string;
  fontVariable: string;
  titleWeight: string;
  motif: string;
  colors: readonly [string, string, string, string, string, string, string];
}

const BABY_SHOWER: Readonly<Record<BabyShowerThemeKey, ExpectedTheme>> = {
  "teddy-honey": {
    displayName: "Osito y miel",
    fontVariable: "--font-baloo-2",
    titleWeight: "700",
    motif: "honey-bear",
    colors: ["#fdf6ec", "#ffffff", "#f7e3c3", "#3d2a12", "#8a5a12", "#e0a83c", "#b3763a"],
  },
  "clouds-stars": {
    displayName: "Nubes y estrellas",
    fontVariable: "--font-quicksand",
    titleWeight: "600",
    motif: "clouds",
    colors: ["#eef4fd", "#ffffff", "#d6e6fa", "#1b2c4a", "#2f5a9e", "#f5c96b", "#9fc4ef"],
  },
  "baby-safari": {
    displayName: "Safari bebé",
    fontVariable: "--font-fredoka",
    titleWeight: "600",
    motif: "safari",
    colors: ["#f6f1e7", "#ffffff", "#e3d8c0", "#2f2a1c", "#3f5b20", "#d18a4f", "#b6c4a0"],
  },
  "hot-air-balloons": {
    displayName: "Globos aerostáticos",
    fontVariable: "--font-playfair-display",
    titleWeight: "700",
    motif: "balloons",
    colors: ["#fbf3ee", "#ffffff", "#f3ddd2", "#33202c", "#35647f", "#e08a6a", "#dcae57"],
  },
  "boho-rainbow": {
    displayName: "Arcoíris boho",
    fontVariable: "--font-cormorant-garamond",
    titleWeight: "500",
    motif: "rainbow",
    colors: ["#fdf4ef", "#ffffff", "#f2ded2", "#3b2620", "#9c4a2f", "#e2b19a", "#9aa88f"],
  },
  "little-moon": {
    displayName: "Lunita",
    fontVariable: "--font-josefin-sans",
    titleWeight: "600",
    motif: "moon",
    colors: ["#f4f1e8", "#ffffff", "#e2ddc9", "#1e2a44", "#4b5a92", "#d9b26a", "#a7b6d9"],
  },
  "woodland-friends": {
    displayName: "Amigos del bosque",
    fontVariable: "--font-fraunces",
    titleWeight: "700",
    motif: "woodland",
    colors: ["#f2f5ee", "#ffffff", "#dde7d6", "#24301f", "#41633a", "#c07a4b", "#9fbe8a"],
  },
  "sweet-bunny": {
    displayName: "Conejito dulce",
    fontVariable: "--font-caveat",
    titleWeight: "700",
    motif: "bunny",
    colors: ["#fdf2f4", "#ffffff", "#f8dde3", "#4a2230", "#a63d5e", "#8fc9b6", "#e8b0bf"],
  },
};

const BAPTISM: Readonly<Record<BaptismThemeKey, ExpectedTheme>> = {
  "dove-olive": {
    displayName: "Paloma y olivo",
    fontVariable: "--font-cormorant-garamond",
    titleWeight: "500",
    motif: "dove",
    colors: ["#f6f6ee", "#ffffff", "#e3e6d3", "#26301f", "#4b6134", "#a9b389", "#d7c9a3"],
  },
  "little-angels": {
    displayName: "Angelitos",
    fontVariable: "--font-great-vibes",
    titleWeight: "400",
    motif: "wings",
    colors: ["#f2f7fd", "#ffffff", "#dbe8f7", "#1f2d47", "#3f6291", "#e2c47a", "#b9d3ef"],
  },
  "sky-clouds": {
    displayName: "Cielo y nubes",
    fontVariable: "--font-nunito",
    titleWeight: "700",
    motif: "sky",
    colors: ["#eff8fb", "#ffffff", "#d3ecf2", "#16323d", "#1f6a7a", "#9ccfdd", "#f3e2b6"],
  },
  "soft-floral": {
    displayName: "Floral suave",
    fontVariable: "--font-lora",
    titleWeight: "700",
    motif: "floral",
    colors: ["#fbf3f5", "#ffffff", "#f2dde3", "#3d2530", "#8e4258", "#a8b99c", "#e5bfc9"],
  },
  "little-lamb": {
    displayName: "Corderito",
    fontVariable: "--font-quicksand",
    titleWeight: "600",
    motif: "lamb",
    colors: ["#faf6ee", "#ffffff", "#ece2cf", "#332a1e", "#6b5a33", "#b8c8a6", "#dcc0a0"],
  },
  "star-light": {
    displayName: "Luz de estrella",
    fontVariable: "--font-cinzel-decorative",
    titleWeight: "400",
    motif: "star",
    colors: ["#eef3f6", "#ffffff", "#d8e4ea", "#142a36", "#1f4f63", "#c9a24e", "#8fb0c4"],
  },
};

/**
 * The single weight `app/layout.tsx` declares for each display family (T7b). A theme title sets exactly its
 * family's weight: a face loaded at one weight would otherwise be synthetically emboldened.
 */
const DECLARED_WEIGHTS: Readonly<Record<string, readonly string[]>> = {
  "--font-baloo-2": ["700"],
  "--font-quicksand": ["600"],
  "--font-fredoka": ["600"],
  "--font-playfair-display": ["700"],
  "--font-cormorant-garamond": ["500", "600"],
  "--font-josefin-sans": ["600"],
  "--font-fraunces": ["700"],
  "--font-caveat": ["700"],
  "--font-great-vibes": ["400"],
  "--font-nunito": ["700"],
  "--font-lora": ["700"],
  "--font-cinzel-decorative": ["400"],
};

/** The theme the API allow-list must name, read as text so the web never imports API code (S13). */
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

describe("baby shower themes", () => {
  it("lists the eight themes in the order of the board", () => {
    assert.deepEqual([...BABY_SHOWER_THEMES], Object.keys(BABY_SHOWER));
    assert.equal(new Set(BABY_SHOWER_THEMES).size, 8, "no duplicate theme");
  });

  it("exposes the board's name, display font, weight, and motif for each theme", () => {
    for (const [key, expected] of Object.entries(BABY_SHOWER)) {
      const theme = BABY_SHOWER_THEME[key as BabyShowerThemeKey];

      assert.equal(theme.displayName, expected.displayName, key);
      assert.equal(theme.fontVariable, expected.fontVariable, key);
      assert.equal(theme.titleWeight, expected.titleWeight, key);
      assert.equal(theme.motif, expected.motif, key);
      assert.match(theme.titleSize, /^clamp\([^)]*\)$/, `${key} title size`);
      assert.equal(
        DECLARED_WEIGHTS[theme.fontVariable]?.includes(theme.titleWeight ?? ""),
        true,
        `${key} uses a weight its family declares`,
      );
    }
    assert.equal(new Set(BABY_SHOWER_MOTIFS).size, 8, "each theme has its own motif");
  });

  it("defines the board's seven colors, in its order, as hex values", () => {
    assert.deepEqual(
      [...THEME_COLOR_ROLES],
      ["background", "surface", "soft", "ink", "accent", "decorationOne", "decorationTwo"],
    );
    for (const [key, expected] of Object.entries(BABY_SHOWER)) {
      const { colors } = BABY_SHOWER_THEME[key as BabyShowerThemeKey];

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
    for (const [key, expected] of Object.entries(BABY_SHOWER)) {
      const { colors } = BABY_SHOWER_THEME[key as BabyShowerThemeKey];
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
      assert.ok(expected.colors.length === 7);
    }
  });

  it("reads an unknown theme as not allowed, without prototype lookups", () => {
    for (const key of BABY_SHOWER_THEMES) {
      assert.equal(isBabyShowerTheme(key), true, key);
    }
    for (const key of [
      "__proto__",
      "constructor",
      "toString",
      "TEDDY-HONEY",
      "",
      "teddy-honey-02",
    ]) {
      assert.equal(isBabyShowerTheme(key), false, key);
    }
    assert.equal(isBabyShowerTheme(undefined), false);
    assert.equal(isBabyShowerTheme(7), false);
  });

  it("names the same themes, in the same order, as the API allow-list", () => {
    assert.deepEqual(apiThemeKeys("baby-shower-themes.ts", "BABY_SHOWER_THEMES"), [
      ...BABY_SHOWER_THEMES,
    ]);
  });
});

describe("themed baptism themes", () => {
  it("lists the six themes in the order of the board", () => {
    assert.deepEqual([...BAPTISM_THEMES], Object.keys(BAPTISM));
    assert.equal(new Set(BAPTISM_THEMES).size, 6, "no duplicate theme");
  });

  it("exposes the board's name, display font, weight, and motif for each theme", () => {
    for (const [key, expected] of Object.entries(BAPTISM)) {
      const theme = BAPTISM_THEME[key as BaptismThemeKey];

      assert.equal(theme.displayName, expected.displayName, key);
      assert.equal(theme.fontVariable, expected.fontVariable, key);
      assert.equal(theme.titleWeight, expected.titleWeight, key);
      assert.equal(theme.motif, expected.motif, key);
      assert.match(theme.titleSize, /^clamp\([^)]*\)$/, `${key} title size`);
      assert.equal(
        DECLARED_WEIGHTS[theme.fontVariable]?.includes(theme.titleWeight ?? ""),
        true,
        `${key} uses a weight its family declares`,
      );
    }
    assert.equal(new Set(BAPTISM_MOTIFS).size, 6, "each theme has its own motif");
  });

  it("defines the board's seven colors, in its order, as hex values", () => {
    for (const [key, expected] of Object.entries(BAPTISM)) {
      const { colors } = BAPTISM_THEME[key as BaptismThemeKey];

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
    for (const [key, expected] of Object.entries(BAPTISM)) {
      const { colors } = BAPTISM_THEME[key as BaptismThemeKey];
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
      assert.ok(expected.colors.length === 7);
    }
  });

  it("reads an unknown theme as not allowed, without prototype lookups", () => {
    for (const key of BAPTISM_THEMES) {
      assert.equal(isBaptismTheme(key), true, key);
    }
    for (const key of ["__proto__", "constructor", "toString", "DOVE-OLIVE", "", "dove-olive-02"]) {
      assert.equal(isBaptismTheme(key), false, key);
    }
    assert.equal(isBaptismTheme(undefined), false);
    assert.equal(isBaptismTheme(7), false);
  });

  it("names the same themes, in the same order, as the API allow-list", () => {
    assert.deepEqual(apiThemeKeys("baptism-themes.ts", "BAPTISM_THEMES"), [...BAPTISM_THEMES]);
  });
});
