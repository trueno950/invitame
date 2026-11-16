import { BLOCKS_AND_PIXELS_ILLUSTRATION } from "./blocks-and-pixels.ts";
import { CLASSIC_MOUSE_ILLUSTRATION } from "./classic-mouse.ts";
import { DINOSAURS_ILLUSTRATION } from "./dinosaurs.ts";
import { FAIRYTALE_PRINCESS_ILLUSTRATION } from "./fairytale-princess.ts";
import { ICE_KINGDOM_ILLUSTRATION } from "./ice-kingdom.ts";
import { RESCUE_TEAM_ILLUSTRATION } from "./rescue-team.ts";
import { SPIDER_HERO_ILLUSTRATION } from "./spider-hero.ts";
import type { ThemeIllustration } from "./types.ts";
import { UNDER_THE_SEA_ILLUSTRATION } from "./under-the-sea.ts";

/**
 * The paper-cut illustration of each **birthday** theme (I3a, I3b; S4). One line per theme: the theme key,
 * exactly as `lib/renderers/birthday-themes.ts` spells it, and the drawing that lives in its own
 * `<theme-key>.ts` file next to this one — so a theme is one new file plus one line here.
 *
 * A theme without a line keeps the motif strip its layout drew before the illustrations.
 */
export const BIRTHDAY_ILLUSTRATIONS: Readonly<Record<string, ThemeIllustration>> = {
  "blocks-and-pixels": BLOCKS_AND_PIXELS_ILLUSTRATION,
  "classic-mouse": CLASSIC_MOUSE_ILLUSTRATION,
  dinosaurs: DINOSAURS_ILLUSTRATION,
  "fairytale-princess": FAIRYTALE_PRINCESS_ILLUSTRATION,
  "ice-kingdom": ICE_KINGDOM_ILLUSTRATION,
  "rescue-team": RESCUE_TEAM_ILLUSTRATION,
  "spider-hero": SPIDER_HERO_ILLUSTRATION,
  "under-the-sea": UNDER_THE_SEA_ILLUSTRATION,
};
