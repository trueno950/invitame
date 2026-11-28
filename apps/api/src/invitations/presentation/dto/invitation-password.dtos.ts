import { IsString, MaxLength } from "class-validator";

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
 * `POST /public/invitations/:slug/unlock` body (F13; L18.2): the access code a guest was given. The bound keeps one request
 * from spending the verifier on a body far wider than any code and keeps the neutral refusal about the code itself; a
 * value over it is a malformed request (400), which says nothing about any invitation.
 */
export class UnlockInvitationDto {
  @IsString()
  @MaxLength(200)
  password!: string;
}
