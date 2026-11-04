import { APIError } from "better-auth/api";

import { EMAIL_CODE_SIGN_IN_PATH } from "./abuse-limits";

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

/** The stored fields that decide access, as Better Auth returns them for a user. */
export interface AccountAccess {
  role?: unknown;
  status?: unknown;
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
 * The response of `POST /sign-in/email-otp` for a wrong code (Better Auth 1.7.16,
 * `plugins/email-otp/error-codes.mjs`). A refused session on that path answers exactly the same, so
 * the response never reveals that the address belongs to an administrator or a DISABLED user.
 */
const INVALID_CODE = { code: "INVALID_OTP", message: "Invalid OTP" } as const;
const SESSION_REFUSED = { code: "FAILED_TO_CREATE_SESSION", message: "Failed to create session" };

/**
 * Decides whether Better Auth may create a session for this stored user on this endpoint path (null
 * outside an endpoint). Returns the error to throw, or null to allow it:
 * - a missing or non-ACTIVE user gets no session on any path (S9, S18);
 * - an administrator gets no session from an email code (decision 3, S22): administrators sign in with
 *   a password and an authenticator app (T7), so an email code would bypass both.
 */
export function sessionRefusal(account: AccountAccess | null, path: string | undefined) {
  const byEmailCode = path === EMAIL_CODE_SIGN_IN_PATH || path?.startsWith("/email-otp/") === true;

  if (account && isActive(account) && !(byEmailCode && account.role !== USER_ROLE.CUSTOMER)) {
    return null;
  }

  return byEmailCode
    ? APIError.from("BAD_REQUEST", INVALID_CODE)
    : APIError.from("UNAUTHORIZED", SESSION_REFUSED);
}
