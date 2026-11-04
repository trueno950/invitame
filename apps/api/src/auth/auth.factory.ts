import { type Auth, type BetterAuthOptions, betterAuth } from "better-auth";
import { getIP } from "better-auth/api";
import { emailOTP } from "better-auth/plugins";

import type { ClientIpEnvironment } from "../config/environment";
import {
  CLIENT_IP_RATE_LIMIT,
  EMAIL_CODE_QUOTA,
  EMAIL_CODE_SIGN_IN_PATH,
  SIGN_IN_CODE_REQUEST_PATH,
} from "./abuse-limits";
import { type AuthRequestLog, guardAuthHandler } from "./auth-request-guard";
import { createBetterAuthSignInCodeStore } from "./sign-in-code/better-auth-sign-in-code-store";
import {
  SIGN_IN_CODE_ALLOWED_ATTEMPTS,
  SIGN_IN_CODE_EXPIRES_IN_SECONDS,
  SIGN_IN_CODE_LENGTH,
} from "./sign-in-code/sign-in-code-message";
import type { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

/**
 * Better Auth's database rate limiter deletes every `RateLimit` row older than the longest window it
 * knows of. This entry never matches a request (paths start with "/"); it only declares the hour of
 * the per-email code count. That row's `lastRequest` is its window start, so it survives pruning
 * until its window has ended (L25).
 */
const EMAIL_CODE_QUOTA_RETENTION_RULE = "email-code-quota-retention";

export interface CreateAuthOptions {
  /** Signing secret supplied by validated configuration; never hard-coded. */
  secret: string;
  /** Public origin of the API that serves the auth routes. */
  baseURL: string;
  /** Validated trusted origins; the same list feeds the project-owned CORS policy. */
  trustedOrigins: readonly string[];
  /** Persistence adapter: the Prisma adapter at runtime, the in-memory adapter in isolated tests. */
  database: NonNullable<BetterAuthOptions["database"]>;
  /** Delivers customer sign-in codes in the background (ADR 0004 decision 8, as amended). */
  signInCodes: SignInCodeSender;
  /** The validated header and trusted proxies that identify a client for rate limits. */
  clientIp: ClientIpEnvironment;
  /**
   * Production: reject a request whose client IP cannot be resolved instead of letting every such
   * client share one rate-limit bucket (L24).
   */
  requireClientIp: boolean;
  /** Receives privacy-safe warnings about rejected auth requests. */
  log: AuthRequestLog;
}

/**
 * Builds the Better Auth instance from explicit options, so the runtime and tests share one
 * configuration source. The caller owns secret sourcing: this module never reads the process
 * environment or an env file. The return type is the generic `Auth`: the email OTP plugin's inferred
 * endpoint types reference a transitive zod path that declaration output cannot name.
 *
 * Rate limits (ADR 0004 decision 7, S25) run in every environment and persist in the `RateLimit`
 * table through the same database adapter. The handler is wrapped so a failing rate-limit store or
 * an unresolved client IP is rejected with a generic 503 before any endpoint runs (S19).
 */
export function createAuth(options: CreateAuthOptions): Auth {
  const authOptions: BetterAuthOptions = {
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [...options.trustedOrigins],
    database: options.database,
    telemetry: { enabled: false },
    advanced: {
      database: { generateId: "uuid" },
      // Better Auth skips origin checks by default when NODE_ENV=test or TEST is set. Pin them on
      // so a misconfigured environment can never disable them.
      disableOriginCheck: false,
      ipAddress: {
        ipAddressHeaders: [options.clientIp.header],
        trustedProxies: [...options.clientIp.trustedProxies],
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        [SIGN_IN_CODE_REQUEST_PATH]: { ...CLIENT_IP_RATE_LIMIT },
        [EMAIL_CODE_SIGN_IN_PATH]: { ...CLIENT_IP_RATE_LIMIT },
        [EMAIL_CODE_QUOTA_RETENTION_RULE]: { ...EMAIL_CODE_QUOTA },
      },
    },
    user: {
      // Better Auth's `name` is stored in the existing `User.displayName` column.
      fields: { name: "displayName" },
      additionalFields: {
        role: {
          type: ["CUSTOMER", "ADMIN"],
          required: false,
          input: false,
          defaultValue: "CUSTOMER",
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // The code sign-in endpoint accepts `name` and `image` from an unauthenticated client
          // without bounds (L16). Ignore both there: the profile is edited later through validated,
          // authenticated endpoints, and media is not accepted before its own bounds exist.
          async before(user, context) {
            if (context?.path !== EMAIL_CODE_SIGN_IN_PATH) {
              return;
            }

            return { data: { ...user, name: "", image: undefined } };
          },
        },
      },
    },
    plugins: [
      emailOTP({
        // S15: 6-digit codes, valid for 300 seconds, at most 3 wrong attempts, stored as a hash.
        otpLength: SIGN_IN_CODE_LENGTH,
        expiresIn: SIGN_IN_CODE_EXPIRES_IN_SECONDS,
        allowedAttempts: SIGN_IN_CODE_ALLOWED_ATTEMPTS,
        storeOTP: "hashed",
        // Kept false: true makes an unknown address return early, a timing difference (S24).
        disableSignUp: false,
        // Returns at once for every address; delivery and the role check run in the background.
        sendVerificationOTP: ({ email, otp, type }, context) =>
          options.signInCodes.handle(
            { email, code: otp, type },
            context ? createBetterAuthSignInCodeStore(context) : undefined,
          ),
      }),
    ],
  };

  const auth = betterAuth(authOptions);
  const resolveClientIp = (request: Request) => getIP(request, authOptions);

  if (options.requireClientIp && resolveClientIp(new Request(options.baseURL)) !== null) {
    // Better Auth resolves unknown clients to 127.0.0.1 when its own environment reads as
    // development or test; in production that would put every such client in one bucket.
    throw new Error(
      "Better Auth would treat unresolved clients as 127.0.0.1; run production with NODE_ENV=production and without TEST.",
    );
  }

  const handler = guardAuthHandler(auth.handler, {
    resolveClientIp: options.requireClientIp ? resolveClientIp : undefined,
    log: options.log,
  });

  return { ...auth, handler, fetch: handler };
}

export type AppAuth = ReturnType<typeof createAuth>;
