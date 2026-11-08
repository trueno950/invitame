import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaOwnProfileRepository } from "./prisma-own-profile.repository";

// The display-name write needs an ACTIVE account in the same statement (M2 T11b; S53, L72). Runs
// only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a
// disposable, already migrated local database; not part of `pnpm test`.

/** A wait on the second connection fails the test instead of hanging it. */
const WAIT_MS = 10_000;
const POLL_MS = 20;

describe("PrismaOwnProfileRepository.updateDisplayName on PostgreSQL (S53)", () => {
  const url = requireLocalDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  // A second connection plays `user:disable`: it holds a row lock the repository's write waits on.
  const other = new PrismaClient({ datasources: { db: { url } } });
  const repository = new PrismaOwnProfileRepository(prisma);
  const runId = randomUUID();
  const emails: string[] = [];

  async function createUser(label: string, status: "ACTIVE" | "DISABLED", displayName: string) {
    const email = `t11b-${label}-${runId}@example.test`;
    emails.push(email);
    return other.user.create({ data: { email, displayName, status } });
  }

  async function stored(id: string) {
    const row = await other.user.findUniqueOrThrow({ where: { id } });
    return { displayName: row.displayName, status: row.status };
  }

  after(async () => {
    try {
      await other.user.deleteMany({ where: { email: { in: emails } } });
    } finally {
      await prisma.$disconnect();
      await other.$disconnect();
    }
  });

  it("renames and clears the name of an ACTIVE account", async () => {
    const user = await createUser("active", "ACTIVE", "");

    const renamed = await repository.updateDisplayName(user.id, "Ana");
    assert.equal(renamed?.displayName, "Ana");
    assert.deepEqual(await stored(user.id), { displayName: "Ana", status: "ACTIVE" });

    const cleared = await repository.updateDisplayName(user.id, null);
    assert.equal(cleared?.displayName, null);
    assert.deepEqual(await stored(user.id), { displayName: null, status: "ACTIVE" });
  });

  it("answers null and keeps the stored name of a DISABLED account, for a rename and for a clear", async () => {
    const user = await createUser("disabled", "DISABLED", "Kept");

    assert.equal(await repository.updateDisplayName(user.id, "Changed"), null);
    assert.equal(await repository.updateDisplayName(user.id, null), null);

    assert.deepEqual(await stored(user.id), { displayName: "Kept", status: "DISABLED" });
  });

  it("answers null for an id that no account has", async () => {
    assert.equal(await repository.updateDisplayName(randomUUID(), "Nobody"), null);
  });

  it("answers null and stores nothing when the disable commits while the write waits on the row lock", async () => {
    const user = await createUser("race", "ACTIVE", "");
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = () => {};
    const lockHeld = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const disabling = other.$transaction(
      async (transaction) => {
        await transaction.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
        locked();
        await gate;
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
    let writing: ReturnType<typeof repository.updateDisplayName> | undefined;

    try {
      await Promise.race([lockHeld, rejectAfter(WAIT_MS, "the disable to hold its row lock")]);
      writing = repository.updateDisplayName(user.id, "RaceName");
      // The write is a statement of its own: wait until PostgreSQL shows it blocked on that lock.
      for (let waited = 0; ; waited += POLL_MS) {
        const [{ blocked }] = await other.$queryRaw<[{ blocked: bigint }]>`
          SELECT count(*) AS blocked FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%"displayName"%'`;
        if (blocked > 0n) break;
        assert.ok(waited < WAIT_MS, "the write waits on the disable's row lock");
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
    } finally {
      release();
      await Promise.race([disabling, rejectAfter(WAIT_MS, "the disable to commit")]).catch(
        () => {},
      );
    }

    assert.ok(writing);
    assert.equal(await writing, null);
    assert.deepEqual(await stored(user.id), { displayName: "", status: "DISABLED" });
  });
});

function rejectAfter(milliseconds: number, what: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error(`timed out after ${milliseconds} ms waiting for ${what}`)),
      milliseconds,
    ).unref();
  });
}
