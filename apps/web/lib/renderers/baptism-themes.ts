import { type InvitationTheme, isAllowedTheme } from "./theme-tokens.ts";

/**
 * The six themed baptism themes the owner approved (T7c; S13), taken from
 * `design/celebration-themes/02-bautizo-tematico.html`. The formal baptism stays in the elegant line
 * (T8); these are the warm, thematic ones: a palette, one licensed display font loaded at a single weight,
 * and an original motif inspired by baptism symbolism — a dove, wings, clouds, flowers, wool, and light.
 *
 * The guardrail is the same as for the birthday themes (S5): no theme carries character artwork, a logo, or
 * a protected name, in its key, its Spanish display name, or its motif. Every motif here is original work.
 *
 * The keys are pinned, in order, to the API allow-list (`apps/api/src/catalog/domain/renderers/
 * baptism-themes.ts`) by `celebration-themes.test.ts`, which reads that file as text.
 */
export const BAPTISM_THEMES = [
  "dove-olive",
  "little-angels",
  "sky-clouds",
  "soft-floral",
  "little-lamb",
  "star-light",
] as const;

export type BaptismThemeKey = (typeof BAPTISM_THEMES)[number];

/** The original motif each theme draws; `app/_components/renderers/themed/celebration-motif.ts` renders it. */
export const BAPTISM_MOTIFS = ["dove", "wings", "sky", "floral", "lamb", "star"] as const;

export type BaptismMotif = (typeof BAPTISM_MOTIFS)[number];

export interface BaptismTheme extends InvitationTheme {
  readonly motif: BaptismMotif;
}

export const BAPTISM_THEME: Readonly<Record<BaptismThemeKey, BaptismTheme>> = {
  "dove-olive": {
    displayName: "Paloma y olivo",
    colors: {
      background: "#f6f6ee",
      surface: "#ffffff",
      soft: "#e3e6d3",
      ink: "#26301f",
      accent: "#4b6134",
      decorationOne: "#a9b389",
      decorationTwo: "#d7c9a3",
    },
    fontVariable: "--font-cormorant-garamond",
    fontFallback: '"Iowan Old Style", Georgia, serif',
    motif: "dove",
    titleSize: "clamp(2.25rem, 9vw, 3rem)",
    titleWeight: "500",
  },
  "little-angels": {
    displayName: "Angelitos",
    colors: {
      background: "#f2f7fd",
      surface: "#ffffff",
      soft: "#dbe8f7",
      ink: "#1f2d47",
      accent: "#3f6291",
      decorationOne: "#e2c47a",
      decorationTwo: "#b9d3ef",
    },
    fontVariable: "--font-great-vibes",
    fontFallback: '"Snell Roundhand", "Apple Chancery", cursive',
    motif: "wings",
    titleSize: "clamp(3rem, 13vw, 4rem)",
    titleWeight: "400",
  },
  "sky-clouds": {
    displayName: "Cielo y nubes",
    colors: {
      background: "#eff8fb",
      surface: "#ffffff",
      soft: "#d3ecf2",
      ink: "#16323d",
      accent: "#1f6a7a",
      decorationOne: "#9ccfdd",
      decorationTwo: "#f3e2b6",
    },
    fontVariable: "--font-nunito",
    fontFallback: '"Avenir Next", "Segoe UI", sans-serif',
    motif: "sky",
    titleSize: "clamp(2rem, 8vw, 2.75rem)",
    titleWeight: "700",
  },
  "soft-floral": {
    displayName: "Floral suave",
    colors: {
      background: "#fbf3f5",
      surface: "#ffffff",
      soft: "#f2dde3",
      ink: "#3d2530",
      accent: "#8e4258",
      decorationOne: "#a8b99c",
      decorationTwo: "#e5bfc9",
    },
    fontVariable: "--font-lora",
    fontFallback: '"Iowan Old Style", Georgia, serif',
    motif: "floral",
    titleSize: "clamp(2rem, 8vw, 2.75rem)",
    titleWeight: "700",
  },
  "little-lamb": {
    displayName: "Corderito",
    colors: {
      background: "#faf6ee",
      surface: "#ffffff",
      soft: "#ece2cf",
      ink: "#332a1e",
      accent: "#6b5a33",
      decorationOne: "#b8c8a6",
      decorationTwo: "#dcc0a0",
    },
    fontVariable: "--font-quicksand",
    fontFallback: '"Avenir Next", "Segoe UI", sans-serif',
    motif: "lamb",
    titleSize: "clamp(2rem, 8vw, 2.75rem)",
    titleWeight: "600",
  },
  "star-light": {
    displayName: "Luz de estrella",
    colors: {
      background: "#eef3f6",
      surface: "#ffffff",
      soft: "#d8e4ea",
      ink: "#142a36",
      accent: "#1f4f63",
      decorationOne: "#c9a24e",
      decorationTwo: "#8fb0c4",
    },
    fontVariable: "--font-cinzel-decorative",
    fontFallback: 'Copperplate, "Trajan Pro", serif',
    motif: "star",
    titleSize: "clamp(1.9rem, 7.5vw, 2.5rem)",
    titleWeight: "400",
  },
};

/** Whether a stored configuration value names an allowed theme, without prototype lookups. */
export function isBaptismTheme(value: unknown): value is BaptismThemeKey {
  return isAllowedTheme(BAPTISM_THEMES, value);
}
