import type { PrismaClient } from "@prisma/client";

import type { JsonObject } from "../domain/invitation-content";
import type { InvitationLockReader, StoredInvitationLock } from "../application/invitation-lock";

/** The columns the lock read needs and nothing else: no owner, no package, no guest, no answer. */
const LOCK_SELECT = {
  id: true,
  slug: true,
  passwordHash: true,
  passwordVersion: true,
  content: true,
} as const;

/** The shape of a JSON object as PostgreSQL returns it; arrays, null, and primitives are not objects. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The lock of one stored row, carrying the current address a previous one redirects to (null for a current address). */
function toLock(
  row: {
    id: string;
    slug: string;
    passwordHash: string | null;
    passwordVersion: number;
    content: unknown;
  },
  redirectTo: string | null,
): StoredInvitationLock {
  return {
    invitationId: row.id,
    passwordHash: row.passwordHash,
    passwordVersion: row.passwordVersion,
    // The column is NOT NULL and carries the `Invitation_content_object` check, so this fallback is unreachable; it keeps
    // the reader's "content is an object" contract true without a cast.
    content: isJsonObject(row.content) ? row.content : {},
    redirectTo,
  };
}

/**
 * The statements that read the lock of a public address (F13; S2.13, L18.2, L18.3).
 *
 * The address is resolved exactly as the public read resolves it (F11; L15.3), so the gate and the page can never
 * disagree about which invitation an address names: the current slug first, in one query on its unique index, and only a
 * slug no invitation currently holds is read from `InvitationSlugAlias` and then through its invitation. A previous
 * address answers the same lock and carries its invitation's current slug, which the web redirects to before the lock
 * screen so its access cookie lives at the address the invitation is served from.
 *
 * What the gate and the unlock route need is the four values below and nothing else. The row must be PUBLISHED, so a
 * draft or an archived invitation that once held the address stays as invisible as the public read makes it. An expired
 * invitation is still answered, because it stays visible read-only (S2).
 *
 * This is the only statement of the API that reads `Invitation.passwordHash`, and its answer never leaves the
 * application layer: the guard reduces it to a decision and the unlock route verifies against it.
 */
export class PrismaInvitationLockRepository implements InvitationLockReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findLockBySlug(slug: string): Promise<StoredInvitationLock | null> {
    const current = await this.prisma.invitation.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: LOCK_SELECT,
    });

    if (current !== null) {
      return toLock(current, null);
    }
    const alias = await this.prisma.invitationSlugAlias.findUnique({
      where: { slug },
      select: { invitationId: true },
    });

    if (alias === null) {
      return null;
    }
    const renamed = await this.prisma.invitation.findFirst({
      where: { id: alias.invitationId, status: "PUBLISHED" },
      select: LOCK_SELECT,
    });

    return renamed === null ? null : toLock(renamed, renamed.slug);
  }
}
