import { ELEGANT_THEMES, type ElegantThemeKey } from "./elegant-themes.ts";
import { parseThemedConfiguration } from "./theme-tokens.ts";
import { parseWeddingArchContent, type WeddingArchContent } from "./wedding-arch-01.ts";

/**
 * The `wedding-ornamental-01` layout — «Ornamental» for a wedding (E4b; S5), the second elegant direction
 * for the occasion: the couple's two names in script on a centered card with a double rule, a laurel
 * monogram, the families and sponsors, one block per place of the day, and the photo as a cameo.
 *
 * The eighteen fields and the eight elegant themes are `wedding-arch-01`'s own (S4), so both elegant
 * layouts read the same snapshot and this module only declares the allow-listed key and its configuration.
 */
export const WEDDING_ORNAMENTAL_COMPONENT_KEY = "wedding-ornamental-01";

export interface WeddingOrnamentalConfiguration {
  readonly componentKey: typeof WEDDING_ORNAMENTAL_COMPONENT_KEY;
  readonly theme: ElegantThemeKey;
}

/** The configuration of a stored version, or a `RendererPropsError` naming every defect. */
export function parseWeddingOrnamentalConfiguration(
  value: unknown,
): WeddingOrnamentalConfiguration {
  const { theme } = parseThemedConfiguration(
    WEDDING_ORNAMENTAL_COMPONENT_KEY,
    ELEGANT_THEMES,
    value,
  );

  return { componentKey: WEDDING_ORNAMENTAL_COMPONENT_KEY, theme };
}

/** The typed content of a stored version, read by the one wedding parser both elegant layouts share. */
export function parseWeddingOrnamentalContent(
  value: unknown,
  hiddenFields: readonly string[] = [],
): WeddingArchContent {
  return parseWeddingArchContent(value, WEDDING_ORNAMENTAL_COMPONENT_KEY, hiddenFields);
}
