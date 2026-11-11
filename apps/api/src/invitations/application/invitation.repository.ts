import type { JsonObject } from "../domain/invitation-content";
import type { InvitationStatus } from "../domain/invitation-lifecycle";

/** One stored invitation; `content` is always a JSON object (the `Invitation_content_object` check). */
export interface InvitationRecord {
  id: string;
  ownerId: string;
  /** The pinned snapshot: it never changes for the life of the invitation (A2, S3). */
  templateVersionId: string;
  packageId: string;
  slug: string;
  status: InvitationStatus;
  content: JsonObject;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A new DRAFT: the owner from the session, the pinned snapshot, the chosen package, and a generated slug. */
export interface NewInvitation {
  ownerId: string;
  templateVersionId: string;
  packageId: string;
  slug: string;
  content: JsonObject;
}

/**
 * Persistence port of invitations (M4 T3; S1, S3, S7, S9, A3, A4). Ownership is never checked outside the
 * query that reads or writes the row: every operation that names one invitation carries the owner id in its
 * own `WHERE`, so another customer's id answers exactly like an id that names nothing and no write can reach
 * a row the caller does not own (S9, A4). Nothing is deleted: archiving is the only lifecycle write of M4.
 */
export interface InvitationRepository {
  /**
   * Stores a DRAFT with `content` as given (S7) and the given slug. Throws
   * `InvitationSlugTakenError` — and PostgreSQL has stored nothing — when the unique slug index already
   * holds this slug; every other failure propagates unchanged, so a caller can tell a slug collision from a
   * real error and retry only the former.
   */
  create(input: NewInvitation): Promise<InvitationRecord>;

  /** The invitation while this owner has it; null when no row has this id or another owner has it (A4). */
  findOwned(ownerId: string, id: string): Promise<InvitationRecord | null>;

  /** Every invitation of this owner, newest first; an owner with none gets an empty list. */
  listOwned(ownerId: string): Promise<InvitationRecord[]>;

  /**
   * Replaces the content of a DRAFT, in one statement whose `WHERE` names the owner and the DRAFT status, so
   * an archived invitation is never rewritten even by a concurrent archive (S7, A3). Throws
   * `InvitationNotEditableError` when the row is owned but no longer DRAFT; null, changing nothing, when no
   * row has this id or another owner has it (A4).
   */
  updateContent(ownerId: string, id: string, content: JsonObject): Promise<InvitationRecord | null>;

  /**
   * Sets `status` to ARCHIVED and `archivedAt` to the same instant in one statement, again scoped by owner and
   * by the DRAFT status. Throws `InvitationAlreadyArchivedError` when the row is owned and already archived,
   * so a repeated archive never looks like a change; null, changing nothing, for an id that is missing or
   * belongs to another owner (A4). The row is kept: an archived invitation is read-only, never deleted.
   */
  archive(ownerId: string, id: string): Promise<InvitationRecord | null>;
}

export const INVITATION_REPOSITORY = Symbol("InvitationRepository");
