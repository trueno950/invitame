// The administrator audit rules (M9 T6; S4, S6, L9). This file is pure: no framework, ORM, clock, provider, or
// transport type, so every rule is stated once and can be exercised from a table. The migration keeps the same two
// closed sets in PostgreSQL enum types and restates the note and target rules in CHECK constraints, so a value this
// file accepts is a value the table can store. The append-only trigger — not this file — is what makes a stored row
// final: nothing here can change one, because nothing here ever updates one.

/**
 * The state-changing actions that are audited (S4, S5, S8). Viewing a payment is deliberately absent: S6 decided that
 * reading a payment is not an action and writes no row.
 */
export const ADMIN_ACTION = {
  /** An administrator unpublished an invitation, by abuse report or at the owner's request. */
  INVITATION_UNPUBLISHED: "INVITATION_UNPUBLISHED",
  /** An administrator blocked an account's access. Its invitations stay published (L8). */
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  /** An administrator restored a disabled account's access (L9). */
  ACCOUNT_REACTIVATED: "ACCOUNT_REACTIVATED",
  /** An administrator asked the existing sign-in-code flow to mail a new code (S4). */
  SIGN_IN_CODE_RESENT: "SIGN_IN_CODE_RESENT",
  /** An administrator changed the operational settings (S5, S8, L15). It names no target: it changes the platform. */
  SETTINGS_UPDATED: "SETTINGS_UPDATED",
} as const;

export type AdminActionType = (typeof ADMIN_ACTION)[keyof typeof ADMIN_ACTION];

/**
 * The closed set of reasons an administrator gives (L8, L9, S6). A free-form reason would make the column
 * unqueryable; `OTHER` is the one value that requires the optional note instead.
 */
export const ADMIN_ACTION_REASON = {
  ABUSE: "ABUSE",
  OWNER_REQUEST: "OWNER_REQUEST",
  PAYMENT_ERROR: "PAYMENT_ERROR",
  OTHER: "OTHER",
} as const;

export type AdminActionReason = (typeof ADMIN_ACTION_REASON)[keyof typeof ADMIN_ACTION_REASON];

/** The widest note S6 allows, counted in characters: the width of `AdminAction.note`. */
export const ADMIN_ACTION_NOTE_MAX_LENGTH = 500;

/**
 * What one action names: the invitation it changed, the account whose access it changed, or — for the one action that
 * changes platform-wide configuration instead of a resource — nothing at all (S8, L15).
 */
export type AdminActionTarget = "invitation" | "user" | null;

/** Which target each action names; the migration's target checks restate this table. */
const TARGET_BY_ACTION: Readonly<Record<AdminActionType, AdminActionTarget>> = {
  [ADMIN_ACTION.INVITATION_UNPUBLISHED]: "invitation",
  [ADMIN_ACTION.ACCOUNT_DISABLED]: "user",
  [ADMIN_ACTION.ACCOUNT_REACTIVATED]: "user",
  [ADMIN_ACTION.SIGN_IN_CODE_RESENT]: "user",
  [ADMIN_ACTION.SETTINGS_UPDATED]: null,
};

/** The issue an action outside the closed set is refused with. */
export const ADMIN_ACTION_TYPE_ISSUE = `action must be one of ${Object.values(ADMIN_ACTION).join(", ")}`;

/** The issue a reason outside the closed set is refused with. */
export const ADMIN_ACTION_REASON_ISSUE = `reason must be one of ${Object.values(
  ADMIN_ACTION_REASON,
).join(", ")}`;

/** The issue an actor that is not an id is refused with. */
export const ADMIN_ACTION_ACTOR_ISSUE = "adminUserId must be a UUID";

/** The issue a target that is neither a UUID nor absent is refused with. */
export const ADMIN_ACTION_TARGET_TYPE_ISSUE = "targetUserId and invitationId must be UUIDs or null";

/** The issue an entry with no target or with both targets is refused with. */
export const ADMIN_ACTION_TARGET_COUNT_ISSUE =
  "exactly one of targetUserId and invitationId is required";

/** The issue a target-less action that still names a target is refused with (S8, L15). */
export const ADMIN_ACTION_NO_TARGET_ISSUE = `${ADMIN_ACTION.SETTINGS_UPDATED} names no target: targetUserId and invitationId must both be null`;

/** The issue a note that is not a string is refused with. */
export const ADMIN_ACTION_NOTE_TYPE_ISSUE = "note must be a string or null";

/** The issue a note wider than `ADMIN_ACTION_NOTE_MAX_LENGTH` is refused with. */
export const ADMIN_ACTION_NOTE_LENGTH_ISSUE = `note must be at most ${ADMIN_ACTION_NOTE_MAX_LENGTH} characters`;

/** The issue a missing or blank note under `OTHER` is refused with (L9). */
export const ADMIN_ACTION_NOTE_REQUIRED_ISSUE = `a note is required when the reason is ${
  ADMIN_ACTION_REASON.OTHER
}`;

/** The one shape every id column has; the columns are PostgreSQL `uuid`s. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value is one of the four audited actions. */
export function isAdminActionType(value: unknown): value is AdminActionType {
  return (
    typeof value === "string" && (Object.values(ADMIN_ACTION) as readonly string[]).includes(value)
  );
}

/** Whether a value is one of the four reasons. */
export function isAdminActionReason(value: unknown): value is AdminActionReason {
  return (
    typeof value === "string" &&
    (Object.values(ADMIN_ACTION_REASON) as readonly string[]).includes(value)
  );
}

/** The target an action names: an invitation, a user account, or none for a platform-wide change. */
export function adminActionTarget(action: AdminActionType): AdminActionTarget {
  return TARGET_BY_ACTION[action];
}

/**
 * One audit entry as its caller prepares it: the administrator taking the action, what the action is, why, the
 * optional note, and the one target the action names. Every field is validated before it reaches a column.
 */
export interface AdminActionEntry {
  /** The signed-in administrator's own id, never a client-supplied actor. */
  adminUserId: string;
  action: AdminActionType;
  reason: AdminActionReason;
  /** Optional, trimmed, at most 500 characters; required and non-blank when the reason is `OTHER`. */
  note?: string | null;
  /** The account the action changed; set exactly for the three account actions. */
  targetUserId?: string | null;
  /** The invitation the action changed; set exactly for `INVITATION_UNPUBLISHED`. */
  invitationId?: string | null;
  // `SETTINGS_UPDATED` names neither: it is the one action that changes platform-wide configuration, so both ids
  // must be absent and the migration's relaxed target checks state the same rule.
}

/** An entry every column accepts: the note trimmed, and exactly the target the action names. */
export interface ValidatedAdminActionEntry {
  adminUserId: string;
  action: AdminActionType;
  reason: AdminActionReason;
  note: string | null;
  targetUserId: string | null;
  invitationId: string | null;
}

/** The outcome of validating one entry: either every stored value, or the first issue found. */
export type AdminActionValidation =
  | { readonly ok: true; readonly value: ValidatedAdminActionEntry }
  | { readonly ok: false; readonly issue: string };

/** The issue a value that is not an entry at all is refused with. */
export const ADMIN_ACTION_ENTRY_ISSUE = "entry must be an object";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An id the `uuid` column can store: the canonical shape, case-insensitive. */
function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** A nullable id: absent, or one the `uuid` column can store. */
function isOptionalUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

/**
 * The pure validation of one audit entry: the closed sets, the trimmed and bounded note, the note `OTHER`
 * requires, and the single target the action names. It answers, never throws, so a caller that stores its change in
 * the same transaction learns about a refused entry before any statement runs.
 */
export function validateAdminActionEntry(input: unknown): AdminActionValidation {
  if (!isRecord(input)) {
    return { ok: false, issue: ADMIN_ACTION_ENTRY_ISSUE };
  }

  const { adminUserId, action, reason } = input;

  if (!isAdminActionType(action)) {
    return { ok: false, issue: ADMIN_ACTION_TYPE_ISSUE };
  }
  if (!isAdminActionReason(reason)) {
    return { ok: false, issue: ADMIN_ACTION_REASON_ISSUE };
  }
  if (!isUuid(adminUserId)) {
    return { ok: false, issue: ADMIN_ACTION_ACTOR_ISSUE };
  }

  const rawNote = input.note ?? null;
  if (rawNote !== null && typeof rawNote !== "string") {
    return { ok: false, issue: ADMIN_ACTION_NOTE_TYPE_ISSUE };
  }
  const note = typeof rawNote === "string" ? rawNote.trim() : null;
  if (note !== null && note.length > ADMIN_ACTION_NOTE_MAX_LENGTH) {
    return { ok: false, issue: ADMIN_ACTION_NOTE_LENGTH_ISSUE };
  }
  if (reason === ADMIN_ACTION_REASON.OTHER && (note === null || note.length === 0)) {
    return { ok: false, issue: ADMIN_ACTION_NOTE_REQUIRED_ISSUE };
  }

  const targetUserId = input.targetUserId ?? null;
  const invitationId = input.invitationId ?? null;
  if (!isOptionalUuid(targetUserId) || !isOptionalUuid(invitationId)) {
    return { ok: false, issue: ADMIN_ACTION_TARGET_TYPE_ISSUE };
  }

  const target = adminActionTarget(action);
  if (target === null) {
    // The platform-wide action names nothing. A target would make the row claim a resource it never changed.
    if (targetUserId !== null || invitationId !== null) {
      return { ok: false, issue: ADMIN_ACTION_NO_TARGET_ISSUE };
    }
  } else {
    if ((targetUserId === null) === (invitationId === null)) {
      return { ok: false, issue: ADMIN_ACTION_TARGET_COUNT_ISSUE };
    }
    if (target === "invitation" && invitationId === null) {
      return { ok: false, issue: `${action} must target an invitation` };
    }
    if (target === "user" && targetUserId === null) {
      return { ok: false, issue: `${action} must target a user` };
    }
  }

  return {
    ok: true,
    value: {
      adminUserId,
      action,
      reason,
      note: note === null || note.length === 0 ? null : note,
      targetUserId,
      invitationId,
    },
  };
}
