import { PrismaClient } from "@prisma/client";

import { validateMediaEnvironment } from "../src/config/environment";
import { CleanupMediaUseCase } from "../src/media/application/media.use-cases";
import { createMediaStorage } from "../src/media/infrastructure/create-media-storage";
import { PrismaGuestAlbumRepository } from "../src/media/infrastructure/prisma-guest-album.repository";
import { PrismaMediaRepository } from "../src/media/infrastructure/prisma-media.repository";

// `pnpm media:cleanup [--dry-run]` (M8 S4, F8; L11.6). Deletes the objects of rows marked deleted and the orphan objects
// under `invitations/` that no row names, then removes the rows whose object is gone; it also retires the guests' photos
// the owner never published or took down again once they have been in that state for the retention window. The command
// is idempotent: running it twice deletes nothing the second time. It prints one line of counts only — never a key, an id, an owner, or image
// data — and supports `--dry-run` to report what it would delete without touching anything. This is the recovery path
// for a failed delete: the row is marked first, so the object is never lost track of.

async function main(): Promise<void> {
  // A package manager forwards arguments after a standalone `--`, so it is dropped before the flags are read.
  const arguments_ = process.argv.slice(2).filter((argument) => argument !== "--");
  const unknown = arguments_.filter((argument) => argument !== "--dry-run");
  if (unknown.length > 0) {
    console.error(JSON.stringify({ event: "media_cleanup_refused", reason: "unknown_argument" }));
    process.exitCode = 1;
    return;
  }

  const dryRun = arguments_.includes("--dry-run");
  // Only the media settings are required: a cleanup needs storage and the database, not a web or auth secret.
  const media = validateMediaEnvironment(process.env);
  const prisma = new PrismaClient();

  try {
    const cleanup = new CleanupMediaUseCase(
      new PrismaMediaRepository(prisma),
      createMediaStorage(media),
      (event) => console.log(JSON.stringify(event)),
      { guestAlbum: new PrismaGuestAlbumRepository(prisma) },
    );
    const result = await cleanup.execute({ dryRun });

    if (dryRun) {
      console.log(JSON.stringify({ event: "media_cleanup", mode: "dry-run", ...result }));
    }

    // A failed object delete is reported, not hidden: the row stays deleted and the next run retries it.
    process.exitCode = result.failedObjects > 0 ? 1 : 0;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "media_cleanup_failed",
        error: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
