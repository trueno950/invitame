import { IsString } from "class-validator";

/**
 * `PUT /invitations/:id/password` body (F13; S2.13, L18.1): the plain access code the owner sets or replaces. The value is
 * validated by the domain — 4 to 40 trimmed characters with no control character — so a value it refuses reaches the
 * client as 400 `INVALID_INVITATION_PASSWORD` with its issues; only the shape is checked here, so a non-string is a
 * malformed request. The body carries no version and no hash: the API owns both.
 */
export class SetInvitationPasswordDto {
  @IsString()
  password!: string;
}

/**
 * `POST /public/invitations/:slug/unlock` body (F13; L18.2): the access code a guest was given. Only the shape is checked
 * here; the width the domain accepts (4 to 40 characters, no control character) is the use case's own rule, so a value
 * that cannot be a code answers the same neutral 401 as a wrong one instead of a body error that distinguishes it.
 */
export class UnlockInvitationDto {
  @IsString()
  password!: string;
}
