import { BABY_SHOWER_ILLUSTRATIONS } from "./registry-baby-shower.ts";
import { BAPTISM_ILLUSTRATIONS } from "./registry-baptism.ts";
import { BIRTHDAY_ILLUSTRATIONS } from "./registry-birthday.ts";
import type { ThemeIllustration } from "./types.ts";

/**
 * The allow-listed registry of paper-cut illustrations, keyed by theme key (I3a; S4). The theme keys of the
 * three occasions are distinct strings, so one map serves the three birthday layouts, the baby shower layout,
 * and the themed baptism layout: a birthday theme is never a baby shower theme.
 *
 * The lines live per occasion — `registry-birthday.ts`, `registry-baby-shower.ts`, `registry-baptism.ts` — so
 * a worker adding themes to one occasion never edits another occasion's lines. Adding a theme is one new
 * drawing file plus one line in its occasion's registry; nothing else in the codebase changes.
 *
 * `THEME_ILLUSTRATIONS` is deliberately a plain object with explicit keys and no computed name: a theme key
 * from a stored `TemplateVersion` is only ever looked up here, never used as a module path.
 */
export const THEME_ILLUSTRATIONS: Readonly<Record<string, ThemeIllustration>> = {
  ...BIRTHDAY_ILLUSTRATIONS,
  ...BABY_SHOWER_ILLUSTRATIONS,
  ...BAPTISM_ILLUSTRATIONS,
};

/** The theme keys that have an illustration today, in registry order. */
export function illustratedThemes(): readonly string[] {
  return Object.keys(THEME_ILLUSTRATIONS);
}

/**
 * The illustration of one theme, or `undefined` when the theme has none and its layout must keep drawing the
 * motif strip it has always drawn. `Object.hasOwn` is the guard: a stored key such as `constructor` or
 * `__proto__` answers `undefined` instead of walking a prototype chain.
 */
export function themeIllustration(theme: string): ThemeIllustration | undefined {
  return Object.hasOwn(THEME_ILLUSTRATIONS, theme) ? THEME_ILLUSTRATIONS[theme] : undefined;
}
