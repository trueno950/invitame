import { type BaptismContent, parseBaptismContent } from "./baptism-classic-01.ts";
import { ELEGANT_THEMES, type ElegantThemeKey } from "./elegant-themes.ts";
import { parseThemedConfiguration } from "./theme-tokens.ts";

/**
 * The `baptism-ornamental-01` layout — «Ornamental» for the formal baptism (E4b; S5), the third design of
 * the `baptism` category next to the themed «Clásica» and the elegant «Arco y foto». The content does not
 * change: it reuses the themed baptism schema exactly, through the one shared baptism parser, so no
 * published invitation migrates and the creator form stays the same. What changes is the layout, the
 * theme, and the ornament.
 */
export const BAPTISM_ORNAMENTAL_COMPONENT_KEY = "baptism-ornamental-01";

export interface BaptismOrnamentalConfiguration {
  readonly componentKey: typeof BAPTISM_ORNAMENTAL_COMPONENT_KEY;
  readonly theme: ElegantThemeKey;
}

/** The configuration of a stored version, or a `RendererPropsError` naming every defect. */
export function parseBaptismOrnamentalConfiguration(
  value: unknown,
): BaptismOrnamentalConfiguration {
  const { theme } = parseThemedConfiguration(
    BAPTISM_ORNAMENTAL_COMPONENT_KEY,
    ELEGANT_THEMES,
    value,
  );

  return { componentKey: BAPTISM_ORNAMENTAL_COMPONENT_KEY, theme };
}

/** The typed content of a stored version, read by the one baptism parser every baptism layout shares. */
export function parseBaptismOrnamentalContent(value: unknown): BaptismContent {
  return parseBaptismContent(BAPTISM_ORNAMENTAL_COMPONENT_KEY, value);
}
