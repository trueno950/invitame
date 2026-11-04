import type { PrismaClient } from "@prisma/client";

import type { DisabledUser, UserAccessRepository } from "../application/user-access.repository";

export class PrismaUserAccessRepository implements UserAccessRepository {
  constructor(private readonly prisma: PrismaClient) {}

  disableAndRevokeSessions(email: string): Promise<DisabledUser | null> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) {
        return null;
      }

      // Conditional update: the count tells whether this call changed the status.
      const { count: changed } = await transaction.user.updateMany({
        where: { id: user.id, status: "ACTIVE" },
        data: { status: "DISABLED" },
      });
      const { count: revokedSessions } = await transaction.session.deleteMany({
        where: { userId: user.id },
      });

      return { userId: user.id, alreadyDisabled: changed === 0, revokedSessions };
    });
  }
}
