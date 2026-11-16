import { type BirthdayContent, parseBirthdayContent } from "./birthday-content.ts";
import { type BirthdayThemeKey, parseThemedLayoutConfiguration } from "./birthday-themes.ts";

/**
 * The `birthday-map-01` layout — Mapa de aventura (T6b; S2, S7, S8), following
 * `design/birthday-adventure-v2/01-mapa-aventura.html`. The layout is coded once and the theme supplies the
 * palette, the licensed display font, and the motif, so one renderer serves all eight themes. Its
 * configuration is exactly `{componentKey, theme}`, and the section order is fixed by the artboard:
 * the hero, «La ruta de la fiesta» with the three stops, and the message scroll.
 */
export const BIRTHDAY_MAP_COMPONENT_KEY = "birthday-map-01";

export interface BirthdayMapConfiguration {
  readonly componentKey: typeof BIRTHDAY_MAP_COMPONENT_KEY;
  readonly theme: BirthdayThemeKey;
}

/** The configuration of a stored `birthday-map-01` version, or a `RendererPropsError` naming every defect. */
export function parseBirthdayMapConfiguration(value: unknown): BirthdayMapConfiguration {
  const { theme } = parseThemedLayoutConfiguration(BIRTHDAY_MAP_COMPONENT_KEY, value);

  return { componentKey: BIRTHDAY_MAP_COMPONENT_KEY, theme };
}

/** The shared eight content fields of a stored `birthday-map-01` version. */
export function parseBirthdayMapContent(value: unknown): BirthdayContent {
  return parseBirthdayContent(BIRTHDAY_MAP_COMPONENT_KEY, value);
}
