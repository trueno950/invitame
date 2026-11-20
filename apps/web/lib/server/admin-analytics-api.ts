import "server-only";

import { cookies } from "next/headers";

import { type AdminAnalyticsClient, createAdminAnalyticsClient } from "./admin-analytics-client.ts";
import { ApiClientError } from "./api-client.ts";
import { getWebServerConfig } from "./config.ts";
import { errorClass } from "./server-log.ts";

/**
 * The administrator analytics API for `/admin/analitica` (M9 T12; S2, S7). One stateless client per server process,
 * created on first use; each call reads the current request's cookies and keeps nothing. `server-only` makes a
 * client-component import fail the build, so the cookie and the proxy secret never reach a browser bundle. An unexpected
 * failure (a thrown `ApiClientError`) is logged once here and rethrown; an outage is already an outcome the page
 * handles.
 */
let client: AdminAnalyticsClient | undefined;

function analyticsClient(): AdminAnalyticsClient {
  client ??= createAdminAnalyticsClient({ config: getWebServerConfig() }, async () =>
    (await cookies()).toString(),
  );
  return client;
}

/**
 * The operational log of an unexpected failure of an administrator analytics call: one JSON line with the event name,
 * the error class, the client's fixed failure kind, and the class of its cause. Never the message, a cookie, a body, a
 * slug, or a day, because the log is an operational line, not a record. The event name lives here, as
 * `admin-invitations-api.ts` does for its own area.
 */
export const ADMIN_ANALYTICS_FAILED_EVENT = "admin_analytics_call_failed";

export function adminAnalyticsFailureLine(error: unknown): string {
  return JSON.stringify({
    event: ADMIN_ANALYTICS_FAILED_EVENT,
    error: errorClass(error),
    ...(error instanceof ApiClientError ? { kind: error.kind } : {}),
    ...(error instanceof Error && error.cause !== undefined
      ? { cause: errorClass(error.cause) }
      : {}),
  });
}

/** Writes the line to standard error and never throws, so logging cannot change a response. */
export function logAdminAnalyticsFailure(
  error: unknown,
  write: (line: string) => void = (line) => console.error(line),
): void {
  try {
    write(adminAnalyticsFailureLine(error));
  } catch {
    // A failing sink must not change the response.
  }
}

async function logged<T>(call: (api: AdminAnalyticsClient) => Promise<T>): Promise<T> {
  try {
    return await call(analyticsClient());
  } catch (error) {
    logAdminAnalyticsFailure(error);
    throw error;
  }
}

/** The same shape as `AdminAnalyticsClient`, so the page's own helpers accept either. */
export const adminAnalytics = {
  views: (...args: Parameters<AdminAnalyticsClient["views"]>) =>
    logged((api) => api.views(...args)),
  funnel: (...args: Parameters<AdminAnalyticsClient["funnel"]>) =>
    logged((api) => api.funnel(...args)),
};
