import { APIError } from "better-auth/api";

import { EMAIL_CODE_SIGN_IN_PATH, PASSWORD_SIGN_IN_PATH } from "./abuse-limits";

/** Stored `User.role` values; the role is server-side only (ADR 0004 decision 6). */
export const USER_ROLE = {
  CUSTOMER: "CUSTOMER",
  ADMIN: "ADMIN",
} as const;

/** Stored `User.status` values. */
export const USER_STATUS = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;

/** S20 (L30): an un-enrolled administrator's initial password works for 24 hours after its issue. */
export const ADMINISTRATOR_ENROLLMENT_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * Tolerated clock difference between the process that issued the password and the API. An issue time
 * further in the future than this is treated as invalid, so the window never grows beyond 24 hours.
 */
const ISSUE_TIME_CLOCK_SKEW_MS = 60_000;

/** The stored fields that decide access, as Better Auth returns them for a user. */
export interface AccountAccess {
  role?: unknown;
  status?: unknown;
  twoFactorEnabled?: unknown;
}

/** Only an active account may hold a session or reach a protected route; anything else fails closed. */
export function isActive(account: AccountAccess): boolean {
  return account.status === USER_STATUS.ACTIVE;
}

/** Sign-in codes go only to active customers: never to an administrator (decision 3) or a DISABLED user. */
export function mayReceiveSignInCode(account: AccountAccess): boolean {
  return isActive(account) && account.role === USER_ROLE.CUSTOMER;
}

/**
 * An administrator who has not confirmed an authenticator app (S6, S21). Enrollment is read from
 * `User.twoFactorEnabled` only. Better Auth sets it after the first valid TOTP code of a signed-in
 * user (1.7.16 `plugins/two-factor/totp/index.mjs`, `verifyTOTP`); the other two paths that set it,
 * `method: "otp"` and `skipVerificationOnEnable`, are closed by the plugin options (`auth.factory.ts`).
 * A `TwoFactor` row and its `verified` column never count: the column defaults to true (L17). Any
 * value other than the boolean `true`, including a missing field, means not enrolled.
 */
export function isPendingAdministrator(account: AccountAccess): boolean {
  return account.role === USER_ROLE.ADMIN && account.twoFactorEnabled !== true;
}

/**
 * Whether an initial password issued at `issuedAt` is still inside the 24-hour enrollment window
 * (S20). Fails closed: a missing or invalid time, or one far in the future, is outside the window.
 */
export function isWithinEnrollmentWindow(issuedAt: unknown, now: Date = new Date()): boolean {
  const issued =
    issuedAt instanceof Date ? issuedAt.getTime() : new Date(issuedAt as string).getTime();
  if (issuedAt === null || issuedAt === undefined || !Number.isFinite(issued)) {
    return false;
  }

  const elapsed = now.getTime() - issued;
  return (
    elapsed >= -ISSUE_TIME_CLOCK_SKEW_MS && elapsed < ADMINISTRATOR_ENROLLMENT_WINDOW_SECONDS * 1000
  );
}

/**
 * The response of `POST /sign-in/email-otp` for a wrong code (Better Auth 1.7.16,
 * `plugins/email-otp/error-codes.mjs`). A refused session on that path answers exactly the same, so
 * the response never reveals that the address belongs to an administrator or a DISABLED user.
 */
const INVALID_CODE = { code: "INVALID_OTP", message: "Invalid OTP" } as const;
/**
 * The response of `POST /sign-in/email` for an unknown address or a wrong password (Better Auth
 * 1.7.16, `api/routes/sign-in.mjs`, `INVALID_EMAIL_OR_PASSWORD`). A refused session on that path
 * answers exactly the same, so a right password never reveals anything either.
 */
const INVALID_EMAIL_OR_PASSWORD = {
  code: "INVALID_EMAIL_OR_PASSWORD",
  message: "Invalid email or password",
} as const;
const SESSION_REFUSED = { code: "FAILED_TO_CREATE_SESSION", message: "Failed to create session" };

/**
 * Decides whether Better Auth may create a session for this stored user on this endpoint path (null
 * outside an endpoint). Returns the error to throw, or null to allow it:
 * - a missing or non-ACTIVE user gets no session on any path (S9, S18);
 * - an administrator gets no session from an email code (decision 3, S22): administrators sign in with
 *   a password and an authenticator app, so an email code would bypass both;
 * - only an administrator gets a session from a password (decision 3): customers have no password;
 * - an administrator who has not enrolled gets no session once the window of the initial password
 *   has ended (S20); `enrollmentWindowOpen` carries that check, made by the caller from stored data.
 */
export function sessionRefusal(
  account: AccountAccess | null,
  path: string | undefined,
  enrollmentWindowOpen = false,
) {
  const byEmailCode = path === EMAIL_CODE_SIGN_IN_PATH || path?.startsWith("/email-otp/") === true;
  const byPassword = path === PASSWORD_SIGN_IN_PATH;

  if (
    account &&
    isActive(account) &&
    !(byEmailCode && account.role !== USER_ROLE.CUSTOMER) &&
    !(byPassword && account.role !== USER_ROLE.ADMIN) &&
    !(isPendingAdministrator(account) && !enrollmentWindowOpen)
  ) {
    return null;
  }

  if (byEmailCode) {
    return APIError.from("BAD_REQUEST", INVALID_CODE);
  }
  return byPassword
    ? APIError.from("UNAUTHORIZED", INVALID_EMAIL_OR_PASSWORD)
    : APIError.from("UNAUTHORIZED", SESSION_REFUSED);
}
