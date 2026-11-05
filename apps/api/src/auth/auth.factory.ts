import { type Auth, type BetterAuthOptions, betterAuth } from "better-auth";
import { getIP } from "better-auth/api";
import { emailOTP, twoFactor } from "better-auth/plugins";

import type { ClientIpEnvironment } from "../config/environment";
import { type AccountAccess, sessionRefusal, USER_ROLE, USER_STATUS } from "./account-access";
import {
  CLIENT_IP_RATE_LIMIT,
  EMAIL_CODE_QUOTA,
  EMAIL_CODE_SIGN_IN_PATH,
  PASSWORD_ATTEMPT_RATE_LIMIT,
  PASSWORD_SIGN_IN_PATH,
  SECOND_FACTOR_RATE_LIMIT,
  SIGN_IN_CODE_REQUEST_PATH,
  TWO_FACTOR_PATH,
} from "./abuse-limits";
import { enrollmentWindowOpen, TWO_FACTOR_OPTIONS } from "./administrator-enrollment";
import { type AuthRequestLog, guardAuthHandler } from "./auth-request-guard";
import { refuseInactiveSessions } from "./inactive-session-hook";
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

/**
 * Better Auth routes that change a user, an email address, an account link, a password, or a second
 * factor. Better Auth answers them with 404 before rate limiting or routing (1.7.16 `api/index.mjs`,
 * `onRequest`, exact path match); this covers HTTP only, not server-side `auth.api.*` calls. Clients
 * cannot change a profile through Better Auth (L16, L28); email change and account deletion are not
 * offered in Milestone 2. Administrators get a password from the server-side command only and
 * Milestone 2 offers no password change or reset through the API (S20, L30); the code-based reset
 * would also create a credential password for a customer (1.7.16 `utils/password.mjs`,
 * `resetCredentialPassword`). `/set-password` is server-only and never routed. The second factor is
 * mandatory for administrators: it cannot be removed, its TOTP URI is shown once at enrollment, and
 * no email or SMS second factor is configured; recovery is a server-side procedure (T10).
 */
export const DISABLED_AUTH_PATHS = [
  "/update-user",
  "/change-email",
  "/delete-user",
  "/delete-user/callback",
  "/change-password",
  "/request-password-reset",
  "/reset-password",
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
  "/email-otp/reset-password",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
  "/email-otp/verify-email",
  "/verify-email",
  "/send-verification-email",
  "/update-session",
  "/link-social",
  "/unlink-account",
  "/two-factor/disable",
  "/two-factor/get-totp-uri",
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
] as const;

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
 * table through the same database adapter, keyed by client IP and path. The handler is wrapped so a failing rate-limit store or
 * an unresolved client IP is rejected with a generic 503 before any endpoint runs (S19).
 */
export function createAuth(options: CreateAuthOptions): Auth {
  // Assigned below; the session hook runs only after the instance exists.
  let authContext: Auth["$context"] | undefined;

  const authOptions: BetterAuthOptions = {
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: [...options.trustedOrigins],
    database: options.database,
    telemetry: { enabled: false },
    disabledPaths: [...DISABLED_AUTH_PATHS],
    // A session of a non-ACTIVE user, or of an administrator whose enrollment window has ended, is
    // deleted before any endpoint can use it; an un-enrolled administrator's session is hidden from
    // every endpoint but enrollment (S20, S21).
    hooks: { before: refuseInactiveSessions },
    // Decision 3: password sign-in exists for administrators only. Sign-up stays closed
    // (`/sign-up/email` answers 400 EMAIL_PASSWORD_SIGN_UP_DISABLED, 1.7.16 `api/routes/sign-up.mjs`),
    // and the session hook refuses a password session to anyone but an administrator.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
      autoSignIn: false,
    },
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
        [PASSWORD_SIGN_IN_PATH]: { ...PASSWORD_ATTEMPT_RATE_LIMIT },
        [TWO_FACTOR_PATH.ENABLE]: { ...PASSWORD_ATTEMPT_RATE_LIMIT },
        [TWO_FACTOR_PATH.GENERATE_BACKUP_CODES]: { ...PASSWORD_ATTEMPT_RATE_LIMIT },
        [TWO_FACTOR_PATH.VERIFY_TOTP]: { ...SECOND_FACTOR_RATE_LIMIT },
        [TWO_FACTOR_PATH.VERIFY_BACKUP_CODE]: { ...SECOND_FACTOR_RATE_LIMIT },
      },
    },
    session: {
      // Every session check reads the stored session and user, so a revoked session or a DISABLED
      // user is rejected on the next request (S18). Better Auth enables this cache by default only
      // without a database (1.7.16 `context/create-context.mjs`); pinned off so it never turns on.
      cookieCache: { enabled: false },
    },
    user: {
      // Better Auth's `name` is stored in the existing `User.displayName` column.
      fields: { name: "displayName" },
      // `input: false`: a client value is replaced by the default on create and rejected with
      // `400 FIELD_NOT_ALLOWED` on update (1.7.16 `db/schema.mjs`, `parseInputData`).
      additionalFields: {
        role: {
          type: [USER_ROLE.CUSTOMER, USER_ROLE.ADMIN],
          required: false,
          input: false,
          defaultValue: USER_ROLE.CUSTOMER,
        },
        status: {
          type: [USER_STATUS.ACTIVE, USER_STATUS.DISABLED],
          required: false,
          input: false,
          defaultValue: USER_STATUS.ACTIVE,
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Every sign-in path ends in `internalAdapter.createSession`, which runs this hook first,
          // including the password step of an enrolled administrator, whose session the two-factor
          // plugin deletes again in the same request before it answers `twoFactorRedirect`.
          // Throwing refuses the session; returning false would make the endpoint fail on a null
          // session instead (1.7.16 `db/with-hooks.mjs`).
          async before(session, context) {
            const internalAdapter =
              context?.context.internalAdapter ?? (await authContext)?.internalAdapter;
            const user = (await internalAdapter?.findUserById(session.userId)) as
              | (AccountAccess & { id: string })
              | null
              | undefined;
            const windowOpen =
              user && internalAdapter
                ? await enrollmentWindowOpen(internalAdapter, user.id, user)
                : false;
            const refusal = sessionRefusal(user ?? null, context?.path, windowOpen);

            if (refusal) {
              throw refusal;
            }
          },
        },
      },
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
      // Decision 3: administrators confirm an authenticator app (TOTP) and keep backup codes.
      twoFactor({
        ...TWO_FACTOR_OPTIONS,
        totpOptions: { ...TWO_FACTOR_OPTIONS.totpOptions },
        backupCodeOptions: { ...TWO_FACTOR_OPTIONS.backupCodeOptions },
        accountLockout: { ...TWO_FACTOR_OPTIONS.accountLockout },
      }),
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
  authContext = auth.$context;
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
