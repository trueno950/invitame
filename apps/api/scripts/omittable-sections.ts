import { PrismaClient } from "@prisma/client";
import type { TemplateRepository } from "../src/catalog/application/templates/template.repository";
import {
  CreateTemplateVersionUseCase,
  ListTemplatesUseCase,
  ListTemplateVersionsUseCase,
  PublishTemplateVersionUseCase,
} from "../src/catalog/application/templates/template.use-cases";
import {
  type OmittableSectionUpgradePlan,
  planOmittableSectionUpgrade,
  type UpgradeCandidate,
} from "../src/catalog/domain/omittable-section-upgrade";
import { PrismaTemplateRepository } from "../src/catalog/infrastructure/prisma-template.repository";

// `pnpm catalog:omittable-sections [--dry-run]` (S8.4, S8.5). Every published template version of the five
// content lines gains a new published version with the same `componentKey`, configuration, and properties plus
// the omittable-section extensions and the `omittedSections` property, so a customer can switch a section off.
// The version is created and published through the catalog's own use cases, so the previous version is retired
// exactly as it is today, and versions stay append-only: nothing is edited, archived, or deleted.
//
// The command is idempotent: a template whose published version already declares `x-omittable` is skipped, so the
// second run creates nothing. `--dry-run` prints the same plan without writing, so the operator can review which
// templates gain a version first. A failure exits non-zero, and so does a published schema the plan refuses,
// because a version that cannot be upgraded is an operator's decision rather than a silent skip.
//
// The plan itself is the pure function `planOmittableSectionUpgrade`, tested without a database; this file only
// reads the catalog, applies the plan, and prints one line of counts.

/** The published version of every template that has one, as the plan needs it. */
async function publishedVersionCandidates(
  templates: TemplateRepository,
): Promise<UpgradeCandidate[]> {
  const listTemplates = new ListTemplatesUseCase(templates);
  const listVersions = new ListTemplateVersionsUseCase(templates);
  const candidates: UpgradeCandidate[] = [];

  for (const template of await listTemplates.execute()) {
    const published = template.publishedVersion;

    if (published === null) {
      continue;
    }
    const versions = await listVersions.execute(template.id);
    const version = versions?.find((stored) => stored.id === published.id);

    if (version === undefined) {
      continue;
    }
    candidates.push({
      templateId: template.id,
      templateKey: template.key,
      publishedVersion: {
        componentKey: version.componentKey,
        schema: version.schema,
        configuration: version.configuration,
      },
    });
  }

  return candidates;
}

/** Applies the plan one template at a time and answers the template keys that did not complete. */
async function applyPlan(
  plan: OmittableSectionUpgradePlan,
  templates: TemplateRepository,
): Promise<{ created: number; failed: string[] }> {
  const createVersion = new CreateTemplateVersionUseCase(templates);
  const publishVersion = new PublishTemplateVersionUseCase(templates);
  let created = 0;
  const failed: string[] = [];

  for (const upgrade of plan.upgrades) {
    const version = await createVersion.execute(upgrade.templateId, {
      componentKey: upgrade.componentKey,
      schema: upgrade.schema,
      configuration: upgrade.configuration,
    });
    if (version === null) {
      failed.push(upgrade.templateKey);
      continue;
    }
    // A version may stay DRAFT if the publication is refused; it is reported, never deleted, because versions
    // are append-only and the next run adds a new one only for a template whose published version still lacks
    // the extension.
    const published = await publishVersion.execute(upgrade.templateId, version.id);
    if (published === null) {
      failed.push(upgrade.templateKey);
      continue;
    }
    created += 1;
  }

  return { created, failed };
}

async function main(): Promise<void> {
  // A package manager forwards arguments after a standalone `--`, so it is dropped before the flags are read.
  const arguments_ = process.argv.slice(2).filter((argument) => argument !== "--");
  const unknown = arguments_.filter((argument) => argument !== "--dry-run");

  if (unknown.length > 0) {
    console.error(
      JSON.stringify({ event: "catalog_omittable_sections_refused", reason: "unknown_argument" }),
    );
    process.exitCode = 1;
    return;
  }

  const dryRun = arguments_.includes("--dry-run");
  let prisma: PrismaClient | undefined;

  try {
    // Constructed inside the guarded block too, so a missing or malformed `DATABASE_URL` is reported by the one
    // structured failure line and a non-zero exit instead of a stack trace.
    prisma = new PrismaClient();
    const templates = new PrismaTemplateRepository(prisma as PrismaClient);
    const plan = planOmittableSectionUpgrade(await publishedVersionCandidates(templates));
    const applied = dryRun ? { created: 0, failed: [] } : await applyPlan(plan, templates);

    console.log(
      JSON.stringify({
        event: "catalog_omittable_sections",
        mode: dryRun ? "dry-run" : "apply",
        planned: plan.upgrades.length,
        created: applied.created,
        alreadyExtended: plan.alreadyExtended.length,
        unsupported: plan.unsupported.length,
        // Template keys and the issues of a schema the contract refuses: catalog metadata, never personal data.
        refused: plan.refused.map((refusal) => ({
          templateKey: refusal.templateKey,
          issues: [...refusal.issues],
        })),
        failed: applied.failed,
      }),
    );
    process.exitCode = plan.refused.length > 0 || applied.failed.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "catalog_omittable_sections_failed",
        // The error's own name only: a database message can name a table or a value, and this line is counts only.
        error: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}

void main();
