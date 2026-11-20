import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  AdminInvitationQuery,
  AdminInvitationRepository,
  AdminInvitationRow,
} from "../application/admin-invitation.repository";
import type { InvitationStatus } from "../domain/invitation-lifecycle";

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

export class PrismaAdminInvitationRepository implements AdminInvitationRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
      // The exact key-set predicate: a strictly older instant, or the same instant with a smaller id. UUIDs compare
      // byte-wise in PostgreSQL, which is the same order the `ORDER BY` uses, so no row is skipped or repeated.
      conditions.push(Prisma.sql`(
        "createdAt" < ${query.after.createdAt}::timestamptz
        OR ("createdAt" = ${query.after.createdAt}::timestamptz AND "id" < ${query.after.id}::uuid)
      )`);
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
    const row = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      select: FIND_COLUMNS,
    });

    return row === null ? null : toRow(row);
  }
}
