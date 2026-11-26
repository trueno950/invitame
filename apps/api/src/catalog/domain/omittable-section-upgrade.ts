// The plan of the omittable-section upgrade (S8.4, S8.5): a pure function that decides, for every published
// `TemplateVersion` the catalog answers, whether a new version with the omittable-section extension must be
// created, whether the template already carries it, or whether the published schema must be refused. It is pure
// and performs no I/O, so `scripts/omittable-sections.ts` only writes what this plan states and a test can prove
// the plan and its idempotence without a database.
//
// A planned version is validated with `validateTemplateVersionContract`, the same call
// `CreateTemplateVersionUseCase` makes before storing a version. Without it a published version the create use
// case refuses — a catalog row written before the renderer contract, such as a database fixture — would be
// planned, and the apply would abort on its first create instead of reporting it as refused.
//
// The plan is idempotent by construction: the version it plans carries the extension, and a version that
// carries the extension is skipped. Versions are append-only (AGENTS.md): the plan adds a version and never
// rewrites, retires, or deletes an existing one.

import {
  type ContentSectionFamily,
  contentSectionFamilyOf,
  extendSchemaWithOmittableSections,
} from "./omittable-section-groups";
import { parseOmittableSections } from "./omittable-sections";
import { validateTemplateVersionContract } from "./renderers/renderer-registry";

/** The shape of a JSON object read from a `Json` column; arrays and `null` are not objects here. */
type JsonObject = Record<string, unknown>;

/** One published version the upgrade considers, as the catalog answered it. */
export interface UpgradeCandidate {
  readonly templateId: string;
  readonly templateKey: string;
  readonly publishedVersion: {
    readonly componentKey: string;
    readonly schema: unknown;
    readonly configuration: unknown;
  };
}

/** One new version to create and publish: the published version's own identity, schema, and configuration. */
export interface OmittableSectionUpgrade {
  readonly templateId: string;
  readonly templateKey: string;
  readonly componentKey: string;
  readonly configuration: unknown;
  readonly schema: JsonObject;
}

/** A template whose published schema cannot be extended, and the issues that explain why. */
export interface RefusedUpgrade {
  readonly templateKey: string;
  readonly issues: readonly string[];
}
/** What the script must do, with the templates it skips named so a run is readable without the database. */
export interface OmittableSectionUpgradePlan {
  readonly upgrades: readonly OmittableSectionUpgrade[];
  /** Templates whose published version already declares `x-omittable`: the second run of the script. */
  readonly alreadyExtended: readonly string[];
  /** Templates whose renderer publishes no omittable section, so no extension applies to them. */
  readonly unsupported: readonly string[];
  readonly refused: readonly RefusedUpgrade[];
}

/**
 * Decides the upgrade of every published version in the order the caller listed it. A version that declares
 * the extension is already done; an invalid extension or a schema that cannot receive one is refused instead of
 * silently skipped, because a published version that cannot be upgraded is an operator's decision.
 */
export function planOmittableSectionUpgrade(
  candidates: readonly UpgradeCandidate[],
): OmittableSectionUpgradePlan {
  const upgrades: OmittableSectionUpgrade[] = [];
  const alreadyExtended: string[] = [];
  const unsupported: string[] = [];
  const refused: RefusedUpgrade[] = [];

  for (const candidate of candidates) {
    const { templateId, templateKey, publishedVersion } = candidate;
    const sections = parseOmittableSections(publishedVersion.schema);

    if (!sections.ok) {
      refused.push({ templateKey, issues: [...sections.issues] });
      continue;
    }
    if (sections.value !== null) {
      alreadyExtended.push(templateKey);
      continue;
    }

    const family: ContentSectionFamily | null = contentSectionFamilyOf(
      publishedVersion.componentKey,
    );

    if (family === null) {
      unsupported.push(templateKey);
      continue;
    }

    const extended = extendSchemaWithOmittableSections(publishedVersion.schema, family);

    if (!extended.ok) {
      refused.push({ templateKey, issues: [...extended.issues] });
      continue;
    }

    // The version this plan would create must pass the same contract the create use case enforces, so a
    // template it would refuse is reported here, in the dry run too, and never aborts an apply midway.
    const contract = validateTemplateVersionContract({
      componentKey: publishedVersion.componentKey,
      schema: extended.value,
      configuration: publishedVersion.configuration,
    });

    if (!contract.ok) {
      refused.push({ templateKey, issues: [...contract.issues] });
      continue;
    }

    upgrades.push({
      templateId,
      templateKey,
      componentKey: publishedVersion.componentKey,
      configuration: publishedVersion.configuration,
      schema: extended.value,
    });
  }

  return { upgrades, alreadyExtended, unsupported, refused };
}
