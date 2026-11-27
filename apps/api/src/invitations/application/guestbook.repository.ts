import type {
  GuestbookEntryRecord,
  GuestbookEntryValues,
  PublicGuestbookEntry,
} from "../domain/invitation-guestbook";

// Persistence port of the guestbook (F7; S2.7, L10.1, L10.4, L10.6). It is separate from the invitation port for the
// same reason the RSVP rows are: the invitation port is about authored content and publication, while these rows are
// what guests signed and the owner only moderates. The public write does NOT read the invitation through this port; it
// reuses `InvitationRepository.findPublishedBySlug`, so the gating has a single definition.
//
// Ownership is never checked outside the query that names it: the owner's read and write carry the owner id in their own
// `WHERE`, so another customer's invitation answers exactly like an id that names nothing (A4). The public write carries
// the invitation id and repeats the publication and expiry rules inside the statement, so an entry that races an
// unpublish or an expiry that just passed is refused by the database, not by an earlier read.

/** Persistence port of the guestbook (F7; S2.7, L10.1, L10.4, L10.6). */
export interface GuestbookRepository {
  /**
   * The visible entries of one invitation, newest first and at most `GUESTBOOK_VISIBLE_ENTRIES_MAX`. A hidden entry is
   * never here, so the guest's wall cannot show one even if a caller forgets the projection.
   */
  findVisible(invitationId: string): Promise<GuestbookEntryRecord[]>;

  /**
   * Every entry of one owned invitation, visible and hidden together, newest first and at most
   * `GUESTBOOK_OWNER_ENTRIES_MAX`; null when no row has this id or another owner has it (A4). The owner is the only
   * reader of the hidden ones, so this is the moderation read. The bound keeps one screen from answering an unbounded
   * list however many signatures an invitation collected.
   */
  findOwnedEntries(ownerId: string, invitationId: string): Promise<GuestbookEntryRecord[] | null>;

  /**
   * Inserts one entry in one statement whose `SELECT` re-states that the invitation is still PUBLISHED and has not
   * expired, both judged by the database's own clock inside the statement — never by an instant the caller captured
   * before reading and validating the signature, which a slow request could make stale; answers false, storing nothing,
   * when the invitation no longer accepts it. The caller must already have validated the entry.
   */
  insert(invitationId: string, entry: GuestbookEntryValues): Promise<boolean>;

  /**
   * Sets `hidden` on one entry of one owned invitation. Answers the stored entry, or null when the entry does not
   * belong to that invitation — an entry of another invitation or another owner is indistinguishable from a missing one
   * (A4). The write is idempotent: hiding a hidden entry, or showing a visible one, keeps the same state.
   */
  setHidden(
    ownerId: string,
    invitationId: string,
    entryId: string,
    hidden: boolean,
  ): Promise<GuestbookEntryRecord | null>;
}

export const GUESTBOOK_REPOSITORY = Symbol("GuestbookRepository");

/**
 * The guestbook source of the public invitation read (F7; L10.4). The invitations module owns what a guest may see and
 * therefore declares this port, exactly like the gallery port; the projection never queries the guestbook table itself,
 * and a test that composes the public read alone still projects a published invitation.
 */
export interface InvitationGuestbookReader {
  readVisibleEntries(invitationId: string): Promise<PublicGuestbookEntry[]>;
}

export const INVITATION_GUESTBOOK_READER = Symbol("InvitationGuestbookReader");
