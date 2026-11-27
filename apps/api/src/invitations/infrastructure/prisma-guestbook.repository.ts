import type { PrismaClient } from "@prisma/client";

import type {
  GuestbookRepository,
  InvitationGuestbookReader,
} from "../application/guestbook.repository";
import {
  GUESTBOOK_OWNER_ENTRIES_MAX,
  GUESTBOOK_VISIBLE_ENTRIES_MAX,
  type GuestbookEntryRecord,
  type GuestbookEntryValues,
  publicGuestbookEntries,
  type PublicGuestbookEntry,
} from "../domain/invitation-guestbook";

/** The columns every guestbook read answers; `invitationId` stays internal to the API. */
const ENTRY_SELECT = {
  id: true,
  authorName: true,
  message: true,
  hidden: true,
  createdAt: true,
} as const;

/**
 * The guestbook port on PostgreSQL (F7; S2.7, L10.1, L10.4, L10.6). The guest's wall reads only visible entries, newest
 * first and bounded, so the projection never has to filter; the owner's read and write carry the owner id in their own
 * `WHERE`, so another customer's invitation is indistinguishable from a missing one (A4), and the owner's read is bounded
 * to the newest `GUESTBOOK_OWNER_ENTRIES_MAX`. The public insert is one statement: the `SELECT` that feeds it checks in
 * the same statement that the invitation is still PUBLISHED and has not expired at the database's own `now()`, so an
 * entry that races an unpublish or an expiry is refused by the database rather than by an earlier read, and a stale
 * instant captured before the request cannot let an expired invitation store one (S2).
 *
 * One adapter implements both the write/read port and the public read the invitation projection consumes, so the
 * guestbook table has exactly one reader in this module.
 */
export class PrismaGuestbookRepository implements GuestbookRepository, InvitationGuestbookReader {
  constructor(private readonly prisma: PrismaClient) {}

  async findVisible(invitationId: string): Promise<GuestbookEntryRecord[]> {
    return this.prisma.guestbookEntry.findMany({
      where: { invitationId, hidden: false },
      select: ENTRY_SELECT,
      // Newest first; the id breaks a tie between two entries signed in the same instant.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: GUESTBOOK_VISIBLE_ENTRIES_MAX,
    });
  }

  async readVisibleEntries(invitationId: string): Promise<PublicGuestbookEntry[]> {
    return publicGuestbookEntries(await this.findVisible(invitationId));
  }

  async findOwnedEntries(
    ownerId: string,
    invitationId: string,
  ): Promise<GuestbookEntryRecord[] | null> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ownerId },
      select: { id: true },
    });
    if (invitation === null) {
      return null;
    }

    return this.prisma.guestbookEntry.findMany({
      where: { invitationId },
      select: ENTRY_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: GUESTBOOK_OWNER_ENTRIES_MAX,
    });
  }

  async insert(invitationId: string, entry: GuestbookEntryValues): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "GuestbookEntry" ("id", "invitationId", "authorName", "message", "hidden", "createdAt")
      SELECT gen_random_uuid(), invitation."id", ${entry.authorName}, ${entry.message}, false, now()
      FROM "Invitation" AS invitation
      WHERE invitation."id" = ${invitationId}::uuid
        AND invitation."status" = 'PUBLISHED'
        -- The expiry is re-stated here with the database's own clock, so an invitation that expired before this
        -- statement refuses the entry even when the caller's instant is stale (S2).
        AND (invitation."expiresAt" IS NULL OR invitation."expiresAt" >= now())
      RETURNING "id"
    `;

    return rows.length === 1;
  }

  async setHidden(
    ownerId: string,
    invitationId: string,
    entryId: string,
    hidden: boolean,
  ): Promise<GuestbookEntryRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      // Ownership is stated in the write itself, so a concurrent owner change cannot slip a moderation through.
      const changed = await tx.guestbookEntry.updateMany({
        where: { id: entryId, invitationId, invitation: { ownerId } },
        data: { hidden },
      });
      if (changed.count !== 1) {
        return null;
      }

      return tx.guestbookEntry.findUniqueOrThrow({ where: { id: entryId }, select: ENTRY_SELECT });
    });
  }
}
