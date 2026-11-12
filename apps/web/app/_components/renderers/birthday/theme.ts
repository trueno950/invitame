import type { CSSProperties } from "react";

import type { BirthdayTheme, ThemeColorRole } from "../../../../lib/renderers/birthday-themes.ts";

/**
 * The color of text and decoration on the theme's `accent` surface (T6c). It is not part of the seven board
 * colors: it is the theme's contrast partner, white for all eight themes (checked at 4.5:1 in
 * `birthday-themes.test.ts`). It is a theme variable so no layout writes a literal `white` — `globals.css`
 * resets the Tailwind palette, so a default-palette utility such as `text-white` compiles to nothing.
 */
export const ON_ACCENT = "#ffffff";

/** The CSS variable each theme color reaches the markup as; the roles are camelCase, the properties kebab. */
export const THEME_VARIABLES: Readonly<Record<ThemeColorRole, string>> = {
  background: "--inv-background",
  surface: "--inv-surface",
  soft: "--inv-soft",
  ink: "--inv-ink",
  accent: "--inv-accent",
  decorationOne: "--inv-decoration-one",
  decorationTwo: "--inv-decoration-two",
};

/**
 * The bridge between a theme and the coded layouts (T6b; S2, S8): every color reaches the markup as a CSS
 * variable, so the same Tailwind classes draw all eight themes and no color is ever a literal in a
 * component. `--inv-display` resolves the licensed display font that `app/layout.tsx` exposes as
 * `--font-<family>`, with the theme board's fallback stack behind it.
 */
export function themeStyle(theme: BirthdayTheme): CSSProperties {
  return {
    [THEME_VARIABLES.background]: theme.colors.background,
    [THEME_VARIABLES.surface]: theme.colors.surface,
    [THEME_VARIABLES.soft]: theme.colors.soft,
    [THEME_VARIABLES.ink]: theme.colors.ink,
    [THEME_VARIABLES.accent]: theme.colors.accent,
    [THEME_VARIABLES.decorationOne]: theme.colors.decorationOne,
    [THEME_VARIABLES.decorationTwo]: theme.colors.decorationTwo,
    "--inv-on-accent": ON_ACCENT,
    "--inv-display": `var(${theme.fontVariable}), ${theme.fontFallback}`,
  } as CSSProperties;
}

/** The display font of the theme: names and titles only, never body text (S8). */
export const DISPLAY_FONT: CSSProperties = { fontFamily: "var(--inv-display)" };

/** The name/title of a themed layout: the theme's display font at its fluid size, tight leading. */
export function titleStyle(theme: BirthdayTheme): CSSProperties {
  return { ...DISPLAY_FONT, fontSize: theme.titleSize, lineHeight: 1.1 };
}

/** The root of every themed invitation: the layout is mobile-first and never wider than 30 rem. */
export const INVITATION_ROOT =
  "mx-auto flex w-full max-w-[30rem] flex-col font-sans text-(color:--inv-ink)";
