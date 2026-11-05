/** Next.js sets `NEXT_PHASE` to this value while `next build` runs (`next/constants`). */
const PRODUCTION_BUILD_PHASE = "phase-production-build";
const GENERIC_MESSAGE = "Invalid web server configuration.";

export interface StartupHooks {
  /** Throws when the settings are invalid; `getWebServerConfig` in production. */
  validate: () => unknown;
  exit: (code: number) => void;
  log: (line: string) => void;
}

export type StartupValidation = "skipped" | "valid" | "invalid";

/**
 * Validates the web server settings when a Node.js server starts (M2 T8c; L38), so a misconfigured
 * web stops at startup instead of failing its first request. It skips `next build`, which needs none
 * of the settings, and the edge runtime, which the web does not use.
 *
 * Next.js 16.3.5 logs an error thrown by `register()` but keeps the process alive and answers every
 * request with 500, so a failure is logged as one structured line and the process exits with code 1.
 * Configuration errors name the variable and never echo its value (`config.ts`).
 */
export function validateAtStartup(
  environment: Readonly<Record<string, string | undefined>>,
  hooks: StartupHooks,
): StartupValidation {
  if (environment.NEXT_RUNTIME !== "nodejs" || environment.NEXT_PHASE === PRODUCTION_BUILD_PHASE) {
    return "skipped";
  }

  try {
    hooks.validate();
    return "valid";
  } catch (error) {
    hooks.log(
      JSON.stringify({
        event: "web_config_invalid",
        message: error instanceof Error ? error.message : GENERIC_MESSAGE,
      }),
    );
    hooks.exit(1);
    return "invalid";
  }
}

/** The real hooks of a Node.js server; `instrumentation.ts` imports them only on that runtime. */
export function nodeStartupHooks(validate: () => unknown): StartupHooks {
  return {
    validate,
    exit: (code) => process.exit(code),
    log: (line) => console.error(line),
  };
}
