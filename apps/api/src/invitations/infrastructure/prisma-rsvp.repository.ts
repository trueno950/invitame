import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  RsvpReadModel,
  RsvpRepository,
  RsvpResponseRecord,
  RsvpResponseWrite,
} from "../application/rsvp.repository";
import { InvitationNotEditableError } from "../domain/invitation.errors";
import { assertEditable } from "../domain/invitation-lifecycle";
import type { RsvpSettings } from "../domain/invitation-rsvp";

const RESPONSE_SELECT = {
  id: true,
  invitationId: true,
  name: true,
  dedupeKey: true,
  attending: true,
  partySize: true,
  phone: true,
  message: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RsvpResponseSelect;

/**
 * The RSVP port on PostgreSQL (M6 G1; S1, S4). The creator's writes and reads carry the owner id in their own
 * `WHERE`, so another owner's invitation is indistinguishable from a missing one (A4), and the settings save
 * re-states the editable status inside the write, so a concurrent archive cannot slip a change through (A2, S7).
 * The public submission is one statement: it inserts the response, or updates the response of the same
 * `(invitationId, dedupeKey)` when it already exists, and the `SELECT` that feeds it checks in the same statement
 * that the invitation is still PUBLISHED, has not expired, and its deadline has not passed at the submission instant.
 * That makes a retry idempotent, a concurrent duplicate impossible, and a response that races an unpublish, an expiry,
 * or an elapsed deadline refused by the database rather than by an earlier read (S2, T4).
 */
export class PrismaRsvpRepository implements RsvpRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async saveSettings(
    ownerId: string,
    id: string,
    settings: RsvpSettings,
  ): Promise<RsvpSettings | null> {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.invitation.findFirst({
        where: { id, ownerId },
        select: { status: true },
      });
      if (stored === null) {
        return null;
      }
      // State the rule now so the caller gets the real reason, and again inside the write below.
      assertEditable(stored.status);

      const changed = await tx.invitation.updateMany({
        // A DRAFT or a PUBLISHED invitation changes; a published one changes live (S7).
        where: { id, ownerId, status: { in: ["DRAFT", "PUBLISHED"] } },
        data: { rsvpDeadline: settings.deadline, rsvpPartyLimit: settings.partyLimit },
      });
      if (changed.count !== 1) {
        // The row stopped being editable after the read: the only other status is ARCHIVED.
        throw new InvitationNotEditableError("ARCHIVED");
      }

      const updated = await tx.invitation.findUniqueOrThrow({
        where: { id },
        select: { rsvpDeadline: true, rsvpPartyLimit: true },
      });

      return { deadline: updated.rsvpDeadline, partyLimit: updated.rsvpPartyLimit };
    });
  }

  async findResponses(ownerId: string, id: string): Promise<RsvpReadModel | null> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id, ownerId },
      select: { slug: true, rsvpDeadline: true, rsvpPartyLimit: true },
    });
    if (invitation === null) {
      return null;
    }

    const responses = await this.prisma.rsvpResponse.findMany({
      where: { invitationId: id },
      select: RESPONSE_SELECT,
      // Newest first; the id breaks a tie between two responses stored in the same instant.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return {
      slug: invitation.slug,
      settings: { deadline: invitation.rsvpDeadline, partyLimit: invitation.rsvpPartyLimit },
      responses: responses satisfies RsvpResponseRecord[],
    };
  }

  async upsertResponse(
    invitationId: string,
    response: RsvpResponseWrite,
    at: Date,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "RsvpResponse"
        ("id", "invitationId", "dedupeKey", "name", "attending", "partySize", "phone", "message",
         "createdAt", "updatedAt")
      SELECT gen_random_uuid(), invitation."id", ${response.dedupeKey}, ${response.name},
             ${response.attending}, ${response.partySize}, ${response.phone}, ${response.message},
             ${at}, ${at}
      FROM "Invitation" AS invitation
      WHERE invitation."id" = ${invitationId}::uuid
        AND invitation."status" = 'PUBLISHED'
        -- The expiry is re-stated here with the deadline, so an invitation that expired between the read and the write
        -- refuses the response in the database too (S2, T4).
        AND (invitation."expiresAt" IS NULL OR invitation."expiresAt" >= ${at})
        AND (invitation."rsvpDeadline" IS NULL OR invitation."rsvpDeadline" >= ${at})
      ON CONFLICT ("invitationId", "dedupeKey") DO UPDATE
      SET "name" = EXCLUDED."name",
          "attending" = EXCLUDED."attending",
          "partySize" = EXCLUDED."partySize",
          "phone" = EXCLUDED."phone",
          "message" = EXCLUDED."message",
          "updatedAt" = EXCLUDED."updatedAt"
      RETURNING "id"
    `;

    return rows.length === 1;
  }
}
