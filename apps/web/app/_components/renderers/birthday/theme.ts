/**
 * The theme bridge of the children's birthday layouts (T6b; S2, S8). It is the shared themed-layout module
 * that the celebration layouts use too (T7c; S13), so one implementation keeps every layout on CSS variables
 * and one on-accent token; re-exported here because the birthday renderers and their tests name it from this
 * path. See `../themed/theme.ts` for the contract.
 */
export {
  BACKGROUND_LAYER,
  DISPLAY_FONT,
  displayFontStyle,
  INVITATION_ROOT,
  ON_ACCENT,
  THEME_VARIABLES,
  themeStyle,
  titleStyle,
} from "../themed/theme.ts";
