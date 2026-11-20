import type { AdminActionReason } from "../../admin/admin-action-recorder";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import type { InvitationPageCursor } from "./invitation-cursor";

// The administrator's read of invitations (M9 T2; S1). It is separate from `InvitationRepository` on purpose, exactly
// like `PaymentRefundRepository` in the payments module: every owner-scoped read and write of this product carries the
// owner in its own query, and the one global invitation read is this one, so keeping it apart means no owner use case
// can reach it by accident.
//
// What the row carries is the whole privacy rule of the status view (S1, L3): the lifecycle columns, the pinned
// references, and the owner id that the owner-email port resolves. It never carries `content`, the owner's display
// name, guests, RSVP answers, or a provider payload, so a mapper cannot leak what the port never read.

/** One stored invitation as the administrator's read answers it: no `content` and no personal data beyond the owner. */
export interface AdminInvitationRow {
  invitationId: string;
  /** The owner reference; the email is read through `InvitationOwnerEmailReader`, never joined here. */
  ownerId: string;
  packageId: string;
  templateVersionId: string;
  slug: string;
  status: InvitationStatus;
  createdAt: Date;
  publishedAt: Date | null;
  /** The first instant this invitation was ever published, or null while it never was (T2, S3). */
  firstPublishedAt: Date | null;
  archivedAt: Date | null;
  /** The instant a refund claim asked the provider, or null while none did (T2, S3). */
  refundRequestedAt: Date | null;
}

/** One page request: the filters, the key-set position, and how many rows to read. */
export interface AdminInvitationQuery {
  /** A case-insensitive slug prefix, or null for every slug. `%` and `_` are literal characters. */
  slugPrefix: string | null;
  status: InvitationStatus | null;
  /** The last row of the previous page, or null for the first page. */
  after: InvitationPageCursor | null;
  /** The greatest number of rows to answer; the caller asks for one more than the page to learn whether another exists. */
  limit: number;
}

/**
 * Why an administrator unpublished an invitation and who did it (T8; S4, S6): the one audit row the change writes
 * names both, and the actor is the session's own id, never a client-supplied one.
 */
export interface AdminInvitationUnpublishAudit {
  adminUserId: string;
  reason: AdminActionReason;
  /** The administrator's optional note, as they sent it: the recorder trims it and enforces its bound. */
  note: string | null;
}

/**
 * The administrator's invitation read (M9 T2; S1). Reads only: nothing here writes, and nothing here answers a
 * request field it was not asked for.
 */
export interface AdminInvitationRepository {
  /**
   * The newest `limit` invitations that match the filters, ordered by `(createdAt desc, id desc)`, strictly after the
   * `after` position when one is given. A cursor that matches no row simply answers the next rows in that order.
   */
  listForAdmin(query: AdminInvitationQuery): Promise<AdminInvitationRow[]>;

  /** One invitation whatever its owner and status, or null when no row has this id. */
  findForAdmin(invitationId: string): Promise<AdminInvitationRow | null>;

  /**
   * The one administrator write of this module (T8; S4, S6, L9): PUBLISHED → DRAFT for any owner, with the audit row
   * `audit` describes written in the same transaction, so the change and its record commit together or not at all.
   *
   * `firstPublishedAt` is untouched: unpublishing returns the invitation to a draft and never erases the publication
   * the refund rule reads. Null means no invitation has this id (the route's 404); an invitation that is not
   * published refuses with the domain's own error (`InvitationNotPublishedError` for a DRAFT,
   * `InvitationAlreadyArchivedError` for an ARCHIVED row), and nothing is written to the change or the audit.
   */
  unpublishForAdmin(
    invitationId: string,
    audit: AdminInvitationUnpublishAudit,
  ): Promise<AdminInvitationRow | null>;
}

export const ADMIN_INVITATION_REPOSITORY = Symbol("AdminInvitationRepository");
