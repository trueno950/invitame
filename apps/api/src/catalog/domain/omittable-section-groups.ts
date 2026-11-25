// The omittable sections of each content line the catalog publishes (S8.4), and the schema declaration they
// produce (S8.1, S8.2). The groups are the owner's decision and travel inside every new `TemplateVersion.schema`
// as data: the seed writes them into the version it creates, and the upgrade script writes them into the new
// version it adds to an existing template. Both read this file, so neither can drift from the other.
//
// The essentials are never groups: the celebrant or couple names and the date stay shown, and a line with two
// places keeps at least one of them through its `x-require-one` set.

import {
  OMITTED_SECTIONS_PROPERTY,
  type OmittableSections,
  type OmittedSectionsDeclaration,
  omittedSectionsDeclaration,
} from "./omittable-sections";

/** The content families the catalog publishes today: one per content schema (S8.4). */
export const CONTENT_SECTION_FAMILIES = [
  "birthday",
  "babyShower",
  "baptism",
  "xv",
  "wedding",
] as const;

/** One content family, named by the schema it publishes rather than by a catalog row. */
export type ContentSectionFamily = (typeof CONTENT_SECTION_FAMILIES)[number];

/** The groups each line may switch off, in the order the editor shows them (S8.4). */
export const OMITTABLE_SECTIONS_BY_FAMILY: Readonly<
  Record<ContentSectionFamily, OmittableSections>
> = {
  birthday: {
    groups: [
      { key: "age", fields: ["age"] },
      { key: "mainPhoto", fields: ["mainPhoto"] },
      { key: "message", fields: ["message"] },
    ],
    requireOne: [],
  },
  babyShower: {
    groups: [
      { key: "message", fields: ["message"] },
      { key: "rsvpContact", fields: ["rsvpContact"] },
    ],
    requireOne: [],
  },
  baptism: {
    groups: [
      { key: "parents", fields: ["parents"] },
      { key: "godparents", fields: ["godparents"] },
      { key: "ceremony", fields: ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"] },
      { key: "reception", fields: ["receptionPlace", "receptionAddress", "receptionTime"] },
      { key: "message", fields: ["message"] },
      { key: "rsvpContact", fields: ["rsvpContact"] },
    ],
    // A baptism always happens somewhere: the ceremony or the reception stays shown (S3, S8.3).
    requireOne: [["ceremony", "reception"]],
  },
  xv: {
    groups: [
      { key: "parents", fields: ["parents"] },
      { key: "honorSponsors", fields: ["honorSponsors"] },
      { key: "ceremony", fields: ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"] },
      { key: "reception", fields: ["receptionPlace", "receptionAddress", "receptionTime"] },
      { key: "dressCode", fields: ["dressCode"] },
      { key: "message", fields: ["message"] },
      { key: "rsvpContact", fields: ["rsvpContact"] },
    ],
    requireOne: [["ceremony", "reception"]],
  },
  wedding: {
    groups: [
      { key: "ceremony", fields: ["ceremonyPlace", "ceremonyAddress", "ceremonyTime"] },
      { key: "reception", fields: ["receptionPlace", "receptionAddress", "receptionTime"] },
      { key: "dressCode", fields: ["dressCode"] },
      { key: "message", fields: ["message"] },
      { key: "rsvpContact", fields: ["rsvpContact"] },
    ],
    requireOne: [["ceremony", "reception"]],
  },
};

/**
 * The section family of each registered renderer key: an allow-list of reviewed code, never a catalog name or a
 * database value (`docs/architecture/module-template.md`). A key outside it publishes no omittable section.
 */
const SECTION_FAMILY_BY_COMPONENT_KEY: Readonly<Record<string, ContentSectionFamily>> = {
  "birthday-map-01": "birthday",
  "birthday-poster-01": "birthday",
  "birthday-story-01": "birthday",
  "baby-shower-classic-01": "babyShower",
  "baptism-classic-01": "baptism",
  "baptism-arch-01": "baptism",
  "baptism-ornamental-01": "baptism",
  "xv-arch-01": "xv",
  "xv-ornamental-01": "xv",
  "wedding-arch-01": "wedding",
  "wedding-ornamental-01": "wedding",
};

/** The two top-level extensions one version schema gains, as plain JSON data. */
export interface OmittableSectionsExtension {
  readonly "x-omittable": readonly {
    readonly key: string;
    readonly fields: readonly string[];
  }[];
  readonly "x-require-one": readonly (readonly string[])[];
}

/** The section family of a renderer key, or null when the catalog publishes no omittable section for it. */
export function contentSectionFamilyOf(componentKey: string): ContentSectionFamily | null {
  return Object.hasOwn(SECTION_FAMILY_BY_COMPONENT_KEY, componentKey)
    ? (SECTION_FAMILY_BY_COMPONENT_KEY[componentKey] ?? null)
    : null;
}

/** The `x-omittable` and `x-require-one` declarations of one family, ready to be stored in a schema. */
export function omittableSectionsExtension(
  family: ContentSectionFamily,
): OmittableSectionsExtension {
  const sections = OMITTABLE_SECTIONS_BY_FAMILY[family];

  return {
    "x-omittable": sections.groups.map((group) => ({ key: group.key, fields: [...group.fields] })),
    "x-require-one": sections.requireOne.map((set) => [...set]),
  };
}

/** The `omittedSections` property declaration of one family (S8.2). */
export function omittedSectionsProperty(family: ContentSectionFamily): OmittedSectionsDeclaration {
  return omittedSectionsDeclaration(OMITTABLE_SECTIONS_BY_FAMILY[family]);
}

/** The shape of a JSON object read from a `Json` column; arrays and `null` are not objects here. */
type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A version schema with the extension, or the issue that makes the given schema unfit to extend. */
export type OmittableSectionsExtensionResult =
  | { readonly ok: true; readonly value: JsonObject }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * The schema a new version receives: the schema of the published version it replaces, plus the family's
 * extensions and the `omittedSections` property (S8.4). Every other declaration — `$schema`, `required`, the
 * renderers' bounds — is kept exactly as it was, so an existing version's contract does not change meaning.
 */
export function extendSchemaWithOmittableSections(
  schema: unknown,
  family: ContentSectionFamily,
): OmittableSectionsExtensionResult {
  if (!isJsonObject(schema) || !isJsonObject(schema.properties)) {
    return { ok: false, issues: ["schema.properties must be an object"] };
  }

  return {
    ok: true,
    value: {
      ...schema,
      ...omittableSectionsExtension(family),
      properties: {
        ...schema.properties,
        [OMITTED_SECTIONS_PROPERTY]: omittedSectionsProperty(family),
      },
    },
  };
}
