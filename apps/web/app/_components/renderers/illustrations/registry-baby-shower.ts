import { BABY_SAFARI_ILLUSTRATION } from "./baby-safari.ts";
import { BOHO_RAINBOW_ILLUSTRATION } from "./boho-rainbow.ts";
import { CLOUDS_STARS_ILLUSTRATION } from "./clouds-stars.ts";
import { HOT_AIR_BALLOONS_ILLUSTRATION } from "./hot-air-balloons.ts";
import { LITTLE_MOON_ILLUSTRATION } from "./little-moon.ts";
import { SWEET_BUNNY_ILLUSTRATION } from "./sweet-bunny.ts";
import { TEDDY_HONEY_ILLUSTRATION } from "./teddy-honey.ts";
import type { ThemeIllustration } from "./types.ts";
import { WOODLAND_FRIENDS_ILLUSTRATION } from "./woodland-friends.ts";

/**
 * The paper-cut illustration of each **baby shower** theme (I3c; S4). One line per theme: the theme key,
 * exactly as `lib/renderers/baby-shower-themes.ts` spells it, and the drawing that lives in its own
 * `<theme-key>.ts` file next to this one — so a theme is one new file plus one line here.
 *
 * A theme without a line keeps the motif strip `baby-shower-classic-01` drew before the illustrations.
 */
export const BABY_SHOWER_ILLUSTRATIONS: Readonly<Record<string, ThemeIllustration>> = {
  "teddy-honey": TEDDY_HONEY_ILLUSTRATION,
  "clouds-stars": CLOUDS_STARS_ILLUSTRATION,
  "baby-safari": BABY_SAFARI_ILLUSTRATION,
  "hot-air-balloons": HOT_AIR_BALLOONS_ILLUSTRATION,
  "boho-rainbow": BOHO_RAINBOW_ILLUSTRATION,
  "little-moon": LITTLE_MOON_ILLUSTRATION,
  "woodland-friends": WOODLAND_FRIENDS_ILLUSTRATION,
  "sweet-bunny": SWEET_BUNNY_ILLUSTRATION,
};
