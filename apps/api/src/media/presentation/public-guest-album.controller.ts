import type { IncomingMessage } from "node:http";
import { Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { Public } from "../../auth/access-control/access-control";
import type { RuntimeEnvironment } from "../../config/environment";
import {
  type ClientAddressRequest,
  clientAddressOf,
} from "../../invitations/presentation/client-address";
import { InvitationLockGuard } from "../../invitations/presentation/invitation-lock.guard";
import { publicInvitationNotFound } from "../../invitations/presentation/invitation.response";
import { UploadGuestPhotoUseCase } from "../application/guest-album.use-cases";
import { MAX_UPLOAD_REQUEST_BYTES } from "../domain/media-asset";
import {
  GUEST_PHOTO_ACCEPTED_RESPONSE,
  type GuestPhotoAcceptedResponse,
  mapGuestAlbumError,
} from "./guest-album.response";
import { GUEST_PHOTO_FIELDS, MultipartFormError, readMultipartUpload } from "./multipart-form";
import { mapMultipartError } from "./media.response";

/**
 * The guests' album upload route (F8; S2.8, L11.3). `@Public()` is deliberate: a guest has no session, so the global
 * guard must not even read one, and a broken session store cannot close the album. The slug is the only input that names
 * the invitation, and it is passed through untouched: the use case refuses a malformed one before any query, so every
 * invisible case — a malformed, unknown, draft, archived, or expired slug — answers the same guest-facing 404 the page
 * itself answers (A3).
 *
 * The photo arrives as multipart because the web sends a file, exactly like the owner's own upload: the strict reader
 * bounds the whole body at 16 MB (a 413 past it) and accepts only `file` and `uploaderName`, so a field one route
 * accepts is refused on the other. Nothing about the guest's address, session, or user is stored: the address is read
 * only to count the hourly per-person limit, and the rate limiter hashes it before writing the `RateLimit` key.
 *
 * F13 (S2.13, L18.2) adds the password gate: the class declares `InvitationLockGuard`, so a locked invitation answers the
 * locked state and stores no object, no row, and no count — the guard refuses the request before this handler reads the
 * body. There is no exemption here: an anonymous upload is exactly what an access code must protect.
 */
@Controller("public/invitations")
@Public()
@UseGuards(InvitationLockGuard)
export class PublicGuestAlbumController {
  constructor(
    @Inject(UploadGuestPhotoUseCase)
    private readonly upload: UploadGuestPhotoUseCase,
    @Inject(ConfigService)
    private readonly config: ConfigService<RuntimeEnvironment, true>,
  ) {}

  /**
   * Stores one guest's photo, PENDING until the owner publishes it (L11.3): 202 with the one minimal body. A slug the
   * page itself would not render is the same 404 as the read; a visible invitation whose album takes no photo (the
   * package does not grant `GUEST_ALBUM`, or the invitation expired) is 409 `GUEST_ALBUM_CLOSED`; an address over its
   * hourly cap is 429 `GUEST_ALBUM_RATE_LIMITED`; an invitation whose album already holds its 300 counted photos is 409
   * `GUEST_ALBUM_FULL`; one whose pending queue already holds its 100 photos is 409 `GUEST_ALBUM_PENDING_FULL` (L26); and
   * a file the domain refuses is 400 `INVALID_GUEST_PHOTO` with its issues. A refused upload stores nothing, its object
   * included.
   */
  @Post(":slug/photos")
  @HttpCode(202)
  async uploadPhoto(
    @Param("slug") slug: string,
    @Req() request: IncomingMessage,
  ): Promise<GuestPhotoAcceptedResponse> {
    try {
      const form = await readMultipartUpload(request, {
        maxBytes: MAX_UPLOAD_REQUEST_BYTES,
        fields: GUEST_PHOTO_FIELDS,
      });
      const stored = await this.upload.execute({
        slug,
        uploaderName: form.fields.get("uploaderName") ?? null,
        bytes: form.file.bytes,
        clientAddress: clientAddressOf(request as ClientAddressRequest, this.clientIpHeader()),
      });

      // An invisible slug is the same 404 the page answers, so the route never confirms that an invitation exists.
      return stored ? GUEST_PHOTO_ACCEPTED_RESPONSE : publicInvitationNotFound();
    } catch (error) {
      return error instanceof MultipartFormError
        ? mapMultipartError(error)
        : mapGuestAlbumError(error);
    }
  }

  /**
   * The lower-case header that names the client address for the per-address limit: the same validated header Better
   * Auth's rate limits read, so the deployment configures it once.
   */
  private clientIpHeader(): string {
    return this.config.get("AUTH_CLIENT_IP", { infer: true }).header;
  }
}
