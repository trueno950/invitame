import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  InvitationMediaCountReader,
  InvitationMediaCounts,
} from "../../invitations/application/invitation-media-counts";

// The administrator's media facet of the invitation status view (M9 T2; S1), on PostgreSQL. The invitations module
// declares the port and this adapter implements it, so the status view reads counts and nothing else: no storage key,
// no URL, no alt text, and no binary.
//
// One grouped read answers a whole page, never one query per row. Only `stored` rows count, matching what the gallery
// read serves: a replaced main photo or a deleted gallery photo is not a photo the invitation has.

/** One row of the grouped count. PostgreSQL counts are `bigint`, so they arrive as such. */
interface MediaCountSqlRow {
  invitationId: string;
  mainPhotoCount: bigint;
  galleryCount: bigint;
}

export class PrismaInvitationMediaCountReader implements InvitationMediaCountReader {
  constructor(private readonly prisma: PrismaClient) {}

  async countsFor(invitationIds: readonly string[]): Promise<Map<string, InvitationMediaCounts>> {
    if (invitationIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<MediaCountSqlRow[]>(Prisma.sql`
      SELECT "invitationId",
             count(*) FILTER (WHERE "kind" = 'main-photo') AS "mainPhotoCount",
             count(*) FILTER (WHERE "kind" = 'gallery') AS "galleryCount"
      FROM "MediaAsset"
      WHERE "invitationId" IN (${Prisma.join(
        invitationIds.map((invitationId) => Prisma.sql`${invitationId}::uuid`),
      )})
        AND "status" = 'stored'
      GROUP BY "invitationId"
    `);

    return new Map(
      rows.map((row) => [
        row.invitationId,
        {
          mainPhoto: Number(row.mainPhotoCount) > 0,
          galleryCount: Number(row.galleryCount),
        },
      ]),
    );
  }
}
