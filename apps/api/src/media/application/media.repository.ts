import type { InvitationStatus } from "../../invitations/domain/invitation-lifecycle";
import type { MediaKind } from "../domain/media-asset";

// The persistence port of invitation media (M8 S4). Ownership is never checked outside the statement that reads or
// writes the row: an own-invitation read answers null for another customer's id exactly like an id that names
// nothing (A4), and every guarded write repeats the owner and the editable statuses in its own `WHERE`, so a
// concurrent archive can never slip a write through (A2). Binaries never pass through this port: a row names its
// object by `storageKey`, and the object lives in the storage adapter.

/** One stored asset, as the database holds it. `kind` and `status` are the stored labels, not Prisma enum names. */
export interface MediaAssetRecord {
  id: string;
  invitationId: string;
  kind: MediaKind;
  storageKey: string;
  mime: string;
  byteSize: number;
  width: number;
  height: number;
  /** The gallery order, or null for the one main photo (S4). */
  position: number | null;
  alt: string | null;
  status: "stored" | "deleted";
  createdAt: Date;
  updatedAt: Date;
}

/** What an upload needs from the invitation: the owner's row, its lifecycle state, and its pinned package. */
export interface OwnedMediaInvitation {
  id: string;
  status: InvitationStatus;
  packageId: string;
}

/** A new asset, built by the application from validated values and a generated id. */
export interface NewMediaAsset {
  id: string;
  kind: MediaKind;
  storageKey: string;
  mime: string;
  byteSize: number;
  width: number;
  height: number;
  /** Null for the main photo; the adapter assigns the next gallery position in the same transaction. */
  position: number | null;
  alt: string | null;
}

/** The row an upload stored, plus the main photo it replaced (already marked deleted) when there was one. */
export interface InsertedMedia {
  asset: MediaAssetRecord;
  replaced: MediaAssetRecord | null;
}

/** What serving one asset needs: the row and the invitation state that decides whether it may be shown. */
export interface ServingMedia {
  asset: MediaAssetRecord;
  invitation: { ownerId: string; status: InvitationStatus };
}

/**
 * Persistence port of invitation media (S4). `insert` enforces the two limits of S4 in the same transaction that
 * writes the row, serialized on the invitation row, so two concurrent uploads cannot both take the last slot.
 */
export interface MediaRepository {
  /** The invitation while this owner has it; null when no row has this id or another owner has it (A4). */
  findOwnedInvitation(ownerId: string, invitationId: string): Promise<OwnedMediaInvitation | null>;

  /** Every stored asset of one owned invitation, gallery ordered by position; null for a foreign id (A4). */
  listStored(ownerId: string, invitationId: string): Promise<MediaAssetRecord[] | null>;

  /**
   * Stores one asset in one transaction that repeats ownership and the editable statuses, marks a previous main
   * photo deleted, and refuses a gallery photo over 12 or an invitation over 40 stored assets. Null when the
   * invitation is missing or foreign, so nothing is written; throws `InvitationNotEditableError` when it is
   * archived and `MediaLimitExceededError` when a limit is reached, and writes nothing in either case.
   */
  insert(
    ownerId: string,
    invitationId: string,
    asset: NewMediaAsset,
    at: Date,
  ): Promise<InsertedMedia | null>;

  /** Replaces one stored asset's alt text; null when it is missing, foreign, or already deleted (A4). */
  updateAlt(
    ownerId: string,
    invitationId: string,
    assetId: string,
    alt: string | null,
    at: Date,
  ): Promise<MediaAssetRecord | null>;

  /**
   * Moves one gallery photo to `index` and rewrites the gallery order 0..n-1 in one transaction, scoped by owner
   * and the editable statuses. Null when the asset or the invitation is missing or foreign; the whole gallery's
   * stored assets when the move succeeded.
   */
  moveGallery(
    ownerId: string,
    invitationId: string,
    assetId: string,
    index: number,
    at: Date,
  ): Promise<MediaAssetRecord[] | null>;

  /**
   * Marks one asset deleted in one statement whose `WHERE` names the owner and the editable statuses (S4). Null
   * when it is missing, foreign, or already deleted (A4); throws `InvitationNotEditableError` for an archived
   * invitation (A2). The object is deleted by the caller, and a failed delete leaves this row for cleanup.
   */
  markDeleted(
    ownerId: string,
    invitationId: string,
    assetId: string,
    at: Date,
  ): Promise<MediaAssetRecord | null>;

  /** One asset with its invitation's owner and status, without any owner scoping: used to decide serving. */
  findForServing(assetId: string): Promise<ServingMedia | null>;

  /** The stored gallery photos of one invitation, ordered by position: the public read's source (S4). */
  listPublicGallery(invitationId: string): Promise<MediaAssetRecord[]>;

  /** Every row marked deleted, for the cleanup command (S4). */
  listDeleted(): Promise<MediaAssetRecord[]>;

  /** Every storage key any row names, whatever its status, so the cleanup can spot orphan objects (S4). */
  listStorageKeys(): Promise<string[]>;

  /** Removes the rows of assets whose object is gone; only the cleanup command calls this (S4). */
  remove(ids: readonly string[]): Promise<void>;
}

export const MEDIA_REPOSITORY = Symbol("MediaRepository");
