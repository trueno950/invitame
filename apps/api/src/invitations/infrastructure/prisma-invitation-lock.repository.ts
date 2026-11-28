import type { PrismaClient } from "@prisma/client";

import type { JsonObject } from "../domain/invitation-content";
import type { StoredInvitationLock, InvitationLockReader } from "../application/invitation-lock";

/** The shape of a JSON object as PostgreSQL returns it; arrays, null, and primitives are not objects. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The one statement that reads the lock of a public address (F13; S2.13, L18.2, L18.3).
 *
 * It reads the four values the gate and the unlock route need — the invitation id, the stored access-code hash and its
 * version, and the content the lock screen names the celebration from — and nothing else: no owner, no package, no
 * price, no guest, no answer. The address may be the current slug or any previous one (F11; L15.2), and the row must be
 * PUBLISHED, so a draft or an archived invitation that once held the address stays as invisible as the public read makes
 * it. An expired invitation is still answered, because it stays visible read-only (S2).
 *
 * One query and one index probe: the unique slug index for the current address, and `InvitationSlugAlias` for a previous
 * one. This is the only statement of the API that reads `Invitation.passwordHash`, and its answer never leaves the
 * application layer: the guard reduces it to a decision and the unlock route verifies against it.
 */
export class PrismaInvitationLockRepository implements InvitationLockReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findLockBySlug(slug: string): Promise<StoredInvitationLock | null> {
    const row = await this.prisma.invitation.findFirst({
      where: {
        status: "PUBLISHED",
        OR: [{ slug }, { slugAliases: { some: { slug } } }],
      },
      select: {
        id: true,
        passwordHash: true,
        passwordVersion: true,
        content: true,
      },
    });

    if (row === null) {
      return null;
    }

    return {
      invitationId: row.id,
      passwordHash: row.passwordHash,
      passwordVersion: row.passwordVersion,
      // The column is NOT NULL and carries the `Invitation_content_object` check, so this fallback is unreachable; it
      // keeps the reader's "content is an object" contract true without a cast.
      content: isJsonObject(row.content) ? row.content : {},
    };
  }
}
