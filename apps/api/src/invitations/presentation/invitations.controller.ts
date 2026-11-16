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
  Res,
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
  UpdateInvitationFeaturesUseCase,
} from "../application/invitation.use-cases";
import {
  GetRsvpResponsesUseCase,
  UpdateRsvpSettingsUseCase,
} from "../application/invitation-rsvp.use-cases";
// biome-ignore lint/style/useImportType: the pipe needs the classes at runtime.
import {
  CreateInvitationDto,
  UpdateInvitationContentDto,
  UpdateInvitationFeaturesDto,
} from "./dto/invitation.dtos";
// The global ValidationPipe reads these classes from emitted metadata, so they are value imports.
// biome-ignore lint/style/useImportType: the pipe needs the classes at runtime.
import { UpdateRsvpSettingsDto } from "./dto/invitation-rsvp.dtos";
import {
  type InvitationSummaryResponse,
  mapInvitationError,
  type OwnedInvitationResponse,
  orInvitationSummaryNotFound,
  orOwnedInvitationNotFound,
  toInvitationSummaryResponse,
  toOwnedInvitationResponse,
} from "./invitation.response";
import {
  mapRsvpError,
  orRsvpReadNotFound,
  orRsvpSettingsNotFound,
  type RsvpReadResponse,
  type RsvpSettingsResponse,
  rsvpCsvAttachment,
  rsvpInvitationNotFound,
} from "./invitation-rsvp.response";

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
    @Inject(UpdateInvitationFeaturesUseCase)
    private readonly updateFeatures: UpdateInvitationFeaturesUseCase,
    @Inject(ArchiveInvitationUseCase) private readonly archiveInvitation: ArchiveInvitationUseCase,
    @Inject(PublishInvitationUseCase) private readonly publishInvitation: PublishInvitationUseCase,
    @Inject(UnpublishInvitationUseCase)
    private readonly unpublishInvitation: UnpublishInvitationUseCase,
    @Inject(UpdateRsvpSettingsUseCase)
    private readonly updateRsvpSettings: UpdateRsvpSettingsUseCase,
    @Inject(GetRsvpResponsesUseCase)
    private readonly getRsvpResponses: GetRsvpResponsesUseCase,
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
   * Replaces the feature data of a DRAFT or a PUBLISHED invitation (F1, F6; S4, S7): the time zone, the WhatsApp
   * phone, and the playlist link. Creator-owned and refused for an archived invitation exactly like a content
   * save; `null` or an empty `whatsappPhone` clears the stored phone, and `null` or an empty `playlistUrl` clears
   * the stored link. `PUT` and not `PATCH`: the whole feature data is replaced.
   */
  @Put(":id/features")
  async replaceFeatures(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Body() body: UpdateInvitationFeaturesDto,
  ): Promise<OwnedInvitationResponse> {
    try {
      return orOwnedInvitationNotFound(
        await this.updateFeatures.execute({
          ownerId: userId,
          id,
          timeZone: body.timeZone,
          whatsappPhone: body.whatsappPhone,
          playlistUrl: body.playlistUrl,
        }),
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

  /**
   * Replaces the RSVP settings of a DRAFT or a PUBLISHED invitation (M6 G1; S4): the optional deadline and the party
   * limit of 1 to 10. Creator-owned and refused for an archived invitation exactly like a content or features save
   * (409 `INVITATION_NOT_EDITABLE`); a deadline the domain cannot read as an ISO instant, or a party limit outside
   * its bounds, is 400 `INVALID_RSVP_SETTINGS` with the issues. `PUT` and not `PATCH`: the whole pair is replaced,
   * and `null` clears the deadline.
   */
  @Put(":id/rsvp-settings")
  async replaceRsvpSettings(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Body() body: UpdateRsvpSettingsDto,
  ): Promise<RsvpSettingsResponse> {
    try {
      return orRsvpSettingsNotFound(
        await this.updateRsvpSettings.execute({
          ownerId: userId,
          id,
          deadline: body.deadline,
          partyLimit: body.partyLimit,
        }),
      );
    } catch (error) {
      return mapRsvpError(error);
    }
  }

  /**
   * The RSVP settings, every response newest first, and the totals of one owned invitation (M6 G1; S1, S4): the
   * confirmed people, the declines, and the number of responses. Owner-only; another customer's id answers 404
   * `INVITATION_NOT_FOUND` like an unknown one (A4). An archived invitation stays readable: archiving is read-only,
   * never erased (A2).
   */
  @Get(":id/rsvp")
  async readRsvp(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<RsvpReadResponse> {
    return orRsvpReadNotFound(await this.getRsvpResponses.execute(userId, id));
  }

  /**
   * The same read as a CSV download (M6 G1; S1, S4). The file is an attachment, is never cached, and is
   * spreadsheet-safe: every cell is quoted when it must be, quotes are doubled, and a cell a spreadsheet would run
   * as a formula is prefixed with an apostrophe. Owner-only, with the same 404 as the JSON read (A4).
   */
  @Get(":id/rsvp.csv")
  async exportRsvp(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Res({ passthrough: true }) reply: RsvpCsvReply,
  ): Promise<string> {
    // The header is set before the read, so it is on the 404 too.
    reply.setHeader("Cache-Control", "no-store");
    const read = await this.getRsvpResponses.execute(userId, id);
    if (read === null) {
      // The same 404 every owner route answers, so a foreign invitation is indistinguishable from an unknown one.
      rsvpInvitationNotFound();
    }
    const attachment = rsvpCsvAttachment(read);
    reply.setHeader("Content-Type", "text/csv; charset=utf-8");
    reply.setHeader("Content-Disposition", `attachment; filename="${attachment.filename}"`);

    return attachment.body;
  }
}

/** The response object the CSV route sets headers on; the Express reply satisfies it. */
interface RsvpCsvReply {
  setHeader(name: string, value: string): void;
}
