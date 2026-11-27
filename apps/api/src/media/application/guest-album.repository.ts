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
 * invitation is no longer published or has expired; `full` means the album already holds `GUEST_PHOTO_MAX_STORED`
 * photos that count toward its cap; and `pending-full` means it already holds `GUEST_PHOTO_MAX_PENDING` photos waiting
 * for review (L26). Nothing is written in the last four cases, so the caller deletes the object it may already have
 * written.
 */
export type InsertGuestPhotoResult =
  | "stored"
  | "invitation-not-found"
  | "closed"
  | "full"
  | "pending-full";

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

/** What one moderation write answered (L26): the stored photo, a photo outside this invitation, or a full album. */
export type ReviewedGuestPhoto =
  | { readonly status: "reviewed"; readonly photo: GuestPhotoRecord }
  | { readonly status: "not-found" }
  | { readonly status: "full" };

/**
 * Persistence port of the album (F8; L11.1, L11.3, L11.4, L11.6, L26). `insert` enforces the per-invitation cap and the
 * pending cap in the same transaction that writes the row, serialized on the invitation row, so two concurrent uploads
 * cannot both take the last slot.
 */
export interface GuestAlbumRepository {
  /**
   * The PUBLISHED invitation of one slug — expired included — and null for a draft, an archived, and an unknown slug
   * (A3, L26). An expired published invitation is still returned on purpose: the upload's own expiry check is what
   * answers the guest-facing closed album (409) for it, so a caller that filtered expiry here would turn a closed album
   * into the invisible 404. `UploadGuestPhotoUseCase` is the caller that relies on it; no public read uses this port.
   */
  findPublishedBySlug(slug: string): Promise<GuestAlbumInvitation | null>;

  /** The invitation while this owner has it; null when no row has this id or another owner has it (A4). */
  findOwnedInvitation(ownerId: string, invitationId: string): Promise<GuestAlbumInvitation | null>;

  /**
   * Stores one PENDING photo in one statement that re-states the invitation is PUBLISHED and unexpired at the
   * database's own clock, and refuses an album that already holds its cap of PENDING and PUBLISHED photos, or its own
   * cap of PENDING ones (L26). Both caps are counted in the same locked transaction, so neither can be raced. `at` is
   * the API's instant, used for the row; the publication and expiry rules are the database's.
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
   * Publishes or hides one photo of one owned invitation, stamping `reviewedAt`, in the transaction that locks the
   * invitation row as `insert` does (L26). Answers the stored photo, `not-found` for a photo of another invitation, of
   * another owner, or a missing one — one answer (A4) — or `full` when the write would pass the album's cap.
   */
  review(
    ownerId: string,
    invitationId: string,
    photoId: string,
    status: GuestPhotoReviewState,
    at: Date,
  ): Promise<ReviewedGuestPhoto>;

  /** One photo with its invitation's owner and status, without any owner scoping: used to decide serving. */
  findForServing(photoId: string): Promise<ServingGuestPhoto | null>;

  /** Every storage key a photo row names, whatever its status, so the cleanup can spot orphan objects (L11.6). */
  listStorageKeys(): Promise<string[]>;

  /**
   * The photos the media retention cleanup retires: those still PENDING, or already HIDDEN, whose state instant —
   * `createdAt` while pending, `reviewedAt` once hidden — is older than `before` (L11.6). Newest last, so a run removes
   * the oldest first. It is a listing of candidates only: `retire` re-checks each one before anything is deleted.
   */
  listRetired(before: Date): Promise<RetiredGuestPhoto[]>;

  /**
   * Removes the rows of photos still retired at `before`, in one statement that re-checks each photo's state and state
   * instant, and answers the rows it removed (L26). A photo the owner published or hid again between the listing and
   * this call keeps its row, so its object is never deleted; only the retention cleanup calls this (L11.6).
   */
  retire(ids: readonly string[], before: Date): Promise<RetiredGuestPhoto[]>;
}

export const GUEST_ALBUM_REPOSITORY = Symbol("GuestAlbumRepository");

/**
 * The part of the album port the media retention cleanup reads (F8; L11.6, L26): the storage keys the whole table names,
 * the photos retired by age, and the conditional removal that keeps a photo published again mid-run. It is narrower than
 * `GuestAlbumRepository` so the cleanup command cannot moderate, insert, or serve a photo.
 */
export interface GuestAlbumCleanup {
  listStorageKeys(): Promise<string[]>;
  listRetired(before: Date): Promise<RetiredGuestPhoto[]>;
  retire(ids: readonly string[], before: Date): Promise<RetiredGuestPhoto[]>;
}
