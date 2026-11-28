import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from "@nestjs/common";

import {
  InvitationAccessGuard,
  RequireInvitationPermission,
} from "../../collaborators/presentation/invitation-access.guard";
import { InvitationOwnerId } from "../../collaborators/presentation/invitation-scope";
import {
  GetGuestAlbumUseCase,
  ReviewGuestPhotoUseCase,
} from "../application/guest-album.use-cases";
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { ReviewGuestPhotoDto } from "./dto/review-guest-photo.dto";
import {
  type GuestAlbumReadResponse,
  type GuestPhotoResponse,
  mapGuestAlbumError,
  orGuestAlbumReadNotFound,
  orReviewState,
  orReviewedGuestPhoto,
} from "./guest-album.response";

/**
 * The owner's album screen (F8; L11.6). No `@AdminOnly()` and no `@Public()`: the global guard answers 401 without an
 * active session, and the owner of the invitation is only ever `@SessionUserId()`, never the path or the body (S9). The
 * repository scopes every read and write by that owner, so another customer's invitation — and another owner's photo —
 * answers the same 404 as an id that names nothing (A4).
 *
 * Moderation is never gated by the catalog: a package that stopped granting `GUEST_ALBUM` still answers what the
 * invitation already received, because the owner's own screen must never become unreachable after a catalog change. The
 * `:photoId` is not a `ParseUUIDPipe` on purpose: a value that is not even a uuid answers the photo's 404, so the screen
 * cannot tell a malformed id apart from a missing one.
 */
@Controller("invitations/:id/guest-photos")
@UseGuards(InvitationAccessGuard)
export class InvitationsGuestAlbumController {
  constructor(
    @Inject(GetGuestAlbumUseCase) private readonly getAlbum: GetGuestAlbumUseCase,
    @Inject(ReviewGuestPhotoUseCase) private readonly reviewPhoto: ReviewGuestPhotoUseCase,
  ) {}

  /**
   * Every photo of one owned invitation, pending and hidden together, with one count per state (L11.6). Owner-only;
   * another customer's id answers 404 `INVITATION_NOT_FOUND` like an unknown one (A4). An archived invitation stays
   * readable: archiving is read-only, never erased (A2).
   */
  @Get()
  @RequireInvitationPermission("EDIT_CONTENT")
  async read(
    @InvitationOwnerId() ownerId: string,
    @Param("id") id: string,
  ): Promise<GuestAlbumReadResponse> {
    return orGuestAlbumReadNotFound(await this.getAlbum.execute(ownerId, id));
  }

  /**
   * Publishes one photo, or hides it again (L11.6): 200 with the photo. Owner-only and reversible — nothing is deleted
   * here — with the same two 404s for a foreign invitation (A4) and for a photo that is not this invitation's. A state
   * the owner may not set is 400 `INVALID_GUEST_PHOTO_REVIEW` with its issue, and a show again past the album's cap is
   * 409 `GUEST_ALBUM_FULL` (L26).
   */
  @Patch(":photoId")
  @RequireInvitationPermission("EDIT_CONTENT")
  async review(
    @InvitationOwnerId() ownerId: string,
    @Param("id") id: string,
    @Param("photoId") photoId: string,
    @Body() body: ReviewGuestPhotoDto,
  ): Promise<GuestPhotoResponse> {
    try {
      return orReviewedGuestPhoto(
        await this.reviewPhoto.execute({
          ownerId: ownerId,
          invitationId: id,
          photoId,
          status: orReviewState(body.status),
        }),
      );
    } catch (error) {
      return mapGuestAlbumError(error);
    }
  }
}
