import { IsBoolean, IsOptional, IsString } from "class-validator";

import { IsProvided } from "./invitation.dtos";

// The bodies of the guest-list routes (M6 G2; S1, S4). Like the RSVP bodies, these DTOs check presence and the plain
// types; the domain owns every bound, so a refused value reaches the client as 400 with the stable `INVALID_GUEST`
// or `INVALID_RSVP` code and the issue list instead of a generic pipe message. The global pipe forbids unknown
// fields, so a request cannot offer an owner, an invitation id, a token, a digest, or a check-in instant.

/**
 * `POST /invitations/:id/guests` body (S4): the guest the creator adds. The name and the seats are required; the
 * phone, the note, and the table are optional and `null` or an empty string means "none", so they stay unknown here
 * for the domain to normalize.
 */
export class CreateGuestDto {
  @IsString()
  name!: string;

  @IsProvided()
  seats!: unknown;

  @IsOptional()
  phone?: unknown;

  @IsOptional()
  note?: unknown;

  /**
   * The table to assign (F5; L8.1). Optional like the phone and the note: an omitted field stores no table, and the
   * domain normalizes it, so a blank one clears it and a value over 12 characters is refused with `INVALID_GUEST`.
   */
  @IsOptional()
  tableLabel?: unknown;
}

/**
 * `PUT /invitations/:id/guests/:guestId` body (S4): the whole guest is replaced, so every field is required and
 * `null` clears the phone or the note. `PUT` and not `PATCH`, like the content, the features, and the RSVP settings.
 */
export class UpdateGuestDto {
  @IsString()
  name!: string;

  @IsProvided()
  seats!: unknown;

  @IsProvided()
  phone!: unknown;

  @IsProvided()
  note!: unknown;

  /**
   * The table to assign, or null to clear it (F5; L8.1, L8.3). Optional even on a whole replacement: a client written
   * before the column existed omits it, and the stored table is kept instead of being cleared (L20).
   */
  @IsOptional()
  tableLabel?: unknown;
}

/**
 * `POST /public/invitations/:slug/guests/:token/rsvp` body (S4): the guest's answer through a personal link. The
 * name, the phone, and the seats come from the guest record, never from the body, so only the answer is accepted
 * here; the party size and the message stay unknown for the domain to normalize against the guest's seats.
 */
export class SubmitGuestRsvpDto {
  @IsBoolean()
  attending!: boolean;

  @IsOptional()
  partySize?: unknown;

  /**
   * The people who come with the guest (F3; L6.1). Optional like the open form's, so a page deployed before this field
   * keeps answering; a provided list must match the party size, which is bounded by the guest's own seats.
   */
  @IsOptional()
  companions?: unknown;

  /** The dietary restrictions of the party, or null (F3; L6.1). */
  @IsOptional()
  dietaryNotes?: unknown;

  @IsOptional()
  message?: unknown;
}

/**
 * `POST /invitations/:id/guests/check-in` body (S4): the token the creator's page reads from the QR URL. The value
 * is the guest's opaque token; a malformed one answers the same 404 as an unknown one, decided by the use case.
 */
export class CheckInGuestDto {
  @IsString()
  token!: string;
}
