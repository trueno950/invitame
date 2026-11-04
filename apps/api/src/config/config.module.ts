import type { DynamicModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "node:path";

import { validateEnvironment } from "./environment";

const RUNTIME_ENVIRONMENT_FILE = join(__dirname, "..", "..", ".env");

/**
 * Builds the global configuration module; validation runs at startup and fails closed.
 *
 * - Without an argument (runtime), it validates `process.env` merged with `apps/api/.env`.
 * - With an explicit environment (tests), it validates only that record and ignores both
 *   `process.env` and env files, so tests never depend on local configuration.
 */
export function createConfigModule(environment?: Record<string, unknown>): Promise<DynamicModule> {
  if (!environment) {
    return ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: RUNTIME_ENVIRONMENT_FILE,
      validate: validateEnvironment,
    });
  }

  return ConfigModule.forRoot({
    isGlobal: true,
    ignoreEnvFile: true,
    validatePredefined: false,
    skipProcessEnv: true,
    load: [() => ({ ...validateEnvironment(environment) })],
  });
}
