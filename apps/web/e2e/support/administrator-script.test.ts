import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { describe, it } from "node:test";

// The harness-only script that creates the browser tests' administrators
// (`apps/api/test/create-e2e-administrator.ts`, M2 T9b part B; S38) writes users and passwords, so it
// refuses to run without an explicit local DATABASE_URL, before Prisma loads, and prints no password.
// Part B's verification proposed this test (L55).

const API_DIRECTORY = resolve(import.meta.dirname, "../../../api");

interface Outcome {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runScript(args: string[], databaseUrl?: string): Promise<Outcome> {
  return new Promise((done) => {
    execFile(
      "node",
      ["-r", "@swc-node/register", "test/create-e2e-administrator.ts", ...args],
      {
        cwd: API_DIRECTORY,
        env: {
          NODE_ENV: "development",
          PATH: process.env.PATH ?? "",
          ...(databaseUrl === undefined ? {} : { DATABASE_URL: databaseUrl }),
        },
      },
      (error, stdout, stderr) => {
        done({
          code: error ? (typeof error.code === "number" ? error.code : null) : 0,
          stdout,
          stderr,
        });
      },
    );
  });
}

/**
 * Asserts a refusal by what it must and must not print, not by the whole of stderr, so a runtime
 * warning on stderr cannot fail it (R3-admin-script-test-exact-stderr-brittle): the exit code, an
 * empty stdout (where the password would go), the expected line, and no database URL or Prisma error,
 * which would mean the check ran after Prisma loaded.
 */
function assertRefusal(outcome: Outcome, code: number, line: string, databaseUrl?: string) {
  assert.equal(outcome.code, code, outcome.stderr);
  assert.equal(outcome.stdout, "");
  const lines = outcome.stderr.split("\n");
  assert.ok(lines.includes(line), `stderr has the line ${JSON.stringify(line)}`);
  assert.doesNotMatch(outcome.stderr, /prisma/i);
  if (databaseUrl !== undefined) {
    assert.ok(!outcome.stderr.includes(databaseUrl), "stderr never repeats the database URL");
  }
}

describe("create-e2e-administrator.ts", { timeout: 60_000 }, () => {
  it("exits 2 with its usage line and no output without exactly one argument", async () => {
    const url = "postgresql://postgres@127.0.0.1:1/none";
    const usage = "Usage: create-e2e-administrator.ts <email>";
    for (const args of [[], ["a@e2e.invitame.test", "b@e2e.invitame.test"]]) {
      assertRefusal(await runScript(args, url), 2, usage, url);
    }
  });

  it("exits 1 before Prisma loads, printing no password, without a DATABASE_URL", async () => {
    assertRefusal(await runScript(["admin@e2e.invitame.test"]), 1, "AssertionError");
  });

  it("exits 1 before Prisma loads, printing no password, for a database that is not local", async () => {
    // `.invalid` never resolves (RFC 2606): Prisma would fail with its own error class instead.
    for (const url of [
      "postgresql://postgres@db.invalid:5432/invitame_e2e",
      "postgresql://postgres@10.0.0.5:5432/invitame_e2e",
    ]) {
      assertRefusal(await runScript(["admin@e2e.invitame.test"], url), 1, "AssertionError", url);
    }
  });
});
