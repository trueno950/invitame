import { ELEGANT_THEMES } from "./elegant-themes";
import type { RendererContract } from "./renderer-contract";
import {
  type RendererField,
  validateRendererSchema,
  validateThemedConfiguration,
} from "./renderer-contract";

export const WEDDING_ARCH_COMPONENT_KEY = "wedding-arch-01";

/**
 * The content the `wedding-arch-01` layout reads (S4), from
 * `design/elegant-line/05-datos-por-ocasion.html`. A wedding announces the couple in two names, and happens in
 * two places: the ceremony and the reception, each with its own place, address, and time. The dress code, the
 * message, and who confirms attendance are required. The two families, the wedding sponsors, the gift
 * registry, the main photo, and the hashtag are optional, and the lists are one bounded text field with one
 * name per line.
 */
export const WEDDING_ARCH_CONTENT_FIELDS: readonly RendererField[] = [
  { name: "coupleNameOne", type: "string", essential: true },
  { name: "coupleNameTwo", type: "string", essential: true },
  { name: "date", type: "string", essential: true },
  { name: "ceremonyPlace", type: "string" },
  { name: "ceremonyAddress", type: "string" },
  { name: "ceremonyTime", type: "string" },
  { name: "receptionPlace", type: "string" },
  { name: "receptionAddress", type: "string" },
  { name: "receptionTime", type: "string" },
  { name: "dressCode", type: "string" },
  { name: "message", type: "string" },
  { name: "rsvpContact", type: "string" },
  { name: "firstFamilyParents", type: "string", presence: "optional" },
  { name: "secondFamilyParents", type: "string", presence: "optional" },
  { name: "weddingSponsors", type: "string", presence: "optional" },
  { name: "giftRegistry", type: "string", presence: "optional" },
  { name: "mainPhoto", type: "string", presence: "optional" },
  { name: "hashtag", type: "string", presence: "optional" },
];

/**
 * The `wedding-arch-01` layout (S4): the «Arco y foto» form of the elegant board, an ornamented arch that
 * frames the photo — or a theme-colored wash with the theme's ornament when there is none — and puts the
 * couple's names over it at AA contrast. It applies an allow-listed elegant theme and takes exactly
 * `{ componentKey, theme }` as configuration.
 */
export const weddingArchRenderer: RendererContract = {
  componentKey: WEDDING_ARCH_COMPONENT_KEY,
  // A themed layout uses no catalog feature: every ACTIVE package fits it.
  requiredFeatureKeys: [],
  validateSchema: (schema) => validateRendererSchema(schema, WEDDING_ARCH_CONTENT_FIELDS),
  validateConfiguration: (configuration, componentKey) =>
    validateThemedConfiguration(configuration, componentKey, ELEGANT_THEMES),
};
