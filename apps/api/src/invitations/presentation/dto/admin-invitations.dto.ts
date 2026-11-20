import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

import { INVITATION_STATUSES, type InvitationStatus } from "../../domain/invitation-lifecycle";

// The query of the administrator's invitation search (M9 T2; S1, L4). Every parameter is optional and bounded, so the
// read stays bounded even when the query omits them, and the global ValidationPipe answers 400 for anything else:
// `forbidNonWhitelisted` refuses an unknown parameter, `@IsIn` closes the status set, and `@Max` caps the page. The
// slug is a prefix of at most 60 characters — the column's own width — and is matched case-insensitively, with `%`
// and `_` read as the literal characters a slug cannot contain anyway.

/** The page size when the query names none. */
export const ADMIN_INVITATION_DEFAULT_LIMIT = 20;

/** The largest page this read answers; the status view never needs more for a working list. */
export const ADMIN_INVITATION_MAX_LIMIT = 50;

/** The widest slug prefix: an invitation slug is at most 60 characters, so a longer prefix matches nothing. */
export const ADMIN_INVITATION_SLUG_MAX_LENGTH = 60;

/** The longest cursor this API writes; a longer value cannot be one of its own. */
export const ADMIN_INVITATION_CURSOR_MAX_LENGTH = 200;

export class ListAdminInvitationsDto {
  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_INVITATION_SLUG_MAX_LENGTH)
  slug?: string;

  @IsOptional()
  @IsIn(INVITATION_STATUSES)
  status?: InvitationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_INVITATION_MAX_LIMIT)
  limit: number = ADMIN_INVITATION_DEFAULT_LIMIT;

  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_INVITATION_CURSOR_MAX_LENGTH)
  cursor?: string;
}
