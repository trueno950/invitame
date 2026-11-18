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
  /**
   * The IANA zone the guest's countdown and calendar use (F1; S4). The column is NOT NULL with a default, so
   * every stored invitation has one; the allow-list is the domain's, not the column's.
   */
  timeZone: string;
  /**
   * The stored WhatsApp phone in E.164, or null when the invitation has none (F1; S4). It travels flattened from
   * the one-to-one `InvitationFeatureSettings` row, so a caller never needs a second read.
   */
  whatsappPhone: string | null;
  /**
   * The stored playlist link, normalized to an `https` URL on an allow-listed music host, or null when the
   * invitation has none (F6; S7). It travels flattened with the phone, from the same settings row.
   */
  playlistUrl: string | null;
  /**
   * The RSVP deadline, or null for one that never closes (M6 G1; S4). The column is nullable, so every row that
   * existed before the migration reads null and keeps accepting responses.
   */
  rsvpDeadline: Date | null;
  /**
   * The party limit the owner set, 1 to 10, defaulting to 4 (M6 G1; S4). The column is NOT NULL with a default,
   * so every stored invitation has one; the domain validates the limit a creator saves.
   */
  rsvpPartyLimit: number;
  archivedAt: Date | null;
  /**
   * When the invitation was published; the database `Invitation_publishedAt_matches_status` check keeps it
   * set exactly while the status is PUBLISHED, so unpublishing and archiving clear it (S7, A2).
   */
  publishedAt: Date | null;
  /**
   * The expiry the database carries and Milestone 5 never sets (S8). It is part of the record because the
   * column exists and the public read must already refuse an elapsed one; no write in this milestone sets it.
   */
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The feature data one write stores (F1, F6; S4, S7): an allow-listed zone, an E.164 phone or null, and a
 * normalized playlist link or null. The application validates all three before the port is asked; the port only
 * persists them.
 */
export interface InvitationFeatureSettingsWrite {
  timeZone: string;
  whatsappPhone: string | null;
  playlistUrl: string | null;
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
 * Persistence port of invitations (M4 T3 and M5 T3; S1, S2, S3, S7, S9, A1, A2, A3, A4). Ownership is never
 * checked outside the query that reads or writes the row: every operation that names one invitation carries
 * the owner id in its own `WHERE`, so another customer's id answers exactly like an id that names nothing and
 * no write can reach a row the caller does not own (S9, A4). Nothing is deleted: archiving is the only
 * terminal lifecycle write (A2).
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
   * Replaces the content of a DRAFT or a PUBLISHED invitation, in one statement whose `WHERE` names the owner
   * and both editable statuses, so a published invitation changes live (S7) and an archived one is never
   * rewritten even by a concurrent archive (A2). Throws `InvitationNotEditableError` when the row is owned but
   * no longer editable; null, changing nothing, when no row has this id or another owner has it (A4). A write
   * that names `expectedUpdatedAt` carries it into the `WHERE` too, so a content merged from an older read never
   * overwrites a newer write: it then throws `InvitationContentConflictError` (S2).
   */
  updateContent(
    ownerId: string,
    id: string,
    content: JsonObject,
    expectedUpdatedAt?: Date,
  ): Promise<InvitationRecord | null>;

  /**
   * Stores the feature data of a DRAFT or a PUBLISHED invitation — the zone on the invitation and the phone and
   * playlist link in its one-to-one settings row — in one transaction whose `WHERE` names the owner and both
   * editable statuses, so a published invitation changes live (S7), an archived one is refused with
   * `InvitationNotEditableError` even by a concurrent archive (A2), and another owner's id answers null,
   * changing nothing (A4).
   */
  updateFeatures(
    ownerId: string,
    id: string,
    features: InvitationFeatureSettingsWrite,
  ): Promise<InvitationRecord | null>;

  /**
   * Sets `status` to ARCHIVED and `archivedAt` to the same instant in one statement, scoped by owner and by the
   * DRAFT or PUBLISHED status it reads first, and clears `publishedAt` because the status is no longer
   * PUBLISHED (A2, S7). Throws `InvitationAlreadyArchivedError` when the row is owned and already archived, so
   * a repeated archive never looks like a change; null, changing nothing, for an id that is missing or belongs
   * to another owner (A4). The row is kept: an archived invitation is read-only, never deleted.
   */
  archive(ownerId: string, id: string): Promise<InvitationRecord | null>;

  /**
   * Publishes a DRAFT in one statement whose `WHERE` names the owner and the DRAFT status, marking
   * `publishedAt` with the given instant (S7). Throws `InvitationAlreadyPublishedError` when the row is owned
   * and already published and `InvitationAlreadyArchivedError` when it is archived, so each wrong status has
   * its own signal and a repeated publish never looks like a change; null, changing nothing, for an id that is
   * missing or belongs to another owner (A4).
   */
  publish(ownerId: string, id: string, at: Date): Promise<InvitationRecord | null>;

  /**
   * Returns a PUBLISHED invitation to DRAFT in one statement whose `WHERE` names the owner and the PUBLISHED
   * status, clearing `publishedAt` (S7, A2). Throws `InvitationNotPublishedError` when the row is owned and not
   * published and `InvitationAlreadyArchivedError` when it is archived; null, changing nothing, for an id that
   * is missing or belongs to another owner (A4).
   */
  unpublish(ownerId: string, id: string): Promise<InvitationRecord | null>;

  /**
   * The public read (S2, A3): the one row with this slug, in one query, that is PUBLISHED and either has no
   * expiry or expires in the future. A draft, an archived, an expired, and an unknown slug all answer null, so
   * the guest sees one 404 for every case that must not render. Like every public read it carries no owner:
   * the slug is the only input, and it is the repository that decides what a guest may reach.
   */
  findPublishedBySlug(slug: string): Promise<InvitationRecord | null>;
}

export const INVITATION_REPOSITORY = Symbol("InvitationRepository");
