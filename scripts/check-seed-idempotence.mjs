#!/usr/bin/env node
/**
 * Proves the second `pnpm db:seed` created nothing (M10 T9; S5).
 *
 * The «Database tests» CI job runs the seed twice to show it stays safe to repeat, but a second run that
 * silently inserted rows would still exit 0. This check reads the row count of every table the catalog seed
 * writes (`apps/api/prisma/catalog-seed.ts`) and compares two runs across the second seed:
 *
 *   node scripts/check-seed-idempotence.mjs --record   # before the second seed
 *   node scripts/check-seed-idempotence.mjs --verify   # after it
 *
 * `--record` writes the counts to a JSON file (default below `os.tmpdir()`, override with `--file`), which
 * `--verify` reads back: it exits non-zero when a count changed in either direction, naming each table with its
 * before and after count. It proves no row was created, updated into existence, or removed; it does not compare
 * what the rows contain, and it never writes to the database.
 *
 * The counts come from the Prisma client the job already generates (`prisma:generate`) and the seed itself uses,
 * resolved from `apps/api`, so the check adds no dependency and needs no `psql` binary. `DATABASE_URL` is
 * required and is never printed.
 *
 * Usage:
 *   node scripts/check-seed-idempotence.mjs --record [--file <path>]
 *   node scripts/check-seed-idempotence.mjs --verify [--file <path>]
 *
 * Exit codes: 0 the counts match (or were recorded), 1 a count changed or the file is unusable, 2 a usage error.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * The Prisma models `seedCatalog` writes, in `apps/api/prisma/catalog-seed.ts`: categories, features, packages
 * with their feature links, and templates with their version 1. A model added to the seed belongs here too, so
 * the check keeps counting every table the seed can touch.
 */
export const SEEDED_MODELS = [
  "Category",
  "Feature",
  "Package",
  "PackageFeature",
  "Template",
  "TemplateVersion",
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultFile = path.join(os.tmpdir(), "invitame-seed-counts.json");
const usage = `Usage: node scripts/check-seed-idempotence.mjs --record|--verify [--file <path>]

  --record          Read and store the current row counts (default file ${defaultFile}).
  --verify          Compare the current row counts with the recorded ones; fails when any changed.
  --file <path>     Snapshot file to write (--record) or read (--verify).`;

/** The Prisma delegate of a model: `PackageFeature` -> `prisma.packageFeature`. */
function delegateFor(model) {
  return model[0].toLowerCase() + model.slice(1);
}

/** The client from `apps/api`, so the script resolves the workspace's generated Prisma client. */
function prismaClient() {
  const requireFromApi = createRequire(path.join(root, "apps/api/package.json"));
  const { PrismaClient } = requireFromApi("@prisma/client");
  return new PrismaClient();
}

/** The row count of every table the seed writes, keyed by model name. */
async function readCounts() {
  const prisma = prismaClient();

  try {
    const counts = {};
    for (const model of SEEDED_MODELS) {
      counts[model] = await prisma[delegateFor(model)].count();
    }

    return counts;
  } finally {
    await prisma.$disconnect();
  }
}

function describe(counts) {
  return SEEDED_MODELS.map((model) => `${model} ${counts[model]}`).join(", ");
}

function usageError(message) {
  console.error(message);
  console.error(usage);
  process.exitCode = 2;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.find((argument) => argument === "--record" || argument === "--verify");
  if (mode === undefined) {
    usageError("Choose --record or --verify.");
    return;
  }

  const fileIndex = args.indexOf("--file");
  const file = fileIndex === -1 ? defaultFile : args[fileIndex + 1];
  if (file === undefined) {
    usageError("--file needs a path.");
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is required: point it at the migrated database the seed runs against.",
    );
    process.exitCode = 1;
    return;
  }

  const counts = await readCounts();

  if (mode === "--record") {
    await writeFile(file, `${JSON.stringify({ counts }, null, 2)}\n`, "utf8");
    console.info(`Recorded seed row counts in ${file}: ${describe(counts)}.`);
    return;
  }

  let recorded;
  try {
    recorded = JSON.parse(await readFile(file, "utf8"));
  } catch {
    console.error(`No readable snapshot at ${file}: run --record before the seed, then --verify.`);
    process.exitCode = 1;
    return;
  }

  const changed = SEEDED_MODELS.filter((model) => recorded.counts?.[model] !== counts[model]);
  if (changed.length > 0) {
    console.error("The seed is not idempotent: the second run changed row counts.");
    for (const model of changed) {
      const before = recorded.counts?.[model];
      console.error(
        `- ${model}: ${before === undefined ? "not recorded" : before} -> ${counts[model]}`,
      );
    }

    process.exitCode = 1;
    return;
  }

  console.info(
    `Seed idempotence check passed: the second run changed none of the ${SEEDED_MODELS.length} tables the seed writes (${describe(counts)}).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
