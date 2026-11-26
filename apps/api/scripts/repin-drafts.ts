import { PrismaClient } from "@prisma/client";

import type { CatalogPublicReader } from "../src/catalog/application/public/catalog-public-reader";
import { PrismaCatalogPublicReader } from "../src/catalog/infrastructure/prisma-catalog-public-reader";
import type { InvitationRepinCandidate } from "../src/invitations/application/invitation-repin.repository";
import {
  type RepinDraftCommand,
  RepinDraftInvitationUseCase,
} from "../src/invitations/application/invitation-repin.use-cases";
import {
  decideDraftRepin,
  type RepinSkipReason,
  type RepinTargetVersion,
} from "../src/invitations/domain/invitation-repin";
import { PrismaInvitationRepinRepository } from "../src/invitations/infrastructure/prisma-invitation-repin.repository";

// `pnpm --filter @invitame/api invitations:repin-drafts [--dry-run]` (S5, S8.6). The owner approved moving the
// invitations that already exist to the version their template publishes now, so a customer who has not published
// yet gets the omittable-section switch: this command does that, one draft at a time. A PUBLISHED or ARCHIVED
// invitation is never touched (S5), the target is always the PUBLISHED version of the same template, and the move
// writes `templateVersionId` only, so the content the customer typed stays stored (S8.2). A draft whose stored
// content the new schema would refuse is skipped with the schema's own issues instead of storing it.
//
// The command is idempotent: a second run finds every moved draft already pinned to the version its template
// publishes, so it moves nothing. `--dry-run` prints the same report without writing, so the operator can review what
// would move first. Each move is one statement over one invitation, so a failure leaves the other drafts untouched and
// the run reports it with a non-zero exit code; a refused content and a failed move both exit non-zero, because both
// are an operator's decision rather than a silent skip.
//
// The rule itself is the pure `decideDraftRepin`, tested without a database; this file only reads the invitations and
// the catalog, applies the decision through the API's own use case, and prints one line of JSON counts.

/** The target every draft of one template may move to: the version the catalog offers that template today. */
async function publishedTargets(
  catalog: CatalogPublicReader,
): Promise<Map<string, RepinTargetVersion>> {
  const targets = new Map<string, RepinTargetVersion>();

  for (const template of await catalog.listPublishedTemplates()) {
    targets.set(template.id, {
      id: template.publishedVersion.id,
      templateId: template.id,
      // The catalog offers only a PUBLISHED version, which is the one condition the trigger also states.
      status: "PUBLISHED",
      schema: template.publishedVersion.schema,
    });
  }

  return targets;
}

/**
 * The template of every version the scanned invitations pin, read once per distinct version. `null` means the version
 * cannot be read, which the foreign keys make unreachable but the rule still reports instead of guessing a template.
 */
async function pinnedTemplates(
  catalog: CatalogPublicReader,
  candidates: readonly InvitationRepinCandidate[],
): Promise<Map<string, string | null>> {
  const templates = new Map<string, string | null>();

  for (const candidate of candidates) {
    if (templates.has(candidate.templateVersionId)) {
      continue;
    }
    const stored = await catalog.findVersionSchema(candidate.templateVersionId);
    templates.set(candidate.templateVersionId, stored?.templateId ?? null);
  }

  return templates;
}

/** One invitation with everything the rule reads, which is also the use case's command. */
function commandFor(
  candidate: InvitationRepinCandidate,
  templates: ReadonlyMap<string, string | null>,
  targets: ReadonlyMap<string, RepinTargetVersion>,
): RepinDraftCommand {
  const pinnedTemplateId = templates.get(candidate.templateVersionId) ?? null;
  const target = pinnedTemplateId === null ? null : (targets.get(pinnedTemplateId) ?? null);

  return {
    invitationId: candidate.invitationId,
    status: candidate.status,
    pinnedVersionId: candidate.templateVersionId,
    pinnedTemplateId,
    content: candidate.content,
    target,
  };
}

/** The reasons a run counts, in the rule's own order; `ALREADY_CURRENT` is reported on its own. */
const SKIP_REASONS = [
  "PINNED_VERSION_MISSING",
  "NO_PUBLISHED_VERSION",
  "NOT_DRAFT",
  "OTHER_TEMPLATE",
  "TARGET_NOT_PUBLISHED",
  "CONTENT_INVALID",
] as const satisfies readonly Exclude<RepinSkipReason, "ALREADY_CURRENT">[];

type CountedSkipReason = (typeof SKIP_REASONS)[number];

/** One draft the run could not move, with the schema's issues; never a stored value. */
interface Refusal {
  readonly invitationId: string;
  readonly issues: readonly string[];
}

/** One move that failed, named by the error's own type only: a database message can carry a value. */
interface Failure {
  readonly invitationId: string;
  readonly error: string;
}

/** One draft that moved (or would move), with both versions, so the operator can undo it from this report alone. */
interface Move {
  readonly invitationId: string;
  readonly fromVersionId: string;
  readonly toVersionId: string;
}

/** What the run counted. */
interface Report {
  scanned: number;
  planned: number;
  moved: number;
  moves: Move[];
  alreadyCurrent: number;
  skipped: Record<CountedSkipReason, number>;
  refused: Refusal[];
  failed: Failure[];
}

function emptyReport(): Report {
  return {
    scanned: 0,
    planned: 0,
    moved: 0,
    moves: [],
    alreadyCurrent: 0,
    skipped: Object.fromEntries(SKIP_REASONS.map((reason) => [reason, 0])) as Record<
      CountedSkipReason,
      number
    >,
    refused: [],
    failed: [],
  };
}

/** Counts one skip with its reason, keeping a refused content's issues for the report. */
function countSkip(
  report: Report,
  invitationId: string,
  reason: RepinSkipReason,
  issues: readonly string[],
) {
  if (reason === "ALREADY_CURRENT") {
    report.alreadyCurrent += 1;
    return;
  }
  report.skipped[reason] += 1;
  if (reason === "CONTENT_INVALID") {
    report.refused.push({ invitationId, issues });
  }
}

/**
 * Reads every stored invitation and either plans or applies the re-pin. Nothing here decides whether an invitation
 * may move: that is the domain rule, applied once through `decideDraftRepin` for `--dry-run` and once more inside the
 * use case, which is also the only writer.
 */
async function repairDrafts(options: {
  dryRun: boolean;
  invitations: PrismaInvitationRepinRepository;
  catalog: CatalogPublicReader;
}): Promise<Report> {
  const { dryRun, invitations, catalog } = options;
  const report = emptyReport();
  const candidates = await invitations.listCandidates();
  const templates = await pinnedTemplates(catalog, candidates);
  const targets = await publishedTargets(catalog);
  const repin = new RepinDraftInvitationUseCase(invitations);

  report.scanned = candidates.length;

  for (const candidate of candidates) {
    const command = commandFor(candidate, templates, targets);

    if (dryRun) {
      const decision = decideDraftRepin(command);

      if (decision.move) {
        report.planned += 1;
        report.moves.push({
          invitationId: candidate.invitationId,
          fromVersionId: command.pinnedVersionId,
          toVersionId: decision.toVersionId,
        });
        continue;
      }
      countSkip(report, candidate.invitationId, decision.reason, decision.issues);
      continue;
    }

    try {
      const outcome = await repin.execute(command);

      if (outcome.outcome === "moved") {
        report.moved += 1;
        report.moves.push({
          invitationId: candidate.invitationId,
          fromVersionId: command.pinnedVersionId,
          toVersionId: command.target?.id ?? "",
        });
        continue;
      }
      countSkip(report, candidate.invitationId, outcome.reason, outcome.issues);
    } catch (error) {
      // One failed move never stops the run: each move is its own statement, so the other drafts stay untouched and
      // the operator sees exactly which invitation failed and why by the error's own name.
      report.failed.push({
        invitationId: candidate.invitationId,
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  return report;
}

async function main(): Promise<void> {
  // A package manager forwards arguments after a standalone `--`, so it is dropped before the flags are read.
  const arguments_ = process.argv.slice(2).filter((argument) => argument !== "--");
  const unknown = arguments_.filter((argument) => argument !== "--dry-run");

  if (unknown.length > 0) {
    console.error(
      JSON.stringify({ event: "invitations_repin_drafts_refused", reason: "unknown_argument" }),
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
    const invitations = new PrismaInvitationRepinRepository(prisma);
    const catalog = new PrismaCatalogPublicReader(prisma);
    const report = await repairDrafts({ dryRun, invitations, catalog });

    console.log(
      JSON.stringify({
        event: "invitations_repin_drafts",
        mode: dryRun ? "dry-run" : "apply",
        scanned: report.scanned,
        // In a dry run nothing moves, so `planned` says what would have; in an apply run it stays zero.
        planned: report.planned,
        moved: report.moved,
        // Each planned or moved draft with its previous and new version ids: the recovery in
        // docs/database/model.md re-pins exactly these, and nothing here is a stored value or personal data.
        moves: report.moves,
        alreadyCurrent: report.alreadyCurrent,
        skipped: report.skipped,
        // Invitation ids and the pinned schema's own issues: never a stored value, an owner, or an email.
        refused: report.refused,
        failed: report.failed,
      }),
    );
    process.exitCode = report.refused.length > 0 || report.failed.length > 0 ? 1 : 0;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "invitations_repin_drafts_failed",
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
