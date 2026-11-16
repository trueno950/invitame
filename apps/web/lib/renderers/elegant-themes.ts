import { type InvitationTheme, isAllowedTheme } from "./theme-tokens.ts";

/**
 * The eight elegant themes the owner chose (E3c; S4), taken from
 * `design/elegant-line/04-tablero-temas-elegantes.html`: one formal line shared by XV años, weddings, and
 * the formal baptism. A theme is a palette of seven colors, one licensed display font loaded at a single
 * weight, and one original fine-line ornament drawn in `app/_components/renderers/elegant-arch/
 * elegant-ornament.ts`.
 *
 * The guardrail is the same as for the themed line (S3): no theme carries character artwork, a logo, or a
 * protected name, in its key, its Spanish display name, or its ornament. Every ornament is our own drawing.
 *
 * The keys are pinned, in order, to the API allow-list (`apps/api/src/catalog/domain/renderers/
 * elegant-themes.ts`) by `elegant-themes.test.ts`, which reads that file as text.
 */
export const ELEGANT_THEMES = [
  "blush-gold",
  "ivory-black",
  "midnight-gold",
  "olive-cream",
  "champagne",
  "lavender-silver",
  "terracotta-sage",
  "burgundy-gold",
] as const;

export type ElegantThemeKey = (typeof ELEGANT_THEMES)[number];

/** The original fine-line ornament of each theme, in the board's order and with its own description. */
export const ELEGANT_ORNAMENTS = [
  "rose",
  "rules",
  "star",
  "olive",
  "laurel",
  "lavender",
  "arch",
  "volutes",
] as const;

export type ElegantOrnament = (typeof ELEGANT_ORNAMENTS)[number];

export interface ElegantTheme extends InvitationTheme {
  /** The shared theme frame names the artwork `motif`; the elegant line calls it an ornament. */
  readonly motif: ElegantOrnament;
  readonly ornament: ElegantOrnament;
}

/**
 * How much of the theme's ink the arch scrim carries: the name sits on this scrim over the photo, so the
 * ratio is measured against the worst case — a pure white photo pixel — in `elegant-themes.test.ts`. The
 * value is the one `design/elegant-line/03-arco-y-foto.html` measured.
 */
export const ARCH_SCRIM_INK_PERCENT = 80;

export const ELEGANT_THEME: Readonly<Record<ElegantThemeKey, ElegantTheme>> = {
  "blush-gold": {
    displayName: "Rosa empolvado y oro",
    colors: {
      background: "#faf0ee",
      surface: "#fffdfc",
      soft: "#f3dcdf",
      ink: "#2b1f22",
      accent: "#8a3e52",
      decorationOne: "#c99a62",
      decorationTwo: "#e3b7be",
    },
    fontVariable: "--font-playfair-display",
    fontFallback: 'Didot, "Bodoni 72", Georgia, serif',
    motif: "rose",
    ornament: "rose",
    titleSize: "clamp(2.4rem, 10vw, 3.4rem)",
    titleWeight: "700",
  },
  "ivory-black": {
    displayName: "Marfil y negro",
    colors: {
      background: "#f3f0e9",
      surface: "#fbfaf6",
      soft: "#e4dfd3",
      ink: "#16150f",
      accent: "#4a4238",
      decorationOne: "#a98f5e",
      decorationTwo: "#8c8578",
    },
    fontVariable: "--font-bodoni-moda",
    fontFallback: '"Bodoni 72", Didot, Georgia, serif',
    motif: "rules",
    ornament: "rules",
    titleSize: "clamp(2.1rem, 8.6vw, 3rem)",
    titleWeight: "500",
  },
  "midnight-gold": {
    displayName: "Azul medianoche y oro",
    colors: {
      background: "#eef1f5",
      surface: "#ffffff",
      soft: "#dde3ec",
      ink: "#101a2b",
      accent: "#1e3355",
      decorationOne: "#c6a15b",
      decorationTwo: "#8fa3be",
    },
    fontVariable: "--font-cinzel-decorative",
    fontFallback: "Copperplate, Georgia, serif",
    motif: "star",
    ornament: "star",
    titleSize: "clamp(1.9rem, 7.5vw, 2.6rem)",
    titleWeight: "400",
  },
  "olive-cream": {
    displayName: "Verde olivo y crema",
    colors: {
      background: "#f5f2e8",
      surface: "#fffdf7",
      soft: "#e5e3ce",
      ink: "#23281c",
      accent: "#4a5a34",
      decorationOne: "#a8b48a",
      decorationTwo: "#c7b98d",
    },
    fontVariable: "--font-lora",
    fontFallback: '"Iowan Old Style", Georgia, serif',
    motif: "olive",
    ornament: "olive",
    titleSize: "clamp(2.1rem, 8.5vw, 3rem)",
    titleWeight: "700",
  },
  champagne: {
    displayName: "Champaña",
    colors: {
      background: "#f7f0df",
      surface: "#fffcf2",
      soft: "#efe2c6",
      ink: "#2a2318",
      accent: "#6a4a16",
      decorationOne: "#b08a3c",
      decorationTwo: "#d8c48e",
    },
    fontVariable: "--font-cormorant-garamond",
    fontFallback: '"Iowan Old Style", Georgia, serif',
    motif: "laurel",
    ornament: "laurel",
    titleSize: "clamp(2.1rem, 8.8vw, 3.1rem)",
    titleWeight: "500",
  },
  "lavender-silver": {
    displayName: "Lavanda y plata",
    colors: {
      background: "#f4f2f7",
      surface: "#ffffff",
      soft: "#e5e0ee",
      ink: "#221e2b",
      accent: "#4c3d63",
      decorationOne: "#a9a2b8",
      decorationTwo: "#c8bfd9",
    },
    fontVariable: "--font-italiana",
    fontFallback: 'Didot, "Bodoni 72", Georgia, serif',
    motif: "lavender",
    ornament: "lavender",
    titleSize: "clamp(2.3rem, 9.5vw, 3.2rem)",
    titleWeight: "400",
  },
  "terracotta-sage": {
    displayName: "Terracota y salvia",
    colors: {
      background: "#faf3ee",
      surface: "#fffdfb",
      soft: "#f0e1d7",
      ink: "#2c211d",
      accent: "#8a4a2f",
      decorationOne: "#a9b39b",
      decorationTwo: "#c98e6e",
    },
    fontVariable: "--font-josefin-sans",
    fontFallback: '"Avenir Next", "Gill Sans", sans-serif',
    motif: "arch",
    ornament: "arch",
    titleSize: "clamp(2rem, 8vw, 2.8rem)",
    titleWeight: "600",
  },
  "burgundy-gold": {
    displayName: "Borgoña y oro",
    colors: {
      background: "#f8f0f0",
      surface: "#fffcfc",
      soft: "#eedcdc",
      ink: "#241417",
      accent: "#6b1f33",
      decorationOne: "#c09a5a",
      decorationTwo: "#b0808c",
    },
    fontVariable: "--font-great-vibes",
    fontFallback: '"Snell Roundhand", "Apple Chancery", cursive',
    motif: "volutes",
    ornament: "volutes",
    titleSize: "clamp(2.8rem, 12vw, 4rem)",
    titleWeight: "400",
  },
};

/** Whether a stored configuration value names an allowed theme, without prototype lookups. */
export function isElegantTheme(value: unknown): value is ElegantThemeKey {
  return isAllowedTheme(ELEGANT_THEMES, value);
}

/** The red, green, and blue channels of a `#rrggbb` theme color. */
function channels(hex: string): [number, number, number] {
  const digits = hex.replace("#", "");

  return [0, 2, 4].map((start) => Number.parseInt(digits.slice(start, start + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/**
 * The color the arch scrim produces over `underneath`: the theme's `ink` at `ARCH_SCRIM_INK_PERCENT` over
 * the pixels behind it. CSS composites the scrim (`color-mix(in srgb, var(--inv-ink) 80%, transparent)`) in
 * sRGB space, so the test can measure the same worst-case pair the browser paints.
 */
export function scrimColorOver(ink: string, underneath: string): string {
  const ratio = ARCH_SCRIM_INK_PERCENT / 100;
  const mixed = channels(ink).map((channel, index) =>
    Math.round(channel * ratio + (channels(underneath)[index] ?? 0) * (1 - ratio)),
  );

  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
