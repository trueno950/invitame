import { createHash } from "node:crypto";

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

/** S25: at most 3 requests per 60 seconds per client IP on each of the two code endpoints. */
export const CLIENT_IP_RATE_LIMIT = { window: 60, max: 3 } as const;

/**
 * Decision 7: at most 3 password checks per 60 seconds per client IP, on password sign-in and on the
 * two-factor endpoints that verify the password. Each check runs the scrypt hash, so the rule bounds
 * hashing work as much as guessing; an administrator who mistypes still has 3 tries a minute.
 * Better Auth's own default for `/sign-in/*` is 3 per 10 seconds, six times looser.
 */
export const PASSWORD_ATTEMPT_RATE_LIMIT = { window: 60, max: 3 } as const;

/**
 * Decision 7: at most 5 second-factor codes per 60 seconds per client IP. It sits above Better Auth's
 * per-challenge limit of 5 wrong codes, so one honest challenge is never cut short, and below the
 * plugin default for `/two-factor/*` of 3 per 10 seconds (18 a minute).
 */
export const SECOND_FACTOR_RATE_LIMIT = { window: 60, max: 5 } as const;
/** S25, L23: at most 5 sign-in codes per hour per email address. */
export const EMAIL_CODE_QUOTA = { window: 3600, max: 5 } as const;

const EMAIL_CODE_QUOTA_KEY_PREFIX = "sign-in-code-email|";

/**
 * The `RateLimit` key that counts codes for one address: a SHA-256 of the trimmed, lower-cased
 * address, so the plain address is never stored. Better Auth's own keys are `<ip>|<path>`, and a
 * path always starts with "/", so the two never collide.
 */
export function emailCodeQuotaKey(email: string): string {
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `${EMAIL_CODE_QUOTA_KEY_PREFIX}${digest}`;
}
