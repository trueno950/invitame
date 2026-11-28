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
  UseGuards,
} from "@nestjs/common";

import { SessionUserId } from "../../auth/access-control/session-user-id";
import {
  AcceptCollaborationUseCase,
  InviteCollaboratorUseCase,
  ListInvitationCollaboratorsUseCase,
  RevokeCollaboratorUseCase,
  UpdateCollaboratorPermissionsUseCase,
} from "../application/collaborator.use-cases";
import {
  InvitationAccessGuard,
  InvitationOwnerOnly,
  InvitationRouteIdIsUuid,
} from "./invitation-access.guard";
import { InvitationOwnerId } from "./invitation-scope";
import {
  type AcceptCollaborationResponse,
  type CollaboratorListResponse,
  type CollaboratorResponse,
  mapCollaboratorError,
  orCollaborator,
  orCollaboratorList,
  orInvitedCollaborator,
} from "./collaborator.response";
// biome-ignore lint/style/useImportType: the pipes need the classes at runtime.
import {
  AcceptCollaborationDto,
  InviteCollaboratorDto,
  UpdateCollaboratorPermissionsDto,
} from "./dto/collaborator.dtos";

const INVITATION_ID = new ParseUUIDPipe();
const COLLABORATOR_ID = new ParseUUIDPipe();

/**
 * The owner's co-host screen (F12; S2.12, L17.1, L17.3, L17.5). Managing collaborators is owner-only and never
 * grantable (L17.2), so every route here declares `@InvitationOwnerOnly()`: a collaborator holding all three
 * permissions answers 403 `INVITATION_FORBIDDEN` and a stranger answers the module's 404, exactly like an invitation
 * that does not exist (A4). `InvitationAccessGuard` resolves the caller once, and `@InvitationOwnerId()` is the owner
 * it proved — never the path and never the body (S9).
 *
 * No answer carries the acceptance token or its digest: the plain token exists only inside the email, and the row's
 * digest is not something the owner has any use for. Inviting an address is a `POST` (201, a new invitation row) and a
 * permission change is a `PATCH`, because it replaces part of the standing row; revoking is a `DELETE` that answers 200
 * with the revoked row, because nothing is deleted — the row stays as history and the access ends immediately.
 */
@Controller("invitations/:id/collaborators")
@UseGuards(InvitationAccessGuard)
@InvitationRouteIdIsUuid()
export class InvitationsCollaboratorsController {
  constructor(
    @Inject(ListInvitationCollaboratorsUseCase)
    private readonly listCollaborators: ListInvitationCollaboratorsUseCase,
    @Inject(InviteCollaboratorUseCase)
    private readonly inviteCollaborator: InviteCollaboratorUseCase,
    @Inject(UpdateCollaboratorPermissionsUseCase)
    private readonly updatePermissions: UpdateCollaboratorPermissionsUseCase,
    @Inject(RevokeCollaboratorUseCase)
    private readonly revokeCollaborator: RevokeCollaboratorUseCase,
  ) {}

  /**
   * The invitation's standing collaborators, oldest first, with the cap (L17.3): 200 with
   * `{ maxCollaborators, collaborators }`. Revoked rows are history and are not listed. Owner-only; another customer's
   * invitation is the module's 404, and a collaborator is 403.
   */
  @Get()
  @InvitationOwnerOnly()
  async list(
    @InvitationOwnerId() ownerId: string,
    @Param("id", INVITATION_ID) id: string,
  ): Promise<CollaboratorListResponse> {
    return orCollaboratorList(await this.listCollaborators.execute(ownerId, id));
  }

  /**
   * Invites one address with a permission set (L17.1, L17.5): 201 with the invited row, never the link. It is 400
   * `INVALID_COLLABORATOR_INVITATION` for an address or a set the domain refuses, 409 `CO_HOSTS_NOT_AVAILABLE` when the
   * pinned package does not grant the key, 409 `COLLABORATOR_ALREADY_INVITED` for an address that already stands, 409
   * `COLLABORATOR_LIMIT_REACHED` for the sixth, and 503 `COLLABORATOR_EMAIL_UNAVAILABLE` when the message could not be
   * delivered.
   */
  @Post()
  @InvitationOwnerOnly()
  async create(
    @InvitationOwnerId() ownerId: string,
    @Param("id", INVITATION_ID) id: string,
    @Body() body: InviteCollaboratorDto,
  ): Promise<CollaboratorResponse> {
    try {
      return orInvitedCollaborator(
        await this.inviteCollaborator.execute({
          ownerId,
          invitationId: id,
          email: body.email,
          permissions: body.permissions,
        }),
      );
    } catch (error) {
      return mapCollaboratorError(error);
    }
  }

  /**
   * Replaces what one collaborator may do (L17.3): 200 with the row as it now stands. The same 400 as the invitation for
   * a set the domain refuses, and the collaborator's 404 for an id that is not this invitation's — a revoked row
   * included, because it is history and no longer holds any permission to change.
   */
  @Patch(":collaboratorId")
  @InvitationOwnerOnly()
  async update(
    @InvitationOwnerId() ownerId: string,
    @Param("id", INVITATION_ID) id: string,
    @Param("collaboratorId", COLLABORATOR_ID) collaboratorId: string,
    @Body() body: UpdateCollaboratorPermissionsDto,
  ): Promise<CollaboratorResponse> {
    try {
      return orCollaborator(
        await this.updatePermissions.execute({
          ownerId,
          invitationId: id,
          collaboratorId,
          permissions: body.permissions,
        }),
      );
    } catch (error) {
      return mapCollaboratorError(error);
    }
  }

  /**
   * Revokes one collaborator, pending or accepted (L17.3): 200 with the row marked revoked. The access ends on that
   * account's next request and its unused link stops resolving in the same statement. Repeating the revoke changes
   * nothing and answers the collaborator's 404, because the row no longer stands.
   */
  @Delete(":collaboratorId")
  @HttpCode(200)
  @InvitationOwnerOnly()
  async revoke(
    @InvitationOwnerId() ownerId: string,
    @Param("id", INVITATION_ID) id: string,
    @Param("collaboratorId", COLLABORATOR_ID) collaboratorId: string,
  ): Promise<CollaboratorResponse> {
    return orCollaborator(await this.revokeCollaborator.execute(ownerId, id, collaboratorId));
  }
}

/**
 * The recipient's acceptance (F12; L17.3). It is not an invitation-scoped route — the token names the invitation, and the
 * caller has no access yet — so it declares nothing and the access guard does not resolve it; the global guard still
 * requires an active session, because the whole point is that the caller signs in with the product's own email code and
 * the invited address is compared with the session's account.
 *
 * A wrong account, an expired link, a used link, a revoked collaborator, and a token that names nothing all answer the
 * same 404 `COLLABORATION_NOT_FOUND` with the same body.
 */
@Controller("collaborations")
export class CollaborationsController {
  constructor(
    @Inject(AcceptCollaborationUseCase)
    private readonly acceptCollaboration: AcceptCollaborationUseCase,
  ) {}

  @Post("accept")
  @HttpCode(200)
  async accept(
    @SessionUserId() userId: string,
    @Body() body: AcceptCollaborationDto,
  ): Promise<AcceptCollaborationResponse> {
    try {
      return await this.acceptCollaboration.execute({ userId, token: body.token });
    } catch (error) {
      // Every refusal is the same 404 (L17.3); anything else — a storage fault, a programming error — is rethrown by
      // the mapper unchanged, so this route never turns a real failure into "that link does not exist".
      return mapCollaboratorError(error);
    }
  }
}
