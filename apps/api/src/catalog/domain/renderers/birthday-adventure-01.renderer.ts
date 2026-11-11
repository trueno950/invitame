import {
  isJsonObject,
  readOwn,
  type JsonObject,
  type RendererContract,
  type RendererField,
  validateRendererSchema,
} from "./renderer-contract";

export const BIRTHDAY_ADVENTURE_COMPONENT_KEY = "birthday-adventure-01";

/** The invitation data the `birthday-adventure-01` web component reads. */
const FIELDS: readonly RendererField[] = [
  { name: "celebrantName", type: "string" },
  { name: "age", type: "integer" },
  { name: "date", type: "string" },
  { name: "time", type: "string" },
  { name: "location", type: "string" },
  { name: "address", type: "string" },
  { name: "mainPhoto", type: "string" },
  { name: "message", type: "string" },
];

const CONFIGURATION_KEYS = [
  "componentKey",
  "layout",
  "palette",
  "typography",
  "sectionOrder",
] as const;
const LAYOUT = "adventure";
const PALETTES = ["sunset", "ocean", "forest"] as const;
const TYPOGRAPHY = "rounded";
const SECTIONS = ["hero", "details", "message"] as const;

function validateSectionOrder(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return ["configuration.sectionOrder must be a non-empty array"];
  }

  const issues: string[] = [];

  value.forEach((section, index) => {
    if (!SECTIONS.some((allowed) => allowed === section)) {
      issues.push(`configuration.sectionOrder[${index}] must be one of: ${SECTIONS.join(", ")}`);
    }
  });
  if (new Set(value).size !== value.length) {
    issues.push("configuration.sectionOrder must not contain duplicates");
  }
  if (!value.includes("hero")) {
    issues.push('configuration.sectionOrder must include "hero"');
  }

  return issues;
}

function validateConfiguration(configuration: unknown, componentKey: string): string[] {
  if (!isJsonObject(configuration)) {
    return ["configuration must be a JSON object"];
  }

  const issues: string[] = [];
  const known: readonly string[] = CONFIGURATION_KEYS;

  for (const key of Object.keys(configuration)) {
    if (!known.includes(key)) {
      issues.push(
        `configuration.${key} is not allowed; allowed keys: ${CONFIGURATION_KEYS.join(", ")}`,
      );
    }
  }
  for (const key of CONFIGURATION_KEYS) {
    if (!Object.hasOwn(configuration, key)) {
      issues.push(`configuration.${key} is required`);
    }
  }

  const read = (key: (typeof CONFIGURATION_KEYS)[number]) =>
    readOwn(configuration as JsonObject, key);

  if (Object.hasOwn(configuration, "componentKey") && read("componentKey") !== componentKey) {
    issues.push(`configuration.componentKey must equal ${JSON.stringify(componentKey)}`);
  }
  if (Object.hasOwn(configuration, "layout") && read("layout") !== LAYOUT) {
    issues.push(`configuration.layout must be ${JSON.stringify(LAYOUT)}`);
  }
  if (
    Object.hasOwn(configuration, "palette") &&
    !PALETTES.some((allowed) => allowed === read("palette"))
  ) {
    issues.push(`configuration.palette must be one of: ${PALETTES.join(", ")}`);
  }
  if (Object.hasOwn(configuration, "typography") && read("typography") !== TYPOGRAPHY) {
    issues.push(`configuration.typography must be ${JSON.stringify(TYPOGRAPHY)}`);
  }
  if (Object.hasOwn(configuration, "sectionOrder")) {
    issues.push(...validateSectionOrder(read("sectionOrder")));
  }

  return issues;
}

export const birthdayAdventureRenderer: RendererContract = {
  componentKey: BIRTHDAY_ADVENTURE_COMPONENT_KEY,
  // A birthday adventure uses no catalog feature: every ACTIVE package fits it (S6, A1).
  requiredFeatureKeys: [],
  validateSchema: (schema) => validateRendererSchema(schema, FIELDS),
  validateConfiguration,
};
