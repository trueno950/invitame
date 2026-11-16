import { type InvitationTheme, isAllowedTheme, parseThemedConfiguration } from "./theme-tokens.ts";

export { THEME_COLOR_ROLES, type ThemeColorRole, type ThemeColors } from "./theme-tokens.ts";

/**
 * The eight children's birthday themes the owner chose (T6b; S2, S5, S7, S8), taken from
 * `design/kids-themes/01-tablero-temas.html`. A theme is a palette, a licensed display font, and an original
 * decorative motif. A themed layout takes every color from its theme through CSS variables, so one coded
 * layout serves all eight combinations.
 *
 * The guardrail (S5): a palette may be inspired by a popular character or brand, and a font may be the
 * official one only when its license allows commercial use. No theme carries character artwork, a logo, or a
 * protected name — not in its key, not in its Spanish display name, not in its motif. Every motif here is
 * original work: dots, claws, waves, blocks, and stars.
 *
 * The keys are pinned, in order, to the API allow-list (`apps/api/src/catalog/domain/renderers/
 * birthday-themes.ts`) by `birthday-themes.test.ts`, which reads that file as text.
 */
export const BIRTHDAY_THEMES = [
  "ice-kingdom",
  "rescue-team",
  "spider-hero",
  "classic-mouse",
  "dinosaurs",
  "under-the-sea",
  "fairytale-princess",
  "blocks-and-pixels",
] as const;

export type BirthdayThemeKey = (typeof BIRTHDAY_THEMES)[number];

/** The original motif each theme draws; `app/_components/renderers/birthday/motif.ts` renders them. */
export const BIRTHDAY_MOTIFS = [
  "flakes",
  "paws",
  "web",
  "dots",
  "dino",
  "bubbles",
  "crown",
  "blocks",
] as const;

export type BirthdayMotif = (typeof BIRTHDAY_MOTIFS)[number];

export interface BirthdayTheme extends InvitationTheme {
  readonly motif: BirthdayMotif;
}

export const BIRTHDAY_THEME: Readonly<Record<BirthdayThemeKey, BirthdayTheme>> = {
  "ice-kingdom": {
    displayName: "Reino de hielo",
    colors: {
      background: "#eef5fc",
      surface: "#ffffff",
      soft: "#d9e8f7",
      ink: "#162544",
      accent: "#2c5aa0",
      decorationOne: "#b9a8e3",
      decorationTwo: "#8fd0f2",
    },
    fontVariable: "--font-cinzel-decorative",
    fontFallback: 'Copperplate, "Trajan Pro", serif',
    motif: "flakes",
    titleSize: "clamp(2.25rem, 9vw, 3rem)",
  },
  "rescue-team": {
    displayName: "Equipo de rescate",
    colors: {
      background: "#fff8e7",
      surface: "#ffffff",
      soft: "#ffe8ad",
      ink: "#14213d",
      accent: "#b5121b",
      decorationOne: "#1f5fbf",
      decorationTwo: "#f6c312",
    },
    fontVariable: "--font-luckiest-guy",
    fontFallback: '"Arial Black", Impact, sans-serif',
    motif: "paws",
    titleSize: "clamp(2.75rem, 12vw, 3.75rem)",
  },
  "spider-hero": {
    displayName: "Héroe arácnido",
    colors: {
      background: "#f3f5fb",
      surface: "#ffffff",
      soft: "#dde5f5",
      ink: "#0f172a",
      accent: "#b91c1c",
      decorationOne: "#1d4ed8",
      decorationTwo: "#0f172a",
    },
    fontVariable: "--font-bangers",
    fontFallback: 'Impact, "Arial Black", sans-serif',
    motif: "web",
    titleSize: "clamp(2.75rem, 12vw, 3.75rem)",
  },
  "classic-mouse": {
    displayName: "Ratón clásico",
    colors: {
      background: "#fff9ec",
      surface: "#ffffff",
      soft: "#fde9b4",
      ink: "#1a1a1a",
      accent: "#b5121b",
      decorationOne: "#f5c400",
      decorationTwo: "#1a1a1a",
    },
    fontVariable: "--font-chewy",
    fontFallback: '"Marker Felt", "Comic Sans MS", cursive',
    motif: "dots",
    titleSize: "clamp(2.75rem, 12vw, 3.75rem)",
  },
  dinosaurs: {
    displayName: "Dinosaurios",
    colors: {
      background: "#f1f6e8",
      surface: "#ffffff",
      soft: "#ddebc6",
      ink: "#1f2d16",
      accent: "#3b6a1c",
      decorationOne: "#e07a1f",
      decorationTwo: "#a3c06b",
    },
    fontVariable: "--font-lilita-one",
    fontFallback: '"Arial Rounded MT Bold", "Arial Black", sans-serif',
    motif: "dino",
    titleSize: "clamp(2.75rem, 12vw, 3.75rem)",
  },
  "under-the-sea": {
    displayName: "Bajo el mar",
    colors: {
      background: "#eafaf7",
      surface: "#ffffff",
      soft: "#c9eee8",
      ink: "#0d3340",
      accent: "#0f6d66",
      decorationOne: "#8a6bd1",
      decorationTwo: "#f2a7c3",
    },
    fontVariable: "--font-pacifico",
    fontFallback: '"Snell Roundhand", "Brush Script MT", cursive',
    motif: "bubbles",
    titleSize: "clamp(2.5rem, 11vw, 3.5rem)",
  },
  "fairytale-princess": {
    displayName: "Princesa de cuento",
    colors: {
      background: "#fff3f7",
      surface: "#ffffff",
      soft: "#fadbe7",
      ink: "#3a1230",
      accent: "#a32b65",
      decorationOne: "#e9b6d2",
      decorationTwo: "#d4af37",
    },
    fontVariable: "--font-great-vibes",
    fontFallback: '"Snell Roundhand", "Apple Chancery", cursive',
    motif: "crown",
    titleSize: "clamp(3.25rem, 14vw, 4.5rem)",
  },
  "blocks-and-pixels": {
    displayName: "Bloques y píxeles",
    colors: {
      background: "#f0f4ea",
      surface: "#ffffff",
      soft: "#d8e6c6",
      ink: "#1f2a1a",
      accent: "#3a6f27",
      decorationOne: "#8b5a2b",
      decorationTwo: "#6fb3d2",
    },
    fontVariable: "--font-press-start-2p",
    fontFallback: '"Courier New", monospace',
    motif: "blocks",
    // Press Start 2P is drawn on a wide grid: titles need a smaller step to fit 390 px.
    titleSize: "clamp(1.4rem, 6vw, 1.9rem)",
  },
};

/** Whether a stored configuration value names an allowed theme, without prototype lookups. */
export function isBirthdayTheme(value: unknown): value is BirthdayThemeKey {
  return isAllowedTheme(BIRTHDAY_THEMES, value);
}

/** The layouts that take their look from a theme: Mapa, Cartel, and Cuento (S8). */
export const THEMED_LAYOUT_KEYS = [
  "birthday-map-01",
  "birthday-poster-01",
  "birthday-story-01",
] as const;

export type ThemedLayoutKey = (typeof THEMED_LAYOUT_KEYS)[number];

export interface ThemedLayoutConfiguration {
  readonly componentKey: ThemedLayoutKey;
  readonly theme: BirthdayThemeKey;
}

/**
 * The configuration of a themed birthday layout is exactly `{componentKey, theme}` (S8). Both keys are
 * required; an extra key, another layout's key, a wrongly typed theme, and an unknown theme are refused, so
 * a drifted snapshot never renders. The rules live in `theme-tokens.ts`, because the celebration layouts
 * follow the same contract (S13); the API enforces it before publication too.
 */
export function parseThemedLayoutConfiguration(
  componentKey: ThemedLayoutKey,
  value: unknown,
): ThemedLayoutConfiguration {
  return parseThemedConfiguration(componentKey, BIRTHDAY_THEMES, value);
}
