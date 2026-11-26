import { IsBoolean, IsOptional, IsString } from "class-validator";

import { IsProvided } from "./invitation.dtos";

// The bodies of the RSVP routes (M6 G1; S1, S4). Like the features route, these DTOs check presence and the plain
// types; the domain owns every conditional bound, so a refused value reaches the client as 400 with the stable
// `INVALID_RSVP_SETTINGS` or `INVALID_RSVP` code and the issue list instead of a generic pipe message. The global
// pipe forbids unknown fields, so a request cannot offer an owner, an invitation id, a dedupe key, or a timestamp.

/**
 * `PUT /invitations/:id/rsvp-settings` body: the optional deadline and the party limit. `deadline` must be present,
 * and `null` clears it, so `@IsDefined()` (which refuses `null`) cannot state the rule; `partyLimit` must be
 * present too. `PUT` and not `PATCH`: the whole settings pair is replaced.
 */
export class UpdateRsvpSettingsDto {
  @IsProvided()
  deadline!: unknown;

  @IsProvided()
  partyLimit!: unknown;
}

/**
 * `POST /public/invitations/:slug/rsvp` body (S4): the guest's answer. `name` and `attending` are required and
 * typed here; the party size, the phone, and the message stay unknown on purpose, so the domain normalizes them and
 * reports its own issues. `honeypot` is the field the page hides: any value a bot fills makes the submission answer
 * success without storing it.
 */
export class SubmitRsvpDto {
  @IsString()
  name!: string;

  @IsBoolean()
  attending!: boolean;

  @IsOptional()
  partySize?: unknown;

  /**
   * The people who come with the guest (F3; L6.1). Optional, so a page deployed before this field keeps answering: an
   * omitted list means one unnamed adult per extra person, and a provided one must match the party size.
   */
  @IsOptional()
  companions?: unknown;

  /** The dietary restrictions of the party, or null (F3; L6.1). */
  @IsOptional()
  dietaryNotes?: unknown;

  @IsOptional()
  phone?: unknown;

  @IsOptional()
  message?: unknown;

  @IsOptional()
  @IsString()
  honeypot?: string;
}
