import type { ThemeIllustration } from "./types.ts";

/**
 * The paper-cut illustration of each **baby shower** theme (I3c; S4). One line per theme: the theme key,
 * exactly as `lib/renderers/baby-shower-themes.ts` spells it, and the drawing that lives in its own
 * `<theme-key>.ts` file next to this one — so a theme is one new file plus one line here.
 *
 * A theme without a line keeps the motif strip `baby-shower-classic-01` drew before the illustrations.
 */
export const BABY_SHOWER_ILLUSTRATIONS: Readonly<Record<string, ThemeIllustration>> = {};
