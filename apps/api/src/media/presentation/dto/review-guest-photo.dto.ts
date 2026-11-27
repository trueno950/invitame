import { IsString } from "class-validator";

// The body of the album's moderation route (F8; L11.6). Like the guestbook's switch, this DTO checks presence and the
// plain type; the domain owns the allow-list, so a state the owner may not set reaches them as a 400 with the stable
// code instead of a generic pipe message, and the global pipe forbids unknown fields, so a request cannot offer an
// owner, an invitation id, an uploader name, or a date.

/**
 * `PATCH /invitations/:id/guest-photos/:photoId` body (L11.6): the one moderation write. `status` is required and typed
 * here, so publishing (`PUBLISHED`) and hiding (`HIDDEN`) are as explicit as each other and `PENDING` is refused by the
 * domain: a photo never returns to the state that hides it from the owner's own tabs.
 */
export class ReviewGuestPhotoDto {
  @IsString()
  status!: string;
}
