import { IsDefined } from "class-validator";

/**
 * `POST /invitations/:id/collaborators` body (F12; L17.1, L17.3). Only presence is checked here: the domain owns the
 * address rules and the permission allow-list, so a value it refuses reaches the client as 400
 * `INVALID_COLLABORATOR_INVITATION` with its issues. The owner is never a field — it comes from the guard, never from
 * the payload (S9) — and `forbidNonWhitelisted` refuses any other field, so a request cannot offer one.
 */
export class InviteCollaboratorDto {
  @IsDefined()
  email!: unknown;

  @IsDefined()
  permissions!: unknown;
}

/**
 * `PATCH /invitations/:id/collaborators/:collaboratorId` body (L17.3): the new permission set, replacing the stored one.
 * Presence only, like the invitation: the domain's allow-list decides what a set may contain.
 */
export class UpdateCollaboratorPermissionsDto {
  @IsDefined()
  permissions!: unknown;
}

/**
 * `POST /collaborations/accept` body (L17.3): the token the emailed link carried. Presence only; a value that is not a
 * token at all is refused with the same answer every unusable link gets, so the body is never the place where the route
 * decides whether a link existed.
 */
export class AcceptCollaborationDto {
  @IsDefined()
  token!: unknown;
}
