import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrismaClient } from "@prisma/client";

import type { AdminActionRecorder } from "../../admin/admin-action-recorder";
import { ADMIN_ACTION, ADMIN_ACTION_REASON } from "../../admin/domain/admin-action";
import { InvalidAdminActionError } from "../../admin/domain/admin-action.errors";
import {
  AccountAlreadyActiveError,
  AccountAlreadyDisabledError,
  AdminAccountProtectedError,
  UserCannotSignInByCodeError,
} from "../domain/account-support.errors";
import { PrismaAdminUserAccountRepository } from "./prisma-admin-user-account.repository";

// The account support adapter (M9 T9; S4, S6, L8, L9) against a fake transaction. Each action is one interactive
// transaction: the account is read, the guarded update decides whether the transition applies, disabling deletes the
// sessions in the same transaction, and the audit row is written through the injected recorder with that same
// transaction client — the shape the PostgreSQL suite then proves against a real database.

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const AUDIT_ROW_ID = "44444444-4444-8444-8444-444444444444";
const AT = new Date("2026-11-28T10:00:00.000Z");
const EMAIL = "duena@example.test";

type StoredStatus = "ACTIVE" | "DISABLED";
type StoredRole = "CUSTOMER" | "ADMIN";

function storedAccount(status: StoredStatus, role: StoredRole = "CUSTOMER") {
  return { id: USER_ID, email: EMAIL, status, role };
}

interface Recorded {
  readonly tx: unknown;
  readonly entry: unknown;
}

interface Options {
  /** The row the adapter's own select answers, or null when no user has the id. */
  readonly stored: ReturnType<typeof storedAccount> | null;
  /**
   * The row the re-read after a guarded update sees; `stored` unless given, and null for a row that is gone. It stands
   * for whatever another transaction committed between this call's read and its update (M9 T10; R1-001, R4-001).
   */
  readonly reread?: ReturnType<typeof storedAccount> | null;
  /** How many rows the guarded update matched. */
  readonly updated?: number;
  /** How many sessions the delete matched. */
  readonly sessions?: number;
  /** The recorder answers a row, or refuses the entry with `InvalidAdminActionError`. */
  readonly recorderRefuses?: boolean;
}

function harness(options: Options) {
  const reads: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const deletes: Array<Record<string, unknown>> = [];
  const recorded: Recorded[] = [];
  const transactions: unknown[] = [];
  const tx = {
    user: {
      findUnique: async (args: { where: { id: string } }) => {
        reads.push(args.where.id);
        if (reads.length === 1) {
          return options.stored;
        }
        return options.reread === undefined ? options.stored : options.reread;
      },
      updateMany: async (args: Record<string, unknown>) => {
        updates.push(args);
        return { count: options.updated ?? 0 };
      },
    },
    session: {
      deleteMany: async (args: Record<string, unknown>) => {
        deletes.push(args);
        return { count: options.sessions ?? 0 };
      },
    },
  };
  const client = {
    $transaction: async (run: (client: unknown) => Promise<unknown>) => {
      transactions.push(tx);
      return run(tx);
    },
  } as unknown as PrismaClient;
  const recorder: AdminActionRecorder = {
    record: async (given, entry) => {
      recorded.push({ tx: given, entry });
      if (options.recorderRefuses === true) {
        throw new InvalidAdminActionError("note must be at most 500 characters");
      }
      return { id: AUDIT_ROW_ID, createdAt: AT };
    },
  };

  return {
    repository: new PrismaAdminUserAccountRepository(client, recorder),
    reads,
    updates,
    deletes,
    recorded,
    transactions,
  };
}

const AUDIT = {
  adminUserId: ADMIN_ID,
  reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
  note: "  Lo pidió por correo.  ",
};

describe("PrismaAdminUserAccountRepository disable (M9 T9; S4, S6, L8)", () => {
  it("guards ACTIVE → DISABLED, revokes the sessions, and records the audit row with the caller's transaction", async () => {
    const test = harness({ stored: storedAccount("ACTIVE"), updated: 1, sessions: 2 });

    assert.deepEqual(await test.repository.disableForAdmin(USER_ID, AUDIT), {
      status: "DISABLED",
      revokedSessions: 2,
    });
    assert.deepEqual(test.updates, [
      {
        // The role is part of the guard: an account promoted in between is never disabled (M9 T10; R1-001).
        where: { id: USER_ID, status: "ACTIVE", role: "CUSTOMER" },
        data: { status: "DISABLED" },
      },
    ]);
    assert.deepEqual(test.deletes, [{ where: { userId: USER_ID } }]);
    assert.equal(test.recorded.length, 1);
    assert.equal(
      test.recorded[0]?.tx,
      test.transactions[0],
      "the audit row is written with the caller's own transaction",
    );
    assert.deepEqual(test.recorded[0]?.entry, {
      adminUserId: ADMIN_ID,
      action: ADMIN_ACTION.ACCOUNT_DISABLED,
      reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
      // The note is passed through as the administrator sent it; the recorder trims it before the column.
      note: AUDIT.note,
      targetUserId: USER_ID,
    });
  });

  it("guards the customer role, so a promotion committed in between is a 409 refusal instead of a disable", async () => {
    const test = harness({
      stored: storedAccount("ACTIVE"),
      updated: 0,
      // The promotion commits after this call's read, so its guarded update matches no row.
      reread: storedAccount("ACTIVE", "ADMIN"),
    });

    await assert.rejects(
      test.repository.disableForAdmin(USER_ID, AUDIT),
      (error: unknown) => error instanceof AdminAccountProtectedError,
    );
    assert.deepEqual(test.updates, [
      {
        where: { id: USER_ID, status: "ACTIVE", role: "CUSTOMER" },
        data: { status: "DISABLED" },
      },
    ]);
    assert.deepEqual(test.deletes, [], "a protected account loses no session");
    assert.deepEqual(test.recorded, []);
  });

  it("answers a typed conflict, never a 500, when the re-read still sees the original ACTIVE status", async () => {
    // A concurrent disable and reactivate landed in between, so the guarded update matched nothing while the row is
    // ACTIVE again: the answer is a conflict the route maps, not an unexpected failure (M9 T10; R4-001).
    const test = harness({ stored: storedAccount("ACTIVE"), updated: 0 });

    await assert.rejects(
      test.repository.disableForAdmin(USER_ID, AUDIT),
      (error: unknown) => error instanceof AccountAlreadyActiveError,
    );
    assert.deepEqual(test.deletes, []);
    assert.deepEqual(test.recorded, []);
  });

  it("answers 404 when the row is gone by the time the guarded update matched nothing", async () => {
    const test = harness({ stored: storedAccount("ACTIVE"), updated: 0, reread: null });

    assert.equal(await test.repository.disableForAdmin(USER_ID, AUDIT), null);
    assert.deepEqual(test.deletes, []);
    assert.deepEqual(test.recorded, []);
  });

  it("refuses an account that is already disabled, with no session delete and no audit row", async () => {
    const test = harness({ stored: storedAccount("DISABLED"), updated: 0 });

    await assert.rejects(
      test.repository.disableForAdmin(USER_ID, AUDIT),
      (error: unknown) => error instanceof AccountAlreadyDisabledError,
    );
    assert.deepEqual(test.deletes, []);
    assert.deepEqual(test.recorded, []);
  });

  it("answers null for an id no user has, writing nothing", async () => {
    const test = harness({ stored: null });

    assert.equal(await test.repository.disableForAdmin(USER_ID, AUDIT), null);
    assert.deepEqual(test.updates, []);
    assert.deepEqual(test.deletes, []);
    assert.deepEqual(test.recorded, []);
  });

  it("protects an administrator account from being disabled", async () => {
    const test = harness({ stored: storedAccount("ACTIVE", "ADMIN"), updated: 1 });

    await assert.rejects(
      test.repository.disableForAdmin(USER_ID, AUDIT),
      (error: unknown) => error instanceof AdminAccountProtectedError,
    );
    assert.deepEqual(test.updates, [], "an administrator account is never updated");
    assert.deepEqual(test.deletes, []);
    assert.deepEqual(test.recorded, []);
  });

  it("lets a refused audit entry fail the whole call", async () => {
    const test = harness({ stored: storedAccount("ACTIVE"), updated: 1, recorderRefuses: true });

    await assert.rejects(
      test.repository.disableForAdmin(USER_ID, AUDIT),
      (error: unknown) => error instanceof InvalidAdminActionError,
    );
  });
});

describe("PrismaAdminUserAccountRepository reactivate (M9 T9; S4, S6, L9)", () => {
  it("guards DISABLED → ACTIVE and records the audit row, touching no session", async () => {
    const test = harness({ stored: storedAccount("DISABLED"), updated: 1 });

    assert.deepEqual(await test.repository.reactivateForAdmin(USER_ID, AUDIT), {
      status: "ACTIVE",
    });
    assert.deepEqual(test.updates, [
      {
        // The role is part of the guard here too (M9 T10; R1-001).
        where: { id: USER_ID, status: "DISABLED", role: "CUSTOMER" },
        data: { status: "ACTIVE" },
      },
    ]);
    assert.deepEqual(test.deletes, [], "reactivating revokes nothing");
    assert.deepEqual(test.recorded[0]?.entry, {
      adminUserId: ADMIN_ID,
      action: ADMIN_ACTION.ACCOUNT_REACTIVATED,
      reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
      note: AUDIT.note,
      targetUserId: USER_ID,
    });
  });

  it("guards the customer role, so a promotion committed in between is a 409 refusal instead of a reactivate", async () => {
    const test = harness({
      stored: storedAccount("DISABLED"),
      updated: 0,
      reread: storedAccount("DISABLED", "ADMIN"),
    });

    await assert.rejects(
      test.repository.reactivateForAdmin(USER_ID, AUDIT),
      (error: unknown) => error instanceof AdminAccountProtectedError,
    );
    assert.deepEqual(test.updates, [
      {
        where: { id: USER_ID, status: "DISABLED", role: "CUSTOMER" },
        data: { status: "ACTIVE" },
      },
    ]);
    assert.deepEqual(test.recorded, []);
  });

  it("answers a typed conflict, never a 500, when the re-read still sees the original DISABLED status", async () => {
    const test = harness({ stored: storedAccount("DISABLED"), updated: 0 });

    await assert.rejects(
      test.repository.reactivateForAdmin(USER_ID, AUDIT),
      (error: unknown) => error instanceof AccountAlreadyDisabledError,
    );
    assert.deepEqual(test.recorded, []);
  });

  it("answers 404 when the row is gone by the time the guarded update matched nothing", async () => {
    const test = harness({ stored: storedAccount("DISABLED"), updated: 0, reread: null });

    assert.equal(await test.repository.reactivateForAdmin(USER_ID, AUDIT), null);
    assert.deepEqual(test.recorded, []);
  });

  it("refuses an account that is already active, writing nothing", async () => {
    const test = harness({ stored: storedAccount("ACTIVE"), updated: 0 });

    await assert.rejects(
      test.repository.reactivateForAdmin(USER_ID, AUDIT),
      (error: unknown) => error instanceof AccountAlreadyActiveError,
    );
    assert.deepEqual(test.recorded, []);
  });

  it("protects an administrator account, and answers null for an unknown id", async () => {
    const administrator = harness({ stored: storedAccount("DISABLED", "ADMIN"), updated: 1 });
    await assert.rejects(
      administrator.repository.reactivateForAdmin(USER_ID, AUDIT),
      (error: unknown) => error instanceof AdminAccountProtectedError,
    );
    assert.deepEqual(administrator.recorded, []);

    const unknown = harness({ stored: null });
    assert.equal(await unknown.repository.reactivateForAdmin(USER_ID, AUDIT), null);
    assert.deepEqual(unknown.recorded, []);
  });
});

describe("PrismaAdminUserAccountRepository sign-in code request (M9 T9; S4, S6, L9)", () => {
  it("records the request for an active customer and answers the address to send to", async () => {
    const test = harness({ stored: storedAccount("ACTIVE") });

    assert.deepEqual(await test.repository.requestSignInCodeForAdmin(USER_ID, AUDIT), {
      email: EMAIL,
    });
    assert.deepEqual(test.recorded[0]?.entry, {
      adminUserId: ADMIN_ID,
      action: ADMIN_ACTION.SIGN_IN_CODE_RESENT,
      reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
      note: AUDIT.note,
      targetUserId: USER_ID,
    });
    assert.deepEqual(test.updates, [], "the request changes no account");
    assert.deepEqual(test.deletes, []);
  });

  it("refuses a disabled account and an administrator, writing no audit row", async () => {
    for (const stored of [storedAccount("DISABLED"), storedAccount("ACTIVE", "ADMIN")]) {
      const test = harness({ stored });

      await assert.rejects(
        test.repository.requestSignInCodeForAdmin(USER_ID, AUDIT),
        (error: unknown) => error instanceof UserCannotSignInByCodeError,
        stored.role,
      );
      assert.deepEqual(test.recorded, [], "a refused request is not recorded");
    }
  });

  it("answers null for an id no user has", async () => {
    const test = harness({ stored: null });

    assert.equal(await test.repository.requestSignInCodeForAdmin(USER_ID, AUDIT), null);
    assert.deepEqual(test.recorded, []);
  });
});

describe("PrismaAdminUserAccountRepository ids", () => {
  it("never opens a transaction for an id that is not a UUID", async () => {
    for (const method of [
      "disableForAdmin",
      "reactivateForAdmin",
      "requestSignInCodeForAdmin",
    ] as const) {
      const test = harness({ stored: storedAccount("ACTIVE"), updated: 1 });

      for (const id of ["not-a-uuid", "", "1111", `${USER_ID}-x`]) {
        assert.equal(await test.repository[method](id, AUDIT), null, `${method} ${id}`);
      }
      assert.deepEqual(test.transactions, [], `${method} costs no transaction for a malformed id`);
    }
  });
});
