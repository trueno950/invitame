import { DOVE_OLIVE_ILLUSTRATION } from "./dove-olive.ts";
import { LITTLE_ANGELS_ILLUSTRATION } from "./little-angels.ts";
import { LITTLE_LAMB_ILLUSTRATION } from "./little-lamb.ts";
import { SKY_CLOUDS_ILLUSTRATION } from "./sky-clouds.ts";
import { SOFT_FLORAL_ILLUSTRATION } from "./soft-floral.ts";
import { STAR_LIGHT_ILLUSTRATION } from "./star-light.ts";
import type { ThemeIllustration } from "./types.ts";

/**
 * The paper-cut illustration of each **themed baptism** theme (I3d; S4). One line per theme: the theme key,
 * exactly as `lib/renderers/baptism-themes.ts` spells it, and the drawing that lives in its own
 * `<theme-key>.ts` file next to this one — so a theme is one new file plus one line here.
 *
 * A theme without a line keeps the motif strip `baptism-classic-01` drew before the illustrations.
 */
export const BAPTISM_ILLUSTRATIONS: Readonly<Record<string, ThemeIllustration>> = {
  "dove-olive": DOVE_OLIVE_ILLUSTRATION,
  "little-angels": LITTLE_ANGELS_ILLUSTRATION,
  "sky-clouds": SKY_CLOUDS_ILLUSTRATION,
  "soft-floral": SOFT_FLORAL_ILLUSTRATION,
  "little-lamb": LITTLE_LAMB_ILLUSTRATION,
  "star-light": STAR_LIGHT_ILLUSTRATION,
};
