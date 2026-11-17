import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  GuestCheckIn,
  GuestFields,
  GuestListReadModel,
  GuestRecord,
  GuestRepository,
  GuestResponseWrite,
  GuestWithResponse,
  NewGuest,
} from "../application/guest.repository";
import { GuestSeatsBelowConfirmedPartyError } from "../application/invitation-guest.errors";
import { assertEditable } from "../domain/invitation-lifecycle";

const GUEST_SELECT = {
  id: true,
  invitationId: true,
  name: true,
  seats: true,
  phone: true,
  note: true,
  tokenIssuedAt: true,
  checkedInAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.GuestSelect;

const RESPONSE_SELECT = {
  attending: true,
  partySize: true,
  message: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RsvpResponseSelect;

/** One row of the guarded writes below: the guest columns every statement returns. */
interface GuestRow {
  id: string;
  invitationId: string;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  tokenIssuedAt: Date;
  checkedInAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One row of the check-in statement: the guest, the confirmed party, and the first check-in instant. */
interface CheckInRow {
  id: string;
  name: string;
  seats: number;
  partySize: number;
  checkedInAt: Date;
}

/**
 * The guest-list port on PostgreSQL (M6 G2; S1, S3, S4). Every creator operation is one statement whose `WHERE`
 * joins the invitation and names the owner and the editable statuses, so another owner's invitation is
 * indistinguishable from a missing one (A4) and a concurrent archive can never slip a write through (A2). The plain
 * token never reaches this adapter: the application hashes it, and every lookup is one probe of the unique index
 * `Guest_tokenHash_key`, so no secret is compared in code and a leaked table cannot be replayed as a link.
 *
 * The guest's own write and the owner's check-in are also one statement each: the answer's `SELECT` repeats the
 * publication status and the deadline, so a retry is idempotent and a race is refused by the database; the check-in
 * requires the owner, the token, and an attending answer, and keeps the first `checkedInAt`.
 */
export class PrismaGuestRepository implements GuestRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    ownerId: string,
    invitationId: string,
    guest: NewGuest,
    at: Date,
  ): Promise<GuestRecord | null> {
    const rows = await this.prisma.$queryRaw<GuestRow[]>`
      INSERT INTO "Guest"
        ("id", "invitationId", "name", "seats", "phone", "note", "tokenHash", "tokenIssuedAt",
         "createdAt", "updatedAt")
      SELECT gen_random_uuid(), invitation."id", ${guest.name}, ${guest.seats}, ${guest.phone},
             ${guest.note}, ${guest.tokenHash}, ${at}, ${at}, ${at}
      FROM "Invitation" AS invitation
      WHERE invitation."id" = ${invitationId}::uuid
        AND invitation."ownerId" = ${ownerId}::uuid
        AND invitation."status" IN ('DRAFT', 'PUBLISHED')
      RETURNING "id", "invitationId", "name", "seats", "phone", "note", "tokenIssuedAt",
                "checkedInAt", "createdAt", "updatedAt"
    `;

    if (rows.length === 1) {
      return rows[0] as GuestRecord;
    }
    // Nothing was written: the invitation is another owner's, missing, or archived. State the real reason.
    return this.refuseMissedWrite(ownerId, invitationId);
  }

  async findGuests(ownerId: string, invitationId: string): Promise<GuestListReadModel | null> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ownerId },
      select: { slug: true },
    });
    if (invitation === null) {
      return null;
    }

    const rows = await this.prisma.guest.findMany({
      where: { invitationId },
      select: { ...GUEST_SELECT, rsvpResponse: { select: RESPONSE_SELECT } },
      // Newest first; the id breaks a tie between two guests stored in the same instant.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return {
      slug: invitation.slug,
      guests: rows.map(({ rsvpResponse, ...guest }) => ({ ...guest, response: rsvpResponse })),
    };
  }

  async findGuest(
    ownerId: string,
    invitationId: string,
    guestId: string,
  ): Promise<GuestWithResponse | null> {
    const row = await this.prisma.guest.findFirst({
      where: { id: guestId, invitationId, invitation: { ownerId } },
      select: { ...GUEST_SELECT, rsvpResponse: { select: RESPONSE_SELECT } },
    });
    if (row === null) {
      return null;
    }
    const { rsvpResponse, ...guest } = row;
    return { ...guest, response: rsvpResponse };
  }

  async update(
    ownerId: string,
    invitationId: string,
    guestId: string,
    guest: GuestFields,
    at: Date,
  ): Promise<GuestRecord | null> {
    const rows = await this.prisma.$queryRaw<GuestRow[]>`
      UPDATE "Guest" AS target
      SET "name" = ${guest.name},
          "seats" = ${guest.seats},
          "phone" = ${guest.phone},
          "note" = ${guest.note},
          "updatedAt" = ${at}
      FROM "Invitation" AS invitation
      WHERE target."id" = ${guestId}::uuid
        AND target."invitationId" = invitation."id"
        AND invitation."id" = ${invitationId}::uuid
        AND invitation."ownerId" = ${ownerId}::uuid
        AND invitation."status" IN ('DRAFT', 'PUBLISHED')
        AND NOT EXISTS (
          SELECT 1 FROM "RsvpResponse" AS response
          WHERE response."guestId" = target."id"
            AND response."attending"
            AND response."partySize" > ${guest.seats}
        )
      RETURNING target."id", target."invitationId", target."name", target."seats", target."phone",
                target."note", target."tokenIssuedAt", target."checkedInAt", target."createdAt",
                target."updatedAt"
    `;

    if (rows.length === 1) {
      return rows[0] as GuestRecord;
    }

    const missed = await this.refuseMissedWrite(ownerId, invitationId);
    if (missed !== null) {
      // The invitation exists and is editable: the guest answered for more people than the new seats allow.
      const answer = await this.prisma.rsvpResponse.findFirst({
        where: { guestId, attending: true },
        select: { partySize: true },
      });
      if (answer !== null && answer.partySize > guest.seats) {
        throw new GuestSeatsBelowConfirmedPartyError(answer.partySize);
      }
    }
    return null;
  }

  async remove(ownerId: string, invitationId: string, guestId: string): Promise<boolean> {
    // One statement: the answer goes with the guest, so no response outlives the person it answers for.
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      WITH target AS (
        SELECT guest."id"
        FROM "Guest" AS guest
        JOIN "Invitation" AS invitation ON invitation."id" = guest."invitationId"
        WHERE guest."id" = ${guestId}::uuid
          AND invitation."id" = ${invitationId}::uuid
          AND invitation."ownerId" = ${ownerId}::uuid
          AND invitation."status" IN ('DRAFT', 'PUBLISHED')
      ), cleared AS (
        DELETE FROM "RsvpResponse"
        WHERE "guestId" IN (SELECT "id" FROM target)
      )
      DELETE FROM "Guest"
      WHERE "id" IN (SELECT "id" FROM target)
      RETURNING "id"
    `;

    if (rows.length === 1) {
      return true;
    }
    await this.refuseMissedWrite(ownerId, invitationId);
    return false;
  }

  async rotateToken(
    ownerId: string,
    invitationId: string,
    guestId: string,
    tokenHash: string,
    at: Date,
  ): Promise<GuestRecord | null> {
    const rows = await this.prisma.$queryRaw<GuestRow[]>`
      UPDATE "Guest" AS target
      SET "tokenHash" = ${tokenHash},
          "tokenIssuedAt" = ${at},
          "updatedAt" = ${at}
      FROM "Invitation" AS invitation
      WHERE target."id" = ${guestId}::uuid
        AND target."invitationId" = invitation."id"
        AND invitation."id" = ${invitationId}::uuid
        AND invitation."ownerId" = ${ownerId}::uuid
        AND invitation."status" IN ('DRAFT', 'PUBLISHED')
      RETURNING target."id", target."invitationId", target."name", target."seats", target."phone",
                target."note", target."tokenIssuedAt", target."checkedInAt", target."createdAt",
                target."updatedAt"
    `;

    if (rows.length === 1) {
      return rows[0] as GuestRecord;
    }
    return this.refuseMissedWrite(ownerId, invitationId);
  }

  async findByToken(invitationId: string, tokenHash: string): Promise<GuestWithResponse | null> {
    // One probe of the unique hash index, scoped by the invitation, so a token of another invitation is simply
    // absent and no secret is compared in code.
    const row = await this.prisma.guest.findFirst({
      where: { invitationId, tokenHash },
      select: { ...GUEST_SELECT, rsvpResponse: { select: RESPONSE_SELECT } },
    });
    if (row === null) {
      return null;
    }
    const { rsvpResponse, ...guest } = row;
    return { ...guest, response: rsvpResponse };
  }

  async upsertResponse(
    invitationId: string,
    guestId: string,
    response: GuestResponseWrite,
    at: Date,
  ): Promise<boolean> {
    // The dedupe key names the guest, so the row stays unique per invitation without storing the name; the
    // `ON CONFLICT ("guestId")` target is the unique index that makes one guest have one answer.
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "RsvpResponse"
        ("id", "invitationId", "guestId", "dedupeKey", "name", "attending", "partySize", "phone",
         "message", "createdAt", "updatedAt")
      SELECT gen_random_uuid(), guest."invitationId", guest."id", 'guest|' || guest."id"::text,
             guest."name", ${response.attending}, ${response.partySize},
             -- The guest row owns the phone; the answer does not duplicate it.
             NULL::varchar,
             ${response.message}, ${at}, ${at}
      FROM "Guest" AS guest
      JOIN "Invitation" AS invitation ON invitation."id" = guest."invitationId"
      WHERE guest."id" = ${guestId}::uuid
        AND guest."invitationId" = ${invitationId}::uuid
        AND invitation."status" = 'PUBLISHED'
        AND (invitation."rsvpDeadline" IS NULL OR invitation."rsvpDeadline" >= ${at})
      ON CONFLICT ("guestId") DO UPDATE
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

  async checkIn(
    ownerId: string,
    invitationId: string,
    tokenHash: string,
    at: Date,
  ): Promise<GuestCheckIn | null> {
    // One statement: ownership, the editable statuses, the token, and an attending answer are the gate, and
    // `COALESCE` keeps the first check-in instant, so showing the same QR twice changes nothing.
    const rows = await this.prisma.$queryRaw<CheckInRow[]>`
      UPDATE "Guest" AS guest
      SET "checkedInAt" = COALESCE(guest."checkedInAt", ${at}),
          "updatedAt" = CASE WHEN guest."checkedInAt" IS NULL THEN ${at} ELSE guest."updatedAt" END
      FROM "Invitation" AS invitation, "RsvpResponse" AS response
      WHERE guest."id" = response."guestId"
        AND guest."invitationId" = invitation."id"
        AND invitation."id" = ${invitationId}::uuid
        AND invitation."ownerId" = ${ownerId}::uuid
        AND invitation."status" IN ('DRAFT', 'PUBLISHED')
        AND guest."tokenHash" = ${tokenHash}
        AND response."attending" = true
      RETURNING guest."id", guest."name", guest."seats", response."partySize", guest."checkedInAt"
    `;

    return rows.length === 1 ? (rows[0] as GuestCheckIn) : null;
  }

  /**
   * What a guarded write answers when it matched nothing: null when no row has this id or another owner has it
   * (A4), and `InvitationNotEditableError` when the row is this owner's and archived (A2). The write already
   * refused; this read exists only to state the reason.
   */
  private async refuseMissedWrite(ownerId: string, invitationId: string): Promise<null> {
    const stored = await this.prisma.invitation.findFirst({
      where: { id: invitationId, ownerId },
      select: { status: true },
    });
    if (stored === null) {
      return null;
    }
    assertEditable(stored.status);
    // The write's `WHERE` already covered every editable status, so the miss is about the guest, not the
    // invitation: the caller answers "no such guest of this invitation" (A4).
    return null;
  }
}
