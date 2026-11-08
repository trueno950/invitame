import { type INestApplication, type NestApplicationOptions, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import type { RuntimeEnvironment } from "./config/environment";

export interface AppSetupOptions {
  /** Validated trusted origins; the same list Better Auth uses for its origin checks. */
  trustedOrigins: readonly string[];
}

export type CreateAppOptions = Pick<NestApplicationOptions, "logger" | "abortOnError">;

type AppEntryModule = Parameters<typeof NestFactory.create>[0];

/**
 * Applies the HTTP boundary shared by the runtime bootstrap and integration tests:
 * security headers, credentialed CORS for trusted origins only, global input validation,
 * and graceful shutdown.
 */
export function configureApp(app: INestApplication, options: AppSetupOptions): void {
  app.use(helmet());
  app.enableCors({
    origin: [...options.trustedOrigins],
    credentials: true,
    methods: ["GET", "HEAD", "POST", "OPTIONS"],
    allowedHeaders: ["Accept", "Content-Type"],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.enableShutdownHooks(["SIGINT", "SIGTERM"]);
}

/**
 * The single app-creation boundary for the runtime and integration tests. Better Auth requires
 * NestJS's body parser to be disabled; the integration parses JSON for non-auth routes instead.
 * Trusted origins come from the validated configuration of the given module.
 */
export async function createApp(
  module: AppEntryModule,
  options: CreateAppOptions = {},
): Promise<INestApplication> {
  const app = await NestFactory.create(module, { ...options, bodyParser: false });
  const config = app.get<ConfigService<RuntimeEnvironment, true>>(ConfigService);

  configureApp(app, { trustedOrigins: config.get("TRUSTED_ORIGINS", { infer: true }) });

  return app;
}
