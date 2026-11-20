import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { PrismaAdminActionRecorder } from "../../admin/infrastructure/prisma-admin-action-recorder";
import {
  ADMIN_ACTION,
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  ADMIN_ACTION_REASON,
} from "../../admin/domain/admin-action";
import { InvalidAdminActionError } from "../../admin/domain/admin-action.errors";
import { requireLocalDatabaseUrl } from "../../../test/database";
import {
  InvitationAlreadyArchivedError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import { PrismaAdminInvitationRepository } from "./prisma-admin-invitation.repository";

// The administrator's unpublish on real PostgreSQL (M9 T8; S4, S6, L9): the guarded transition from PUBLISHED to DRAFT
// that keeps `firstPublishedAt`, the audit row the same transaction writes, the silence of every refusal, and the
// rollback of the change when the audit entry is refused. Runs only through `pnpm --filter @invitame/api test:db` with
// an explicit DATABASE_URL.
//
// The `AdminAction` table is append-only and its three references are RESTRICT, so this suite cannot delete the rows it
// commits: the migration's trigger refuses the DELETE of an audit row, and that row blocks deleting the invitation and
// the two accounts it names. The fixtures are therefore unique to this run and the committed ones stay in the
// disposable database; `after` only disconnects. The refused and rolled-back scenarios leave no audit row at all, so
// their invitations stay deletable in principle and are simply left with the rest.

const RENDERER = "birthday-poster-01";
const AT = new Date("2026-11-24T10:00:00.000Z");

describe("admin invitation unpublish on real PostgreSQL (M9 T8; S4, S6)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const repository = new PrismaAdminInvitationRepository(prisma, new PrismaAdminActionRecorder());
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  let sequence = 0;
  let adminUserId = "";
  let ownerUserId = "";
  let publishedId = "";
  let draftId = "";
  let archivedId = "";
  let rolledBackId = "";

  before(async () => {
    const admin = await prisma.user.create({
      data: { email: `m9-unpublish-admin-${runId}@example.test`, role: "ADMIN" },
    });
    adminUserId = admin.id;
    const owner = await prisma.user.create({
      data: { email: `m9-unpublish-owner-${runId}@example.test` },
    });
    ownerUserId = owner.id;

    const category = await prisma.category.create({
      data: { key: `m9-unpublish-category-${runId}`, name: "Categoría" },
    });
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m9-unpublish-template-${runId}`,
        name: "Plantilla",
        status: "PUBLISHED",
      },
    });
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
      data: { key: `m9-unpublish-package-${runId}`, name: "Paquete", status: "ACTIVE" },
    });

    async function newInvitation(status: "DRAFT" | "PUBLISHED" | "ARCHIVED"): Promise<string> {
      sequence += 1;
      const created = await prisma.invitation.create({
        data: {
          ownerId: owner.id,
          templateVersionId: version.id,
          packageId: createdPackage.id,
          slug: `m9-unpublish-${runId}-${sequence}`,
          status,
          content: {},
          // The CHECK constraints pair each status with its own marker columns.
          publishedAt: status === "PUBLISHED" ? AT : null,
          firstPublishedAt: status === "DRAFT" ? null : AT,
          archivedAt: status === "ARCHIVED" ? AT : null,
        },
      });
      return created.id;
    }

    publishedId = await newInvitation("PUBLISHED");
    draftId = await newInvitation("DRAFT");
    archivedId = await newInvitation("ARCHIVED");
    rolledBackId = await newInvitation("PUBLISHED");
  });

  after(async () => {
    // Nothing is deleted: a committed audit row refuses the DELETE of itself, of its invitation, and of the two
    // accounts it names, and the disposable database removes the fixtures with it.
    await prisma.$disconnect();
  });

  it("unpublishes and commits the audit row with the change", async () => {
    const row = await repository.unpublishForAdmin(publishedId, {
      adminUserId,
      reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
      note: "  La dueña lo pidió por correo.  ",
    });

    assert.ok(row);
    assert.equal(row.invitationId, publishedId);
    assert.equal(row.status, "DRAFT");
    assert.equal(row.publishedAt, null);
    // Unpublishing is not the first publication: the history the refund rule reads is kept (S3).
    assert.equal(row.firstPublishedAt?.getTime(), AT.getTime());
    assert.equal(row.ownerId, ownerUserId);

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: publishedId } });
    assert.equal(stored.status, "DRAFT");
    assert.equal(stored.publishedAt, null);
    assert.equal(stored.firstPublishedAt?.getTime(), AT.getTime());

    const actions = await prisma.adminAction.findMany({ where: { invitationId: publishedId } });
    assert.equal(actions.length, 1, "one audit row for one unpublish");
    const action = actions[0];
    assert.ok(action);
    assert.equal(action.adminUserId, adminUserId);
    assert.equal(action.action, ADMIN_ACTION.INVITATION_UNPUBLISHED);
    assert.equal(action.reason, ADMIN_ACTION_REASON.OWNER_REQUEST);
    assert.equal(action.note, "La dueña lo pidió por correo.", "the stored note is trimmed");
    assert.equal(action.targetUserId, null);
  });

  it("writes no audit row for a draft, an archived invitation, or an unknown id", async () => {
    await assert.rejects(
      repository.unpublishForAdmin(draftId, {
        adminUserId,
        reason: ADMIN_ACTION_REASON.ABUSE,
        note: null,
      }),
      InvitationNotPublishedError,
    );
    await assert.rejects(
      repository.unpublishForAdmin(archivedId, {
        adminUserId,
        reason: ADMIN_ACTION_REASON.ABUSE,
        note: null,
      }),
      InvitationAlreadyArchivedError,
    );
    assert.equal(
      await repository.unpublishForAdmin(randomUUID(), {
        adminUserId,
        reason: ADMIN_ACTION_REASON.PAYMENT_ERROR,
        note: null,
      }),
      null,
    );

    assert.equal(
      await prisma.adminAction.count({
        where: { invitationId: { in: [draftId, archivedId] } },
      }),
      0,
      "a refused unpublish writes no audit row",
    );
    const draft = await prisma.invitation.findUniqueOrThrow({ where: { id: draftId } });
    assert.equal(draft.status, "DRAFT");
    const archived = await prisma.invitation.findUniqueOrThrow({ where: { id: archivedId } });
    assert.equal(archived.status, "ARCHIVED");
    assert.equal(archived.archivedAt?.getTime(), AT.getTime());
  });

  it("rolls the unpublish back when the audit entry is refused", async () => {
    // The note bypasses the DTO on purpose: the repository is a direct caller, and only the audit domain refuses a
    // note wider than the column. The refusal happens after the guarded update ran, so the rollback is what the
    // transaction has to prove.
    await assert.rejects(
      repository.unpublishForAdmin(rolledBackId, {
        adminUserId,
        reason: ADMIN_ACTION_REASON.OTHER,
        note: "a".repeat(ADMIN_ACTION_NOTE_MAX_LENGTH + 1),
      }),
      InvalidAdminActionError,
    );

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: rolledBackId } });
    assert.equal(
      stored.status,
      "PUBLISHED",
      "the unpublish rolled back with the refused audit row",
    );
    assert.equal(stored.publishedAt?.getTime(), AT.getTime());
    assert.equal(stored.firstPublishedAt?.getTime(), AT.getTime());
    assert.equal(await prisma.adminAction.count({ where: { invitationId: rolledBackId } }), 0);
  });
});
