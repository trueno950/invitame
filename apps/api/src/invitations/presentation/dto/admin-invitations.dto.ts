import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from "class-validator";

import {
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  ADMIN_ACTION_REASON,
  type AdminActionReason,
} from "../../../admin/admin-action-recorder";
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

/**
 * The note's whole rule, in one validator because the three parts depend on the reason (S6, L9): optional and at most
 * 500 characters for every reason, and required and non-blank while the reason is `OTHER`, where a note of spaces says
 * nothing. The audit domain states the same rule again and the column's CHECK constraint behind it, so a caller that
 * reaches the repository directly is refused too; this one only makes a bad body an ordinary 400 at the boundary.
 */
@ValidatorConstraint({ name: "adminActionNote" })
class AdminActionNoteConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, arguments_: ValidationArguments): boolean {
    const reason = (arguments_.object as { reason?: unknown }).reason;

    if (value === undefined || value === null) {
      return reason !== ADMIN_ACTION_REASON.OTHER;
    }
    if (typeof value !== "string" || value.length > ADMIN_ACTION_NOTE_MAX_LENGTH) {
      return false;
    }

    return reason !== ADMIN_ACTION_REASON.OTHER || value.trim() !== "";
  }

  defaultMessage(): string {
    return `note must be at most ${ADMIN_ACTION_NOTE_MAX_LENGTH} characters, and is required and non-blank when the reason is ${ADMIN_ACTION_REASON.OTHER}`;
  }
}

/** `@AdminActionNote()`: the optional note, bounded and required under «Otro» (S6, L9). */
function AdminActionNote(): PropertyDecorator {
  return Validate(AdminActionNoteConstraint);
}

/** The closed set of reasons, as the DTO's `@IsIn` needs it: the audit domain's own values. */
export const ADMIN_ACTION_REASONS: readonly AdminActionReason[] =
  Object.values(ADMIN_ACTION_REASON);

/**
 * `POST /admin/invitations/:invitationId/unpublish` body (M9 T8; S4, S6, L9). The administrator says why they act — one
 * value of the closed set, plus an optional note of at most 500 characters that «Otro» requires — and nothing else: the
 * actor is the session's own id and the invitation is the path, so the global pipe (`forbidNonWhitelisted`) refuses a
 * body that offers either.
 */
export class UnpublishAdminInvitationDto {
  @IsIn(ADMIN_ACTION_REASONS)
  reason!: AdminActionReason;

  @AdminActionNote()
  note?: string;
}
