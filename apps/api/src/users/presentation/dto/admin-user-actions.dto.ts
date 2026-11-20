import { IsIn } from "class-validator";

import { ADMIN_ACTION_REASONS, AdminActionNote } from "../../../admin/admin-action.dto";
import type { AdminActionReason } from "../../../admin/admin-action-recorder";

// The bodies of the three account support routes (M9 T9; S4, S6, L9). Both DTOs state exactly the rule the unpublish
// body states — one reason of the audit's closed set plus the optional note — because the reason set and the note rule
// are the `admin` module's own (`../../admin/admin-action.dto.ts`) and are shared with that route. The actor is the
// session's own id and the account is the path, so a body that offers either is refused by the global pipe's
// `forbidNonWhitelisted`.

/**
 * `POST /admin/users/:userId/disable`, `/reactivate`, and `/sign-in-code` body (M9 T9; S4, S6): why the administrator
 * acts, plus an optional note of at most 500 characters that «Otro» requires.
 */
export class AdminUserActionDto {
  @IsIn(ADMIN_ACTION_REASONS)
  reason!: AdminActionReason;

  @AdminActionNote()
  note?: string;
}
