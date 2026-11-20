import {
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";

import {
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  ADMIN_ACTION_REASON,
  type AdminActionReason,
} from "./domain/admin-action";

// The request boundary of the audit's own rules (M9 T9; S4, S6, L9). It lives in the `admin` module because that module
// owns both closed sets and the note's bound, and because two modules' bodies state the same rule: the administrator's
// unpublish (`invitations`, T8) and the three account actions (`users`, T9). Declared once here, the two bodies cannot
// drift apart, and the audit domain and the column's CHECK constraint stay behind them.
//
// This is a presentation concern of the modules that accept an entry, not a widening of the audit contract: nothing
// here writes a row.

/**
 * The note's whole rule, in one validator because its parts depend on the reason (S6, L9): optional and at most 500
 * characters for every reason, and required and non-blank while the reason is `OTHER`, where a note of spaces says
 * nothing. The audit domain states the same rule again, and the column's CHECK constraint behind it, so a caller that
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
export function AdminActionNote(): PropertyDecorator {
  return Validate(AdminActionNoteConstraint);
}

/** The closed set of reasons, as a body DTO's `@IsIn` needs it: the audit domain's own values. */
export const ADMIN_ACTION_REASONS: readonly AdminActionReason[] =
  Object.values(ADMIN_ACTION_REASON);
