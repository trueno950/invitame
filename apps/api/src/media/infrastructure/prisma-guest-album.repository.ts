import type { PrismaClient } from "@prisma/client";

import type { InvitationStatus } from "../../invitations/domain/invitation-lifecycle";
import {
  GUEST_PHOTO_MAX_STORED,
  GUEST_PHOTO_OWNER_MAX,
  GUEST_PHOTO_PUBLIC_MAX,
  type GuestPhotoRecord,
  type GuestPhotoReviewState,
  type GuestPhotoStatus,
} from "../domain/guest-photo";
import type {
  GuestAlbumInvitation,
  GuestAlbumRepository,
  InsertGuestPhotoResult,
  NewGuestPhoto,
  RetiredGuestPhoto,
  ServingGuestPhoto,
} from "../application/guest-album.repository";

// The album port on PostgreSQL (F8; S2.8, L11.1, L11.3, L11.4, L11.6). Owner-scoped reads and writes carry the owner in
// their own statement, so another customer's id is indistinguishable from a missing one (A4). The per-invitation cap is
// enforced inside the transaction that writes the row, serialized on the invitation row (`SELECT ... FOR UPDATE`), so
// two simultaneous uploads cannot both take the last slot; the same transaction re-states that the invitation is still
// PUBLISHED and unexpired at the database's own `now()`, so a photo that races an unpublish or an expiry is refused by
// the database rather than by an earlier read.
//
// The public read answers PUBLISHED photos only, newest first and bounded; a PENDING or HIDDEN photo is never in its
// projection, so the guest page cannot show one even by accident. No adapter ever answers a storage key to a caller.

/** The columns every photo read answers; `storageKey` stays internal to the API and the cleanup. */
const PHOTO_SELECT = {
  id: true,
  invitationId: true,
  storageKey: true,
  status: true,
  uploaderName: true,
  createdAt: true,
  reviewedAt: true,
} as const;

/** One row as Prisma answers it, with the stored labels instead of the enum names it generates. */
type PhotoRow = {
  id: string;
  invitationId: string;
  storageKey: string;
  status: string;
  uploaderName: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
};

function toRecord(row: PhotoRow): GuestPhotoRecord {
  return {
    id: row.id,
    invitationId: row.invitationId,
    storageKey: row.storageKey,
    status: row.status as GuestPhotoStatus,
    uploaderName: row.uploaderName,
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
  };
}

export class PrismaGuestAlbumRepository implements GuestAlbumRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPublishedBySlug(slug: string): Promise<GuestAlbumInvitation | null> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: { id: true, status: true, packageId: true, expiresAt: true },
    });

    return invitation === null
      ? null
      : {
          id: invitation.id,
          status: invitation.status as InvitationStatus,
          packageId: invitation.packageId,
          expiresAt: invitation.expiresAt,
        };
  }

  async findOwnedInvitation(
    ownerId: string,
    invitationId: string,
  ): Promise<GuestAlbumInvitation | null> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ownerId },
      select: { id: true, status: true, packageId: true, expiresAt: true },
    });

    return invitation === null
      ? null
      : {
          id: invitation.id,
          status: invitation.status as InvitationStatus,
          packageId: invitation.packageId,
          expiresAt: invitation.expiresAt,
        };
  }

  async insert(
    invitationId: string,
    photo: NewGuestPhoto,
    at: Date,
  ): Promise<InsertGuestPhotoResult> {
    // The object was written before this call, so a refused row leaves it to the caller's best-effort delete (or to the
    // cleanup scan). One photo id per upload means a replay writes one row: the unique storage key refuses a second one.
    return this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.$queryRaw<
        Array<{ status: InvitationStatus; expired: boolean }>
      >`
        SELECT "status",
               ("expiresAt" IS NOT NULL AND "expiresAt" < now()) AS "expired"
        FROM "Invitation"
        WHERE "id" = ${invitationId}::uuid
        FOR UPDATE
      `;
      const current = invitation[0];
      if (current === undefined) {
        return "invitation-not-found";
      }
      // Archiving, unpublishing, and expiry all close the album: the page is already read-only for them (S2).
      if (current.status !== "PUBLISHED" || current.expired) {
        return "closed";
      }

      const counts = await transaction.$queryRaw<Array<{ stored: bigint }>>`
        SELECT count(*) AS "stored" FROM "GuestPhoto" WHERE "invitationId" = ${invitationId}::uuid
      `;
      if (Number(counts[0]?.stored ?? 0) >= GUEST_PHOTO_MAX_STORED) {
        return "full";
      }

      await transaction.$executeRaw`
        INSERT INTO "GuestPhoto"
          ("id", "invitationId", "storageKey", "status", "uploaderName", "createdAt", "reviewedAt")
        VALUES (
          ${photo.id}::uuid, ${invitationId}::uuid, ${photo.storageKey}, 'PENDING',
          ${photo.uploaderName}, ${at}, NULL
        )
      `;

      return "stored";
    });
  }

  async readPublished(
    invitationId: string,
  ): Promise<{ photos: GuestPhotoRecord[]; count: number }> {
    const [photos, count] = await Promise.all([
      this.prisma.guestPhoto.findMany({
        where: { invitationId, status: "PUBLISHED" },
        select: PHOTO_SELECT,
        // Newest first; the id breaks a tie between two photos uploaded in the same instant.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: GUEST_PHOTO_PUBLIC_MAX,
      }),
      this.prisma.guestPhoto.count({ where: { invitationId, status: "PUBLISHED" } }),
    ]);

    return { photos: photos.map(toRecord), count };
  }

  async findOwnedPhotos(ownerId: string, invitationId: string): Promise<GuestPhotoRecord[] | null> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ownerId },
      select: { id: true },
    });
    if (invitation === null) {
      return null;
    }

    const photos = await this.prisma.guestPhoto.findMany({
      where: { invitationId },
      select: PHOTO_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: GUEST_PHOTO_OWNER_MAX,
    });

    return photos.map(toRecord);
  }

  async review(
    ownerId: string,
    invitationId: string,
    photoId: string,
    status: GuestPhotoReviewState,
    at: Date,
  ): Promise<GuestPhotoRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      // Ownership is stated in the write itself, so a concurrent owner change cannot slip a moderation through.
      const changed = await transaction.guestPhoto.updateMany({
        where: { id: photoId, invitationId, invitation: { ownerId } },
        data: { status, reviewedAt: at },
      });
      if (changed.count !== 1) {
        return null;
      }

      const stored = await transaction.guestPhoto.findUniqueOrThrow({
        where: { id: photoId },
        select: PHOTO_SELECT,
      });

      return toRecord(stored);
    });
  }

  async findForServing(photoId: string): Promise<ServingGuestPhoto | null> {
    const stored = await this.prisma.guestPhoto.findUnique({
      where: { id: photoId },
      select: {
        ...PHOTO_SELECT,
        invitation: { select: { ownerId: true, status: true } },
      },
    });
    if (stored === null) {
      return null;
    }

    return {
      photo: toRecord(stored),
      invitation: {
        ownerId: stored.invitation.ownerId,
        status: stored.invitation.status as InvitationStatus,
      },
    };
  }

  async listStorageKeys(): Promise<string[]> {
    const rows = await this.prisma.guestPhoto.findMany({ select: { storageKey: true } });

    return rows.map((row) => row.storageKey);
  }

  async listRetired(before: Date): Promise<RetiredGuestPhoto[]> {
    const rows = await this.prisma.guestPhoto.findMany({
      where: {
        OR: [
          // Never published: the clock starts when the guest uploaded it.
          { status: "PENDING", createdAt: { lt: before } },
          // Taken down: the clock starts when the owner hid it.
          { status: "HIDDEN", reviewedAt: { lt: before } },
        ],
      },
      select: { id: true, storageKey: true },
      orderBy: { createdAt: "asc" },
    });

    return rows;
  }

  async remove(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.prisma.guestPhoto.deleteMany({ where: { id: { in: [...ids] } } });
  }
}
