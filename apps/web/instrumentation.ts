/**
 * Runs once when a Next.js server starts (M2 T8c; L38). It validates the web server settings so a
 * misconfigured web exits at startup instead of failing its first request. `next build` and the
 * edge runtime skip it; see `lib/server/startup.ts`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [{ nodeStartupHooks, validateAtStartup }, { getWebServerConfig }] = await Promise.all([
    import("./lib/server/startup.ts"),
    import("./lib/server/config.ts"),
  ]);
  validateAtStartup(process.env, nodeStartupHooks(getWebServerConfig));
}
