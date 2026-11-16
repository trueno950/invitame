import { type BaptismContent, parseBaptismContent } from "./baptism-classic-01.ts";
import { ELEGANT_THEMES, type ElegantThemeKey } from "./elegant-themes.ts";
import { parseThemedConfiguration } from "./theme-tokens.ts";

/**
 * The `baptism-arch-01` layout — «Arco y foto» for the formal baptism (E3c; S3, S4), the elegant version of
 * the themed baptism that sits next to it in the catalog. The content does not change: it reuses the themed
 * baptism schema exactly (child, date, parents, godparents, both places with their address and time, the
 * message, the RSVP, and the optional photo and gift registry), so no published invitation is migrated and
 * the creator form stays the same. What changes is the layout, the theme, and the ornament.
 */
export const BAPTISM_ARCH_COMPONENT_KEY = "baptism-arch-01";

export interface BaptismArchConfiguration {
  readonly componentKey: typeof BAPTISM_ARCH_COMPONENT_KEY;
  readonly theme: ElegantThemeKey;
}

/** The configuration of a stored version, or a `RendererPropsError` naming every defect. */
export function parseBaptismArchConfiguration(value: unknown): BaptismArchConfiguration {
  const { theme } = parseThemedConfiguration(BAPTISM_ARCH_COMPONENT_KEY, ELEGANT_THEMES, value);

  return { componentKey: BAPTISM_ARCH_COMPONENT_KEY, theme };
}

/** The typed content of a stored version, read by the one baptism parser both layouts share. */
export function parseBaptismArchContent(value: unknown): BaptismContent {
  return parseBaptismContent(BAPTISM_ARCH_COMPONENT_KEY, value);
}
