import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from "@nestjs/common";

import { AdminOnly } from "../../auth/access-control/access-control";
import {
  GetAdminInvitationUseCase,
  ListAdminInvitationsUseCase,
} from "../application/admin-invitation.use-cases";
// The global ValidationPipe reads this class from emitted metadata, so it is a value import.
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { ListAdminInvitationsDto } from "./dto/admin-invitations.dto";
import {
  type AdminInvitationDetailResponse,
  type AdminInvitationListResponse,
  mapAdminInvitationError,
  orAdminInvitationNotFound,
  toAdminInvitationListResponse,
} from "./admin-invitation.response";

const INVITATION_ID = new ParseUUIDPipe();

/** An absent or empty slug field means "every slug": the form sends nothing when the box is empty. */
function slugPrefix(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

/**
 * The administrator's invitation status view (M9 T2; S1, L3, L4). `@AdminOnly()` on the class: the global guard
 * answers 401 without an active session and 403 to a user whose stored role is not `ADMIN`, before any input is
 * validated. Both routes are read-only, and neither carries personal data beyond the owner's email.
 *
 * - `GET /admin/invitations?slug=<prefix>&status=DRAFT|PUBLISHED|ARCHIVED&limit=<1..50>&cursor=<opaque>`: 200
 *   `{ items, nextCursor }`, newest first by `(createdAt, id)`. Every parameter is optional and bounded: `limit`
 *   defaults to 20, `slug` is a case-insensitive prefix of at most 60 characters, and `status` is the closed
 *   lifecycle set. An unknown parameter or a malformed value answers 400, and so does a cursor this API did not
 *   write (`INVALID_CURSOR`), before the database is read.
 * - `GET /admin/invitations/:invitationId`: 200 with the same fields plus `packageId`, `templateVersionId`, and the
 *   newest payments (at most 20, newest first), or 404 `INVITATION_NOT_FOUND`.
 *
 * A request never names an owner: the status view is global, so ownership scoping does not apply here, and the read
 * is the only global invitation read in the product.
 */
@AdminOnly()
@Controller("admin/invitations")
export class AdminInvitationsController {
  constructor(
    @Inject(ListAdminInvitationsUseCase)
    private readonly listInvitations: ListAdminInvitationsUseCase,
    @Inject(GetAdminInvitationUseCase)
    private readonly getInvitation: GetAdminInvitationUseCase,
  ) {}

  @Get()
  async list(@Query() query: ListAdminInvitationsDto): Promise<AdminInvitationListResponse> {
    try {
      return toAdminInvitationListResponse(
        await this.listInvitations.execute({
          slug: slugPrefix(query.slug),
          status: query.status ?? null,
          limit: query.limit,
          cursor: query.cursor === undefined || query.cursor === "" ? null : query.cursor,
        }),
      );
    } catch (error) {
      return mapAdminInvitationError(error);
    }
  }

  @Get(":invitationId")
  async read(
    @Param("invitationId", INVITATION_ID) invitationId: string,
  ): Promise<AdminInvitationDetailResponse> {
    return orAdminInvitationNotFound(await this.getInvitation.execute(invitationId));
  }
}
