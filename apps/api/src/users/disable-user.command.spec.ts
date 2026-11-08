import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DisabledUser } from "./application/user-access.repository";
import { runDisableUser } from "./disable-user.command";

// The `user:disable` command: output, exit codes, and the close of its store, with an in-memory
// store. The transaction is proved in the Prisma specs of the user access repository.

const CLOSE_FAILED_LINE = '{"event":"user_disable_close_failed","error":"TypeError"}';

function run(args: string[], result: DisabledUser | null | Error, failClose = false) {
  const out: string[] = [];
  const err: string[] = [];
  const store = { opened: 0, closed: 0 };
  const exitCode = runDisableUser(
    args,
    { isTerminal: false, out: (line) => out.push(line), err: (line) => err.push(line) },
    () => {
      store.opened += 1;
      return {
        users: {
          disableAndRevokeSessions: async () => {
            if (result instanceof Error) {
              throw result;
            }
            return result;
          },
        },
        close: async () => {
          store.closed += 1;
          if (failClose) {
            throw new TypeError("disconnect from user@example.test failed");
          }
        },
      };
    },
  );
  return exitCode.then((code) => ({ exitCode: code, out, err, store }));
}

const DISABLED = { userId: "user-1", alreadyDisabled: false, revokedSessions: 2 } as const;

describe("user:disable", () => {
  for (const args of [[], ["--"], ["a@example.test", "b@example.test"]]) {
    it(`exits 2 with the usage for ${JSON.stringify(args)} and opens no store`, async () => {
      const { exitCode, out, err, store } = await run(args, DISABLED);

      assert.equal(exitCode, 2);
      assert.deepEqual(out, []);
      assert.deepEqual(err, ["Usage: pnpm --filter @invitame/api user:disable -- <email>"]);
      assert.equal(store.opened, 0);
    });
  }

  it("exits 0 and logs the user id, never the address", async () => {
    const { exitCode, out, err, store } = await run(["User@Example.test"], DISABLED);

    assert.equal(exitCode, 0);
    assert.deepEqual(err, []);
    assert.deepEqual(out, [
      '{"event":"user_disabled","userId":"user-1","alreadyDisabled":false,"revokedSessions":2}',
    ]);
    assert.deepEqual(store, { opened: 1, closed: 1 });
  });

  it("exits 1 when no user has the address", async () => {
    const { exitCode, out, err } = await run(["user@example.test"], null);

    assert.equal(exitCode, 1);
    assert.deepEqual(err, []);
    assert.deepEqual(out, ['{"event":"user_disable_not_found"}']);
  });

  it("exits 2 for an address that is not an email", async () => {
    const { exitCode, out, err } = await run(["not-an-email"], DISABLED);

    assert.equal(exitCode, 2);
    assert.deepEqual(out, []);
    assert.deepEqual(err, ["Provide the email address of the user to disable."]);
  });

  it("exits 1 on a store failure and reports the error class only", async () => {
    const { exitCode, out, err } = await run(
      ["user@example.test"],
      new TypeError("connect to user@example.test failed"),
    );

    assert.equal(exitCode, 1);
    assert.deepEqual(out, []);
    assert.deepEqual(err, ['{"event":"user_disable_failed","error":"TypeError"}']);
  });

  describe("when closing the store fails after the user is disabled", () => {
    it("still exits 0 and logs one line with the class only", async () => {
      const { exitCode, out, err } = await run(["user@example.test"], DISABLED, true);

      assert.equal(exitCode, 0);
      assert.equal(out.length, 1);
      assert.deepEqual(err, [CLOSE_FAILED_LINE]);
      assert.ok(!err.join("\n").includes("user@example.test"));
    });

    it("keeps the exit code 1 of an unknown user and of a store failure", async () => {
      const unknown = await run(["user@example.test"], null, true);
      assert.equal(unknown.exitCode, 1);
      assert.deepEqual(unknown.err, [CLOSE_FAILED_LINE]);

      const failed = await run(["user@example.test"], new RangeError("boom"), true);
      assert.equal(failed.exitCode, 1);
      assert.deepEqual(failed.err, [
        '{"event":"user_disable_failed","error":"RangeError"}',
        CLOSE_FAILED_LINE,
      ]);
    });
  });
});
