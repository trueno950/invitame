import {
  ConflictException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";

import { InvitationNotEditableError } from "../../invitations/domain/invitation.errors";
import {
  GalleryNotAvailableError,
  InvalidMediaUpdateError,
  InvalidMediaUploadError,
  MediaLimitExceededError,
  MediaNotFoundError,
} from "../application/media.errors";
import type { MediaAssetView } from "../application/media.use-cases";
import { MediaStorageError } from "../application/media-storage";
import type { MultipartFormError } from "./multipart-form";

// The stable REST shapes of invitation media (M8 S4). `ownerId`, the storage key, and the byte size are deliberately
// absent: the URL is the only way to reach the bytes, and an asset the caller may not see answers the same 404 as an
// id that names nothing (A4). A provider failure is one 503 that never names the provider, the endpoint, the bucket,
// or the credential.

/** One asset as the creator's editor sees it. */
export interface MediaAssetResponse {
  id: string;
  kind: "main-photo" | "gallery";
  url: string;
  width: number;
  height: number;
  alt: string | null;
  position: number | null;
  createdAt: string;
}

/** The one media 404: missing, foreign, deleted, unpublished, and a foreign asset are indistinguishable (S4). */
export function mediaNotFound(): NotFoundException {
  return new NotFoundException({ code: "MEDIA_NOT_FOUND", message: "Media not found." });
}

export function toMediaAssetResponse(view: MediaAssetView): MediaAssetResponse {
  return {
    id: view.id,
    kind: view.kind,
    url: view.url,
    width: view.width,
    height: view.height,
    alt: view.alt,
    position: view.position,
    createdAt: view.createdAt.toISOString(),
  };
}

/**
 * Turns a refused media operation into its HTTP answer, and rethrows anything unrecognized so an unexpected bug is
 * not disguised as a client error. Every body carries a stable `code` and a fixed English message; a refused upload
 * or update also carries the domain's `issues`.
 */
export function mapMediaError(error: unknown): never {
  if (error instanceof MediaNotFoundError) {
    throw mediaNotFound();
  }
  if (error instanceof InvitationNotEditableError) {
    throw new ConflictException({
      code: "INVITATION_NOT_EDITABLE",
      message: "The invitation is archived and cannot be changed.",
      status: error.status,
    });
  }
  if (error instanceof GalleryNotAvailableError) {
    throw new ConflictException({
      code: "GALLERY_NOT_AVAILABLE",
      message: "The gallery is not available for this invitation.",
    });
  }
  if (error instanceof MediaLimitExceededError) {
    throw new ConflictException({
      code: "MEDIA_LIMIT_REACHED",
      message: "The media limit of this invitation is reached.",
      limit: error.limit,
    });
  }
  if (error instanceof InvalidMediaUploadError) {
    throw new HttpException(
      {
        code: "INVALID_MEDIA_UPLOAD",
        message: "The upload was refused.",
        issues: [...error.issues],
      },
      400,
    );
  }
  if (error instanceof InvalidMediaUpdateError) {
    throw new HttpException(
      {
        code: "INVALID_MEDIA_UPDATE",
        message: "The media update was refused.",
        issues: [...error.issues],
      },
      400,
    );
  }
  if (error instanceof MediaStorageError) {
    // One answer for every storage failure: no provider, endpoint, bucket, key, or credential is echoed.
    throw new HttpException(
      { code: "MEDIA_STORAGE_UNAVAILABLE", message: "Media storage is unavailable." },
      503,
    );
  }

  throw error;
}

/** Turns a multipart refusal into its answer; the reader already chose the status and the code. */
export function mapMultipartError(error: MultipartFormError): never {
  if (error.status === 413) {
    throw new PayloadTooLargeException({ code: error.code, message: error.message });
  }
  if (error.status === 415) {
    throw new UnsupportedMediaTypeException({ code: error.code, message: error.message });
  }
  throw new HttpException({ code: error.code, message: error.message }, 400);
}
