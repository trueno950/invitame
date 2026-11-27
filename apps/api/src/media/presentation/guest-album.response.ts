import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";

import type { GuestAlbumRead, GuestPhotoView } from "../application/guest-album.use-cases";
import {
  GuestAlbumClosedError,
  GuestAlbumFullError,
  GuestAlbumPendingFullError,
  GuestAlbumRateLimitedError,
  InvalidGuestPhotoError,
} from "../application/guest-album.errors";
import { GUEST_PHOTO_REVIEW_STATE_ISSUE, isGuestPhotoReviewState } from "../domain/guest-photo";
import { mapMediaError } from "./media.response";

// The stable REST shapes of the album routes (F8; S2.8, L11.3, L11.4, L11.6). The owner's read carries every photo of one
// invitation with its state and one count per state; the owner's write answers the photo it changed. The public upload
// answers one minimal body — no id, no count, and nothing another guest could read — because a photo is pending until
// the owner publishes it.
//
// Error codes: `INVALID_GUEST_PHOTO` carries the domain's issues (400), `GUEST_ALBUM_CLOSED` is 409 because the
// invitation is visible but its album takes no photo, `GUEST_ALBUM_FULL` is 409 because the invitation already holds its
// cap of pending and published photos, `GUEST_ALBUM_PENDING_FULL` is 409 because too many photos are waiting for review
// (L26), `GUEST_ALBUM_RATE_LIMITED` is 429, and a photo that names nothing of this invitation is `GUEST_PHOTO_NOT_FOUND`
// (404). An error this module does not own is mapped by the media error mapper, so a storage failure keeps its 503 and a
// foreign invitation keeps its own 404 (A4).

/** One photo as the owner's screen reads it: its row, its object's URL, its state, and its dates. */
export interface GuestPhotoResponse {
  id: string;
  url: string;
  uploaderName: string | null;
  status: "PENDING" | "PUBLISHED" | "HIDDEN";
  createdAt: string;
  reviewedAt: string | null;
}

/** The owner's read: every photo newest first, and how many are pending, published, and hidden (L11.6). */
export interface GuestAlbumReadResponse {
  photos: GuestPhotoResponse[];
  pendingCount: number;
  publishedCount: number;
  hiddenCount: number;
}

/** The one public success body (L11.3): no id, no URL, and nothing another guest could read. */
export interface GuestPhotoAcceptedResponse {
  status: "received";
}

export const GUEST_PHOTO_ACCEPTED_RESPONSE: GuestPhotoAcceptedResponse = { status: "received" };

export function toGuestPhotoResponse(photo: GuestPhotoView): GuestPhotoResponse {
  return {
    id: photo.id,
    url: photo.url,
    uploaderName: photo.uploaderName,
    status: photo.status,
    createdAt: photo.createdAt.toISOString(),
    reviewedAt: photo.reviewedAt?.toISOString() ?? null,
  };
}

export function toGuestAlbumReadResponse(read: GuestAlbumRead): GuestAlbumReadResponse {
  return {
    photos: read.photos.map(toGuestPhotoResponse),
    pendingCount: read.pendingCount,
    publishedCount: read.publishedCount,
    hiddenCount: read.hiddenCount,
  };
}

/**
 * The answer for a read of an invitation the session user does not own, or of an unknown id (A4). One 404 body covers
 * every case, so nothing tells a foreign invitation apart from an unknown one.
 */
export function orGuestAlbumReadNotFound(stored: GuestAlbumRead | null): GuestAlbumReadResponse {
  if (stored === null) {
    guestAlbumInvitationNotFound();
  }
  return toGuestAlbumReadResponse(stored);
}

/** The single 404 of the album reads: no row has this id, or another customer has it (A4). */
export function guestAlbumInvitationNotFound(): never {
  throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
}

/** The 404 of a photo id that names nothing of this invitation (A4). */
export function guestPhotoNotFound(): never {
  throw new NotFoundException({ code: "GUEST_PHOTO_NOT_FOUND" });
}

/** The first of the two 404s: a foreign or unknown invitation, then a photo that is not this invitation's. */
export function orReviewedGuestPhoto(
  result:
    | { readonly status: "ok"; readonly photo: GuestPhotoView }
    | { readonly status: "invitation-not-found" }
    | { readonly status: "photo-not-found" },
): GuestPhotoResponse {
  if (result.status === "invitation-not-found") {
    guestAlbumInvitationNotFound();
  }
  if (result.status === "photo-not-found") {
    guestPhotoNotFound();
  }
  return toGuestPhotoResponse(result.photo);
}

/** The state the owner asked for, or the 400 the domain states: PENDING is never a value a request may set. */
export function orReviewState(value: unknown): "PUBLISHED" | "HIDDEN" {
  if (!isGuestPhotoReviewState(value)) {
    throw new BadRequestException({
      code: "INVALID_GUEST_PHOTO_REVIEW",
      issues: [GUEST_PHOTO_REVIEW_STATE_ISSUE],
    });
  }
  return value;
}

/**
 * Maps an album error to its HTTP outcome; an error this module does not own goes to the media mapper unchanged, so a
 * storage failure is still 503 and a refused file is still 400.
 */
export function mapGuestAlbumError(error: unknown): never {
  if (error instanceof InvalidGuestPhotoError) {
    throw new BadRequestException({
      code: "INVALID_GUEST_PHOTO",
      issues: [...error.issues],
    });
  }
  if (error instanceof GuestAlbumClosedError) {
    throw new ConflictException({ code: "GUEST_ALBUM_CLOSED" });
  }
  if (error instanceof GuestAlbumFullError) {
    throw new ConflictException({ code: "GUEST_ALBUM_FULL" });
  }
  if (error instanceof GuestAlbumPendingFullError) {
    throw new ConflictException({ code: "GUEST_ALBUM_PENDING_FULL" });
  }
  if (error instanceof GuestAlbumRateLimitedError) {
    throw new HttpException({ code: "GUEST_ALBUM_RATE_LIMITED" }, HttpStatus.TOO_MANY_REQUESTS);
  }
  return mapMediaError(error);
}
