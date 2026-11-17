import { Prisma, type PrismaClient } from "@prisma/client";

import { InvitationNotEditableError } from "../../invitations/domain/invitation.errors";
import type { InvitationStatus } from "../../invitations/domain/invitation-lifecycle";
import { MediaLimitExceededError } from "../application/media.errors";
import type {
  InsertedMedia,
  MediaAssetRecord,
  MediaRepository,
  NewMediaAsset,
  OwnedMediaInvitation,
  ServingMedia,
} from "../application/media.repository";
import { MAX_GALLERY_PHOTOS, MAX_STORED_ASSETS } from "../domain/media-asset";

// The media port on PostgreSQL (M8 S4). Owner-scoped reads and writes carry the owner in their own statement, so
// another customer's id is indistinguishable from a missing one (A4) and a concurrent archive can never slip a
// write through (A2). The two limits of S4 are enforced inside the transaction that writes the row, serialized on
// the invitation row (`SELECT ... FOR UPDATE`), so two simultaneous uploads cannot both take the last slot.
//
// The gallery position is assigned by the adapter, never by a caller: an upload appends, and a reorder rewrites the
// gallery's positions 0..n-1 in one transaction. Every row is read back in the same shape, so a caller never sees a
// Prisma enum name.

/** One row as the guarded statements return it: the stored labels, not the Prisma enum names. */
interface MediaRow {
  id: string;
  invitationId: string;
  kind: "main-photo" | "gallery";
  storageKey: string;
  mime: string;
  byteSize: number;
  width: number;
  height: number;
  position: number | null;
  alt: string | null;
  status: "stored" | "deleted";
  createdAt: Date;
  updatedAt: Date;
}

const MEDIA_COLUMNS = Prisma.sql`
  "id", "invitationId", "kind", "storageKey", "mime", "byteSize", "width", "height", "position",
  "alt", "status", "createdAt", "updatedAt"
`;

/**
 * The same columns qualified with the asset alias. An `UPDATE ... FROM "Invitation"` has two tables in scope, so
 * unqualified `id`, `status`, `createdAt`, or `updatedAt` would be ambiguous.
 */
const MEDIA_COLUMNS_QUALIFIED = Prisma.sql`
  asset."id", asset."invitationId", asset."kind", asset."storageKey", asset."mime", asset."byteSize",
  asset."width", asset."height", asset."position", asset."alt", asset."status", asset."createdAt",
  asset."updatedAt"
`;

export class PrismaMediaRepository implements MediaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findOwnedInvitation(
    ownerId: string,
    invitationId: string,
  ): Promise<OwnedMediaInvitation | null> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ownerId },
      select: { id: true, status: true, packageId: true },
    });

    return invitation === null
      ? null
      : {
          id: invitation.id,
          status: invitation.status as InvitationStatus,
          packageId: invitation.packageId,
        };
  }

  async listStored(ownerId: string, invitationId: string): Promise<MediaAssetRecord[] | null> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ownerId },
      select: { id: true },
    });
    if (invitation === null) {
      return null;
    }

    return this.prisma.$queryRaw<MediaRow[]>`
      SELECT ${MEDIA_COLUMNS}
      FROM "MediaAsset"
      WHERE "invitationId" = ${invitationId}::uuid AND "status" = 'stored'
      ORDER BY CASE WHEN "kind" = 'main-photo' THEN 0 ELSE 1 END, "position", "createdAt", "id"
    `;
  }

  async insert(
    ownerId: string,
    invitationId: string,
    asset: NewMediaAsset,
    at: Date,
  ): Promise<InsertedMedia | null> {
    return this.prisma.$transaction(async (transaction) => {
      // One row lock per invitation serializes concurrent uploads, so the counts below cannot both see the last
      // free slot (S4: at most 12 gallery photos and 40 stored assets).
      const invitation = await transaction.$queryRaw<Array<{ status: InvitationStatus }>>`
        SELECT "status" FROM "Invitation"
        WHERE "id" = ${invitationId}::uuid AND "ownerId" = ${ownerId}::uuid
        FOR UPDATE
      `;
      const status = invitation[0]?.status;
      if (status === undefined) {
        return null;
      }
      if (status === "ARCHIVED") {
        throw new InvitationNotEditableError("ARCHIVED");
      }

      const counts = await transaction.$queryRaw<Array<{ gallery: bigint; stored: bigint }>>`
        SELECT count(*) FILTER (WHERE "kind" = 'gallery') AS "gallery",
               count(*) AS "stored"
        FROM "MediaAsset"
        WHERE "invitationId" = ${invitationId}::uuid AND "status" = 'stored'
      `;
      const counting = counts[0];
      if (counting === undefined) {
        return null;
      }
      // The outer bound first: an invitation holds at most 40 stored assets, and a gallery at most 12 photos.
      if (Number(counting.stored) >= MAX_STORED_ASSETS) {
        throw new MediaLimitExceededError("assets");
      }
      if (asset.kind === "gallery" && Number(counting.gallery) >= MAX_GALLERY_PHOTOS) {
        throw new MediaLimitExceededError("gallery");
      }

      let replaced: MediaAssetRecord | null = null;
      let position: number | null = null;

      if (asset.kind === "main-photo") {
        // Replacing marks the previous main photo deleted first, so the partial unique index keeps one current one.
        const previous = await transaction.$queryRaw<MediaRow[]>`
          UPDATE "MediaAsset"
          SET "status" = 'deleted', "updatedAt" = ${at}
          WHERE "invitationId" = ${invitationId}::uuid
            AND "kind" = 'main-photo' AND "status" = 'stored'
          RETURNING ${MEDIA_COLUMNS}
        `;
        replaced = previous[0] ?? null;
      } else {
        const next = await transaction.$queryRaw<Array<{ position: number }>>`
          SELECT COALESCE(MAX("position") + 1, 0) AS "position"
          FROM "MediaAsset"
          WHERE "invitationId" = ${invitationId}::uuid
            AND "kind" = 'gallery' AND "status" = 'stored'
        `;
        position = next[0]?.position ?? 0;
      }

      const rows = await transaction.$queryRaw<MediaRow[]>`
        INSERT INTO "MediaAsset" (
          "id", "invitationId", "kind", "storageKey", "mime", "byteSize", "width", "height",
          "position", "alt", "status", "createdAt", "updatedAt"
        )
        VALUES (
          ${asset.id}::uuid, ${invitationId}::uuid, ${asset.kind}::"MediaAssetKind", ${asset.storageKey},
          ${asset.mime}, ${asset.byteSize}, ${asset.width}, ${asset.height}, ${position}, ${asset.alt},
          'stored', ${at}, ${at}
        )
        RETURNING ${MEDIA_COLUMNS}
      `;
      const inserted = rows[0];
      if (inserted === undefined) {
        return null;
      }

      return { asset: inserted, replaced } satisfies InsertedMedia;
    });
  }

  async updateAlt(
    ownerId: string,
    invitationId: string,
    assetId: string,
    alt: string | null,
    at: Date,
  ): Promise<MediaAssetRecord | null> {
    const rows = await this.prisma.$queryRaw<MediaRow[]>`
      UPDATE "MediaAsset" AS asset
      SET "alt" = ${alt}, "updatedAt" = ${at}
      FROM "Invitation" AS invitation
      WHERE asset."id" = ${assetId}::uuid
        AND asset."invitationId" = invitation."id"
        AND invitation."id" = ${invitationId}::uuid
        AND invitation."ownerId" = ${ownerId}::uuid
        AND invitation."status" IN ('DRAFT', 'PUBLISHED')
        AND asset."status" = 'stored'
      RETURNING ${MEDIA_COLUMNS_QUALIFIED}
    `;

    if (rows[0] !== undefined) {
      return rows[0];
    }

    return this.refuseMissedWrite(ownerId, invitationId);
  }

  async moveGallery(
    ownerId: string,
    invitationId: string,
    assetId: string,
    index: number,
    at: Date,
  ): Promise<MediaAssetRecord[] | null> {
    return this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.$queryRaw<Array<{ status: InvitationStatus }>>`
        SELECT "status" FROM "Invitation"
        WHERE "id" = ${invitationId}::uuid AND "ownerId" = ${ownerId}::uuid
        FOR UPDATE
      `;
      const status = invitation[0]?.status;
      if (status === undefined) {
        return null;
      }
      if (status === "ARCHIVED") {
        throw new InvitationNotEditableError("ARCHIVED");
      }

      const gallery = await transaction.$queryRaw<MediaRow[]>`
        SELECT ${MEDIA_COLUMNS}
        FROM "MediaAsset"
        WHERE "invitationId" = ${invitationId}::uuid
          AND "kind" = 'gallery' AND "status" = 'stored'
        ORDER BY "position", "createdAt", "id"
        FOR UPDATE
      `;
      const from = gallery.findIndex((row) => row.id === assetId);
      if (from === -1) {
        return null;
      }

      const target = Math.min(index, gallery.length - 1);
      const [moved] = gallery.splice(from, 1);
      if (moved === undefined) {
        return null;
      }
      gallery.splice(target, 0, moved);

      for (const [position, row] of gallery.entries()) {
        if (row.position === position) {
          continue;
        }
        await transaction.$executeRaw`
          UPDATE "MediaAsset" SET "position" = ${position}, "updatedAt" = ${at}
          WHERE "id" = ${row.id}::uuid
        `;
      }

      return transaction.$queryRaw<MediaRow[]>`
        SELECT ${MEDIA_COLUMNS}
        FROM "MediaAsset"
        WHERE "invitationId" = ${invitationId}::uuid
          AND "kind" = 'gallery' AND "status" = 'stored'
        ORDER BY "position", "createdAt", "id"
      `;
    });
  }

  async markDeleted(
    ownerId: string,
    invitationId: string,
    assetId: string,
    at: Date,
  ): Promise<MediaAssetRecord | null> {
    const rows = await this.prisma.$queryRaw<MediaRow[]>`
      UPDATE "MediaAsset" AS asset
      SET "status" = 'deleted', "updatedAt" = ${at}
      FROM "Invitation" AS invitation
      WHERE asset."id" = ${assetId}::uuid
        AND asset."invitationId" = invitation."id"
        AND invitation."id" = ${invitationId}::uuid
        AND invitation."ownerId" = ${ownerId}::uuid
        AND invitation."status" IN ('DRAFT', 'PUBLISHED')
        AND asset."status" = 'stored'
      RETURNING ${MEDIA_COLUMNS_QUALIFIED}
    `;

    if (rows[0] !== undefined) {
      return rows[0];
    }

    return this.refuseMissedWrite(ownerId, invitationId);
  }

  async findForServing(assetId: string): Promise<ServingMedia | null> {
    const rows = await this.prisma.$queryRaw<
      Array<MediaRow & { ownerId: string; invitationStatus: InvitationStatus }>
    >`
      SELECT asset."id", asset."invitationId", asset."kind", asset."storageKey", asset."mime",
             asset."byteSize", asset."width", asset."height", asset."position", asset."alt",
             asset."status", asset."createdAt", asset."updatedAt",
             invitation."ownerId", invitation."status" AS "invitationStatus"
      FROM "MediaAsset" AS asset
      JOIN "Invitation" AS invitation ON invitation."id" = asset."invitationId"
      WHERE asset."id" = ${assetId}::uuid
    `;
    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    const { ownerId, invitationStatus, ...asset } = row;

    return { asset, invitation: { ownerId, status: invitationStatus } };
  }

  async listPublicGallery(invitationId: string): Promise<MediaAssetRecord[]> {
    return this.prisma.$queryRaw<MediaRow[]>`
      SELECT ${MEDIA_COLUMNS}
      FROM "MediaAsset"
      WHERE "invitationId" = ${invitationId}::uuid
        AND "kind" = 'gallery' AND "status" = 'stored'
      ORDER BY "position", "createdAt", "id"
    `;
  }

  async listDeleted(): Promise<MediaAssetRecord[]> {
    return this.prisma.$queryRaw<MediaRow[]>`
      SELECT ${MEDIA_COLUMNS}
      FROM "MediaAsset"
      WHERE "status" = 'deleted'
      ORDER BY "createdAt", "id"
    `;
  }

  async listStorageKeys(): Promise<string[]> {
    const rows = await this.prisma.mediaAsset.findMany({ select: { storageKey: true } });

    return rows.map((row) => row.storageKey);
  }

  async remove(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.prisma.mediaAsset.deleteMany({ where: { id: { in: [...ids] } } });
  }

  /**
   * What a guarded write answers when it matched nothing: null when no row has this id or another owner has it
   * (A4), and `InvitationNotEditableError` when the invitation is this owner's and archived (A2).
   */
  private async refuseMissedWrite(ownerId: string, invitationId: string): Promise<null> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ownerId },
      select: { status: true },
    });
    if (invitation?.status === "ARCHIVED") {
      throw new InvitationNotEditableError("ARCHIVED");
    }

    return null;
  }
}
