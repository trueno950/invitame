import {
  AccountAlreadyActiveError,
  AccountAlreadyDisabledError,
  AdminAccountProtectedError,
} from "./account-support.errors";

// The account support rules (M9 T9; S4, S6, L8, L9). This file is pure: no framework, ORM, or transport type, so each
// rule is stated once and can be exercised from a table. The adapter states the same rules inside its transaction
// against the row it just read, and the columns' own enums are behind them, so a value this file accepts is a value
// the account can hold. The role and status values are the stored `UserRole` and `UserStatus` labels.

/** The stored `User.role` values the support actions read. */
export const SUPPORT_ACCOUNT_ROLE = {
  CUSTOMER: "CUSTOMER",
  ADMIN: "ADMIN",
} as const;

export type SupportAccountRole = (typeof SUPPORT_ACCOUNT_ROLE)[keyof typeof SUPPORT_ACCOUNT_ROLE];

/** The stored `User.status` values the support actions change. */
export const SUPPORT_ACCOUNT_STATUS = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;

export type SupportAccountStatus =
  (typeof SUPPORT_ACCOUNT_STATUS)[keyof typeof SUPPORT_ACCOUNT_STATUS];

/** What the support rules read of one stored account: never its address, its name, or its sessions. */
export interface SupportAccountState {
  role: SupportAccountRole;
  status: SupportAccountStatus;
}

/**
 * Refuses an administrator account (S4, S6). Both support transitions check it before they touch the row, so an
 * administrator's access is changed only by the server-side commands an operator runs.
 */
export function refuseProtectedAdministrator(account: SupportAccountState): void {
  if (account.role === SUPPORT_ACCOUNT_ROLE.ADMIN) {
    throw new AdminAccountProtectedError();
  }
}

/** The status an ACTIVE account moves to; a DISABLED one has nothing to disable (S4). */
export function disableTransition(status: SupportAccountStatus): SupportAccountStatus {
  if (status !== SUPPORT_ACCOUNT_STATUS.ACTIVE) {
    throw new AccountAlreadyDisabledError();
  }
  return SUPPORT_ACCOUNT_STATUS.DISABLED;
}

/** The status a DISABLED account moves to; an ACTIVE one has nothing to reactivate (L9). */
export function reactivateTransition(status: SupportAccountStatus): SupportAccountStatus {
  if (status !== SUPPORT_ACCOUNT_STATUS.DISABLED) {
    throw new AccountAlreadyActiveError();
  }
  return SUPPORT_ACCOUNT_STATUS.ACTIVE;
}

/**
 * Whether an account may be sent a sign-in code: only an active customer. It repeats the auth module's own
 * `mayReceiveSignInCode` rule (`apps/api/src/auth/account-access.ts`) at the route's boundary so the administrator gets
 * a 409 instead of an audited request that delivers nothing; the sender applies the rule again before any code is
 * mailed, and that is what actually keeps a code from an administrator or a disabled account.
 */
export function mayRequestSignInCode(account: SupportAccountState): boolean {
  return (
    account.status === SUPPORT_ACCOUNT_STATUS.ACTIVE &&
    account.role === SUPPORT_ACCOUNT_ROLE.CUSTOMER
  );
}
