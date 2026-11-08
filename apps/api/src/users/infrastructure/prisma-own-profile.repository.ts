import { Prisma, type PrismaClient } from "@prisma/client";

import type { OwnProfile, OwnProfileRepository } from "../application/own-profile.repository";

const PROFILE_FIELDS = { id: true, email: true, displayName: true, role: true } as const;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof PROFILE_FIELDS }>;

/** The empty name that the code sign-in stores for a new user means "no name". */
function toProfile(row: ProfileRow): OwnProfile {
  return { id: row.id, email: row.email, displayName: row.displayName || null, role: row.role };
}

export class PrismaOwnProfileRepository implements OwnProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(userId: string): Promise<OwnProfile | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_FIELDS,
    });
    return row ? toProfile(row) : null;
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<OwnProfile | null> {
    try {
      const row = await this.prisma.user.update({
        // One statement: the write needs the account to be ACTIVE at that instant (S53, L72), so a
        // `user:disable` that commits after the guard's read cannot be followed by a stored name.
        where: { id: userId, status: "ACTIVE" },
        data: { displayName },
        select: PROFILE_FIELDS,
      });
      return toProfile(row);
    } catch (error) {
      // P2025: no row matched, for example a user deleted or disabled after the guard read the session.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }
      throw error;
    }
  }
}
