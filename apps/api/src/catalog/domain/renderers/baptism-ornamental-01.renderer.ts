import { BAPTISM_CONTENT_FIELDS } from "./baptism-classic-01.renderer";
import { ELEGANT_THEMES } from "./elegant-themes";
import type { RendererContract } from "./renderer-contract";
import { validateRendererSchema, validateThemedConfiguration } from "./renderer-contract";

export const BAPTISM_ORNAMENTAL_COMPONENT_KEY = "baptism-ornamental-01";

/**
 * The `baptism-ornamental-01` layout (S5): «Ornamental — papelería clásica», the second elegant layout for the
 * formal baptism, a centered card with a double rule over textured paper and a fine-line laurel instead of the
 * arch. It is a new visual layout, not a new content contract: the content fields are the themed baptism fields
 * exactly, imported instead of copied, so the two elegant layouts of the occasion and the themed layout cannot
 * drift apart and a baptism needs no new form. It applies the shared elegant theme allow-list and takes exactly
 * `{ componentKey, theme }` as configuration.
 */
export const baptismOrnamentalRenderer: RendererContract = {
  componentKey: BAPTISM_ORNAMENTAL_COMPONENT_KEY,
  // A themed layout uses no catalog feature: every ACTIVE package fits it.
  requiredFeatureKeys: [],
  validateSchema: (schema) => validateRendererSchema(schema, BAPTISM_CONTENT_FIELDS),
  validateConfiguration: (configuration, componentKey) =>
    validateThemedConfiguration(configuration, componentKey, ELEGANT_THEMES),
};
