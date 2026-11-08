import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, it } from "node:test";

import { commandFailureEvent } from "./application/command-failure";
import { databaseErrorCode } from "./domain/database-error-code";

// The failure line of the server-side commands (M2 T11d; S50, L71): the error class and, for a Prisma
// failure, its error code such as P2002. Never the message, which can echo the address or a value.

class PrismaClientKnownRequestError extends Error {
  override readonly name = "PrismaClientKnownRequestError";
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

class PrismaClientInitializationError extends Error {
  override readonly name = "PrismaClientInitializationError";
  constructor(
    message: string,
    readonly errorCode: string,
  ) {
    super(message);
  }
}

describe("databaseErrorCode", () => {
  it("reads the code of a known request error and the errorCode of an initialization error", () => {
    assert.equal(databaseErrorCode(new PrismaClientKnownRequestError("x", "P2002")), "P2002");
    assert.equal(databaseErrorCode(new PrismaClientInitializationError("x", "P1001")), "P1001");
  });

  it("returns undefined for anything that is not a Prisma code, whatever it says", () => {
    const system = Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" });
    const echoing = new PrismaClientKnownRequestError("x", "P2002 for admin@example.test");

    for (const value of [system, echoing, new Error("P2002"), "P2002", null, undefined, 42]) {
      assert.equal(databaseErrorCode(value), undefined);
    }
  });
});

describe("commandFailureEvent", () => {
  it("holds the event, the error class, and the Prisma code, and no message", () => {
    const failure = new PrismaClientKnownRequestError(
      "Unique constraint failed on admin@example.test",
      "P2002",
    );

    const event = commandFailureEvent("administrator_create_failed", failure);

    assert.deepEqual(event, {
      event: "administrator_create_failed",
      error: "PrismaClientKnownRequestError",
      code: "P2002",
    });
    assert.ok(!JSON.stringify(event).includes("admin@example.test"));
  });

  it("keeps the previous shape, the event and the class, when the failure has no Prisma code", () => {
    assert.deepEqual(
      commandFailureEvent("user_disable_failed", new TypeError("admin@example.test")),
      {
        event: "user_disable_failed",
        error: "TypeError",
      },
    );
    assert.deepEqual(commandFailureEvent("user_disable_failed", "admin@example.test"), {
      event: "user_disable_failed",
      error: "unknown",
    });
  });
});

describe("user:disable failure line", () => {
  it("prints the Prisma code and the class when the database is unreachable, never the address or the URL", () => {
    const email = "locked.person@example.test";
    const password = "pw-secret-9f2c";
    const run = spawnSync(
      process.execPath,
      ["-r", "@swc-node/register", join(__dirname, "disable-user.command.ts"), "--", email],
      {
        encoding: "utf8",
        timeout: 60_000,
        env: {
          PATH: process.env.PATH ?? "",
          DATABASE_URL: `postgresql://someone:${password}@127.0.0.1:1/invitame_unreachable`,
        },
      },
    );

    assert.equal(run.status, 1);
    assert.deepEqual(JSON.parse(run.stderr.trim()), {
      event: "user_disable_failed",
      error: "PrismaClientInitializationError",
      code: "P1001",
    });
    for (const secret of [email, password, "127.0.0.1", "someone"]) {
      assert.ok(!run.stderr.includes(secret) && !run.stdout.includes(secret));
    }
  });
});
