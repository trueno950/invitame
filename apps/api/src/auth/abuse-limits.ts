import { createHash } from "node:crypto";

/** The endpoint that issues a sign-in code. */
export const SIGN_IN_CODE_REQUEST_PATH = "/email-otp/send-verification-otp";
/** The endpoint where an email code signs in, and creates a customer account on first sign-in. */
export const EMAIL_CODE_SIGN_IN_PATH = "/sign-in/email-otp";

/** S25: at most 3 requests per 60 seconds per client IP on each of the two code endpoints. */
export const CLIENT_IP_RATE_LIMIT = { window: 60, max: 3 } as const;
/** S25, L23: at most 5 sign-in codes per hour per email address. */
export const EMAIL_CODE_QUOTA = { window: 3600, max: 5 } as const;
/** Bound on sign-in code deliveries waiting in the background, per process (L24). */
export const MAX_PENDING_SIGN_IN_CODE_TASKS = 100;

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
