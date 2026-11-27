import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
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
  CheckInGuestUseCase,
  CreateGuestUseCase,
  DeleteGuestUseCase,
  GetAttendanceExportUseCase,
  ListGuestsUseCase,
  RotateGuestTokenUseCase,
  UpdateGuestUseCase,
} from "../application/invitation-guest.use-cases";
import {
  ClearInvitationPlaceUseCase,
  SearchPlacesUseCase,
  UpdateInvitationPlaceUseCase,
} from "../application/invitation-place.use-cases";
import {
  GetRsvpResponsesUseCase,
  UpdateRsvpSettingsUseCase,
} from "../application/invitation-rsvp.use-cases";
import {
  GetGuestbookEntriesUseCase,
  SetGuestbookEntryHiddenUseCase,
} from "../application/invitation-guestbook.use-cases";
import type { PlacePoint } from "../domain/invitation-place";
// biome-ignore lint/style/useImportType: the pipe needs the classes at runtime.
import {
  CreateInvitationDto,
  UpdateInvitationContentDto,
  UpdateInvitationFeaturesDto,
  UpdateInvitationPlaceDto,
} from "./dto/invitation.dtos";
// biome-ignore lint/style/useImportType: the pipe needs the classes at runtime.
import { CheckInGuestDto, CreateGuestDto, UpdateGuestDto } from "./dto/invitation-guest.dtos";
// The global ValidationPipe reads these classes from emitted metadata, so they are value imports.
// biome-ignore lint/style/useImportType: the pipe needs the classes at runtime.
import { UpdateRsvpSettingsDto } from "./dto/invitation-rsvp.dtos";
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { UpdateGuestbookEntryDto } from "./dto/invitation-guestbook.dtos";
import {
  type InvitationListItemResponse,
  type InvitationSummaryResponse,
  mapInvitationError,
  type OwnedInvitationResponse,
  orInvitationSummaryNotFound,
  orOwnedInvitationNotFound,
  orPlaceSuggestionsNotFound,
  toInvitationListItemResponse,
  toOwnedInvitationResponse,
} from "./invitation.response";
import {
  type DeletedGuestResponse,
  type GuestCheckInResponse,
  type GuestListResponse,
  type GuestResponseItem,
  type GuestWithTokenResponse,
  mapGuestError,
  orDeletedGuestResponse,
  orGuestCheckInResponse,
  orGuestListNotFound,
  orGuestResponseItem,
  orGuestWithTokenResponse,
} from "./invitation-guest.response";
import {
  type GuestbookEntryResponse,
  type GuestbookReadResponse,
  mapGuestbookError,
  orGuestbookEntry,
  orGuestbookReadNotFound,
} from "./invitation-guestbook.response";
import {
  mapRsvpError,
  orRsvpReadNotFound,
  orRsvpSettingsNotFound,
  type RsvpReadResponse,
  type RsvpSettingsResponse,
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
    @Inject(SearchPlacesUseCase) private readonly searchPlaces: SearchPlacesUseCase,
    @Inject(UpdateInvitationPlaceUseCase)
    private readonly updatePlace: UpdateInvitationPlaceUseCase,
    @Inject(ClearInvitationPlaceUseCase)
    private readonly clearPlace: ClearInvitationPlaceUseCase,
    @Inject(ArchiveInvitationUseCase) private readonly archiveInvitation: ArchiveInvitationUseCase,
    @Inject(PublishInvitationUseCase) private readonly publishInvitation: PublishInvitationUseCase,
    @Inject(UnpublishInvitationUseCase)
    private readonly unpublishInvitation: UnpublishInvitationUseCase,
    @Inject(UpdateRsvpSettingsUseCase)
    private readonly updateRsvpSettings: UpdateRsvpSettingsUseCase,
    @Inject(GetRsvpResponsesUseCase)
    private readonly getRsvpResponses: GetRsvpResponsesUseCase,
    @Inject(GetGuestbookEntriesUseCase)
    private readonly getGuestbookEntries: GetGuestbookEntriesUseCase,
    @Inject(SetGuestbookEntryHiddenUseCase)
    private readonly setGuestbookEntryHidden: SetGuestbookEntryHiddenUseCase,
    @Inject(ListGuestsUseCase) private readonly listGuests: ListGuestsUseCase,
    @Inject(CreateGuestUseCase) private readonly createGuest: CreateGuestUseCase,
    @Inject(UpdateGuestUseCase) private readonly updateGuest: UpdateGuestUseCase,
    @Inject(DeleteGuestUseCase) private readonly deleteGuest: DeleteGuestUseCase,
    @Inject(RotateGuestTokenUseCase) private readonly rotateGuestToken: RotateGuestTokenUseCase,
    @Inject(CheckInGuestUseCase) private readonly checkInGuest: CheckInGuestUseCase,
    @Inject(GetAttendanceExportUseCase)
    private readonly exportAttendance: GetAttendanceExportUseCase,
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

  /**
   * The session user's invitations, newest first, each with what its card renders it from (T2; S2.6); an owner without
   * any gets an empty list (S1).
   */
  @Get()
  async list(@SessionUserId() userId: string): Promise<InvitationListItemResponse[]> {
    return (await this.listOwn.execute(userId)).map(toInvitationListItemResponse);
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
   * and not `PATCH`: the whole content is replaced, and the web client calls it from a server action. A body that
   * names `expectedUpdatedAt` is a conditional write and answers 409 when another writer committed first (S2).
   */
  @Put(":id/content")
  async replaceContent(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Body() body: UpdateInvitationContentDto,
  ): Promise<OwnedInvitationResponse> {
    try {
      return orOwnedInvitationNotFound(
        await this.updateContent.execute({
          ownerId: userId,
          id,
          content: body.content,
          ...(body.expectedUpdatedAt === undefined
            ? {}
            : { expectedUpdatedAt: body.expectedUpdatedAt }),
        }),
      );
    } catch (error) {
      return mapInvitationError(error);
    }
  }

  /**
   * Replaces the feature data of a DRAFT or a PUBLISHED invitation (F1, F2, F4, F6; S4, S7): the time zone, the
   * WhatsApp phone, the playlist link, the itinerary, the gift registry, the lodging, the livestream, the opening
   * animation switch, and the WhatsApp
   * reminder switches. Creator-owned and refused for an archived invitation exactly like a content save; `null` or an empty
   * `whatsappPhone` clears the stored phone, `null` or an empty `playlistUrl` clears the stored link, `null` or an empty
   * list clears the stored itinerary, `null` or an empty registry clears the stored registry, `null` or a payload with
   * no hotel and no transport line clears the stored lodging, `null` or a payload without a link clears the stored
   * livestream, and `null` or a pair of switches with nothing on clears the stored reminder switches. An omitted
   * `itinerary`, `giftRegistry`, `lodging`, `livestream`, or `reminders` keeps the stored one. `PUT` and not `PATCH`: the whole feature data is replaced.
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
          itinerary: body.itinerary,
          giftRegistry: body.giftRegistry,
          lodging: body.lodging,
          livestream: body.livestream,
          reminders: body.reminders,
          openingAnimation: body.openingAnimation,
        }),
      );
    } catch (error) {
      return mapInvitationError(error);
    }
  }

  /**
   * The place suggestions for the text an owner is typing in an address field (S1, S2): 200 with at most five points,
   * each a label and its coordinates, so the editor can write the label into the content and store the point.
   * Creator-owned, exactly like every other route of this controller: another customer's id is 404
   * `INVITATION_NOT_FOUND` and costs no geocoder request (A4). The query is read raw and validated by the domain, so
   * a missing or too short `q` is 400 `INVALID_PLACE_QUERY` with its issue, and an owner over the search limit is 429
   * `PLACE_SEARCH_RATE_LIMITED` (S2). The request carries no session data beyond the owner the guard attached.
   */
  @Get(":id/places/search")
  async searchPlacesIn(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Query("q") query: unknown,
  ): Promise<readonly PlacePoint[]> {
    try {
      return orPlaceSuggestionsNotFound(
        await this.searchPlaces.execute({ ownerId: userId, id, query }),
      );
    } catch (error) {
      return mapInvitationError(error);
    }
  }

  /**
   * Stores the point the owner chose for one address field of a DRAFT or a PUBLISHED invitation (S1, S2): 200 with
   * the owned invitation, whose `places` carry the stored point. `:field` must name an address field of the pinned
   * template version's schema; the label and both coordinates must satisfy the bounds the columns state, and anything
   * else is 400 `INVALID_INVITATION_PLACE` with its issues. An archived invitation is 409 `INVITATION_NOT_EDITABLE`
   * and a foreign id is 404 (A2, A4). `PUT` and not `PATCH`: the whole point is replaced.
   */
  @Put(":id/places/:field")
  async replacePlace(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Param("field") field: string,
    @Body() body: UpdateInvitationPlaceDto,
  ): Promise<OwnedInvitationResponse> {
    try {
      return orOwnedInvitationNotFound(
        await this.updatePlace.execute({
          ownerId: userId,
          id,
          field,
          label: body.label,
          lat: body.lat,
          lng: body.lng,
        }),
      );
    } catch (error) {
      return mapInvitationError(error);
    }
  }

  /**
   * Clears the stored point of one address field (S1, S2): 200 with the owned invitation, whose address text is
   * untouched — the owner keeps the words they typed and only loses the coordinates. The same field rule, the same
   * 409 for an archived invitation, and the same 404 for a foreign id as the write (A2, A4).
   */
  @Delete(":id/places/:field")
  @HttpCode(200)
  async clearPlaceOf(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Param("field") field: string,
  ): Promise<OwnedInvitationResponse> {
    try {
      return orOwnedInvitationNotFound(
        await this.clearPlace.execute({ ownerId: userId, id, field }),
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
   * Every guestbook entry of one owned invitation, visible and hidden together, with the two counts the moderation
   * screen's tabs show (F7; L10.6). Owner-only; another customer's id answers 404 `INVITATION_NOT_FOUND` like an unknown
   * one (A4). An archived invitation stays readable: archiving is read-only, never erased (A2). A package that does not
   * grant `GUESTBOOK` still answers what the invitation already received, because the owner's own moderation must never
   * become unreachable after a catalog change.
   */
  @Get(":id/guestbook")
  async readGuestbook(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<GuestbookReadResponse> {
    return orGuestbookReadNotFound(await this.getGuestbookEntries.execute(userId, id));
  }

  /**
   * Hides one entry, or shows it again (F7; L10.6): the owner's only moderation, and nothing is deleted. Owner-only,
   * idempotent, and the same two 404s for a foreign invitation (A4) and for an entry that is not this invitation's —
   * an `:entryId` that is not even a uuid included, so the use case decides it rather than the pipe answering a 400
   * the screen could not tell apart from a malformed body.
   */
  @Put(":id/guestbook/:entryId")
  async updateGuestbookEntry(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Param("entryId") entryId: string,
    @Body() body: UpdateGuestbookEntryDto,
  ): Promise<GuestbookEntryResponse> {
    try {
      return orGuestbookEntry(
        await this.setGuestbookEntryHidden.execute({
          ownerId: userId,
          id,
          entryId,
          hidden: body.hidden,
        }),
      );
    } catch (error) {
      return mapGuestbookError(error);
    }
  }

  /**
   * The same read as a CSV download (M6 G1, G2; S1, S4). The file is an attachment, is never cached, and is
   * spreadsheet-safe: every cell is quoted when it must be, quotes are doubled, and a cell a spreadsheet would run
   * as a formula is prefixed with an apostrophe. Owner-only, with the same 404 as the JSON read (A4). In guest-list
   * mode the file is the guest list, pending guests and check-in times included; otherwise it is the open form's
   * responses, unchanged from G1.
   */
  @Get(":id/rsvp.csv")
  async exportRsvp(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Res({ passthrough: true }) reply: RsvpCsvReply,
  ): Promise<string> {
    // The header is set before the read, so it is on the 404 too.
    reply.setHeader("Cache-Control", "no-store");
    const exported = await this.exportAttendance.execute(userId, id);
    if (exported === null) {
      // The same 404 every owner route answers, so a foreign invitation is indistinguishable from an unknown one.
      rsvpInvitationNotFound();
    }
    reply.setHeader("Content-Type", "text/csv; charset=utf-8");
    reply.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);

    return exported.body;
  }

  /**
   * The guest list of one owned invitation with its totals (M6 G2; S1, S4): guests, seats, confirmed people,
   * declines, pending guests, and check-ins, each guest with their answer and check-in state and never their token.
   * Owner-only; another customer's id answers 404 `INVITATION_NOT_FOUND` like an unknown one (A4); an archived
   * invitation stays readable (A2); a package that does not grant `GUEST_LIST` is 409 `GUEST_LIST_NOT_AVAILABLE`.
   */
  @Get(":id/guests")
  async readGuests(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<GuestListResponse> {
    try {
      return orGuestListNotFound(await this.listGuests.execute(userId, id));
    } catch (error) {
      return mapGuestError(error);
    }
  }

  /**
   * Adds one guest to a DRAFT or a PUBLISHED invitation (M6 G2; S4): 201 with the guest and the personal token, which
   * is answered exactly once. A refused guest is 400 `INVALID_GUEST` with the issues, an archived invitation is 409
   * `INVITATION_NOT_EDITABLE`, a package without the guest list is 409 `GUEST_LIST_NOT_AVAILABLE`, and a foreign
   * invitation is 404 (A4).
   */
  @Post(":id/guests")
  async createGuestFor(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Body() body: CreateGuestDto,
  ): Promise<GuestWithTokenResponse> {
    try {
      return orGuestWithTokenResponse(
        await this.createGuest.execute({
          ownerId: userId,
          id,
          name: body.name,
          seats: body.seats,
          phone: body.phone,
          note: body.note,
          tableLabel: body.tableLabel,
        }),
      );
    } catch (error) {
      return mapGuestError(error);
    }
  }

  /**
   * Replaces one guest's name, seats, phone, and note (M6 G2; S4). `PUT` and not `PATCH`: the whole guest is
   * replaced, and `null` clears the phone or the note. The token and the check-in state are untouched; a seat count
   * that could not hold the party the guest already confirmed is 409 `GUEST_SEATS_BELOW_RESPONSE` with that party.
   */
  @Put(":id/guests/:guestId")
  async replaceGuest(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Param("guestId", INVITATION_ID) guestId: string,
    @Body() body: UpdateGuestDto,
  ): Promise<GuestResponseItem> {
    try {
      return orGuestResponseItem(
        await this.updateGuest.execute({
          ownerId: userId,
          id,
          guestId,
          name: body.name,
          seats: body.seats,
          phone: body.phone,
          note: body.note,
          tableLabel: body.tableLabel,
        }),
      );
    } catch (error) {
      return mapGuestError(error);
    }
  }

  /**
   * Removes one guest together with the answer they gave (M6 G2; S4), in one statement: a response never outlives the
   * guest it answers for. 200 with `{ status: "deleted" }`, because no new resource is created; a guest that is not
   * part of this invitation is 404 `GUEST_NOT_FOUND`, and an archived invitation is 409 (A2, A4).
   */
  @Delete(":id/guests/:guestId")
  @HttpCode(200)
  async removeGuest(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Param("guestId", INVITATION_ID) guestId: string,
  ): Promise<DeletedGuestResponse> {
    try {
      return orDeletedGuestResponse(await this.deleteGuest.execute(userId, id, guestId));
    } catch (error) {
      return mapGuestError(error);
    }
  }

  /**
   * Replaces one guest's personal token (M6 G2; S4): 200 with the guest and the new token, answered once, so the
   * owner can revoke a link that leaked. The previous link stops resolving at the same instant; the answer and the
   * check-in state stay. Owner-only, with the same 404 and 409 answers as an edit (A2, A4).
   */
  @Post(":id/guests/:guestId/token")
  @HttpCode(200)
  async rotateGuestTokenFor(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Param("guestId", INVITATION_ID) guestId: string,
  ): Promise<GuestWithTokenResponse> {
    try {
      return orGuestWithTokenResponse(await this.rotateGuestToken.execute(userId, id, guestId));
    } catch (error) {
      return mapGuestError(error);
    }
  }

  /**
   * Checks one guest in at the door (M6 G2; S4): the token arrives in the body from the QR URL the guest's personal
   * page shows, and the owner comes from the session. 200 with the guest, the seats, the confirmed party, and the
   * first check-in instant; the first instant is kept, so showing the same QR twice is idempotent. A guest who has
   * not confirmed is 409 `GUEST_NOT_CONFIRMED`, a token that names no guest of this invitation is 404
   * `GUEST_NOT_FOUND` like an unknown one (no oracle), a package without `QR_PASS` is 409 `QR_PASS_NOT_AVAILABLE`,
   * and an archived invitation is 409 (A2).
   */
  @Post(":id/guests/check-in")
  @HttpCode(200)
  async checkInGuestAt(
    @SessionUserId() userId: string,
    @Param("id", INVITATION_ID) id: string,
    @Body() body: CheckInGuestDto,
  ): Promise<GuestCheckInResponse> {
    try {
      return orGuestCheckInResponse(
        await this.checkInGuest.execute({ ownerId: userId, id, token: body.token }),
      );
    } catch (error) {
      return mapGuestError(error);
    }
  }
}

/** The response object the CSV route sets headers on; the Express reply satisfies it. */
interface RsvpCsvReply {
  setHeader(name: string, value: string): void;
}
