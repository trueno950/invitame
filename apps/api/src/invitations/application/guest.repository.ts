// Persistence port of the guest list (M6 G2; S1, S4). It is separate from `RsvpRepository` on purpose: that port
// carries the invitation's open answers, while these rows are creators' guests with their own personal token and
// check-in state. The two meet on `RsvpResponse.guestId`, the nullable reference that turns one response into one
// guest's answer.
//
// Ownership and the archived refusal are never checked outside the query that names them: every creator operation
// carries the owner id and the editable statuses in its own `WHERE`, so another customer's invitation answers
// exactly like an id that names nothing (A4) and a concurrent archive cannot slip a write through (A2). The plain
// guest token never reaches this port: the application hashes it, and the port stores and looks up only the digest
// through the unique index, so no secret is compared in application code.

import type { RsvpCompanion } from "../domain/invitation-rsvp";

/** One stored guest, without the token digest: the digest is internal and never leaves the adapter. */
export interface GuestRecord {
  id: string;
  /** The invitation the guest belongs to; the read is already scoped by it, and no route exposes it. */
  invitationId: string;
  name: string;
  /** 1 to 10 people, the party this guest may confirm. */
  seats: number;
  phone: string | null;
  note: string | null;
  /** When the current personal token was minted; the token itself is not stored. */
  tokenIssuedAt: Date;
  /** When the owner first checked this guest in, or null while not checked in. */
  checkedInAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One guest's answer as the creator's list and the CSV export render it. */
export interface GuestResponseSummary {
  attending: boolean;
  /** 0 when the guest declined, otherwise 1 to the guest's seats. */
  partySize: number;
  /**
   * The people who come with the guest (F3; L6.1): `partySize - 1` entries when attending and empty when not, or null
   * for an answer stored before the column existed, which then counts its whole party as adults.
   */
  companions: RsvpCompanion[] | null;
  dietaryNotes: string | null;
  message: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One guest with their answer, or null while they have not answered. */
export interface GuestWithResponse extends GuestRecord {
  response: GuestResponseSummary | null;
}

/** What a guest-list read returns: the invitation's slug for the export filename, and the guests. */
export interface GuestListReadModel {
  slug: string;
  guests: GuestWithResponse[];
}

/** The values a new guest stores; the application validates them and mints the token before this port is asked. */
export interface NewGuest {
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  /** The SHA-256 digest of the plain token, which is the only form ever stored. */
  tokenHash: string;
}

/** The fields an edit replaces; the token and the check-in state are not editable. */
export interface GuestFields {
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
}

/** The answer a guest submits through their personal link. */
export interface GuestResponseWrite {
  attending: boolean;
  partySize: number;
  /** One entry per extra person when attending, empty when not (F3; L6.1). */
  companions: RsvpCompanion[];
  dietaryNotes: string | null;
  message: string | null;
}

/** What the owner's check-in answers: the guest, the party, and the first check-in instant. */
export interface GuestCheckIn {
  id: string;
  name: string;
  seats: number;
  partySize: number;
  /** The first check-in instant, unchanged by a repeated scan. */
  checkedInAt: Date;
}

/**
 * Persistence port of the guest list (M6 G2; S1, S4). Every creator operation is one guarded statement: the
 * invitation is named by its owner and by the DRAFT or PUBLISHED statuses inside the same `WHERE` that writes, so
 * ownership, the archived refusal, and the write are atomic (A2, A4, S9).
 */
export interface GuestRepository {
  /**
   * Stores one guest of a DRAFT or a PUBLISHED invitation. Null, changing nothing, for an id that is missing or
   * belongs to another owner (A4); throws `InvitationNotEditableError` when the row is owned but archived.
   */
  create(
    ownerId: string,
    invitationId: string,
    guest: NewGuest,
    at: Date,
  ): Promise<GuestRecord | null>;

  /**
   * The guest list of one owned invitation with each guest's answer, newest first; null when no row has this id
   * or another owner has it (A4). An archived invitation stays readable: archiving is read-only (A2).
   */
  findGuests(ownerId: string, invitationId: string): Promise<GuestListReadModel | null>;

  /**
   * One guest of an owned invitation with their answer; null when it is not part of this invitation or the
   * invitation is another owner's (A4). It is the read a missed write uses to answer the precise refusal.
   */
  findGuest(
    ownerId: string,
    invitationId: string,
    guestId: string,
  ): Promise<GuestWithResponse | null>;

  /**
   * Replaces the name, the seats, the phone, and the note of one guest of a DRAFT or a PUBLISHED invitation. Null
   * for a guest that is not part of this owned invitation (A4). Throws `InvitationNotEditableError` when the
   * invitation is owned but archived, and `GuestSeatsBelowConfirmedPartyError` when the new seats could not hold
   * the party the guest already confirmed.
   */
  update(
    ownerId: string,
    invitationId: string,
    guestId: string,
    guest: GuestFields,
    at: Date,
  ): Promise<GuestRecord | null>;

  /**
   * Removes one guest of a DRAFT or a PUBLISHED invitation together with their answer, in one statement, so no
   * response outlives the guest it answers for. False for a guest that is not part of this owned invitation (A4);
   * throws `InvitationNotEditableError` when the invitation is owned but archived.
   */
  remove(ownerId: string, invitationId: string, guestId: string): Promise<boolean>;

  /**
   * Replaces the token digest of one guest, so the previous personal link stops working. Null for a guest that is
   * not part of this owned invitation (A4); throws `InvitationNotEditableError` when the invitation is owned but
   * archived.
   */
  rotateToken(
    ownerId: string,
    invitationId: string,
    guestId: string,
    tokenHash: string,
    at: Date,
  ): Promise<GuestRecord | null>;

  /**
   * The guest of one invitation whose token digest matches, with their answer; null when no guest of that
   * invitation has it, which is what a revoked token and a token of another invitation answer too (S4). The
   * lookup is one probe of the unique index `Guest_tokenHash_key`, scoped by the invitation.
   */
  findByToken(invitationId: string, tokenHash: string): Promise<GuestWithResponse | null>;

  /**
   * Stores one guest's answer, or updates it when the guest already answered, in one statement whose `SELECT`
   * repeats the publication status and the deadline, so a retry is idempotent and a write that races an
   * unpublish, an archive, or an elapsed deadline is refused by the database. False, storing nothing, when it is.
   */
  upsertResponse(
    invitationId: string,
    guestId: string,
    response: GuestResponseWrite,
    at: Date,
  ): Promise<boolean>;

  /**
   * Checks one guest in, keeping the instant of the first check-in, in one statement that requires an owned
   * invitation that is not archived, the guest's own token, and a response that confirmed attendance. Null when
   * that statement matched nothing; the caller distinguishes an unknown guest from a guest who has not confirmed.
   */
  checkIn(
    ownerId: string,
    invitationId: string,
    tokenHash: string,
    at: Date,
  ): Promise<GuestCheckIn | null>;
}

export const GUEST_REPOSITORY = Symbol("GuestRepository");
