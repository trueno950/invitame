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
