import type { Auth } from "better-auth";
import type { twoFactor } from "better-auth/plugins";

import { TWO_FACTOR_PATH } from "./abuse-limits";
import {
  type AccountAccess,
  isPendingAdministrator,
  isWithinEnrollmentWindow,
} from "./account-access";

/** The issuer label of the TOTP URI shown at enrollment (decision 3). */
export const TOTP_ISSUER = "InvitaMe";

/**
 * Better Auth two-factor plugin options (1.7.16), every security-relevant value pinned:
 * - `allowPasswordless: false`: enabling TOTP needs the password, even with a session;
 * - `skipVerificationOnEnable: false` and no `otpOptions`: `twoFactorEnabled` is set only by the first
 *   valid TOTP code (`plugins/two-factor/index.mjs`, `enableTwoFactor`; `method: "otp"` answers
 *   `400 OTP_NOT_CONFIGURED`);
 * - TOTP: 6 digits, 30-second period; Better Auth accepts one period either side;
 * - backup codes: 10 codes of 10 characters, stored encrypted with the auth secret, each removed from
 *   the stored list when used (`backup-codes/index.mjs`, `verifyBackupCode`);
 * - a sign-in challenge expires after 600 seconds and ends after 5 wrong codes (fixed in Better Auth,
 *   `beginAttempt(5)`); after 10 consecutive failures across challenges the account's second factor is
 *   locked for 900 seconds (`failedVerificationCount`, `lockedUntil`; `verify-two-factor.mjs`).
 * Trusted devices are never honored: the session hook forces `trustDevice: false`.
 */
export const TWO_FACTOR_OPTIONS = {
  issuer: TOTP_ISSUER,
  allowPasswordless: false,
  skipVerificationOnEnable: false,
  twoFactorCookieMaxAge: 600,
  totpOptions: { digits: 6, period: 30 },
  backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
  accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 900 },
} as const satisfies NonNullable<Parameters<typeof twoFactor>[0]>;

/**
 * The only Better Auth endpoints on which an administrator who has not enrolled may use a session
 * (S21): read it, start enrollment, confirm enrollment with the first code, and sign out. On every
 * other endpoint the session is hidden, so the endpoint answers exactly as without a session.
 */
export const PENDING_ADMINISTRATOR_ENDPOINTS: ReadonlySet<string> = new Set([
  "/get-session",
  TWO_FACTOR_PATH.ENABLE,
  TWO_FACTOR_PATH.VERIFY_TOTP,
  "/sign-out",
]);

type InternalAdapter = Awaited<Auth["$context"]>["internalAdapter"];

/**
 * Whether an administrator who has not enrolled may still use the initial password (S20). The issue
 * time is the `createdAt` of the user's credential account (`providerId: "credential"`, `accountId`
 * equal to the user id, as Better Auth's password sign-in looks it up). Better Auth writes `createdAt`
 * only when it creates an account (`db/internal-adapter.mjs`, `createAccount`); every HTTP route that
 * could create or replace a credential account is disabled or server-only (`DISABLED_AUTH_PATHS`), so
 * only the server-side creation command restarts the window. No credential account means no window.
 * Returns true for anyone who is not a pending administrator.
 */
export async function enrollmentWindowOpen(
  internalAdapter: InternalAdapter,
  userId: string,
  account: AccountAccess,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isPendingAdministrator(account)) {
    return true;
  }

  const credential = await internalAdapter.findCredentialAccount(userId);
  return isWithinEnrollmentWindow(credential?.createdAt, now);
}
