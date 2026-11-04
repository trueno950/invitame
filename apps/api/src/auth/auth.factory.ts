import { type BetterAuthOptions, betterAuth } from "better-auth";

export interface CreateAuthOptions {
  /** Signing secret supplied by validated configuration; never hard-coded. */
  secret: string;
  /** Public origin of the API that serves the auth routes. */
  baseURL: string;
  /** Validated trusted origins; the same list feeds the project-owned CORS policy. */
  trustedOrigins: readonly string[];
  /** Persistence adapter: the Prisma adapter at runtime, the in-memory adapter in isolated tests. */
  database: NonNullable<BetterAuthOptions["database"]>;
}

/**
 * Builds the Better Auth instance from explicit options, so the runtime and tests share one
 * configuration source. The caller owns secret sourcing: this module never reads the process
 * environment or an env file.
 */
export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
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
  });
}

export type AppAuth = ReturnType<typeof createAuth>;
