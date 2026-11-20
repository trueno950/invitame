import type { PrismaClient } from "@prisma/client";

import type {
  InvitationOwnerStatusReader,
  OwnerAccountStatus,
} from "../../invitations/application/invitation-owner-status";

// The owner's account state for the administrator's invitation detail (M9 T9; S4), on PostgreSQL. The support card
// offers disable or reactivate for the owner, so the detail answers one more field; this adapter reads the stored
// status and nothing else about the account — no role, no name, no session, no address — in one statement for the
// whole batch, never one query per row.
export class PrismaInvitationOwnerStatusReader implements InvitationOwnerStatusReader {
  constructor(private readonly prisma: PrismaClient) {}

  async statusesFor(ownerIds: readonly string[]): Promise<Map<string, OwnerAccountStatus>> {
    if (ownerIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.user.findMany({
      where: { id: { in: [...ownerIds] } },
      select: { id: true, status: true },
    });

    return new Map(rows.map((row) => [row.id, row.status as OwnerAccountStatus]));
  }
}
