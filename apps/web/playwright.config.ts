import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";

import { GATE_READY_PATH } from "./e2e/support/api-gate.ts";
import {
  API_ORIGIN,
  API_PORT,
  CLIENT_IP_HEADER,
  EDGE_CLIENT_IP_HEADER,
  GATE_ORIGIN,
  requireLocalUrl,
  WEB_ORIGIN,
  WEB_PORT,
} from "./e2e/support/environment.ts";

/**
 * Browser end-to-end tests (M2 T9b; S38): `pnpm --filter @invitame/web test:e2e`. Playwright starts
 * the built API (`apps/api/dist`), the production build of the web (`next start`), and the
 * harness-only API gate between them (`e2e/support/api-gate.ts`) on dedicated ports, then drives
 * Chromium against the web origin only. Build both apps, migrate the database,
 * and name a disposable local PostgreSQL and Mailpit in `E2E_DATABASE_URL` and `E2E_MAILPIT_URL`
 * first; see `docs/development/quality-gates.md`.
 *
 * Every server setting is passed explicitly, so neither server depends on a developer's env files:
 * process variables take precedence over `apps/api/.env` and `apps/web/.env*`, and each variable an
 * env file could add is set here, empty when unused. The two secrets are random per run and exist
 * only in the server processes' environment.
 */

const databaseUrl = requireLocalUrl("E2E_DATABASE_URL");
const mailpitUrl = requireLocalUrl("E2E_MAILPIT_URL");
const runSecret = () => randomBytes(32).toString("base64url");
const proxySecret = runSecret();

const apiEnvironment = {
  // The API refuses Mailpit and plain http in production; development keeps every auth rule on.
  NODE_ENV: "development",
  PORT: String(API_PORT),
  CORS_ORIGIN: WEB_ORIGIN,
  AUTH_BASE_URL: WEB_ORIGIN,
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: runSecret(),
  BETTER_AUTH_TRUSTED_ORIGINS: "",
  BETTER_AUTH_SECRETS: "",
  AUTH_PROXY_SECRET: proxySecret,
  // Pinned empty so a developer's `apps/api/.env` cannot add a rotation secret to the e2e API.
  AUTH_PROXY_SECRET_PREVIOUS: "",
  AUTH_CLIENT_IP_HEADER: CLIENT_IP_HEADER,
  AUTH_TRUSTED_PROXIES: "",
  // The API's existing provider for local mail: codes reach the tests only through Mailpit.
  EMAIL_TRANSPORT: "mailpit",
  EMAIL_FROM: "InvitaMe E2E <no-reply@invitame.localhost>",
  MAILPIT_URL: mailpitUrl,
  RESEND_API_KEY: "",
};

const webEnvironment = {
  // `next start` serves the production build with the production configuration rules.
  NODE_ENV: "production",
  // Every web-to-API call crosses the gate, which forwards it unchanged unless a test holds it.
  API_ORIGIN: GATE_ORIGIN,
  AUTH_PROXY_SECRET: proxySecret,
  AUTH_CLIENT_IP_HEADER: CLIENT_IP_HEADER,
  AUTH_EDGE_CLIENT_IP_HEADER: EDGE_CLIENT_IP_HEADER,
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // The harness's own unit tests run under `node --test` (`pnpm test`), never in the browser suite.
  testIgnore: "**/*.test.ts",
  outputDir: process.env.E2E_OUTPUT_DIR ?? "test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A retry would hide a flaky test; each test owns its address and client IP instead.
  retries: 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: WEB_ORIGIN,
    locale: "es-MX",
    // Kept for failed tests only, and uploaded by CI (R4-browser-tests-failure-artifacts-discarded).
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      name: "api",
      command: "node dist/main.js",
      cwd: resolve(__dirname, "../api"),
      url: `${API_ORIGIN}/health`,
      env: apiEnvironment,
      // Never attach to a server that is already listening: it would not be this harness's.
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      name: "gate",
      command: "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON e2e/support/api-gate-main.ts",
      cwd: __dirname,
      url: `${GATE_ORIGIN}${GATE_READY_PATH}`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      name: "web",
      command: `next start --hostname 127.0.0.1 --port ${WEB_PORT}`,
      cwd: __dirname,
      url: `${WEB_ORIGIN}/`,
      env: webEnvironment,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
