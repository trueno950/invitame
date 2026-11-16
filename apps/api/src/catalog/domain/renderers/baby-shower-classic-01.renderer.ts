import { BABY_SHOWER_THEMES } from "./baby-shower-themes";
import type { RendererContract } from "./renderer-contract";
import {
  type RendererField,
  validateRendererSchema,
  validateThemedConfiguration,
} from "./renderer-contract";

export const BABY_SHOWER_CLASSIC_COMPONENT_KEY = "baby-shower-classic-01";

/**
 * The content the `baby-shower-classic-01` layout reads (S13), from
 * `design/celebration-themes/01-baby-shower.html`. A baby shower has no age to announce: the hosts, the
 * date and time, the place, the message, and who confirms attendance are required, and the baby's name,
 * the gender reveal, the gift registry, and the main photo are optional because a shower can be a surprise.
 */
export const BABY_SHOWER_CONTENT_FIELDS: readonly RendererField[] = [
  { name: "hosts", type: "string" },
  { name: "date", type: "string" },
  { name: "time", type: "string" },
  { name: "location", type: "string" },
  { name: "address", type: "string" },
  { name: "message", type: "string" },
  { name: "rsvpContact", type: "string" },
  { name: "babyName", type: "string", presence: "optional" },
  { name: "genderReveal", type: "boolean", presence: "optional" },
  { name: "giftRegistry", type: "string", presence: "optional" },
  { name: "mainPhoto", type: "string", presence: "optional" },
];

/**
 * The `baby-shower-classic-01` layout (S13): the «Clásica» full-page form of the board's approved preview,
 * an accent band with the baby's name and the date, information rows, and place cards. It applies an
 * allow-listed baby shower theme and takes exactly `{ componentKey, theme }` as configuration.
 */
export const babyShowerClassicRenderer: RendererContract = {
  componentKey: BABY_SHOWER_CLASSIC_COMPONENT_KEY,
  // A themed layout uses no catalog feature: every ACTIVE package fits it.
  requiredFeatureKeys: [],
  validateSchema: (schema) => validateRendererSchema(schema, BABY_SHOWER_CONTENT_FIELDS),
  validateConfiguration: (configuration, componentKey) =>
    validateThemedConfiguration(configuration, componentKey, BABY_SHOWER_THEMES),
};
