/**
 * WCAG 2.2 contrast helpers for the theme tokens (M2 T8t; S35). `themeColors` reads the
 * `--color-*` tokens of every `@theme` block in a Tailwind stylesheet, so the contrast test checks
 * the same values the pages use. Pure functions: no file access, no framework.
 */

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const THEME_BLOCK = /@theme(?:\s+[a-z-]+)*\s*\{([^}]*)\}/gi;
const COLOR_TOKEN = /--color-([a-z0-9-]+)\s*:\s*([^;]+);/gi;

/** Expands `#abc` to `#aabbcc` and returns the red, green, and blue channels from 0 to 255. */
function channels(hex: string): [number, number, number] {
  if (!HEX_COLOR.test(hex)) {
    throw new Error(`Not a hex color: ${hex}`);
  }
  const digits = hex.slice(1);
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;
  return [0, 2, 4].map((start) => Number.parseInt(full.slice(start, start + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** Relative luminance as WCAG defines it, from 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = channels(hex).map((value) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The contrast ratio of two colors, from 1 to 21; the order of the arguments does not matter. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * The `--color-*` tokens declared inside `@theme` blocks, keyed by name without the prefix. A block
 * ends at its first closing brace, so keep nested rules such as `@keyframes` out of `@theme`.
 */
export function themeColors(css: string): Map<string, string> {
  const colors = new Map<string, string>();
  for (const [, body = ""] of css.matchAll(THEME_BLOCK)) {
    for (const [, name = "", value = ""] of body.matchAll(COLOR_TOKEN)) {
      colors.set(name, value.trim().toLowerCase());
    }
  }
  return colors;
}

/** One theme color by name; a missing token throws, so a renamed or deleted token fails loudly. */
export function themeColor(colors: ReadonlyMap<string, string>, name: string): string {
  const value = colors.get(name);
  if (value === undefined) {
    throw new Error(`Missing theme color token --color-${name}`);
  }
  return value;
}
