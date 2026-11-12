import { Prisma, type PrismaClient } from "@prisma/client";
import { InvitationSlugTakenError } from "../application/invitation.application.errors";
import type {
  InvitationRecord,
  InvitationRepository,
  NewInvitation,
} from "../application/invitation.repository";
import {
  InvitationAlreadyArchivedError,
  InvitationNotEditableError,
} from "../domain/invitation.errors";
import type { JsonObject } from "../domain/invitation-content";
import { archive, assertEditable } from "../domain/invitation-lifecycle";

const INVITATION_SELECT = {
  id: true,
  ownerId: true,
  templateVersionId: true,
  packageId: true,
  slug: true,
  status: true,
  content: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InvitationSelect;

type InvitationRow = Prisma.InvitationGetPayload<{ select: typeof INVITATION_SELECT }>;

/** The shape of a JSON object as PostgreSQL returns it; arrays, null, and primitives are not objects. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(row: InvitationRow): InvitationRecord {
  return {
    ...row,
    // The column is NOT NULL and carries the `Invitation_content_object` check, so this fallback is
    // unreachable; it keeps the port's "content is an object" contract true without a cast.
    content: isJsonObject(row.content) ? row.content : {},
  };
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * The invitation port on PostgreSQL (M4 T3; S1, S3, S5, S7, S9, A3, A4). Every statement that names one
 * invitation carries the owner id in its own `WHERE` (S9): another owner's row is indistinguishable from a
 * missing one, so no read-then-check outside the write can ever let a foreign row through (A4). Each content
 * change and each archive runs in one interactive transaction that re-states the owner and the DRAFT status in
 * the `WHERE` of the write itself, so the domain check and the write cannot disagree: a concurrent archive
 * makes the write match nothing and is reported as `InvitationNotEditableError` instead of silently rewriting
 * a read-only invitation (S7, A3). The unique index on `slug` is the only uniqueness guard (S3); its violation
 * (P2002) is reported as `InvitationSlugTakenError` so the create use case can draw another slug.
 */
export class PrismaInvitationRepository implements InvitationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewInvitation): Promise<InvitationRecord> {
    try {
      const created = await this.prisma.invitation.create({
        select: INVITATION_SELECT,
        data: {
          ownerId: input.ownerId,
          templateVersionId: input.templateVersionId,
          packageId: input.packageId,
          slug: input.slug,
          content: input.content as Prisma.InputJsonObject,
        },
      });
      return toRecord(created);
    } catch (error) {
      // P2002: the unique index "Invitation_slug_key"; PostgreSQL stored nothing. It is the only unique
      // index on the table, so no other constraint can be mistaken for a slug collision.
      if (isPrismaError(error, "P2002")) {
        throw new InvitationSlugTakenError(input.slug);
      }
      throw error;
    }
  }

  async findOwned(ownerId: string, id: string): Promise<InvitationRecord | null> {
    const stored = await this.prisma.invitation.findFirst({
      where: { id, ownerId },
      select: INVITATION_SELECT,
    });
    return stored === null ? null : toRecord(stored);
  }

  async listOwned(ownerId: string): Promise<InvitationRecord[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { ownerId },
      select: INVITATION_SELECT,
      // Newest first; the id breaks a tie between two rows created in the same instant.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toRecord);
  }

  async updateContent(
    ownerId: string,
    id: string,
    content: JsonObject,
  ): Promise<InvitationRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.invitation.findFirst({
        where: { id, ownerId },
        select: INVITATION_SELECT,
      });
      if (stored === null) {
        return null;
      }
      // State the rule now so the caller gets the real reason, and again inside the write below.
      assertEditable(toRecord(stored).status);

      const changed = await tx.invitation.updateMany({
        where: { id, ownerId, status: "DRAFT" },
        data: { content: content as Prisma.InputJsonObject },
      });
      if (changed.count !== 1) {
        // The row stopped being an editable draft after the read: the only other status is ARCHIVED.
        throw new InvitationNotEditableError("ARCHIVED");
      }

      return toRecord(
        await tx.invitation.findUniqueOrThrow({ where: { id }, select: INVITATION_SELECT }),
      );
    });
  }

  async archive(ownerId: string, id: string): Promise<InvitationRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.invitation.findFirst({
        where: { id, ownerId },
        select: INVITATION_SELECT,
      });
      if (stored === null) {
        return null;
      }
      const current = toRecord(stored);
      // The domain states the transition; ARCHIVED and its marker are written together below (A3).
      const next = archive(current.status);

      const changed = await tx.invitation.updateMany({
        where: { id, ownerId, status: "DRAFT" },
        data: { status: next, archivedAt: new Date() },
      });
      if (changed.count !== 1) {
        // A concurrent archive won; this request archived nothing, so it is not a successful change.
        throw new InvitationAlreadyArchivedError();
      }

      return toRecord(
        await tx.invitation.findUniqueOrThrow({ where: { id }, select: INVITATION_SELECT }),
      );
    });
  }
}
