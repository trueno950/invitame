import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";

import { SessionUserId } from "../../auth/access-control/session-user-id";
import {
  ArchiveInvitationUseCase,
  CreateInvitationDraftUseCase,
  GetOwnInvitationUseCase,
  ListOwnInvitationsUseCase,
  PublishInvitationUseCase,
  UnpublishInvitationUseCase,
  UpdateInvitationContentUseCase,
} from "../application/invitation.use-cases";
// biome-ignore lint/style/useImportType: the global ValidationPipe reads these classes from emitted metadata.
import { CreateInvitationDto, UpdateInvitationContentDto } from "./dto/invitation.dtos";
import {
  type InvitationSummaryResponse,
  mapInvitationError,
  type OwnedInvitationResponse,
  orInvitationSummaryNotFound,
  orOwnedInvitationNotFound,
  toInvitationSummaryResponse,
  toOwnedInvitationResponse,
} from "./invitation.response";

const INVITATION_ID = new ParseUUIDPipe();

/**
 * The signed-in customer's own invitations (M4 T4 and M5 T4; S1, S2, S3, S7, S9, A4). No `@AdminOnly()` and no
 * `@Public()`: the global guard answers 401 without an active session, and every customer may create and edit
 * drafts for free (S6). The owner of a resource is only ever `@SessionUserId()` — the global guard attached it
 * from the stored session — never the path, the query, or the body (S9); the repository scopes every read and
 * write by it, so another customer's id answers 404 like an id that names nothing (A4). A malformed `:id` is
 * refused by `ParseUUIDPipe` before it can reach a port, so PostgreSQL never refuses a bad cast. Nothing is
 * deleted: archiving is the only terminal lifecycle write (S7, A2). Publishing is `POST` (CORS allows it for the
 * trusted origins) and answers 200, because no new resource is created; the published preference itself lives in
 * the database, so no client can publish by changing its own state (S3).
 */
@Controller("invitations")
export class InvitationsController {
  constructor(
    @Inject(CreateInvitationDraftUseCase)
    private readonly createDraft: CreateInvitationDraftUseCase,
    @Inject(ListOwnInvitationsUseCase) private readonly listOwn: ListOwnInvitationsUseCase,
    @Inject(GetOwnInvitationUseCase) private readonly getOwn: GetOwnInvitationUseCase,
    @Inject(UpdateInvitationContentUseCase)
    private readonly updateContent: UpdateInvitationContentUseCase,
    @Inject(ArchiveInvitationUseCase) private readonly archiveInvitation: ArchiveInvitationUseCase,
    @Inject(PublishInvitationUseCase) private readonly publishInvitation: PublishInvitationUseCase,
    @Inject(UnpublishInvitationUseCase)
    private readonly unpublishInvitation: UnpublishInvitationUseCase,
  ) {}

  /** Creates a free DRAFT pinned to a PUBLISHED version: 201 with the owned invitation (S1, S6, S7). */
  @Post()
  async create(
    @SessionUserId() userId: string,
    @Body() body: CreateInvitationDto,
  ): Promise<OwnedInvitationResponse> {
    try {
      return toOwnedInvitationResponse(
        await this.createDraft.execute({
          ownerId: userId,
          templateVersionId: body.templateVersionId,
          packageId: body.packageId,
        }),
      );
    } catch (error) {
      return mapInvitationError(error);
    }
  }

  /** The session user's invitations, newest first; an owner without any gets an empty list (S1). */
  @Get()
  async list(@SessionUserId() userId: string): Promise<InvitationSummaryResponse[]> {
    return (await this.listOwn.execute(userId)).map(toInvitationSummaryResponse);
  }

  /** One of the session user's invitations, with its content and the fields it still lacks (S7). */
  @Get(":id")
  async read(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<OwnedInvitationResponse> {
    return orOwnedInvitationNotFound(await this.getOwn.execute(userId, id));
  }

  /**
   * Replaces the content of a DRAFT, validating every value against the pinned version's schema (S3, S7). `PUT`
   * and not `PATCH`: the whole content is replaced, and the web client calls it from a server action.
   */
  @Put(":id/content")
  async replaceContent(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Body() body: UpdateInvitationContentDto,
  ): Promise<OwnedInvitationResponse> {
    try {
      return orOwnedInvitationNotFound(
        await this.updateContent.execute({ ownerId: userId, id, content: body.content }),
      );
    } catch (error) {
      return mapInvitationError(error);
    }
  }

  /**
   * Archives a DRAFT: it becomes read-only and stays stored (S7, A3). 200 with the summary, because no new
   * resource is created, matching the publish and retire routes of the admin catalog.
   */
  @Post(":id/archive")
  @HttpCode(200)
  async archive(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<InvitationSummaryResponse> {
    try {
      return orInvitationSummaryNotFound(await this.archiveInvitation.execute(userId, id));
    } catch (error) {
      return mapInvitationError(error);
    }
  }

  /**
   * Publishes an owned DRAFT: 200 with the owned invitation and its `publishedAt` (S1, S2, S3, S7). Readiness is
   * the application's rule and reaches the client as 409 `INVITATION_NOT_PUBLISHABLE` with its issues; the
   * payment gate answers 402 `INVITATION_PAYMENT_REQUIRED` in a milestone that charges (S6); an archived
   * invitation is 409 `INVITATION_ALREADY_ARCHIVED`, a published one 409 `INVITATION_ALREADY_PUBLISHED`, and an
   * id the caller does not own is 404 `INVITATION_NOT_FOUND` like an unknown one (A4).
   */
  @Post(":id/publish")
  @HttpCode(200)
  async publish(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<OwnedInvitationResponse> {
    try {
      return orOwnedInvitationNotFound(await this.publishInvitation.execute(userId, id));
    } catch (error) {
      return mapInvitationError(error);
    }
  }

  /**
   * Returns an owned PUBLISHED invitation to DRAFT, so the slug stops resolving and the owner can edit and
   * publish again (S7). 200 with the summary; a draft that was never published is 409
   * `INVITATION_NOT_PUBLISHED`, an archived invitation 409 `INVITATION_ALREADY_ARCHIVED`, and an id the caller
   * does not own 404 (A4).
   */
  @Post(":id/unpublish")
  @HttpCode(200)
  async unpublish(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<InvitationSummaryResponse> {
    try {
      return orInvitationSummaryNotFound(await this.unpublishInvitation.execute(userId, id));
    } catch (error) {
      return mapInvitationError(error);
    }
  }
}
