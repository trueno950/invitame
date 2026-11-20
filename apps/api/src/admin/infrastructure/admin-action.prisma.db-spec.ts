import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { PrismaClient, type Prisma } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import {
  ADMIN_ACTION,
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  ADMIN_ACTION_REASON,
} from "../domain/admin-action";
import { InvalidAdminActionError } from "../domain/admin-action.errors";
import { PrismaAdminActionRecorder } from "./prisma-admin-action-recorder";

// The administrator audit on real PostgreSQL (M9 T6; S4, S6, L9): the additive migration's two enum types, table,
// checks, indexes, references, and append-only trigger; the recorder writing the row with the caller's own
// transaction and rolling back with it; each CHECK refusing its bad case; the trigger refusing UPDATE and DELETE; and
// the three RESTRICT references. Runs only through `pnpm --filter @invitame/api test:db` with an explicit
// DATABASE_URL.
//
// The trigger refuses DELETE, so this suite cannot remove the audit rows it writes. Every audit write therefore
// happens inside a transaction the suite rolls back, and the only committed rows are the fixture account, invitation,
// and catalog rows the `after` hook removes.

const RENDERER = "birthday-poster-01";
const AT = new Date("2026-11-27T10:00:00.000Z");
const ROLLBACK = Symbol("rollback");
const NOT_REFUSED = Symbol("not refused");

describe("the append-only administrator audit on real PostgreSQL (M9 T6; S4, S6)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const recorder = new PrismaAdminActionRecorder();
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const adminUserIds: string[] = [];
  const ownerUserIds: string[] = [];
  const targetUserIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const packageIds: string[] = [];
  const invitationIds: string[] = [];
  let adminUserId = "";
  let ownerUserId = "";
  let targetUserId = "";
  let invitationId = "";
  let sequence = 0;

  before(async () => {
    sequence += 1;
    const admin = await prisma.user.create({
      data: { email: `m9-audit-admin-${runId}@example.test`, role: "ADMIN" },
    });
    adminUserId = admin.id;
    adminUserIds.push(admin.id);
    const owner = await prisma.user.create({
      data: { email: `m9-audit-owner-${runId}@example.test` },
    });
    ownerUserId = owner.id;
    ownerUserIds.push(owner.id);

    // The account the audit actions target. It owns nothing, so a refused delete of it can only be the audit row's
    // RESTRICT reference and never an invitation's.
    const target = await prisma.user.create({
      data: { email: `m9-audit-target-${runId}@example.test` },
    });
    targetUserId = target.id;
    targetUserIds.push(target.id);

    const category = await prisma.category.create({
      data: { key: `m9-audit-category-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m9-audit-template-${runId}`,
        name: "Plantilla",
        status: "PUBLISHED",
      },
    });
    templateIds.push(template.id);
    const version = await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        status: "PUBLISHED",
        componentKey: RENDERER,
        schema: { type: "object", required: [], properties: {} },
        configuration: { componentKey: RENDERER },
      },
    });
    const createdPackage = await prisma.package.create({
      data: { key: `m9-audit-package-${runId}`, name: "Paquete", status: "ACTIVE" },
    });
    packageIds.push(createdPackage.id);
    const invitation = await prisma.invitation.create({
      data: {
        ownerId: owner.id,
        templateVersionId: version.id,
        packageId: createdPackage.id,
        slug: `m9-audit-${runId}-${sequence}`,
        status: "PUBLISHED",
        content: {},
        publishedAt: AT,
        firstPublishedAt: AT,
      },
    });
    invitationId = invitation.id;
    invitationIds.push(invitation.id);
  });

  after(async () => {
    try {
      // No audit row reaches the committed state, so the fixture rows have no AdminAction reference and the trigger
      // has nothing to refuse.
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.user.deleteMany({
        where: { id: { in: [...adminUserIds, ...ownerUserIds, ...targetUserIds] } },
      });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  /** One scenario inside a transaction of its own, rolled back afterwards: the audit table accepts no DELETE, so a
   * row this suite writes must never commit. */
  async function rolledBack<T>(scenario: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    let result: T | undefined;
    await prisma
      .$transaction(async (tx) => {
        result = await scenario(tx);
        throw ROLLBACK;
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) {
          throw error;
        }
      });

    return result as T;
  }

  /** The error one statement refuses with. Each attempt runs in its own rolled-back transaction, because a refused
   * statement aborts the transaction it ran in and a later one would only report that abort. */
  async function refusalOf(
    scenario: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<unknown> {
    let refusal: unknown = NOT_REFUSED;
    await prisma
      .$transaction(async (tx) => {
        try {
          await scenario(tx);
        } catch (error) {
          refusal = error;
          throw error;
        }
      })
      .catch(() => undefined);

    assert.notEqual(refusal, NOT_REFUSED, "the database accepted what it must refuse");
    return refusal;
  }

  function messageOf(refusal: unknown): string {
    return refusal instanceof Error ? refusal.message : String(refusal);
  }

  /** One row a caller could write through the recorder, as the raw columns the database checks. */
  function accountAction(overrides: Record<string, unknown> = {}) {
    return {
      adminUserId,
      action: ADMIN_ACTION.ACCOUNT_DISABLED,
      reason: ADMIN_ACTION_REASON.ABUSE,
      note: null,
      targetUserId,
      invitationId: null,
      ...overrides,
    };
  }

  function invitationAction(overrides: Record<string, unknown> = {}) {
    return {
      adminUserId,
      action: ADMIN_ACTION.INVITATION_UNPUBLISHED,
      reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
      note: null,
      targetUserId: null,
      invitationId,
      ...overrides,
    };
  }

  it("creates AdminAction with its two enum types, bounded columns, checks, indexes, references, and trigger", async () => {
    const columns = await prisma.$queryRaw<
      Array<{
        column_name: string;
        is_nullable: string;
        data_type: string;
        character_maximum_length: number | null;
      }>
    >`
      SELECT column_name, is_nullable, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'AdminAction'
      ORDER BY ordinal_position
    `;
    assert.deepEqual(
      columns.map((column) => column.column_name),
      [
        "id",
        "adminUserId",
        "action",
        "reason",
        "note",
        "targetUserId",
        "invitationId",
        "createdAt",
      ],
      "the table has exactly the eight audited columns and no payload column",
    );
    const byName = new Map(columns.map((column) => [column.column_name, column]));
    assert.equal(byName.get("adminUserId")?.is_nullable, "NO");
    assert.equal(byName.get("action")?.is_nullable, "NO");
    assert.equal(byName.get("reason")?.is_nullable, "NO");
    assert.equal(byName.get("note")?.is_nullable, "YES");
    assert.equal(byName.get("note")?.character_maximum_length, ADMIN_ACTION_NOTE_MAX_LENGTH);
    assert.equal(byName.get("targetUserId")?.is_nullable, "YES");
    assert.equal(byName.get("invitationId")?.is_nullable, "YES");
    assert.equal(byName.get("createdAt")?.data_type, "timestamp with time zone");

    const enums = await prisma.$queryRaw<Array<{ type: string; labels: string[] }>>`
      SELECT t.typname AS "type", array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN ('AdminActionType', 'AdminActionReason')
      GROUP BY t.typname
      ORDER BY t.typname
    `;
    assert.deepEqual(enums, [
      { type: "AdminActionReason", labels: Object.values(ADMIN_ACTION_REASON) },
      { type: "AdminActionType", labels: Object.values(ADMIN_ACTION) },
    ]);

    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint WHERE conrelid = '"AdminAction"'::regclass
    `;
    const constraintNames = constraints.map((constraint) => constraint.conname);
    for (const name of [
      "AdminAction_pkey",
      "AdminAction_note_length",
      "AdminAction_note_required_for_other",
      "AdminAction_exactly_one_target",
      "AdminAction_target_matches_action",
      "AdminAction_adminUserId_fkey",
      "AdminAction_targetUserId_fkey",
      "AdminAction_invitationId_fkey",
    ]) {
      assert.ok(constraintNames.includes(name), name);
    }

    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'AdminAction'
    `;
    const indexNames = indexes.map((index) => index.indexname);
    for (const name of [
      "AdminAction_createdAt_id_idx",
      "AdminAction_targetUserId_idx",
      "AdminAction_invitationId_idx",
    ]) {
      assert.ok(indexNames.includes(name), name);
    }

    const references = await prisma.$queryRaw<
      Array<{ constraint_name: string; delete_rule: string }>
    >`
      SELECT constraint_name, delete_rule
      FROM information_schema.referential_constraints
      WHERE constraint_name LIKE 'AdminAction_%_fkey'
      ORDER BY constraint_name
    `;
    assert.deepEqual(
      references.map((reference) => [reference.constraint_name, reference.delete_rule]),
      [
        ["AdminAction_adminUserId_fkey", "RESTRICT"],
        ["AdminAction_invitationId_fkey", "RESTRICT"],
        ["AdminAction_targetUserId_fkey", "RESTRICT"],
      ],
    );

    const triggers = await prisma.$queryRaw<Array<{ tgname: string; tgtype: number }>>`
      SELECT tgname, tgtype FROM pg_trigger
      WHERE tgrelid = '"AdminAction"'::regclass AND NOT tgisinternal
    `;
    assert.deepEqual(
      triggers.map((trigger) => trigger.tgname),
      ["AdminAction_append_only"],
    );
  });

  it("writes the audit row with the caller's transaction and rolls back with the caller's change", async () => {
    const recordedId = await rolledBack(async (tx) => {
      const changed = await tx.invitation.update({
        where: { id: invitationId },
        data: { status: "DRAFT", publishedAt: null },
      });
      assert.equal(changed.status, "DRAFT", "the caller's change ran in this transaction");

      const recorded = await recorder.record(tx, {
        adminUserId,
        action: ADMIN_ACTION.INVITATION_UNPUBLISHED,
        reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
        note: "  La dueña lo pidió por correo.  ",
        invitationId,
      });
      const stored = await tx.adminAction.findUniqueOrThrow({ where: { id: recorded.id } });
      assert.equal(stored.adminUserId, adminUserId);
      assert.equal(stored.action, "INVITATION_UNPUBLISHED");
      assert.equal(stored.reason, "OWNER_REQUEST");
      assert.equal(stored.note, "La dueña lo pidió por correo.", "the stored note is trimmed");
      assert.equal(stored.invitationId, invitationId);
      assert.equal(stored.targetUserId, null);
      assert.equal(stored.createdAt.getTime(), recorded.createdAt.getTime());

      return recorded.id;
    });

    assert.equal(
      await prisma.adminAction.count({ where: { id: recordedId } }),
      0,
      "the audit row rolled back with the caller's transaction",
    );
    const invitation = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
    assert.equal(
      invitation.status,
      "PUBLISHED",
      "the caller's change rolled back with the audit row",
    );
    assert.equal(invitation.publishedAt?.getTime(), AT.getTime());
  });

  it("stores each action with the one target it names", async () => {
    await rolledBack(async (tx) => {
      const rows = [
        invitationAction(),
        accountAction({ action: ADMIN_ACTION.ACCOUNT_DISABLED }),
        accountAction({ action: ADMIN_ACTION.ACCOUNT_REACTIVATED }),
        accountAction({ action: ADMIN_ACTION.SIGN_IN_CODE_RESENT }),
      ];
      for (const row of rows) {
        await tx.adminAction.create({ data: row });
      }

      // The count is scoped to this suite's own actor: the database is shared with the parallel suites, and a suite
      // that commits an audit row (the invitation unpublish does, M9 T8) must not change what this one reads.
      assert.equal(await tx.adminAction.count({ where: { adminUserId } }), rows.length);
    });
  });

  it("refuses an entry the domain refuses before it reaches a statement", async () => {
    await rolledBack(async (tx) => {
      await assert.rejects(
        recorder.record(tx, {
          adminUserId,
          action: ADMIN_ACTION.ACCOUNT_DISABLED,
          reason: ADMIN_ACTION_REASON.OTHER,
          note: "   ",
        }),
        InvalidAdminActionError,
      );
      assert.equal(
        await tx.adminAction.count({ where: { adminUserId } }),
        0,
        "a refused entry writes no row in the caller's transaction",
      );
    });
  });

  it("refuses a note that OTHER requires but does not have, and one longer than 500 characters", async () => {
    const missing = await refusalOf((tx) =>
      tx.adminAction.create({
        data: accountAction({ reason: ADMIN_ACTION_REASON.OTHER }),
      }),
    );
    assert.match(
      messageOf(missing),
      /AdminAction_note_required_for_other|violates check constraint/,
    );

    const blank = await refusalOf((tx) =>
      tx.adminAction.create({
        data: accountAction({ reason: ADMIN_ACTION_REASON.OTHER, note: "   " }),
      }),
    );
    assert.match(messageOf(blank), /AdminAction_note_required_for_other|violates check constraint/);

    const tooWide = await refusalOf((tx) =>
      tx.adminAction.create({
        data: accountAction({
          reason: ADMIN_ACTION_REASON.OTHER,
          note: "a".repeat(ADMIN_ACTION_NOTE_MAX_LENGTH + 1),
        }),
      }),
    );
    assert.ok(tooWide, "a note of 501 characters is refused");
  });

  it("refuses zero targets, two targets, and a target that does not match the action", async () => {
    const none = await refusalOf((tx) =>
      tx.adminAction.create({
        data: accountAction({ targetUserId: null }),
      }),
    );
    assert.match(messageOf(none), /AdminAction_exactly_one_target|violates check constraint/);

    const two = await refusalOf((tx) =>
      tx.adminAction.create({
        data: invitationAction({ targetUserId: ownerUserId }),
      }),
    );
    assert.match(messageOf(two), /AdminAction_exactly_one_target|violates check constraint/);

    const accountMismatch = await refusalOf((tx) =>
      tx.adminAction.create({
        data: accountAction({ targetUserId: null, invitationId }),
      }),
    );
    assert.match(
      messageOf(accountMismatch),
      /AdminAction_target_matches_action|violates check constraint/,
    );

    const invitationMismatch = await refusalOf((tx) =>
      tx.adminAction.create({
        data: invitationAction({ invitationId: null, targetUserId: ownerUserId }),
      }),
    );
    assert.match(
      messageOf(invitationMismatch),
      /AdminAction_target_matches_action|violates check constraint/,
    );
  });

  it("refuses every UPDATE and every DELETE of a stored row", async () => {
    const updated = await refusalOf(async (tx) => {
      const created = await tx.adminAction.create({ data: accountAction() });
      await tx.adminAction.update({ where: { id: created.id }, data: { note: "editada" } });
    });
    assert.match(messageOf(updated), /AdminAction rows are append-only/);

    const deleted = await refusalOf(async (tx) => {
      const created = await tx.adminAction.create({ data: accountAction() });
      await tx.adminAction.delete({ where: { id: created.id } });
    });
    assert.match(messageOf(deleted), /AdminAction rows are append-only/);

    // The same two statements aimed at the whole table rather than one row are refused row by row, so nothing is
    // removed either.
    const cleared = await refusalOf(async (tx) => {
      await tx.adminAction.create({ data: accountAction() });
      await tx.adminAction.deleteMany({});
    });
    assert.match(messageOf(cleared), /AdminAction rows are append-only/);
  });

  it("refuses to delete the actor, the target account, or the invitation an audit row names", async () => {
    const actor = await refusalOf(async (tx) => {
      await tx.adminAction.create({ data: accountAction() });
      await tx.user.delete({ where: { id: adminUserId } });
    });
    assert.match(messageOf(actor), /AdminAction_adminUserId_fkey/);

    const target = await refusalOf(async (tx) => {
      await tx.adminAction.create({ data: accountAction() });
      await tx.user.delete({ where: { id: targetUserId } });
    });
    assert.match(messageOf(target), /AdminAction_targetUserId_fkey/);

    const written = await refusalOf(async (tx) => {
      await tx.adminAction.create({ data: invitationAction() });
      await tx.invitation.delete({ where: { id: invitationId } });
    });
    assert.match(messageOf(written), /AdminAction_invitationId_fkey/);
  });
});
