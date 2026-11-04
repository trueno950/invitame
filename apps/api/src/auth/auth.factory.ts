import { type Auth, type BetterAuthOptions, betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";

import { createBetterAuthSignInCodeStore } from "./sign-in-code/better-auth-sign-in-code-store";
import {
  SIGN_IN_CODE_ALLOWED_ATTEMPTS,
  SIGN_IN_CODE_EXPIRES_IN_SECONDS,
  SIGN_IN_CODE_LENGTH,
} from "./sign-in-code/sign-in-code-message";
import type { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

/** The endpoint where an email code creates a customer account on first sign-in. */
const EMAIL_CODE_SIGN_IN_PATH = "/sign-in/email-otp";

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
}

/**
 * Builds the Better Auth instance from explicit options, so the runtime and tests share one
 * configuration source. The caller owns secret sourcing: this module never reads the process
 * environment or an env file. The return type is the generic `Auth`: the email OTP plugin's inferred
 * endpoint types reference a transitive zod path that declaration output cannot name.
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

  return betterAuth(authOptions);
}

export type AppAuth = ReturnType<typeof createAuth>;
