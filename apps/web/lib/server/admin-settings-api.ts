import "server-only";

import { cookies } from "next/headers";

import { type AdminSettingsClient, createAdminSettingsClient } from "./admin-settings-client.ts";
import { ApiClientError } from "./api-client.ts";
import { getWebServerConfig } from "./config.ts";
import { errorClass } from "./server-log.ts";

/**
 * The administrator settings API for `/admin/configuracion` (M9 T14; S5, S8). One stateless client per server process,
 * created on first use; each call reads the current request's cookies and keeps nothing. `server-only` makes a
 * client-component import fail the build, so the cookie and the proxy secret never reach a browser bundle. An unexpected
 * failure (a thrown `ApiClientError`) is logged once here and rethrown; a refusal or an outage is already an outcome the
 * page handles.
 */
let client: AdminSettingsClient | undefined;

function settingsClient(): AdminSettingsClient {
  client ??= createAdminSettingsClient({ config: getWebServerConfig() }, async () =>
    (await cookies()).toString(),
  );
  return client;
}

/**
 * The operational log of an unexpected failure of a settings call: one JSON line with the event name, the error class,
 * the client's fixed failure kind, and the class of its cause. Never the message, a cookie, a body, a value, or a note,
 * because the log is an operational line, not a record. The event name lives here, as `admin-analytics-api.ts` does for
 * its own area.
 */
export const ADMIN_SETTINGS_FAILED_EVENT = "admin_settings_call_failed";

export function adminSettingsFailureLine(error: unknown): string {
  return JSON.stringify({
    event: ADMIN_SETTINGS_FAILED_EVENT,
    error: errorClass(error),
    ...(error instanceof ApiClientError ? { kind: error.kind } : {}),
    ...(error instanceof Error && error.cause !== undefined
      ? { cause: errorClass(error.cause) }
      : {}),
  });
}

/** Writes the line to standard error and never throws, so logging cannot change a response. */
export function logAdminSettingsFailure(
  error: unknown,
  write: (line: string) => void = (line) => console.error(line),
): void {
  try {
    write(adminSettingsFailureLine(error));
  } catch {
    // A failing sink must not change the response.
  }
}

async function logged<T>(call: (api: AdminSettingsClient) => Promise<T>): Promise<T> {
  try {
    return await call(settingsClient());
  } catch (error) {
    logAdminSettingsFailure(error);
    throw error;
  }
}

/** The same shape as `AdminSettingsClient`, so the page's own helpers accept either. */
export const adminSettings = {
  read: (...args: Parameters<AdminSettingsClient["read"]>) => logged((api) => api.read(...args)),
  update: (...args: Parameters<AdminSettingsClient["update"]>) =>
    logged((api) => api.update(...args)),
};
