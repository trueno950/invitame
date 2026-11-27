import type { InvitationStatus } from "../../invitations/domain/invitation-lifecycle";
import type { GuestPhotoRecord, GuestPhotoReviewState } from "../domain/guest-photo";

// The persistence port of the album of the guests' photos (F8; S2.8, L11.1, L11.3, L11.4, L11.6). It is separate from
// the invitation media port because the two answer different questions: `MediaAsset` is what the owner authored for
// their own invitation, while these rows are what guests uploaded and the owner only moderates. Binaries never pass
// through this port: a row names its object by `storageKey`, and the object lives in the existing storage adapter.
//
// The public upload does not read the invitation through the owner's scope: it resolves a published slug, and the
// insert repeats the publication and expiry rules inside its own statement, against the database's own clock, so a photo
// that races an unpublish or an expiry is refused by the database and not by an earlier read. Ownership is never
// checked outside the query that names it: the owner's read and write carry the owner id in their own `WHERE`, so
// another customer's invitation answers exactly like an id that names nothing (A4).

/** What the album needs from an invitation: its row, its lifecycle state, its pinned package, and its expiry. */
export interface GuestAlbumInvitation {
  readonly id: string;
  readonly status: InvitationStatus;
  readonly packageId: string;
  readonly expiresAt: Date | null;
}

/** One photo an upload is about to store: the id the API generated and the object the storage adapter wrote. */
export interface NewGuestPhoto {
  readonly id: string;
  readonly storageKey: string;
  readonly uploaderName: string | null;
}

/**
 * What one insert answered. `stored` wrote the row; `invitation-not-found` means no row has this id; `closed` means the
 * invitation is no longer published or has expired; `full` means the album already stores
 * `GUEST_PHOTO_MAX_STORED` photos. Nothing is written in the last three cases, so the caller deletes the object it may
 * already have written.
 */
export type InsertGuestPhotoResult = "stored" | "invitation-not-found" | "closed" | "full";

/** What serving one photo needs: the row and the invitation state that decides whether it may be shown. */
export interface ServingGuestPhoto {
  readonly photo: GuestPhotoRecord;
  readonly invitation: { readonly ownerId: string; readonly status: InvitationStatus };
}

/** One retired photo, as the retention cleanup answers it: the row to remove and the object to delete. */
export interface RetiredGuestPhoto {
  readonly id: string;
  readonly storageKey: string;
}

/**
 * Persistence port of the album (F8; L11.1, L11.3, L11.4, L11.6). `insert` enforces the per-invitation cap in the same
 * transaction that writes the row, serialized on the invitation row, so two concurrent uploads cannot both take the
 * last slot.
 */
export interface GuestAlbumRepository {
  /** The live PUBLISHED invitation of one slug; null for a draft, an archived, an expired, and an unknown slug (A3). */
  findPublishedBySlug(slug: string): Promise<GuestAlbumInvitation | null>;

  /** The invitation while this owner has it; null when no row has this id or another owner has it (A4). */
  findOwnedInvitation(ownerId: string, invitationId: string): Promise<GuestAlbumInvitation | null>;

  /**
   * Stores one PENDING photo in one statement that re-states the invitation is PUBLISHED and unexpired at the
   * database's own clock, and refuses an album that already stores the cap. `at` is the API's instant, used for the
   * row; the publication and expiry rules are the database's.
   */
  insert(invitationId: string, photo: NewGuestPhoto, at: Date): Promise<InsertGuestPhotoResult>;

  /**
   * The published photos of one invitation, newest first and at most `GUEST_PHOTO_PUBLIC_MAX`, with how many published
   * photos the invitation holds in total. A pending or hidden photo is never here, so a guest's page cannot show one
   * even if a caller forgets the projection.
   */
  readPublished(
    invitationId: string,
  ): Promise<{ readonly photos: GuestPhotoRecord[]; readonly count: number }>;

  /**
   * Every photo of one owned invitation, newest first and at most `GUEST_PHOTO_OWNER_MAX`; null when no row has this id
   * or another owner has it (A4). The owner is the only reader of the pending and hidden ones, so this is the
   * moderation read.
   */
  findOwnedPhotos(ownerId: string, invitationId: string): Promise<GuestPhotoRecord[] | null>;

  /**
   * Publishes or hides one photo of one owned invitation, stamping `reviewedAt`. Answers the stored photo, or null when
   * the photo does not belong to that invitation — a photo of another invitation, a photo of another owner, and a
   * missing one are the same answer (A4).
   */
  review(
    ownerId: string,
    invitationId: string,
    photoId: string,
    status: GuestPhotoReviewState,
    at: Date,
  ): Promise<GuestPhotoRecord | null>;

  /** One photo with its invitation's owner and status, without any owner scoping: used to decide serving. */
  findForServing(photoId: string): Promise<ServingGuestPhoto | null>;

  /** Every storage key a photo row names, whatever its status, so the cleanup can spot orphan objects (L11.6). */
  listStorageKeys(): Promise<string[]>;

  /**
   * The photos the media retention cleanup retires: those still PENDING, or already HIDDEN, whose state instant —
   * `createdAt` while pending, `reviewedAt` once hidden — is older than `before` (L11.6). Newest last, so a run removes
   * the oldest first.
   */
  listRetired(before: Date): Promise<RetiredGuestPhoto[]>;

  /** Removes the rows of photos whose object is gone; only the retention cleanup calls this (L11.6). */
  remove(ids: readonly string[]): Promise<void>;
}

export const GUEST_ALBUM_REPOSITORY = Symbol("GuestAlbumRepository");

/**
 * The part of the album port the media retention cleanup reads (F8; L11.6): the storage keys the whole table names, the
 * photos retired by age, and the removal of the rows whose object is gone. It is narrower than `GuestAlbumRepository` so
 * the cleanup command cannot moderate, insert, or serve a photo.
 */
export interface GuestAlbumCleanup {
  listStorageKeys(): Promise<string[]>;
  listRetired(before: Date): Promise<RetiredGuestPhoto[]>;
  remove(ids: readonly string[]): Promise<void>;
}
