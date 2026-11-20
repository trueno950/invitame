import type { AdminActionReason } from "../../admin/admin-action-recorder";

// The account support port of the users module (M9 T9; S4, S6, L9). It is separate from `UserAccessRepository`, which
// the `user:disable` command uses, for two reasons: the support actions address an account by id and never by email,
// and each one writes its `AdminAction` row in the transaction that changes the account. The command's
// `disableAndRevokeSessions` keeps its own behaviour — idempotent, keyed by email, and not audited — unchanged.
//
// Every method answers null for an id no account has (the route's one 404 `USER_NOT_FOUND`); the refusals
// (`AdminAccountProtectedError`, `AccountAlreadyDisabledError`, `AccountAlreadyActiveError`,
// `UserCannotSignInByCodeError`) come from the domain and reach the route unchanged.

/**
 * Why an administrator took an account action and who did it (S6): the one audit row the change writes names both, and
 * the actor is the session's own id, never a client-supplied one.
 */
export interface AdminUserActionAudit {
  adminUserId: string;
  reason: AdminActionReason;
  /** The administrator's optional note, as they sent it: the recorder trims it and enforces its bound. */
  note: string | null;
}

/** What disabling did: the stored status and how many sessions it revoked in the same transaction (S4). */
export interface AdminAccountDisabled {
  status: "DISABLED";
  revokedSessions: number;
}

/** What reactivating did (L9). */
export interface AdminAccountReactivated {
  status: "ACTIVE";
}

/**
 * What a recorded sign-in-code request carries: the stored address the code goes to. The request itself is the auth
 * module's — the per-email quota, hashing, expiry, attempt cap, and the sender's own refusals stay theirs — so the
 * port answers only the address its caller must hand over.
 */
export interface AdminSignInCodeRequest {
  email: string;
}

/** The account support port; every method is one transaction of the adapter's own. */
export interface AdminUserAccountRepository {
  /**
   * In one transaction: ACTIVE → DISABLED for any customer, every session of the account deleted, and the
   * `ACCOUNT_DISABLED` audit row written with that same transaction client. The account's invitations are untouched
   * (L8: «Siguen publicadas»).
   *
   * Null means no account has this id. An administrator account refuses with `AdminAccountProtectedError` and an
   * account that is already DISABLED with `AccountAlreadyDisabledError`; neither writes a change or an audit row.
   */
  disableForAdmin(
    userId: string,
    audit: AdminUserActionAudit,
  ): Promise<AdminAccountDisabled | null>;

  /**
   * In one transaction: DISABLED → ACTIVE and the `ACCOUNT_REACTIVATED` audit row. Sessions stay as they are — every
   * one of them was revoked when the account was disabled, so the customer signs in again by code (L9).
   *
   * Null means no account has this id. An administrator account refuses with `AdminAccountProtectedError` and an
   * account that is already ACTIVE with `AccountAlreadyActiveError`; neither writes anything.
   */
  reactivateForAdmin(
    userId: string,
    audit: AdminUserActionAudit,
  ): Promise<AdminAccountReactivated | null>;

  /**
   * In one transaction: the account is read, a DISABLED account or an administrator's is refused with
   * `UserCannotSignInByCodeError`, and the `SIGN_IN_CODE_RESENT` audit row is written for the request. The row records
   * that an administrator asked for a code — written before the request is made — never that one was delivered.
   *
   * Null means no account has this id. The read and the audit row share one transaction, so a request is never
   * recorded against an account the support action could not see, and a refused request writes no row.
   */
  requestSignInCodeForAdmin(
    userId: string,
    audit: AdminUserActionAudit,
  ): Promise<AdminSignInCodeRequest | null>;
}

export const ADMIN_USER_ACCOUNT_REPOSITORY = Symbol("AdminUserAccountRepository");
