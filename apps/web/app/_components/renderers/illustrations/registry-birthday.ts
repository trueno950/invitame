import { DINOSAURS_ILLUSTRATION } from "./dinosaurs.ts";
import type { ThemeIllustration } from "./types.ts";

/**
 * The paper-cut illustration of each **birthday** theme (I3a, I3b; S4). One line per theme: the theme key,
 * exactly as `lib/renderers/birthday-themes.ts` spells it, and the drawing that lives in its own
 * `<theme-key>.ts` file next to this one — so a theme is one new file plus one line here.
 *
 * A theme without a line keeps the motif strip its layout drew before the illustrations.
 */
export const BIRTHDAY_ILLUSTRATIONS: Readonly<Record<string, ThemeIllustration>> = {
  dinosaurs: DINOSAURS_ILLUSTRATION,
};
