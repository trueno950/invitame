import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrismaClient } from "@prisma/client";

import type { AdminActionRecorder } from "../../admin/admin-action-recorder";
import { ADMIN_ACTION, ADMIN_ACTION_REASON } from "../../admin/domain/admin-action";
import {
  InvitationAlreadyArchivedError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import { PrismaAdminInvitationRepository } from "./prisma-admin-invitation.repository";

// The detail read's identifier (M9 T2, T5; S1). The route validates the parameter as a UUID, so a malformed id never
// arrives over HTTP today; the use case and the repository can still be called with one (a command, a later route, a
// future internal caller), and PostgreSQL would refuse the comparison with a database error. The repository answers
// null — the same "no row" the route maps to its one 404 — and never sends the statement.

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";

/** The read suites never write an audit row, so a recorder that refuses proves it was never asked. */
const NEVER_RECORDS: AdminActionRecorder = {
  record: async () => {
    throw new Error("the read suites never record an audit row");
  },
};

/** A Prisma client whose only used method records the id it was given and answers no row. */
function fakePrisma(): { client: PrismaClient; reads: string[] } {
  const reads: string[] = [];
  const client = {
    invitation: {
      findUnique: async (args: { where: { id: string } }) => {
        reads.push(args.where.id);
        return null;
      },
    },
  } as unknown as PrismaClient;

  return { client, reads };
}

describe("PrismaAdminInvitationRepository detail read (M9 T2, T5; S1)", () => {
  it("answers null for an id that is not a UUID, without querying", async () => {
    const { client, reads } = fakePrisma();
    const repository = new PrismaAdminInvitationRepository(client, NEVER_RECORDS);

    for (const id of ["not-a-uuid", "", "1111", `${INVITATION_ID}-x`]) {
      assert.equal(await repository.findForAdmin(id), null, id);
    }
    assert.deepEqual(reads, [], "a malformed id costs no query");
  });

  it("still reads a stored id through the client", async () => {
    const { client, reads } = fakePrisma();
    const repository = new PrismaAdminInvitationRepository(client, NEVER_RECORDS);

    assert.equal(await repository.findForAdmin(INVITATION_ID), null);
    assert.deepEqual(reads, [INVITATION_ID]);
  });
});

describe("PrismaAdminInvitationRepository admin unpublish (M9 T8; S4, S6)", () => {
  const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
  const AUDIT_ROW_ID = "44444444-4444-8444-8444-444444444444";
  const PUBLISHED_AT = new Date("2026-11-24T10:00:00.000Z");

  type StoredStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

  /** One stored row as the adapter's own select returns it, in the status the scenario names. */
  function storedRow(status: StoredStatus) {
    return {
      id: INVITATION_ID,
      ownerId: "11111111-1111-4111-8111-111111111111",
      packageId: "22222222-2222-4222-8222-222222222222",
      templateVersionId: "33333333-3333-4333-8333-333333333333",
      slug: "boda-ana",
      status,
      createdAt: new Date("2026-11-20T10:00:00.000Z"),
      publishedAt: status === "PUBLISHED" ? PUBLISHED_AT : null,
      firstPublishedAt: PUBLISHED_AT,
      archivedAt: status === "ARCHIVED" ? PUBLISHED_AT : null,
      refundRequestedAt: null,
    };
  }

  interface Recorded {
    readonly tx: unknown;
    readonly entry: unknown;
  }

  /**
   * A Prisma client whose transaction hands one fake client to the callback and whose `invitation` statements answer
   * what the scenario names. The recorder keeps the client it was given, so a spec can prove the audit row is written
   * with the caller's own transaction rather than one of its own.
   */
  function harness(options: { updated: number; stored: ReturnType<typeof storedRow> | null }) {
    const updates: Array<Record<string, unknown>> = [];
    const reads: string[] = [];
    const recorded: Recorded[] = [];
    const transactions: unknown[] = [];
    const tx = {
      invitation: {
        updateMany: async (args: Record<string, unknown>) => {
          updates.push(args);
          return { count: options.updated };
        },
        findUnique: async (args: { where: { id: string } }) => {
          reads.push(args.where.id);
          return options.stored;
        },
        findUniqueOrThrow: async (args: { where: { id: string } }) => {
          reads.push(args.where.id);
          return options.stored;
        },
      },
    };
    const client = {
      $transaction: async (run: (client: unknown) => Promise<unknown>) => {
        transactions.push(tx);
        return run(tx);
      },
    } as unknown as PrismaClient;
    const recorder = {
      record: async (given: unknown, entry: unknown) => {
        recorded.push({ tx: given, entry });
        return { id: AUDIT_ROW_ID, createdAt: PUBLISHED_AT };
      },
    };

    return {
      repository: new PrismaAdminInvitationRepository(client, recorder),
      updates,
      reads,
      recorded,
      transactions,
    };
  }

  const AUDIT = {
    adminUserId: ADMIN_ID,
    reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
    note: "  La dueña lo pidió por correo.  ",
  };

  it("guards the transition by status and records the audit row with the caller's transaction", async () => {
    const test = harness({ updated: 1, stored: storedRow("DRAFT") });

    const row = await test.repository.unpublishForAdmin(INVITATION_ID, AUDIT);

    assert.equal(row?.status, "DRAFT");
    assert.deepEqual(test.updates, [
      {
        where: { id: INVITATION_ID, status: "PUBLISHED" },
        // The status left PUBLISHED, so its marker is cleared in the same write; `firstPublishedAt` is not touched.
        data: { status: "DRAFT", publishedAt: null },
      },
    ]);
    assert.equal(test.recorded.length, 1);
    assert.equal(
      test.recorded[0]?.tx,
      test.transactions[0],
      "the audit row is written with the caller's own transaction",
    );
    assert.deepEqual(test.recorded[0]?.entry, {
      adminUserId: ADMIN_ID,
      action: ADMIN_ACTION.INVITATION_UNPUBLISHED,
      reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
      // The note is passed through as the administrator sent it; the recorder trims it before the column.
      note: "  La dueña lo pidió por correo.  ",
      invitationId: INVITATION_ID,
    });
    assert.equal(test.reads.at(-1), INVITATION_ID, "the unpublish reads the changed row back once");
  });

  it("answers null, and writes no audit row, for an id no invitation has", async () => {
    const test = harness({ updated: 0, stored: null });

    assert.equal(await test.repository.unpublishForAdmin(INVITATION_ID, AUDIT), null);
    assert.equal(
      test.reads.at(-1),
      INVITATION_ID,
      "the miss is re-read to tell 404 from a conflict",
    );
    assert.deepEqual(test.recorded, []);
  });

  it("refuses a draft and an archived invitation, and writes no audit row for either", async () => {
    for (const [status, expected] of [
      ["DRAFT", InvitationNotPublishedError],
      ["ARCHIVED", InvitationAlreadyArchivedError],
    ] as const) {
      const test = harness({ updated: 0, stored: storedRow(status) });

      await assert.rejects(
        test.repository.unpublishForAdmin(INVITATION_ID, AUDIT),
        (error: unknown) => error instanceof expected,
        status,
      );
      assert.deepEqual(test.recorded, [], `${status} writes no audit row`);
    }
  });

  it("never opens a transaction for an id that is not a UUID", async () => {
    const test = harness({ updated: 1, stored: storedRow("DRAFT") });

    for (const id of ["not-a-uuid", "", "1111"]) {
      assert.equal(await test.repository.unpublishForAdmin(id, AUDIT), null, id);
    }
    assert.deepEqual(test.transactions, [], "a malformed id costs no transaction");
  });
});
