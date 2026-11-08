import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../test/database";

// S2, ownership as normalized relations and database constraints: every identity row names its
// user through a NOT NULL foreign key that cascades, so no row exists without an owner and none
// outlives it. Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL
// that points at a disposable, already migrated local database; it is not part of `pnpm test`.

describe("identity rows are owned through database constraints (S2, real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const runId = randomUUID();
  const emails: string[] = [];

  after(async () => {
    try {
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function createUser(label: string) {
    const email = `s2-${label}-${runId}@example.test`;
    emails.push(email);
    return prisma.user.create({ data: { email } });
  }

  /** The PostgreSQL SQLSTATE a raw statement raises, or "ok" when it succeeds. */
  async function sqlState(statement: () => Promise<unknown>): Promise<string> {
    try {
      await statement();
      return "ok";
    } catch (error) {
      return (error as { meta?: { code?: string } }).meta?.code ?? "unknown";
    }
  }

  const insertSession = (userId: string) => prisma.$executeRaw`
    INSERT INTO "Session" (id, "userId", token, "expiresAt", "updatedAt")
    VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${randomUUID()}, now(), now())`;
  const insertAccount = (userId: string, accountId: string = randomUUID()) => prisma.$executeRaw`
    INSERT INTO "Account" (id, "userId", "accountId", "providerId", "updatedAt")
    VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${accountId}, 'credential', now())`;
  const insertTwoFactor = (userId: string) => prisma.$executeRaw`
    INSERT INTO "TwoFactor" (id, "userId", secret, "backupCodes")
    VALUES (${randomUUID()}::uuid, ${userId}::uuid, 'secret', 'codes')`;

  it("refuses a session, an account, and a two-factor row whose user does not exist", async () => {
    const orphan = randomUUID();

    assert.deepEqual(
      {
        session: await sqlState(() => insertSession(orphan)),
        account: await sqlState(() => insertAccount(orphan)),
        twoFactor: await sqlState(() => insertTwoFactor(orphan)),
      },
      { session: "23503", account: "23503", twoFactor: "23503" },
    );
  });

  it("deletes a user's sessions, accounts, and two-factor row together with the user", async () => {
    const user = await createUser("cascade");
    await insertSession(user.id);
    await insertAccount(user.id);
    await insertTwoFactor(user.id);
    const rowsOf = async () => ({
      sessions: await prisma.session.count({ where: { userId: user.id } }),
      accounts: await prisma.account.count({ where: { userId: user.id } }),
      twoFactor: await prisma.twoFactor.count({ where: { userId: user.id } }),
    });
    assert.deepEqual(await rowsOf(), { sessions: 1, accounts: 1, twoFactor: 1 });

    await prisma.user.delete({ where: { id: user.id } });

    assert.deepEqual(await rowsOf(), { sessions: 0, accounts: 0, twoFactor: 0 });
  });

  it("allows one two-factor row per user and one account per provider and account id", async () => {
    const user = await createUser("unique");
    const other = await createUser("unique-other");
    await insertTwoFactor(user.id);
    await insertAccount(user.id, user.id);

    assert.equal(await sqlState(() => insertTwoFactor(user.id)), "23505");
    assert.equal(await sqlState(() => insertAccount(other.id, user.id)), "23505");
  });

  it("stores only the declared roles and statuses", async () => {
    const email = `s2-enum-${runId}@example.test`;
    emails.push(email);
    const insertUser = (role: string, status: string) => prisma.$executeRaw`
      INSERT INTO "User" (id, email, role, status, "updatedAt")
      VALUES (${randomUUID()}::uuid, ${email}, ${role}::"UserRole", ${status}::"UserStatus", now())`;

    assert.equal(await sqlState(() => insertUser("SUPERUSER", "ACTIVE")), "22P02");
    assert.equal(await sqlState(() => insertUser("CUSTOMER", "SUSPENDED")), "22P02");
  });
});
