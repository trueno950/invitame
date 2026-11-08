import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, it } from "node:test";

import type { IssueInitialPasswordResult } from "./application/administrator-account.repository";
import { runCreateAdministrator } from "./create-administrator.command";

// The `admin:create` command: terminal-only output, exit codes, and the close of its store, with an
// in-memory store. The transaction is proved in `create-administrator.command.db-spec.ts`.

const CLOSE_FAILED_LINE = '{"event":"administrator_create_close_failed","error":"TypeError"}';

function run(
  args: string[],
  result: IssueInitialPasswordResult | Error,
  options: { isTerminal?: boolean; failClose?: boolean } = {},
) {
  const out: string[] = [];
  const err: string[] = [];
  const store = { opened: 0, closed: 0 };
  const exitCode = runCreateAdministrator(
    args,
    {
      isTerminal: options.isTerminal ?? true,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    },
    () => {
      store.opened += 1;
      return {
        accounts: {
          issueInitialPassword: async () => {
            if (result instanceof Error) {
              throw result;
            }
            return result;
          },
        },
        close: async () => {
          store.closed += 1;
          if (options.failClose) {
            throw new TypeError("disconnect from admin@example.test failed");
          }
        },
      };
    },
    async (password) => `hash-of-${password.length}`,
  );
  return exitCode.then((code) => ({ exitCode: code, out, err, store }));
}

const CREATED = { outcome: "created", userId: "user-1" } as const;

describe("admin:create", () => {
  for (const args of [[], ["--"], ["a@example.test", "b@example.test"]]) {
    it(`exits 2 with the usage for ${JSON.stringify(args)} and opens no store`, async () => {
      const { exitCode, out, err, store } = await run(args, CREATED);

      assert.equal(exitCode, 2);
      assert.deepEqual(out, []);
      assert.deepEqual(err, ["Usage: pnpm --filter @invitame/api admin:create -- <email>"]);
      assert.equal(store.opened, 0);
    });
  }

  it("refuses to run when stdout is not a terminal and opens no store", async () => {
    const { exitCode, out, err, store } = await run(["admin@example.test"], CREATED, {
      isTerminal: false,
    });

    assert.equal(exitCode, 2);
    assert.deepEqual(out, []);
    assert.deepEqual(err, [
      "admin:create shows the initial password once and only on an interactive terminal.",
    ]);
    assert.equal(store.opened, 0);
  });

  it("exits 0, logs the event, and prints the password once on its own line", async () => {
    const { exitCode, out, err, store } = await run(["admin@example.test"], CREATED);

    assert.equal(exitCode, 0);
    assert.deepEqual(err, []);
    assert.equal(out.length, 2);
    assert.deepEqual(JSON.parse(out[0] ?? ""), {
      event: "administrator_created",
      userId: "user-1",
    });
    assert.match(out[1] ?? "", /^Initial password.*\n.+$/s);
    assert.deepEqual(store, { opened: 1, closed: 1 });
  });

  it("exits 1 on a refusal without a password", async () => {
    const { exitCode, out, err } = await run(["admin@example.test"], {
      outcome: "refused",
      userId: "user-2",
      reason: "customer",
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(err, []);
    assert.deepEqual(
      out.map((line) => JSON.parse(line)),
      [{ event: "administrator_create_refused", userId: "user-2", reason: "customer" }],
    );
  });

  it("exits 2 for an address that is not an email, without opening a failure line", async () => {
    const { exitCode, out, err, store } = await run(["not-an-email"], CREATED);

    assert.equal(exitCode, 2);
    assert.deepEqual(out, []);
    assert.equal(err.length, 1);
    assert.deepEqual(store, { opened: 1, closed: 1 });
  });

  it("exits 1 on a store failure and reports the error class only", async () => {
    const { exitCode, out, err } = await run(
      ["admin@example.test"],
      new TypeError("connect to admin@example.test failed"),
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(out, []);
    assert.deepEqual(err, ['{"event":"administrator_create_failed","error":"TypeError"}']);
  });

  describe("when closing the store fails (T10a R4-001)", () => {
    it("still exits 0, prints the password once, and logs the class only", async () => {
      const { exitCode, out, err } = await run(["admin@example.test"], CREATED, {
        failClose: true,
      });

      assert.equal(exitCode, 0);
      assert.equal(out.filter((line) => line.includes("Initial password")).length, 1);
      assert.deepEqual(err, [CLOSE_FAILED_LINE]);
      assert.ok(!err.join("\n").includes("admin@example.test"));
    });

    it("keeps the exit code of a refusal and of a store failure", async () => {
      const refused = await run(
        ["admin@example.test"],
        { outcome: "refused", userId: "user-2", reason: "enrolled" },
        { failClose: true },
      );
      assert.equal(refused.exitCode, 1);
      assert.deepEqual(refused.err, [CLOSE_FAILED_LINE]);

      const failed = await run(["admin@example.test"], new RangeError("boom"), {
        failClose: true,
      });
      assert.equal(failed.exitCode, 1);
      assert.deepEqual(failed.err, [
        '{"event":"administrator_create_failed","error":"RangeError"}',
        CLOSE_FAILED_LINE,
      ]);
    });
  });

  // The script guard (`require.main === module`): a direct run starts the command, and loading the
  // module any other way never does. Neither child reaches the database.
  describe("entry guard", () => {
    const apiRoot = path.resolve(__dirname, "../..");
    const command = "src/users/create-administrator.command.ts";

    function spawn(args: string[]) {
      return spawnSync(process.execPath, ["-r", "@swc-node/register", ...args], {
        cwd: apiRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
      });
    }

    it("starts the command on a direct run: no email prints the usage and exits 2", () => {
      const result = spawn([command]);

      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "Usage: pnpm --filter @invitame/api admin:create -- <email>\n");
    });

    it("does nothing when the module is only loaded, even where require.main is undefined", () => {
      const result = spawn(["-e", `require(${JSON.stringify(`./${command}`)});`]);

      assert.equal(result.status, 0);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
    });
  });
});
