import { IsBoolean, IsOptional, IsString } from "class-validator";

import { IsProvided } from "./invitation.dtos";

// The bodies of the guestbook routes (F7; S2.7, L10.1, L10.6). Like the RSVP bodies, these DTOs check presence and the
// plain types; the domain owns every bound, so a refused signature reaches the guest as 400 with the stable
// `INVALID_GUESTBOOK_ENTRY` code and the issue list instead of a generic pipe message. The global pipe forbids unknown
// fields, so a request cannot offer an owner, an invitation id, a hidden flag, or a timestamp.

/**
 * `POST /public/invitations/:slug/guestbook` body (L10.3): the signature one guest left. `authorName` and `message` are
 * required and typed here — the domain trims them and reports its own bounds. `honeypot` is the field the page hides:
 * any value a bot fills makes the submission answer success without storing it.
 */
export class SubmitGuestbookEntryDto {
  @IsString()
  authorName!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  honeypot?: string;
}

/**
 * `PUT /invitations/:id/guestbook/:entryId` body (L10.6): the owner's one moderation switch. `hidden` is required and
 * typed here, so `false` (show again) is as explicit as `true` (hide) and an omitted value is refused instead of being
 * read as a default.
 */
export class UpdateGuestbookEntryDto {
  @IsProvided()
  @IsBoolean()
  hidden!: boolean;
}
