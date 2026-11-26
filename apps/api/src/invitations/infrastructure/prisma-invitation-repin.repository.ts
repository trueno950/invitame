import type { PrismaClient } from "@prisma/client";

import type {
  InvitationRepinCandidate,
  InvitationRepinRepository,
} from "../application/invitation-repin.repository";
import type { JsonObject } from "../domain/invitation-content";

/** The shape of a JSON object as PostgreSQL returns it; arrays, null, and primitives are not objects. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The re-pin's adapter on PostgreSQL (S5, S8.6). The read is one bounded query over the table's primary order and
 * carries only the invitation id, its status, the version it pins, and its content — never an owner, an email, or a
 * slug, because the operator's report prints what this answers. The move is one `UPDATE` whose `WHERE` names the row,
 * the DRAFT status, and the version that was read, so it can neither reach a published or archived invitation nor
 * overwrite a concurrent change, and whose `data` names only `templateVersionId`, so the content stays exactly as the
 * customer typed it (S8.2). The database's `Invitation_pinned_fields_immutable` trigger states the rest — only a
 * version of the same template that is PUBLISHED right now may be pinned, and every other pinned field stays
 * immutable — and its refusal propagates unchanged.
 */
export class PrismaInvitationRepinRepository implements InvitationRepinRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listCandidates(): Promise<InvitationRepinCandidate[]> {
    const rows = await this.prisma.invitation.findMany({
      select: { id: true, status: true, templateVersionId: true, content: true },
      // Oldest first, so a run reads and reports its drafts in a stable order; the id breaks a tie.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    return rows.map((row) => ({
      invitationId: row.id,
      status: row.status,
      templateVersionId: row.templateVersionId,
      // The column is NOT NULL and carries the `Invitation_content_object` check, so the fallback is unreachable.
      content: isJsonObject(row.content) ? row.content : {},
    }));
  }

  async repinDraft(
    invitationId: string,
    fromVersionId: string,
    toVersionId: string,
  ): Promise<boolean> {
    // One statement: PostgreSQL applies it as its own transaction, and the three `WHERE` columns are the guards the
    // domain stated, re-stated in the write itself so the read and the write cannot disagree (S5, A2).
    const changed = await this.prisma.invitation.updateMany({
      where: { id: invitationId, templateVersionId: fromVersionId, status: "DRAFT" },
      data: { templateVersionId: toVersionId },
    });

    return changed.count === 1;
  }
}
