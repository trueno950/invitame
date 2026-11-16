import { ELEGANT_THEMES } from "./elegant-themes";
import type { RendererContract } from "./renderer-contract";
import { validateRendererSchema, validateThemedConfiguration } from "./renderer-contract";
import { WEDDING_ARCH_CONTENT_FIELDS } from "./wedding-arch-01.renderer";

export const WEDDING_ORNAMENTAL_COMPONENT_KEY = "wedding-ornamental-01";

/**
 * The `wedding-ornamental-01` layout (S5): «Ornamental — papelería clásica», the second elegant layout for
 * weddings, a centered card with a double rule over textured paper and a fine-line laurel instead of the arch.
 * It is a new visual layout, not a new content contract: the content fields are imported from
 * `wedding-arch-01`, so both elegant layouts of the occasion read the same invitation data and no published
 * invitation migrates. It applies the shared elegant theme allow-list and takes exactly
 * `{ componentKey, theme }` as configuration.
 */
export const weddingOrnamentalRenderer: RendererContract = {
  componentKey: WEDDING_ORNAMENTAL_COMPONENT_KEY,
  // A themed layout uses no catalog feature: every ACTIVE package fits it.
  requiredFeatureKeys: [],
  validateSchema: (schema) => validateRendererSchema(schema, WEDDING_ARCH_CONTENT_FIELDS),
  validateConfiguration: (configuration, componentKey) =>
    validateThemedConfiguration(configuration, componentKey, ELEGANT_THEMES),
};
