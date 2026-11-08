import { createHash } from "node:crypto";

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
 * Decision 7: at most 5 second-factor codes per 60 seconds per client IP. It equals Better Auth's
 * per-challenge limit of 5 wrong codes, so a client alone on its IP can use a whole challenge within a
 * minute; clients that share an IP share these 5, so one of their challenges can be cut short. It sits
 * below the plugin default for `/two-factor/*` of 3 per 10 seconds (18 a minute).
 */
export const SECOND_FACTOR_RATE_LIMIT = { window: 60, max: 5 } as const;
/** S25, L23: at most 5 sign-in codes per hour per email address. */
export const EMAIL_CODE_QUOTA = { window: 3600, max: 5 } as const;

/** The prefix of every per-email count key; exported so tests can tell these rows apart. */
export const EMAIL_CODE_QUOTA_KEY_PREFIX = "sign-in-code-email|";

/**
 * The `RateLimit` key that counts codes for one address: a SHA-256 of the trimmed, lower-cased
 * address, so the plain address is never stored. Better Auth's own keys are `<ip>|<path>`, and a
 * path always starts with "/", so the two never collide.
 */
export function emailCodeQuotaKey(email: string): string {
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `${EMAIL_CODE_QUOTA_KEY_PREFIX}${digest}`;
}
