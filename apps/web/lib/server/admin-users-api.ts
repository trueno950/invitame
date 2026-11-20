import "server-only";

import { cookies } from "next/headers";

import { type AdminUsersClient, createAdminUsersClient } from "./admin-users-client.ts";
import { ApiClientError } from "./api-client.ts";
import { getWebServerConfig } from "./config.ts";
import { errorClass } from "./server-log.ts";

/**
 * The administrator account support API for the invitation's support card (M9 T9; S4, S6, L8, L9). One stateless client
 * per server process, created on first use; each call reads the current request's cookies and keeps nothing.
 * `server-only` makes a client-component import fail the build, so the cookie and the proxy secret never reach a
 * browser bundle. An unexpected failure (a thrown `ApiClientError`) is logged once here and rethrown; an outage is
 * already an outcome the page handles.
 */
let client: AdminUsersClient | undefined;

function usersClient(): AdminUsersClient {
  client ??= createAdminUsersClient({ config: getWebServerConfig() }, async () =>
    (await cookies()).toString(),
  );
  return client;
}

/**
 * The operational log of an unexpected failure of an account support call: one JSON line with the event name, the error
 * class, the client's fixed failure kind, and the class of its cause. Never the message, a cookie, a body, or an
 * address, because any of them could carry personal data. It is an operational log, not an audit trail; the audit is
 * the API's own `AdminAction` row.
 */
export const ADMIN_USERS_FAILED_EVENT = "admin_users_call_failed";

export function adminUsersFailureLine(error: unknown): string {
  return JSON.stringify({
    event: ADMIN_USERS_FAILED_EVENT,
    error: errorClass(error),
    ...(error instanceof ApiClientError ? { kind: error.kind } : {}),
    ...(error instanceof Error && error.cause !== undefined
      ? { cause: errorClass(error.cause) }
      : {}),
  });
}

/** Writes the line to standard error and never throws, so logging cannot change a response. */
export function logAdminUsersFailure(
  error: unknown,
  write: (line: string) => void = (line) => console.error(line),
): void {
  try {
    write(adminUsersFailureLine(error));
  } catch {
    // A failing sink must not change the response.
  }
}

async function logged<T>(call: (api: AdminUsersClient) => Promise<T>): Promise<T> {
  try {
    return await call(usersClient());
  } catch (error) {
    logAdminUsersFailure(error);
    throw error;
  }
}

/** The same shape as `AdminUsersClient`, so the logic in `lib/admin/invitations` accepts either. */
export const adminUsers = {
  disable: (...args: Parameters<AdminUsersClient["disable"]>) =>
    logged((api) => api.disable(...args)),
  reactivate: (...args: Parameters<AdminUsersClient["reactivate"]>) =>
    logged((api) => api.reactivate(...args)),
  resendSignInCode: (...args: Parameters<AdminUsersClient["resendSignInCode"]>) =>
    logged((api) => api.resendSignInCode(...args)),
};
