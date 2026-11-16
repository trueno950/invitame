import { ELEGANT_THEMES } from "./elegant-themes";
import type { RendererContract } from "./renderer-contract";
import { validateRendererSchema, validateThemedConfiguration } from "./renderer-contract";
import { XV_ARCH_CONTENT_FIELDS } from "./xv-arch-01.renderer";

export const XV_ORNAMENTAL_COMPONENT_KEY = "xv-ornamental-01";

/**
 * The `xv-ornamental-01` layout (S5): «Ornamental — papelería clásica», the second elegant layout for XV años,
 * a centered card with a double rule over textured paper and a fine-line laurel instead of the arch. It is a
 * new visual layout, not a new content contract: the content fields are imported from `xv-arch-01`, so both
 * elegant layouts of the occasion read the same invitation data and no published invitation migrates. It
 * applies the shared elegant theme allow-list and takes exactly `{ componentKey, theme }` as configuration.
 */
export const xvOrnamentalRenderer: RendererContract = {
  componentKey: XV_ORNAMENTAL_COMPONENT_KEY,
  // A themed layout uses no catalog feature: every ACTIVE package fits it.
  requiredFeatureKeys: [],
  validateSchema: (schema) => validateRendererSchema(schema, XV_ARCH_CONTENT_FIELDS),
  validateConfiguration: (configuration, componentKey) =>
    validateThemedConfiguration(configuration, componentKey, ELEGANT_THEMES),
};
