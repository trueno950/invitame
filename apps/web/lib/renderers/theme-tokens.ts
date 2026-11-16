import { RendererPropsError } from "./renderer-props-error.ts";

/**
 * The shared shape of a themed invitation (T7c; S13). Every themed layout — the three children's birthday
 * ones and the two celebration layouts — takes its look from one theme: seven colors, one licensed display
 * font, and one original motif. A theme is data, and the layout is coded once, so one renderer serves every
 * palette (S2). This module holds what all themed layouts have in common, so a second occasion adds themes
 * instead of a second copy of the configuration rules.
 */

/** The seven colors of a theme, in the order the theme boards show them. Decoration never carries text. */
export const THEME_COLOR_ROLES = [
  "background",
  "surface",
  "soft",
  "ink",
  "accent",
  "decorationOne",
  "decorationTwo",
] as const;

export type ThemeColorRole = (typeof THEME_COLOR_ROLES)[number];
export type ThemeColors = Readonly<Record<ThemeColorRole, string>>;

/** What a themed layout reads from one theme, whichever occasion the theme belongs to. */
export interface InvitationTheme {
  /** The neutral Spanish name the catalog uses, without a protected name (S5). */
  readonly displayName: string;
  /** `ink` and `accent` keep 4.5:1 on `background`, `surface`, and `soft`; white keeps 4.5:1 on `accent`. */
  readonly colors: ThemeColors;
  /** The CSS variable `app/layout.tsx` sets for the theme's licensed display font. */
  readonly fontVariable: string;
  /** The font stack behind the display font, from the theme board. */
  readonly fontFallback: string;
  /** The original motif the theme draws; the layout's motif component renders it. */
  readonly motif: string;
  /**
   * The title size as a CSS length with a fluid step, applied inline: a script face and a wide grid need
   * different widths, so one Tailwind scale cannot serve every theme at 390 px.
   */
  readonly titleSize: string;
  /**
   * The weight the theme's display font is loaded at (T7b). A title sets exactly this weight: a face loaded
   * at a single weight would otherwise be synthetically emboldened.
   */
  readonly titleWeight?: string;
}

/** Whether `value` is one of `allowed`, compared by equality and never through a prototype chain. */
export function isAllowedTheme<Theme extends string>(
  allowed: readonly Theme[],
  value: unknown,
): value is Theme {
  return typeof value === "string" && allowed.some((theme) => theme === value);
}

const CONFIGURATION_KEYS = ["componentKey", "theme"] as const;

/**
 * The configuration of a themed layout is exactly `{componentKey, theme}` (S8, S13). Both keys are
 * required; an extra key, another layout's key, a wrongly typed theme, and an unknown theme are refused, so
 * a drifted snapshot never renders. The API enforces the same shape before publication.
 */
export function parseThemedConfiguration<Key extends string, Theme extends string>(
  componentKey: Key,
  allowedThemes: readonly Theme[],
  value: unknown,
): { readonly componentKey: Key; readonly theme: Theme } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RendererPropsError(componentKey, "configuration", [
      "configuration must be a JSON object",
    ]);
  }

  const configuration = value as Record<string, unknown>;
  const issues: string[] = [];

  for (const key of Object.keys(configuration)) {
    if (!CONFIGURATION_KEYS.some((allowed) => allowed === key)) {
      issues.push(
        `configuration.${key} is not allowed; allowed keys: ${CONFIGURATION_KEYS.join(", ")}`,
      );
    }
  }
  for (const key of CONFIGURATION_KEYS) {
    if (!Object.hasOwn(configuration, key)) {
      issues.push(`configuration.${key} is required`);
    }
  }

  if (Object.hasOwn(configuration, "componentKey") && configuration.componentKey !== componentKey) {
    issues.push(`configuration.componentKey must be ${JSON.stringify(componentKey)}`);
  }

  const theme = Object.hasOwn(configuration, "theme") ? configuration.theme : undefined;

  if (Object.hasOwn(configuration, "theme") && !isAllowedTheme(allowedThemes, theme)) {
    issues.push(`configuration.theme must be one of: ${allowedThemes.join(", ")}`);
  }

  if (issues.length > 0 || !isAllowedTheme(allowedThemes, theme)) {
    throw new RendererPropsError(componentKey, "configuration", issues);
  }
  return { componentKey, theme };
}
