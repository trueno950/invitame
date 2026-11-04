import type { DynamicModule } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import type { RuntimeEnvironment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { createAuth } from "./auth.factory";

/**
 * Builds the integration options from validated configuration and the shared Prisma client.
 * CORS stays project-owned (see `configureApp`), so the integration never adds its own.
 */
export function createAuthModuleOptions(
  config: ConfigService<RuntimeEnvironment, true>,
  prisma: PrismaService,
) {
  return {
    auth: createAuth({
      secret: config.get("BETTER_AUTH_SECRET", { infer: true }),
      baseURL: config.get("AUTH_BASE_URL", { infer: true }),
      trustedOrigins: config.get("TRUSTED_ORIGINS", { infer: true }),
      database: prismaAdapter(prisma, { provider: "postgresql" }),
    }),
    disableTrustedOriginsCors: true,
  };
}

/**
 * Registers Better Auth at `/api/auth` with the integration's global guard, which denies every
 * route by default; public routes opt out with `@AllowAnonymous()`.
 */
export function registerAuthModule(): DynamicModule {
  return AuthModule.forRootAsync({
    inject: [ConfigService, PrismaService],
    useFactory: createAuthModuleOptions,
  });
}
