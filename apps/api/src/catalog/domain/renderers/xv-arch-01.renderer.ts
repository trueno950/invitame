import { ELEGANT_THEMES } from "./elegant-themes";
import type { RendererContract } from "./renderer-contract";
import {
  type RendererField,
  validateRendererSchema,
  validateThemedConfiguration,
} from "./renderer-contract";

export const XV_ARCH_COMPONENT_KEY = "xv-arch-01";

/**
 * The content the `xv-arch-01` layout reads (S4), from
 * `design/elegant-line/05-datos-por-ocasion.html`. A fifteenth birthday announces the celebrant (never the
 * age, which is always fifteen), the parents and the honor sponsors, and happens in two places: the ceremony
 * and the reception, each with its own place, address, and time. The dress code, the message, and who
 * confirms attendance are required; the chambelanes, the gift registry, and the main photo are optional, and
 * the lists are one bounded text field with one name per line.
 */
export const XV_ARCH_CONTENT_FIELDS: readonly RendererField[] = [
  { name: "celebrantName", type: "string", essential: true },
  { name: "date", type: "string", essential: true },
  { name: "parents", type: "string" },
  { name: "honorSponsors", type: "string" },
  { name: "ceremonyPlace", type: "string" },
  { name: "ceremonyAddress", type: "string" },
  { name: "ceremonyTime", type: "string" },
  { name: "receptionPlace", type: "string" },
  { name: "receptionAddress", type: "string" },
  { name: "receptionTime", type: "string" },
  { name: "dressCode", type: "string" },
  { name: "message", type: "string" },
  { name: "rsvpContact", type: "string" },
  { name: "chambelanes", type: "string", presence: "optional" },
  { name: "giftRegistry", type: "string", presence: "optional" },
  { name: "mainPhoto", type: "string", presence: "optional" },
];

/**
 * The `xv-arch-01` layout (S4): the «Arco y foto» form of the elegant board, an ornamented arch that frames
 * the photo — or a theme-colored wash with the theme's ornament when there is none — and puts the celebrant's
 * name over it at AA contrast. It applies an allow-listed elegant theme and takes exactly
 * `{ componentKey, theme }` as configuration.
 */
export const xvArchRenderer: RendererContract = {
  componentKey: XV_ARCH_COMPONENT_KEY,
  // A themed layout uses no catalog feature: every ACTIVE package fits it.
  requiredFeatureKeys: [],
  validateSchema: (schema) => validateRendererSchema(schema, XV_ARCH_CONTENT_FIELDS),
  validateConfiguration: (configuration, componentKey) =>
    validateThemedConfiguration(configuration, componentKey, ELEGANT_THEMES),
};
