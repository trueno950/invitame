import type { RsvpCompanion, RsvpSettings } from "../domain/invitation-rsvp";

// Persistence port of RSVP data (M6 G1; S1, S4). It is separate from `InvitationRepository` on purpose: the
// invitation port is about authored content and publication, while these rows are guest answers that the creator
// only reads and exports. The public submission does NOT read through this port for the invitation itself; it
// reuses `InvitationRepository.findPublishedBySlug`, which already answers "published and not expired" in one
// query, so the gating has a single definition.
//
// Ownership is never checked outside the query that names it: `saveSettings` and `findResponses` carry the owner
// id in their own `WHERE`, so another customer's id answers exactly like an id that names nothing (A4). The
// public write carries the invitation id and repeats the publication and deadline rules inside the statement, so a
// response that races an unpublish or a deadline that just passed is refused by the database, not by an earlier
// read.

/** One response as the creator's read and the CSV export render it. */
export interface RsvpResponseRecord {
  id: string;
  /** The invitation the response belongs to; the read is already scoped by it, and no route exposes it. */
  invitationId: string;
  name: string;
  /** The normalized name and phone the unique index holds; internal, never exposed (S4). */
  dedupeKey: string;
  attending: boolean;
  /** 0 when the guest declined, otherwise 1 to the invitation's party limit. */
  partySize: number;
  /**
   * The people who come with the guest (F3; L6.1): `partySize - 1` entries when attending and empty when not, or null
   * for an answer stored before the column existed, which then counts its whole party as adults.
   */
  companions: RsvpCompanion[] | null;
  dietaryNotes: string | null;
  phone: string | null;
  message: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The values one guest submission stores; the application validates every one of them first. */
export interface RsvpResponseWrite {
  name: string;
  dedupeKey: string;
  attending: boolean;
  partySize: number;
  /** One entry per extra person when attending, empty when not (F3; L6.1). */
  companions: RsvpCompanion[];
  dietaryNotes: string | null;
  phone: string | null;
  message: string | null;
}

/** What the creator's read returns: the invitation's slug for the export filename, the settings, and the rows. */
export interface RsvpReadModel {
  slug: string;
  settings: RsvpSettings;
  responses: RsvpResponseRecord[];
}

/** Persistence port of RSVP data (M6 G1; S1, S4). */
export interface RsvpRepository {
  /**
   * Stores the RSVP settings of a DRAFT or a PUBLISHED invitation in one statement whose `WHERE` names the owner
   * and both editable statuses, so a published invitation changes live and an archived one is refused with
   * `InvitationNotEditableError` even by a concurrent archive. Null, changing nothing, for an id that is missing
   * or belongs to another owner (A4).
   */
  saveSettings(ownerId: string, id: string, settings: RsvpSettings): Promise<RsvpSettings | null>;

  /**
   * The settings and every response of one owned invitation, newest first; null when no row has this id or
   * another owner has it (A4). The creator is the only reader, so the phone and the message travel here.
   */
  findResponses(ownerId: string, id: string): Promise<RsvpReadModel | null>;

  /**
   * Inserts one response, or updates the one response of the same guest when `(invitationId, dedupeKey)` already
   * exists, in one statement, so a retry never duplicates and a concurrent duplicate never fails (S1, S4). The
   * statement itself checks that the invitation is still PUBLISHED and that the deadline has not passed at the
   * given instant; answers false, storing nothing, when it is not. The caller must already have validated the
   * response against the owner's party limit.
   */
  upsertResponse(invitationId: string, response: RsvpResponseWrite, at: Date): Promise<boolean>;
}

export const RSVP_REPOSITORY = Symbol("RsvpRepository");
