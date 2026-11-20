import { PrismaClient } from "@prisma/client";

import { PurgeInvitationViewsUseCase } from "../src/invitations/application/invitation-view-retention";
import { PrismaInvitationViewRepository } from "../src/invitations/infrastructure/prisma-invitation-view.repository";

// `pnpm analytics:retention [--dry-run]` (M9 T11; S3, S7, L12). Deletes the view rows whose day is older than ninety
// days before today in `America/Mexico_City` and prints one line of counts only — never an invitation, a slug, or an
// owner. The command is idempotent: the second run of the same day deletes nothing. `--dry-run` reports the same count
// without deleting anything, so the cutoff can be checked before the nightly task is trusted with it.
//
// The owner chose a command plus a scheduled Railway task (L12). The schedule itself is a production change the owner
// approves separately; until it exists, running this command by hand is the whole operation. A failure exits non-zero,
// so a scheduler shows it as failed instead of silently keeping ninety days of rows forever.

async function main(): Promise<void> {
  // A package manager forwards arguments after a standalone `--`, so it is dropped before the flags are read.
  const arguments_ = process.argv.slice(2).filter((argument) => argument !== "--");
  const unknown = arguments_.filter((argument) => argument !== "--dry-run");
  if (unknown.length > 0) {
    console.error(
      JSON.stringify({ event: "analytics_retention_refused", reason: "unknown_argument" }),
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
    const purge = new PurgeInvitationViewsUseCase(
      new PrismaInvitationViewRepository(prisma as PrismaClient),
    );
    const result = await purge.execute({ dryRun });

    console.log(
      JSON.stringify({
        event: "analytics_retention",
        mode: dryRun ? "dry-run" : "apply",
        deletedViews: result.deletedViews,
      }),
    );
    process.exitCode = 0;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "analytics_retention_failed",
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
