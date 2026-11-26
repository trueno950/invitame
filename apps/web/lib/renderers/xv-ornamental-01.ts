import { ELEGANT_THEMES, type ElegantThemeKey } from "./elegant-themes.ts";
import { parseThemedConfiguration } from "./theme-tokens.ts";
import { parseXVArchContent, type XVArchContent } from "./xv-arch-01.ts";

/**
 * The `xv-ornamental-01` layout — «Ornamental» for XV años (E4b; S5), following
 * `design/elegant-line/02-ornamental.html`: papelería clásica, a centered card with a double rule over
 * textured paper, an original laurel monogram, foil-like hairlines, the name in script, and the photo
 * reduced to a cameo.
 *
 * It is a second visual direction over the content the owner approved for «Arco y foto» (S4), not a second
 * content contract: the fifteen fields and the eight elegant themes are the arch layout's own, so an
 * invitation renders in either elegant layout without migrating and the creator form does not change. The
 * parsers therefore delegate to the arch siblings instead of restating a schema.
 */
export const XV_ORNAMENTAL_COMPONENT_KEY = "xv-ornamental-01";

export interface XVOrnamentalConfiguration {
  readonly componentKey: typeof XV_ORNAMENTAL_COMPONENT_KEY;
  readonly theme: ElegantThemeKey;
}

/** The configuration of a stored version, or a `RendererPropsError` naming every defect. */
export function parseXVOrnamentalConfiguration(value: unknown): XVOrnamentalConfiguration {
  const { theme } = parseThemedConfiguration(XV_ORNAMENTAL_COMPONENT_KEY, ELEGANT_THEMES, value);

  return { componentKey: XV_ORNAMENTAL_COMPONENT_KEY, theme };
}

/** The typed content of a stored version, read by the one XV parser both elegant layouts share. */
export function parseXVOrnamentalContent(
  value: unknown,
  hiddenFields: readonly string[] = [],
): XVArchContent {
  return parseXVArchContent(value, XV_ORNAMENTAL_COMPONENT_KEY, hiddenFields);
}
