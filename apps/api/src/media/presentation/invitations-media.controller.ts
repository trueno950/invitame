import type { IncomingMessage } from "node:http";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";

import { SessionUserId } from "../../auth/access-control/session-user-id";
import {
  DeleteMediaUseCase,
  ListOwnMediaUseCase,
  type MediaUploadLimits,
  ReadOwnMediaLimitsUseCase,
  UpdateMediaUseCase,
  UploadMediaUseCase,
} from "../application/media.use-cases";
import { MAX_UPLOAD_REQUEST_BYTES } from "../domain/media-asset";
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { UpdateMediaDto } from "./dto/update-media.dto";
import {
  type MediaAssetResponse,
  type MediaUploadLimitsResponse,
  mapMediaError,
  mapMultipartError,
  toMediaAssetResponse,
  toMediaUploadLimitsResponse,
} from "./media.response";
import { MultipartFormError, readMultipartUpload } from "./multipart-form";

const INVITATION_ID = new ParseUUIDPipe();
const ASSET_ID = new ParseUUIDPipe();

/**
 * The creator's media routes (M8 S4). No `@AdminOnly()` and no `@Public()`: the global guard answers 401 without an
 * active session, and the owner of the invitation is only ever `@SessionUserId()`, never the path or the body (S9).
 * The repository scopes every read and write by that owner, so another customer's invitation or asset answers the
 * same 404 as an id that names nothing (A4). Malformed ids are refused by `ParseUUIDPipe` before a port is asked.
 *
 * The upload is multipart because the web sends a file: it is read by strict `readMultipartUpload`, which bounds the
 * whole body at 16 MB (a 413 past it) and accepts only `file`, `kind`, and `alt`. Every other route keeps its
 * existing JSON body limit; this one route alone parses form data. The 16 MB leaves room for the widest configured
 * upload (15 MB) plus the boundary, the fields, and the part headers (S5 «Tamaño de foto»).
 */
@Controller("invitations/:id/media")
export class InvitationsMediaController {
  constructor(
    @Inject(UploadMediaUseCase) private readonly upload: UploadMediaUseCase,
    @Inject(ListOwnMediaUseCase) private readonly listOwn: ListOwnMediaUseCase,
    @Inject(ReadOwnMediaLimitsUseCase) private readonly readLimits: ReadOwnMediaLimitsUseCase,
    @Inject(UpdateMediaUseCase) private readonly updateAsset: UpdateMediaUseCase,
    @Inject(DeleteMediaUseCase) private readonly deleteMedia: DeleteMediaUseCase,
  ) {}

  /**
   * Uploads one photo (S4): 201 with the asset and its public URL. A gallery photo needs the pinned package to grant
   * `GALLERY` (409 `GALLERY_NOT_AVAILABLE`); the limits answer 409 `MEDIA_LIMIT_REACHED`; a refused file is 400
   * `INVALID_MEDIA_UPLOAD` with its issues; an archived invitation is 409 `INVITATION_NOT_EDITABLE`; a foreign one is
   * 404 `MEDIA_NOT_FOUND`; and a storage failure is 503 `MEDIA_STORAGE_UNAVAILABLE`.
   */
  @Post()
  @HttpCode(201)
  async create(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Req() request: IncomingMessage,
  ): Promise<MediaAssetResponse> {
    try {
      const form = await readMultipartUpload(request, { maxBytes: MAX_UPLOAD_REQUEST_BYTES });
      const view = await this.upload.execute({
        ownerId: userId,
        invitationId: id,
        kind: form.fields.get("kind"),
        alt: form.fields.get("alt") ?? null,
        bytes: form.file.bytes,
      });

      return toMediaAssetResponse(view);
    } catch (error) {
      return error instanceof MultipartFormError ? mapMultipartError(error) : mapMediaError(error);
    }
  }

  /**
   * The stored assets of one owned invitation (S4), the main photo first and the gallery in position order. The
   * owner read exposes media only through this route: no invitation response carries a storage key or a media row.
   */
  @Get()
  async list(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<MediaAssetResponse[]> {
    try {
      return (await this.listOwn.execute(userId, id)).map(toMediaAssetResponse);
    } catch (error) {
      return mapMediaError(error);
    }
  }

  /**
   * The upload bound of one owned invitation (M9 T13; S5, S8), in bytes: the settings row's `maxUploadMegabytes` read
   * at the moment of the call. The owner's page refuses a photo over it before reading it and states the size it
   * actually applies; the upload itself checks the same setting again, so this answer is a courtesy, never the guard.
   * Another customer's invitation, an unknown id, and a malformed id are the one media 404 (A4).
   */
  @Get("limits")
  async limits(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<MediaUploadLimitsResponse> {
    try {
      const limits: MediaUploadLimits = await this.readLimits.execute(userId, id);

      return toMediaUploadLimitsResponse(limits);
    } catch (error) {
      return mapMediaError(error);
    }
  }

  /**
   * Replaces the alt text and/or moves a gallery photo (S4). 200 with the asset; a refused value is 400
   * `INVALID_MEDIA_UPDATE` with its issues, an archived invitation is 409 `INVITATION_NOT_EDITABLE`, and a missing,
   * foreign, or deleted asset is 404 `MEDIA_NOT_FOUND` like an unknown id (A4).
   */
  @Patch(":assetId")
  async update(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Param("assetId", ASSET_ID) assetId: string,
    @Body() body: UpdateMediaDto,
  ): Promise<MediaAssetResponse> {
    try {
      return toMediaAssetResponse(
        await this.updateAsset.execute({
          ownerId: userId,
          invitationId: id,
          assetId,
          ...(body.alt === undefined ? {} : { alt: body.alt }),
          ...(body.position === undefined ? {} : { position: body.position }),
        }),
      );
    } catch (error) {
      return mapMediaError(error);
    }
  }

  /**
   * Removes one asset (S4): the row is marked `deleted` first and the object deleted after it, so a failed object
   * delete leaves a row for `pnpm media:cleanup` and this route still answers 200 with `{ status: "deleted" }`.
   * Another customer's asset is the same 404 as an unknown one (A4).
   */
  @Delete(":assetId")
  @HttpCode(200)
  async remove(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Param("assetId", ASSET_ID) assetId: string,
  ): Promise<{ status: "deleted" }> {
    try {
      await this.deleteMedia.execute(userId, id, assetId);

      return { status: "deleted" };
    } catch (error) {
      return mapMediaError(error);
    }
  }
}
