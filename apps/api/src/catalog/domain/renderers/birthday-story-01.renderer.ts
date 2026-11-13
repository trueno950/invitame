import {
  validateBirthdayContentSchema,
  validateThemedLayoutConfiguration,
} from "./birthday-layout-contract";
import type { RendererContract } from "./renderer-contract";

export const BIRTHDAY_STORY_COMPONENT_KEY = "birthday-story-01";

/**
 * The `birthday-story-01` layout (S7, S8): the Cuento direction
 * (`design/birthday-adventure-v2/03-cuento-ilustrado.html`), an illustrated story whose sections follow the
 * artboard. It applies an allow-listed birthday theme, reads the eight shared birthday content
 * fields, and takes exactly `{ componentKey, theme }` as configuration.
 */
export const birthdayStoryRenderer: RendererContract = {
  componentKey: BIRTHDAY_STORY_COMPONENT_KEY,
  // A themed birthday layout uses no catalog feature: every ACTIVE package fits it.
  requiredFeatureKeys: [],
  validateSchema: validateBirthdayContentSchema,
  validateConfiguration: validateThemedLayoutConfiguration,
};
