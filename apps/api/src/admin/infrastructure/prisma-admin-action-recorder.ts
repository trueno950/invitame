import type { Prisma } from "@prisma/client";

import type { AdminActionRecorder, RecordedAdminAction } from "../admin-action-recorder";
import type { AdminActionEntry } from "../domain/admin-action";
import { validateAdminActionEntry } from "../domain/admin-action";
import { InvalidAdminActionError } from "../domain/admin-action.errors";

// The `AdminAction` recorder on PostgreSQL (M9 T6; S4, S6, L9). It holds no client of its own on purpose: every
// statement runs on the transaction client its caller passes, so the caller's change and the audit row commit
// together or not at all. The row is never read back beyond its id and its server instant, and nothing here updates
// or deletes one — the migration's trigger refuses both.
export class PrismaAdminActionRecorder implements AdminActionRecorder {
  async record(
    tx: Prisma.TransactionClient,
    entry: AdminActionEntry,
  ): Promise<RecordedAdminAction> {
    const validated = validateAdminActionEntry(entry);

    if (!validated.ok) {
      throw new InvalidAdminActionError(validated.issue);
    }

    return tx.adminAction.create({
      data: {
        adminUserId: validated.value.adminUserId,
        action: validated.value.action,
        reason: validated.value.reason,
        note: validated.value.note,
        targetUserId: validated.value.targetUserId,
        invitationId: validated.value.invitationId,
      },
      select: { id: true, createdAt: true },
    });
  }
}
