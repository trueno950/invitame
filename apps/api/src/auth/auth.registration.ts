import { type DynamicModule, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { NODE_ENVIRONMENT, type RuntimeEnvironment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { createAuth } from "./auth.factory";
import { SignInCodeModule } from "./sign-in-code/sign-in-code.module";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

/**
 * Builds the integration options from validated configuration and the shared Prisma client.
 * CORS stays project-owned (see `configureApp`), so the integration never adds its own.
 */
export function createAuthModuleOptions(
  config: ConfigService<RuntimeEnvironment, true>,
  prisma: PrismaService,
  signInCodes: SignInCodeSender,
) {
  const logger = new Logger("AuthRequestGuard");
  const production = config.get("NODE_ENV", { infer: true }) === NODE_ENVIRONMENT.PRODUCTION;

  return {
    auth: createAuth({
      secret: config.get("BETTER_AUTH_SECRET", { infer: true }),
      baseURL: config.get("AUTH_BASE_URL", { infer: true }),
      trustedOrigins: config.get("TRUSTED_ORIGINS", { infer: true }),
      database: prismaAdapter(prisma, { provider: "postgresql" }),
      signInCodes,
      clientIp: config.get("AUTH_CLIENT_IP", { infer: true }),
      requireClientIp: production,
      proxySecret: config.get("AUTH_PROXY_SECRET", { infer: true }),
      previousProxySecret: config.get("AUTH_PROXY_SECRET_PREVIOUS", { infer: true }),
      requireProxySecret: production,
      log: (event) => logger.warn(event),
    }),
    disableTrustedOriginsCors: true,
  };
}

/**
 * Registers Better Auth at `/api/auth`. The integration's global guard is disabled because it reads
 * the session before it honors `@AllowAnonymous()` (L20); `AccessControlModule` registers the
 * project-owned guard instead, which denies every route by default.
 */
export function registerAuthModule(): DynamicModule {
  return AuthModule.forRootAsync({
    disableGlobalAuthGuard: true,
    imports: [SignInCodeModule],
    inject: [ConfigService, PrismaService, SignInCodeSender],
    useFactory: createAuthModuleOptions,
  });
}
