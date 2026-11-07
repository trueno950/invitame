import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

import type { ResetSecondFactorResult } from "./application/administrator-account.repository";
import { runResetSecondFactor } from "./reset-second-factor.command";

// The `admin:reset-second-factor` command (M2 T10a, S44): terminal-only output and exit codes, with an
// in-memory store. The transaction is proved in `prisma-administrator-account.repository.db-spec.ts`.

function run(args: string[], result: ResetSecondFactorResult | Error, isTerminal = true) {
  const out: string[] = [];
  const err: string[] = [];
  const store = { opened: 0, closed: 0 };
  const code = runResetSecondFactor(
    args,
    { isTerminal, out: (line) => out.push(line), err: (line) => err.push(line) },
    () => {
      store.opened += 1;
      return {
        accounts: {
          resetSecondFactor: async () => {
            if (result instanceof Error) {
              throw result;
            }
            return result;
          },
        },
        close: async () => {
          store.closed += 1;
        },
      };
    },
    async (password) => `hash-of-${password.length}`,
  );
  return code.then((exitCode) => ({ exitCode, out, err, store }));
}

const RESET = { outcome: "reset", userId: "user-1", revokedSessions: 1 } as const;

describe("admin:reset-second-factor", () => {
  for (const args of [[], ["--"], ["a@example.test", "b@example.test"]]) {
    it(`exits 2 with the usage for ${JSON.stringify(args)} and opens no store`, async () => {
      const { exitCode, out, err, store } = await run(args, RESET);

      assert.equal(exitCode, 2);
      assert.deepEqual(out, []);
      assert.deepEqual(err, [
        "Usage: pnpm --filter @invitame/api admin:reset-second-factor -- <email>",
      ]);
      assert.equal(store.opened, 0);
    });
  }

  it("refuses to run when stdout is not a terminal", async () => {
    const { exitCode, out, err, store } = await run(["admin@example.test"], RESET, false);

    assert.equal(exitCode, 2);
    assert.deepEqual(out, []);
    assert.match(err.join("\n"), /only on an interactive terminal/);
    assert.equal(store.opened, 0);
  });

  it("exits 2 for an invalid address", async () => {
    const { exitCode, err } = await run(["--", "no-at-sign"], RESET);

    assert.equal(exitCode, 2);
    assert.deepEqual(err, ["Provide the email address of the administrator to recover."]);
  });

  it("exits 0, logs the user id, and prints the new initial password once", async () => {
    const { exitCode, out, err, store } = await run(["--", "Admin@Example.test"], RESET);

    assert.equal(exitCode, 0);
    assert.deepEqual(err, []);
    assert.equal(out[0], '{"event":"administrator_second_factor_reset","userId":"user-1"}');
    const password = out[1]?.split("\n").at(-1) ?? "";
    assert.match(password, /^[A-Za-z0-9]{24}$/);
    assert.equal(out.join("\n").split(password).length, 2, "printed once");
    assert.equal(out.join("\n").includes("Admin@"), false);
    assert.deepEqual(store, { opened: 1, closed: 1 });
  });

  for (const refused of [
    { outcome: "refused", reason: "unknown" },
    { outcome: "refused", userId: "user-2", reason: "customer" },
    { outcome: "refused", userId: "user-3", reason: "disabled" },
  ] as const) {
    it(`exits 1 and reports the ${refused.reason} refusal without a password`, async () => {
      const { exitCode, out, err } = await run(["admin@example.test"], refused);

      assert.equal(exitCode, 1);
      assert.deepEqual(err, []);
      const { outcome: _outcome, ...fields } = refused;
      assert.deepEqual(
        out.map((line) => JSON.parse(line)),
        [{ event: "administrator_second_factor_reset_refused", ...fields }],
      );
    });
  }

  it("exits 1 on a store failure and reports the error class only", async () => {
    const failure = new TypeError("connect to admin@example.test failed");

    const { exitCode, out, err, store } = await run(["admin@example.test"], failure);

    assert.equal(exitCode, 1);
    assert.deepEqual(out, []);
    assert.deepEqual(err, [
      '{"event":"administrator_second_factor_reset_failed","error":"TypeError"}',
    ]);
    assert.deepEqual(store, { opened: 1, closed: 1 });
  });

  it("refuses to run as a script when stdout is piped", () => {
    const apiRoot = path.resolve(__dirname, "../..");
    const result = spawnSync(
      process.execPath,
      [
        "-r",
        "@swc-node/register",
        "src/users/reset-second-factor.command.ts",
        "--",
        "a@example.test",
      ],
      { cwd: apiRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /only on an interactive terminal/);
  });
});
