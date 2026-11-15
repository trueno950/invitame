import type { ThemeIllustration } from "./types.ts";

/**
 * The paper-cut illustration of each **themed baptism** theme (I3d; S4). One line per theme: the theme key,
 * exactly as `lib/renderers/baptism-themes.ts` spells it, and the drawing that lives in its own
 * `<theme-key>.ts` file next to this one — so a theme is one new file plus one line here.
 *
 * A theme without a line keeps the motif strip `baptism-classic-01` drew before the illustrations.
 */
export const BAPTISM_ILLUSTRATIONS: Readonly<Record<string, ThemeIllustration>> = {};
