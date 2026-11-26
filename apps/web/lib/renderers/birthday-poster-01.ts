import { type BirthdayContent, parseBirthdayContent } from "./birthday-content.ts";
import { type BirthdayThemeKey, parseThemedLayoutConfiguration } from "./birthday-themes.ts";

/**
 * The `birthday-poster-01` layout — Cartel de fiesta (T6b; S2, S7, S8), following
 * `design/birthday-adventure-v2/02-cartel-fiesta.html`. The layout is coded once and the theme supplies the
 * palette, the licensed display font, and the motif, so one renderer serves all eight themes. Its
 * configuration is exactly `{componentKey, theme}`, and the section order is fixed by the artboard:
 * the poster band, the admission ticket, and the message bubble.
 */
export const BIRTHDAY_POSTER_COMPONENT_KEY = "birthday-poster-01";

export interface BirthdayPosterConfiguration {
  readonly componentKey: typeof BIRTHDAY_POSTER_COMPONENT_KEY;
  readonly theme: BirthdayThemeKey;
}

/** The configuration of a stored `birthday-poster-01` version, or a `RendererPropsError` naming every defect. */
export function parseBirthdayPosterConfiguration(value: unknown): BirthdayPosterConfiguration {
  const { theme } = parseThemedLayoutConfiguration(BIRTHDAY_POSTER_COMPONENT_KEY, value);

  return { componentKey: BIRTHDAY_POSTER_COMPONENT_KEY, theme };
}

/** The shared eight content fields of a stored `birthday-poster-01` version. */
export function parseBirthdayPosterContent(
  value: unknown,
  hiddenFields: readonly string[] = [],
): BirthdayContent {
  return parseBirthdayContent(BIRTHDAY_POSTER_COMPONENT_KEY, value, hiddenFields);
}
