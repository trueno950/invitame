import { IsInt, IsOptional, IsString, MaxLength } from "class-validator";

import { OPERATIONAL_SETTINGS_NOTE_MAX_LENGTH } from "../../domain/operational-settings";

// The body of `PUT /admin/settings` (M9 T13; S5, S8). All seven settings are required integers and the note is optional:
// the global ValidationPipe refuses a missing field, an unknown field (so a body cannot offer an owner, a timestamp, or
// a column this route does not own), a fractional or string value, and a note wider than 200 characters with its own
// 400 before a use case is reached.
//
// What is *not* here is the bounds and the two cross-field rules: they belong to the domain, so an out-of-range value
// reaches the client as 400 `INVALID_SETTINGS` with the stable `{ field, rule }` issues the panel renders, instead of a
// generic pipe message the form cannot place next to a field.

export class UpdateOperationalSettingsDto {
  @IsInt()
  rsvpDefaultPartyLimit!: number;

  @IsInt()
  rsvpMaxPartyLimit!: number;

  @IsInt()
  galleryPhotoLimit!: number;

  @IsInt()
  storedAssetLimit!: number;

  @IsInt()
  maxUploadMegabytes!: number;

  @IsInt()
  placeSearchResultLimit!: number;

  @IsInt()
  analyticsDefaultWindowDays!: number;

  @IsOptional()
  @IsString()
  @MaxLength(OPERATIONAL_SETTINGS_NOTE_MAX_LENGTH)
  note?: string;
}
