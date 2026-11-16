import { type BirthdayContent, parseBirthdayContent } from "./birthday-content.ts";
import { type BirthdayThemeKey, parseThemedLayoutConfiguration } from "./birthday-themes.ts";

/**
 * The `birthday-story-01` layout — Cuento ilustrado (T6b; S2, S7, S8), following
 * `design/birthday-adventure-v2/03-cuento-ilustrado.html`. The layout is coded once and the theme supplies the
 * palette, the licensed display font, and the motif, so one renderer serves all eight themes. Its
 * configuration is exactly `{componentKey, theme}`, and the section order is fixed by the artboard:
 * the story opening, «Capítulo 1 · Detalles», «Capítulo 2 · Lugar», and «Capítulo 3 · Mensaje».
 */
export const BIRTHDAY_STORY_COMPONENT_KEY = "birthday-story-01";

export interface BirthdayStoryConfiguration {
  readonly componentKey: typeof BIRTHDAY_STORY_COMPONENT_KEY;
  readonly theme: BirthdayThemeKey;
}

/** The configuration of a stored `birthday-story-01` version, or a `RendererPropsError` naming every defect. */
export function parseBirthdayStoryConfiguration(value: unknown): BirthdayStoryConfiguration {
  const { theme } = parseThemedLayoutConfiguration(BIRTHDAY_STORY_COMPONENT_KEY, value);

  return { componentKey: BIRTHDAY_STORY_COMPONENT_KEY, theme };
}

/** The shared eight content fields of a stored `birthday-story-01` version. */
export function parseBirthdayStoryContent(value: unknown): BirthdayContent {
  return parseBirthdayContent(BIRTHDAY_STORY_COMPONENT_KEY, value);
}
