import { Prisma, type PrismaClient } from "@prisma/client";

import type { AdminActionRecorder } from "../../admin/admin-action-recorder";
import { ADMIN_ACTION } from "../../admin/admin-action-recorder";
import type {
  AdminInvitationQuery,
  AdminInvitationRepository,
  AdminInvitationRow,
  AdminInvitationUnpublishAudit,
} from "../application/admin-invitation.repository";
import { isInvitationId } from "../application/invitation-cursor";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import { unpublish } from "../domain/invitation-lifecycle";
import { InvitationNotPublishedError } from "../domain/invitation.errors";

// The administrator's invitation read on PostgreSQL (M9 T2; S1). Two rules shape this adapter:
//
// 1. It reads the status view's columns and no others. `content` is never selected, so no mapper can leak it, and the
//    owner's display name, guests, and RSVP answers are not even in the statement.
// 2. The page is a key-set read, never an offset: `(createdAt, id)` desc with a strict "after" predicate, so a row
//    created between two requests cannot shift a later page and no transaction or snapshot is needed.
//
// The slug prefix is a case-insensitive `LIKE` over the stored slug. `%` and `_` are the pattern's own wildcards, so
// they are escaped and the statement declares the escape character: a prefix a slug cannot contain (`_`, `%`) then
// matches only itself instead of everything.
//
// The one write (T8; S4, S6, L9) is the administrator's unpublish: the same guarded transition the owner's own
// unpublish performs, without the owner scope, plus the audit row the caller's `AdminActionRecorder` writes through the
// same transaction client. The two statements are one unit: if the audit entry is refused, the transition rolls back
// with it, so an invitation is never a draft without a record of who made it one.

/** One row as the statement returns it: the stored enum label, not a Prisma client enum name. */
interface AdminInvitationSqlRow {
  invitationId: string;
  ownerId: string;
  packageId: string;
  templateVersionId: string;
  slug: string;
  status: InvitationStatus;
  createdAt: Date;
  publishedAt: Date | null;
  firstPublishedAt: Date | null;
  archivedAt: Date | null;
  refundRequestedAt: Date | null;
}

/** The status view's columns, aliased so the row shape is the port's; `content` is deliberately absent. */
const ADMIN_COLUMNS = Prisma.sql`
  "id" AS "invitationId", "ownerId", "packageId", "templateVersionId", "slug", "status",
  "createdAt", "publishedAt", "firstPublishedAt", "archivedAt", "refundRequestedAt"
`;

const FIND_COLUMNS = {
  id: true,
  ownerId: true,
  packageId: true,
  templateVersionId: true,
  slug: true,
  status: true,
  createdAt: true,
  publishedAt: true,
  firstPublishedAt: true,
  archivedAt: true,
  refundRequestedAt: true,
} satisfies Prisma.InvitationSelect;

function toRow(row: {
  id: string;
  ownerId: string;
  packageId: string;
  templateVersionId: string;
  slug: string;
  status: string;
  createdAt: Date;
  publishedAt: Date | null;
  firstPublishedAt: Date | null;
  archivedAt: Date | null;
  refundRequestedAt: Date | null;
}): AdminInvitationRow {
  return {
    invitationId: row.id,
    ownerId: row.ownerId,
    packageId: row.packageId,
    templateVersionId: row.templateVersionId,
    slug: row.slug,
    status: row.status as InvitationStatus,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
    firstPublishedAt: row.firstPublishedAt,
    archivedAt: row.archivedAt,
    refundRequestedAt: row.refundRequestedAt,
  };
}

/** Escapes the two `LIKE` wildcards and the escape character itself, so a prefix is matched literally. */
function escapeLikePattern(prefix: string): string {
  return prefix.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * The refusal of a guarded update that matched nothing: the domain transition states which one it is — a DRAFT answers
 * `InvitationNotPublishedError` and an ARCHIVED row `InvitationAlreadyArchivedError` (S7, A2) — so the route keeps its
 * two 409 codes. A PUBLISHED row cannot reach the fallback: the guarded update matches exactly that status.
 */
function refusedUnpublish(status: InvitationStatus): never {
  unpublish(status);
  throw new InvitationNotPublishedError();
}

export class PrismaAdminInvitationRepository implements AdminInvitationRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly actions: AdminActionRecorder,
  ) {}

  async listForAdmin(query: AdminInvitationQuery): Promise<AdminInvitationRow[]> {
    const conditions: Prisma.Sql[] = [];

    if (query.status !== null) {
      conditions.push(Prisma.sql`"status" = ${query.status}::"InvitationStatus"`);
    }
    if (query.slugPrefix !== null) {
      conditions.push(
        Prisma.sql`"slug" ILIKE ${`${escapeLikePattern(query.slugPrefix)}%`} ESCAPE '\\'`,
      );
    }
    if (query.after !== null) {
      // The exact key-set predicate as a row comparison: a strictly older instant, or the same instant with a smaller
      // id. It is lexicographic, the same order the `ORDER BY "createdAt" DESC, "id" DESC` uses, so no row is skipped or
      // repeated, and PostgreSQL turns it into an index condition on `Invitation(createdAt, id)` instead of filtering
      // every row before the cursor (T5).
      conditions.push(
        Prisma.sql`("createdAt", "id") < (${query.after.createdAt}::timestamptz, ${query.after.id}::uuid)`,
      );
    }

    const where = conditions.length === 0 ? Prisma.sql`TRUE` : Prisma.join(conditions, " AND ");

    return this.prisma.$queryRaw<AdminInvitationSqlRow[]>(Prisma.sql`
      SELECT ${ADMIN_COLUMNS}
      FROM "Invitation"
      WHERE ${where}
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT ${query.limit}
    `);
  }

  async findForAdmin(invitationId: string): Promise<AdminInvitationRow | null> {
    // The route already refuses a parameter that is not a UUID, so this guard is for a direct caller (a command, a
    // later internal read): PostgreSQL would refuse the comparison with a cast error, and "no such row" is the same
    // null the route maps to its one 404. It costs no query.
    if (!isInvitationId(invitationId)) {
      return null;
    }

    const row = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      select: FIND_COLUMNS,
    });

    return row === null ? null : toRow(row);
  }

  async unpublishForAdmin(
    invitationId: string,
    audit: AdminInvitationUnpublishAudit,
  ): Promise<AdminInvitationRow | null> {
    // The route already refuses a parameter that is not a UUID; this guard is for a direct caller, and it costs no
    // transaction. "No such row" is the same null the route maps to its one 404.
    if (!isInvitationId(invitationId)) {
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.invitation.updateMany({
        // The guard is the whole transition: only a PUBLISHED row changes, and the status and its marker move in the
        // same statement, as the `Invitation_publishedAt_matches_status` check requires. `firstPublishedAt` is not
        // part of this write, so unpublishing never erases the history the refund rule reads (S3).
        where: { id: invitationId, status: "PUBLISHED" },
        data: { status: "DRAFT", publishedAt: null },
      });

      if (changed.count !== 1) {
        // Nothing changed, so nothing is audited either: re-read the row to tell a missing invitation (404) from one
        // that exists with a status this action refuses (409).
        const stored = await tx.invitation.findUnique({
          where: { id: invitationId },
          select: { status: true },
        });
        if (stored === null) {
          return null;
        }
        return refusedUnpublish(stored.status as InvitationStatus);
      }

      // The audit row is written with this transaction, never a transaction of its own: the invitation never becomes a
      // draft without the record of who made it one, and the recorder's refusal rolls the transition back.
      await this.actions.record(tx, {
        adminUserId: audit.adminUserId,
        action: ADMIN_ACTION.INVITATION_UNPUBLISHED,
        reason: audit.reason,
        note: audit.note,
        invitationId,
      });

      return toRow(
        await tx.invitation.findUniqueOrThrow({
          where: { id: invitationId },
          select: FIND_COLUMNS,
        }),
      );
    });
  }
}
