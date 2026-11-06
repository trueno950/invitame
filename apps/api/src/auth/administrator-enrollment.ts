import type { Auth, BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import type { twoFactor } from "better-auth/plugins";

import { TWO_FACTOR_PATH } from "./abuse-limits";
import {
  type AccountAccess,
  isPendingAdministrator,
  isWithinEnrollmentWindow,
  USER_ROLE,
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

type SessionCreateBefore = NonNullable<
  NonNullable<NonNullable<BetterAuthOptions["databaseHooks"]>["session"]>["create"]
>["before"];
/** The endpoint context Better Auth passes to the session-create hook (null outside an endpoint). */
export type SessionCreateContext = NonNullable<Parameters<NonNullable<SessionCreateBefore>>[1]>;

/**
 * The refusal of a first TOTP confirmation that lost a race (S39, T7c): `401` with a stable code.
 * The web treats every `401` from `verify-totp` other than `INVALID_CODE` as an ended session.
 */
export const ENROLLMENT_SUPERSEDED = {
  code: "ENROLLMENT_SUPERSEDED",
  message: "The enrollment is no longer valid. Sign in again.",
} as const;

/**
 * Whether the session Better Auth is about to create on `verify-totp` belongs to a first TOTP
 * confirmation whose pending session is gone (T9a-D1, S39). Better Auth 1.7.16 confirms a first
 * code by setting `twoFactorEnabled`, then creating the enrolled session, then setting its cookie,
 * then deleting the pending session, and finally marking the `TwoFactor` row verified, each in its
 * own statement (`plugins/two-factor/totp/index.mjs`, `verifyTOTP`). Once the flag commits, the
 * reissue of `admin:create` is refused, so a reissue or a `user:disable` that won the race has
 * already deleted the pending session by the time this runs.
 *
 * Only an ADMIN whose flag is already true on the TOTP path is checked. A verified `TwoFactor` row
 * means a sign-in challenge (Better Auth refuses a challenge on an unverified row), which carries no
 * session and needs no check. Otherwise (no row, or an unverified one) it is a first confirmation,
 * and the session named by the request's signed session cookie, the one `verify-totp` resolved, must
 * still exist and belong to this user. The checks use the raw adapter, which runs no hooks.
 */
export async function isSupersededFirstConfirmation(
  context: SessionCreateContext,
  user: AccountAccess & { id: string },
): Promise<boolean> {
  if (
    context.path !== TWO_FACTOR_PATH.VERIFY_TOTP ||
    user.role !== USER_ROLE.ADMIN ||
    user.twoFactorEnabled !== true
  ) {
    return false;
  }

  const { adapter, authCookies, secret } = context.context;
  const enrollment = await adapter.findOne<{ verified?: unknown }>({
    model: "twoFactor",
    where: [{ field: "userId", value: user.id }],
  });
  if (enrollment?.verified === true) {
    return false;
  }

  const token = await context.getSignedCookie(authCookies.sessionToken.name, secret);
  const pending =
    typeof token === "string" && token !== ""
      ? await adapter.findOne<{ userId?: unknown }>({
          model: "session",
          where: [{ field: "token", value: token }],
        })
      : null;
  return pending?.userId !== user.id;
}

/**
 * Compensates a superseded first confirmation (S39): sets `twoFactorEnabled` back to false for this
 * user only if it is still true, and changes no other column (Prisma still stamps `updatedAt`).
 * Returns the error the session-create hook throws, so no session row and no cookie exist. If the
 * process stops before this update, the flag stays true with no `TwoFactor` row and no session: the
 * account is locked, fails closed, and only the manual recovery procedure (T10) releases it.
 */
export async function revertSupersededEnrollment(
  context: SessionCreateContext,
  userId: string,
): Promise<APIError> {
  await context.context.adapter.updateMany({
    model: "user",
    where: [
      { field: "id", value: userId },
      { field: "twoFactorEnabled", value: true },
    ],
    update: { twoFactorEnabled: false },
  });
  return APIError.from("UNAUTHORIZED", ENROLLMENT_SUPERSEDED);
}

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
