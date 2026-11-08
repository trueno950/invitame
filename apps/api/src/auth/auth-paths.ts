// Better Auth endpoint paths that project code refers to by name: the session hooks, the session
// refusal, the enrollment gate, and the rate-limit rules all key on them.

/** The endpoint that issues a sign-in code. */
export const SIGN_IN_CODE_REQUEST_PATH = "/email-otp/send-verification-otp";
/** The endpoint where an email code signs in, and creates a customer account on first sign-in. */
export const EMAIL_CODE_SIGN_IN_PATH = "/sign-in/email-otp";

/** The endpoint where an administrator signs in with email and password (decision 3). */
export const PASSWORD_SIGN_IN_PATH = "/sign-in/email";

/** Better Auth two-factor endpoints that stay enabled (T7). */
export const TWO_FACTOR_PATH = {
  ENABLE: "/two-factor/enable",
  VERIFY_TOTP: "/two-factor/verify-totp",
  VERIFY_BACKUP_CODE: "/two-factor/verify-backup-code",
  GENERATE_BACKUP_CODES: "/two-factor/generate-backup-codes",
} as const;

/**
 * The second-factor verification endpoints. In Better Auth 1.7.16 they are the only enabled endpoints
 * that create a session after a verified second factor: `verify-totp` and `verify-backup-code` open
 * the session of a sign-in challenge, and `verify-totp` also opens the enrolled session of a first
 * confirmation (`plugins/two-factor/totp/index.mjs`, `verify-two-factor.mjs`). The other
 * session-creating two-factor code (`/two-factor/enable` with `method: "otp"` or
 * `skipVerificationOnEnable`, and `/two-factor/disable`) is closed by the plugin options and
 * `DISABLED_AUTH_PATHS`.
 */
export const SECOND_FACTOR_VERIFY_PATHS: ReadonlySet<string> = new Set([
  TWO_FACTOR_PATH.VERIFY_TOTP,
  TWO_FACTOR_PATH.VERIFY_BACKUP_CODE,
]);
