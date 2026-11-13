import { BAPTISM_THEMES } from "./baptism-themes";
import type { RendererContract } from "./renderer-contract";
import {
  type RendererField,
  validateRendererSchema,
  validateThemedConfiguration,
} from "./renderer-contract";

export const BAPTISM_CLASSIC_COMPONENT_KEY = "baptism-classic-01";

/**
 * The content the `baptism-classic-01` layout reads (S13), from
 * `design/celebration-themes/02-bautizo-tematico.html`. A baptism announces a person instead of an age and
 * usually happens in two places: the ceremony (place, address, and time) and the reception (place, address,
 * and time) are separate required blocks, together with the parents, the godparents, the message, and who
 * confirms attendance. The main photo and the gift registry are optional.
 */
export const BAPTISM_CONTENT_FIELDS: readonly RendererField[] = [
  { name: "celebrantName", type: "string" },
  { name: "date", type: "string" },
  { name: "parents", type: "string" },
  { name: "godparents", type: "string" },
  { name: "ceremonyPlace", type: "string" },
  { name: "ceremonyAddress", type: "string" },
  { name: "ceremonyTime", type: "string" },
  { name: "receptionPlace", type: "string" },
  { name: "receptionAddress", type: "string" },
  { name: "receptionTime", type: "string" },
  { name: "message", type: "string" },
  { name: "rsvpContact", type: "string" },
  { name: "mainPhoto", type: "string", presence: "optional" },
  { name: "giftRegistry", type: "string", presence: "optional" },
];

/**
 * The `baptism-classic-01` layout (S13): the «Clásica» full-page form of the board's approved preview, an
 * accent band with the name and the date, information rows, and one card per place. It applies an
 * allow-listed themed baptism theme and takes exactly `{ componentKey, theme }` as configuration.
 */
export const baptismClassicRenderer: RendererContract = {
  componentKey: BAPTISM_CLASSIC_COMPONENT_KEY,
  // A themed layout uses no catalog feature: every ACTIVE package fits it.
  requiredFeatureKeys: [],
  validateSchema: (schema) => validateRendererSchema(schema, BAPTISM_CONTENT_FIELDS),
  validateConfiguration: (configuration, componentKey) =>
    validateThemedConfiguration(configuration, componentKey, BAPTISM_THEMES),
};
