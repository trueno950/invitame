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

describe("create-e2e-administrator.ts", { timeout: 60_000 }, () => {
  it("exits 2 with its usage line and no output without exactly one argument", async () => {
    for (const args of [[], ["a@e2e.invitame.test", "b@e2e.invitame.test"]]) {
      assert.deepEqual(await runScript(args, "postgresql://postgres@127.0.0.1:1/none"), {
        code: 2,
        stdout: "",
        stderr: "Usage: create-e2e-administrator.ts <email>\n",
      });
    }
  });

  it("exits 1 before Prisma loads, printing no password, without a DATABASE_URL", async () => {
    assert.deepEqual(await runScript(["admin@e2e.invitame.test"]), {
      code: 1,
      stdout: "",
      stderr: "AssertionError\n",
    });
  });

  it("exits 1 before Prisma loads, printing no password, for a database that is not local", async () => {
    // `.invalid` never resolves (RFC 2606): Prisma would fail with its own error class instead.
    for (const url of [
      "postgresql://postgres@db.invalid:5432/invitame_e2e",
      "postgresql://postgres@10.0.0.5:5432/invitame_e2e",
    ]) {
      assert.deepEqual(await runScript(["admin@e2e.invitame.test"], url), {
        code: 1,
        stdout: "",
        stderr: "AssertionError\n",
      });
    }
  });
});
