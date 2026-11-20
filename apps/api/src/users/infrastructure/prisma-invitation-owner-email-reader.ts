import type { PrismaClient } from "@prisma/client";

import type { InvitationOwnerEmailReader } from "../../invitations/application/invitation-owner-email";

// The administrator's owner facet of the invitation status view (M9 T2; S1, L3), on PostgreSQL. The owner decided the
// view shows «Solo el correo», so this adapter reads the email and nothing else: no display name, no account status,
// no role, and no session. It answers a whole page in one statement, never one query per row, and an owner id no row
// has is absent from the map instead of a made-up value.
export class PrismaInvitationOwnerEmailReader implements InvitationOwnerEmailReader {
  constructor(private readonly prisma: PrismaClient) {}

  async emailsFor(ownerIds: readonly string[]): Promise<Map<string, string>> {
    if (ownerIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.user.findMany({
      where: { id: { in: [...ownerIds] } },
      select: { id: true, email: true },
    });

    return new Map(rows.map((row) => [row.id, row.email]));
  }
}
