import { BAPTISM_CONTENT_FIELDS } from "./baptism-classic-01.renderer";
import { ELEGANT_THEMES } from "./elegant-themes";
import type { RendererContract } from "./renderer-contract";
import { validateRendererSchema, validateThemedConfiguration } from "./renderer-contract";

export const BAPTISM_ARCH_COMPONENT_KEY = "baptism-arch-01";

/**
 * The `baptism-arch-01` layout (S4): the formal baptism next to the themed one. It is a new visual layout and
 * a new theme allow-list, but it reuses the themed baptism content fields exactly — same names, same types,
 * same optional fields — so a baptism needs no new form and a published invitation keeps reading its pinned
 * version. The content list is imported instead of copied, so the two layouts cannot drift apart.
 */
export const baptismArchRenderer: RendererContract = {
  componentKey: BAPTISM_ARCH_COMPONENT_KEY,
  // A themed layout uses no catalog feature: every ACTIVE package fits it.
  requiredFeatureKeys: [],
  validateSchema: (schema) => validateRendererSchema(schema, BAPTISM_CONTENT_FIELDS),
  validateConfiguration: (configuration, componentKey) =>
    validateThemedConfiguration(configuration, componentKey, ELEGANT_THEMES),
};
