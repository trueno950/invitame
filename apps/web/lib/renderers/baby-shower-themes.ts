import { type InvitationTheme, isAllowedTheme } from "./theme-tokens.ts";

/**
 * The eight baby shower themes the owner approved (T7c; S13), taken from
 * `design/celebration-themes/01-baby-shower.html`. A theme is a palette, one licensed display font loaded at
 * a single weight, and an original decorative motif. The guardrail is the same as for the birthday themes
 * (S5): a palette may take its colors from a popular character or brand, and a font may be the official one
 * only when its license allows commercial use. No theme carries character artwork, a logo, or a protected
 * name — not in its key, not in its Spanish display name, not in its motif. Every motif here is original
 * geometric work: a honeycomb, clouds, leaves, balloons, arcs, a moon, pines, and ears.
 *
 * The keys are pinned, in order, to the API allow-list (`apps/api/src/catalog/domain/renderers/
 * baby-shower-themes.ts`) by `celebration-themes.test.ts`, which reads that file as text.
 */
export const BABY_SHOWER_THEMES = [
  "teddy-honey",
  "clouds-stars",
  "baby-safari",
  "hot-air-balloons",
  "boho-rainbow",
  "little-moon",
  "woodland-friends",
  "sweet-bunny",
] as const;

export type BabyShowerThemeKey = (typeof BABY_SHOWER_THEMES)[number];

/** The original motif each theme draws; `app/_components/renderers/themed/celebration-motif.ts` renders it. */
export const BABY_SHOWER_MOTIFS = [
  "honey-bear",
  "clouds",
  "safari",
  "balloons",
  "rainbow",
  "moon",
  "woodland",
  "bunny",
] as const;

export type BabyShowerMotif = (typeof BABY_SHOWER_MOTIFS)[number];

export interface BabyShowerTheme extends InvitationTheme {
  readonly motif: BabyShowerMotif;
}

export const BABY_SHOWER_THEME: Readonly<Record<BabyShowerThemeKey, BabyShowerTheme>> = {
  "teddy-honey": {
    displayName: "Osito y miel",
    colors: {
      background: "#fdf6ec",
      surface: "#ffffff",
      soft: "#f7e3c3",
      ink: "#3d2a12",
      accent: "#8a5a12",
      decorationOne: "#e0a83c",
      decorationTwo: "#b3763a",
    },
    fontVariable: "--font-baloo-2",
    fontFallback: '"Avenir Next Rounded", "Trebuchet MS", sans-serif',
    motif: "honey-bear",
    titleSize: "clamp(2.25rem, 9vw, 3rem)",
    titleWeight: "700",
  },
  "clouds-stars": {
    displayName: "Nubes y estrellas",
    colors: {
      background: "#eef4fd",
      surface: "#ffffff",
      soft: "#d6e6fa",
      ink: "#1b2c4a",
      accent: "#2f5a9e",
      decorationOne: "#f5c96b",
      decorationTwo: "#9fc4ef",
    },
    fontVariable: "--font-quicksand",
    fontFallback: '"Avenir Next", "Segoe UI", sans-serif',
    motif: "clouds",
    titleSize: "clamp(2rem, 8vw, 2.75rem)",
    titleWeight: "600",
  },
  "baby-safari": {
    displayName: "Safari bebé",
    colors: {
      background: "#f6f1e7",
      surface: "#ffffff",
      soft: "#e3d8c0",
      ink: "#2f2a1c",
      accent: "#3f5b20",
      decorationOne: "#d18a4f",
      decorationTwo: "#b6c4a0",
    },
    fontVariable: "--font-fredoka",
    fontFallback: '"Avenir Next Rounded", "Trebuchet MS", sans-serif',
    motif: "safari",
    titleSize: "clamp(2.25rem, 9vw, 3rem)",
    titleWeight: "600",
  },
  "hot-air-balloons": {
    displayName: "Globos aerostáticos",
    colors: {
      background: "#fbf3ee",
      surface: "#ffffff",
      soft: "#f3ddd2",
      ink: "#33202c",
      accent: "#35647f",
      decorationOne: "#e08a6a",
      decorationTwo: "#dcae57",
    },
    fontVariable: "--font-playfair-display",
    fontFallback: 'Georgia, "Times New Roman", serif',
    motif: "balloons",
    titleSize: "clamp(2rem, 8vw, 2.75rem)",
    titleWeight: "700",
  },
  "boho-rainbow": {
    displayName: "Arcoíris boho",
    colors: {
      background: "#fdf4ef",
      surface: "#ffffff",
      soft: "#f2ded2",
      ink: "#3b2620",
      accent: "#9c4a2f",
      decorationOne: "#e2b19a",
      decorationTwo: "#9aa88f",
    },
    fontVariable: "--font-cormorant-garamond",
    fontFallback: '"Iowan Old Style", Georgia, serif',
    motif: "rainbow",
    titleSize: "clamp(2.25rem, 9vw, 3rem)",
    titleWeight: "500",
  },
  "little-moon": {
    displayName: "Lunita",
    colors: {
      background: "#f4f1e8",
      surface: "#ffffff",
      soft: "#e2ddc9",
      ink: "#1e2a44",
      accent: "#4b5a92",
      decorationOne: "#d9b26a",
      decorationTwo: "#a7b6d9",
    },
    fontVariable: "--font-josefin-sans",
    fontFallback: '"Avenir Next", "Segoe UI", sans-serif',
    motif: "moon",
    titleSize: "clamp(1.9rem, 7.5vw, 2.5rem)",
    titleWeight: "600",
  },
  "woodland-friends": {
    displayName: "Amigos del bosque",
    colors: {
      background: "#f2f5ee",
      surface: "#ffffff",
      soft: "#dde7d6",
      ink: "#24301f",
      accent: "#41633a",
      decorationOne: "#c07a4b",
      decorationTwo: "#9fbe8a",
    },
    fontVariable: "--font-fraunces",
    fontFallback: '"Iowan Old Style", Georgia, serif',
    motif: "woodland",
    titleSize: "clamp(2rem, 8vw, 2.75rem)",
    titleWeight: "700",
  },
  "sweet-bunny": {
    displayName: "Conejito dulce",
    colors: {
      background: "#fdf2f4",
      surface: "#ffffff",
      soft: "#f8dde3",
      ink: "#4a2230",
      accent: "#a63d5e",
      decorationOne: "#8fc9b6",
      decorationTwo: "#e8b0bf",
    },
    fontVariable: "--font-caveat",
    fontFallback: '"Bradley Hand", "Segoe Print", cursive',
    motif: "bunny",
    titleSize: "clamp(2.75rem, 12vw, 3.75rem)",
    titleWeight: "700",
  },
};

/** Whether a stored configuration value names an allowed theme, without prototype lookups. */
export function isBabyShowerTheme(value: unknown): value is BabyShowerThemeKey {
  return isAllowedTheme(BABY_SHOWER_THEMES, value);
}
