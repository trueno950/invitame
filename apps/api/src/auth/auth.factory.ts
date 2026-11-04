import { type BetterAuthOptions, betterAuth } from "better-auth";

export interface CreateAuthOptions {
  /** Signing secret supplied by validated configuration; never hard-coded. */
  secret: string;
  /** Public origin of the API that serves the auth routes. */
  baseURL: string;
  /** Persistence adapter; tests use the in-memory adapter until the Prisma adapter lands. */
  database: NonNullable<BetterAuthOptions["database"]>;
}

/**
 * Builds a Better Auth instance from explicit options. The caller owns secret
 * sourcing so this module never reads the process environment or an env file.
 */
export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    database: options.database,
    telemetry: { enabled: false },
  });
}

export type AppAuth = ReturnType<typeof createAuth>;
