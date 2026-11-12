import {
  validateBirthdayContentSchema,
  validateThemedLayoutConfiguration,
} from "./birthday-layout-contract";
import type { RendererContract } from "./renderer-contract";

export const BIRTHDAY_MAP_COMPONENT_KEY = "birthday-map-01";

/**
 * The `birthday-map-01` layout (S7, S8): the Mapa direction (`design/birthday-adventure-v2/01-mapa-aventura.html`),
 * an adventure map whose sections follow the artboard. It applies an allow-listed birthday theme, reads the
 * eight `birthday-adventure-01` content fields, and takes exactly `{ componentKey, theme }` as configuration.
 */
export const birthdayMapRenderer: RendererContract = {
  componentKey: BIRTHDAY_MAP_COMPONENT_KEY,
  // A themed birthday layout uses no catalog feature: every ACTIVE package fits it.
  requiredFeatureKeys: [],
  validateSchema: validateBirthdayContentSchema,
  validateConfiguration: validateThemedLayoutConfiguration,
};
