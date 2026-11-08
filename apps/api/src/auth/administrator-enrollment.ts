import type { Auth, BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import type { twoFactor } from "better-auth/plugins";

import {
  type AccountAccess,
  isActive,
  isPendingAdministrator,
  isWithinEnrollmentWindow,
  USER_ROLE,
} from "./account-access";
import { TWO_FACTOR_PATH } from "./auth-paths";
import {
  AUTH_REQUEST_EVENT,
  type AuthRequestLog,
  type EnrollmentRevertResult,
} from "./auth-request-guard";
import { errorClass, logSafely } from "./safe-logging";

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
 * What the session-create hook does with a session Better Auth is about to create (S39, S40):
 * `allow` it, `refuse` it and leave the enrollment as it is, or `revert` the enrollment and refuse.
 */
export type FirstConfirmationDecision = "allow" | "refuse" | "revert";

/** The pending session `verify-totp` resolved for a first confirmation. */
interface ResolvedSession {
  token?: unknown;
  createdAt?: unknown;
}

/**
 * Decides a session Better Auth is about to create on `verify-totp` (T9a-D1, S39, S40), and ends
 * sessions of the user as part of that decision (an allowed confirmation and case 3 below). Better Auth
 * 1.7.16 confirms a first code by setting `twoFactorEnabled`, then creating the enrolled session,
 * then setting its cookie, then deleting the pending session, and finally marking the `TwoFactor`
 * row verified, each in its own statement (`plugins/two-factor/totp/index.mjs`, `verifyTOTP`). Once
 * the flag commits, the reissue of `admin:create` is refused and a password sign-in needs the
 * second factor.
 *
 * Only an ADMIN whose flag is already true on the TOTP path is decided; everything else is allowed
 * and left to the other checks. The endpoint tells the two uses apart: it resolves the request's
 * session first and stores it on its context (`context.context.session`, the same object this hook
 * receives); a sign-in challenge has none and is allowed (`plugins/two-factor/verify-two-factor.mjs`).
 * A first confirmation is allowed only while its pending session still exists for this user; every
 * other session of the user is then ended, so no session opened with the password alone keeps
 * authority once the administrator is enrolled. Otherwise the confirmation was superseded:
 * 1. a verified `TwoFactor` row means another confirmation completed: refuse;
 * 2. a user who is not ACTIVE, or a credential account that is missing or was issued after the
 *    pending session began (an `admin:create` reissue): revert;
 * 3. a session of this user created at or after the pending one means a duplicate submit may be
 *    completing, or a second tab signed in with the password alone: every session of the user is
 *    ended, then refuse;
 * 4. otherwise (a sign-out, or a reissue the clocks hide): revert.
 * Every query uses the raw adapter, which runs no hooks.
 */
export async function settleFirstConfirmation(
  context: SessionCreateContext,
  user: AccountAccess & { id: string },
  log: AuthRequestLog,
): Promise<FirstConfirmationDecision> {
  if (
    context.path !== TWO_FACTOR_PATH.VERIFY_TOTP ||
    user.role !== USER_ROLE.ADMIN ||
    user.twoFactorEnabled !== true
  ) {
    return "allow";
  }

  const resolved = context.context.session as { session?: ResolvedSession | null } | null;
  const snapshot = resolved?.session;
  if (!snapshot) {
    return "allow";
  }

  const { adapter } = context.context;
  const token = typeof snapshot.token === "string" ? snapshot.token : "";
  const pending =
    token === ""
      ? null
      : await adapter.findOne<{ userId?: unknown }>({
          model: "session",
          where: [{ field: "token", value: token }],
        });
  if (pending?.userId === user.id) {
    await deleteSiblingSessions(context, log, [
      { field: "userId", value: user.id },
      { field: "token", operator: "ne", value: token },
    ]);
    return "allow";
  }

  return settleSupersededConfirmation(context, user, snapshot, log);
}

/**
 * Ends sessions of a user with the raw adapter. A failure is logged once, as the path and the error
 * class (S50, L71), and rethrown, so the hook still fails closed.
 */
async function deleteSiblingSessions(
  context: SessionCreateContext,
  log: AuthRequestLog,
  where: Parameters<SessionCreateContext["context"]["adapter"]["deleteMany"]>[0]["where"],
): Promise<void> {
  try {
    await context.context.adapter.deleteMany({ model: "session", where });
  } catch (error) {
    logSafely(log, {
      event: AUTH_REQUEST_EVENT.SIBLING_SESSIONS_DELETE_FAILED,
      path: context.path,
      error: errorClass(error),
    });
    throw error;
  }
}

/** Cases 1 to 4 of `settleFirstConfirmation`; case 3 ends every session of the user. */
async function settleSupersededConfirmation(
  context: SessionCreateContext,
  user: AccountAccess & { id: string },
  snapshot: ResolvedSession,
  log: AuthRequestLog,
): Promise<"refuse" | "revert"> {
  const { adapter, internalAdapter } = context.context;
  const enrollment = await adapter.findOne<{ verified?: unknown }>({
    model: "twoFactor",
    where: [{ field: "userId", value: user.id }],
  });
  if (enrollment?.verified === true) {
    return "refuse";
  }
  if (!isActive(user)) {
    return "revert";
  }

  const startedAt = timeOf(snapshot.createdAt);
  const issuedAt = timeOf((await internalAdapter.findCredentialAccount(user.id))?.createdAt);
  if (startedAt === undefined || issuedAt === undefined || issuedAt > startedAt) {
    return "revert";
  }

  const completing = await adapter.count({
    model: "session",
    where: [
      { field: "userId", value: user.id },
      { field: "createdAt", operator: "gte", value: new Date(startedAt) },
    ],
  });
  if (completing === 0) {
    return "revert";
  }
  // A newer session may be a sibling confirmation or a second tab signed in with the password alone;
  // they cannot be told apart, so every session of the user ends before the refusal.
  await deleteSiblingSessions(context, log, [{ field: "userId", value: user.id }]);
  return "refuse";
}

/** Milliseconds since the epoch, or undefined for anything that is not a valid date. */
function timeOf(value: unknown): number | undefined {
  if (!(value instanceof Date) && typeof value !== "string") {
    return undefined;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : time;
}

/**
 * Refuses a superseded first confirmation (S39, S40) and returns the error the session-create hook
 * throws, so no session row and no cookie exist. It first logs one `administrator_enrollment_superseded`
 * event whose `compensation` names the chosen compensation: `skipped` for `refuse`, `reverted` for
 * `revert`. A revert sets `twoFactorEnabled` back to false for this user only if it is still true, and
 * changes no other column (Prisma still stamps `updatedAt`). If that update throws, one
 * `administrator_enrollment_compensation_failed` event with the error class follows and the refusal
 * stands. Then, as when the process stops before the update, the flag stays true without a session:
 * the account is locked, fails closed, and only the manual recovery procedure (T10) releases it.
 *
 * After a revert attempt, one `administrator_enrollment_revert_result` event names its result:
 * `reverted`, `unchanged` (the guarded update matched no row), or `failed` (S50, L71).
 */
export async function refuseSupersededConfirmation(
  context: SessionCreateContext,
  userId: string,
  decision: "refuse" | "revert",
  log: AuthRequestLog,
): Promise<APIError> {
  const path = context.path;
  logSafely(log, {
    event: AUTH_REQUEST_EVENT.ENROLLMENT_SUPERSEDED,
    path,
    compensation: decision === "revert" ? "reverted" : "skipped",
  });

  if (decision === "revert") {
    let result: EnrollmentRevertResult = "failed";
    try {
      const changed = await context.context.adapter.updateMany({
        model: "user",
        where: [
          { field: "id", value: userId },
          { field: "twoFactorEnabled", value: true },
        ],
        update: { twoFactorEnabled: false },
      });
      result = changed > 0 ? "reverted" : "unchanged";
    } catch (error) {
      logSafely(log, {
        event: AUTH_REQUEST_EVENT.ENROLLMENT_COMPENSATION_FAILED,
        path,
        error: errorClass(error),
      });
    }
    // Logged after the attempt, with what it did (S50, L71).
    logSafely(log, { event: AUTH_REQUEST_EVENT.ENROLLMENT_REVERT_RESULT, path, result });
  }

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
