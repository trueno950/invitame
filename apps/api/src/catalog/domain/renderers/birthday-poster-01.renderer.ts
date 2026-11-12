import {
  validateBirthdayContentSchema,
  validateThemedLayoutConfiguration,
} from "./birthday-layout-contract";
import type { RendererContract } from "./renderer-contract";

export const BIRTHDAY_POSTER_COMPONENT_KEY = "birthday-poster-01";

/**
 * The `birthday-poster-01` layout (S7, S8): the Cartel direction
 * (`design/birthday-adventure-v2/02-cartel-fiesta.html`), a festive poster whose sections follow the
 * artboard. It applies an allow-listed birthday theme, reads the eight `birthday-adventure-01` content
 * fields, and takes exactly `{ componentKey, theme }` as configuration.
 */
export const birthdayPosterRenderer: RendererContract = {
  componentKey: BIRTHDAY_POSTER_COMPONENT_KEY,
  // A themed birthday layout uses no catalog feature: every ACTIVE package fits it.
  requiredFeatureKeys: [],
  validateSchema: validateBirthdayContentSchema,
  validateConfiguration: validateThemedLayoutConfiguration,
};
