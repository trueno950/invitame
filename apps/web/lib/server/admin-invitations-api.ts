import "server-only";

import { cookies } from "next/headers";

import {
  type AdminInvitationsClient,
  createAdminInvitationsClient,
} from "./admin-invitations-client.ts";
import { ApiClientError } from "./api-client.ts";
import { getWebServerConfig } from "./config.ts";
import { errorClass } from "./server-log.ts";

/**
 * The administrator invitations API for the status pages (M9 T3; S1). One stateless client per server process, created
 * on first use; each call reads the current request's cookies and keeps nothing. `server-only` makes a client-component
 * import fail the build, so the cookie and the proxy secret never reach a browser bundle. An unexpected failure (a
 * thrown `ApiClientError`) is logged once here and rethrown; an outage is already an outcome the page handles.
 */
let client: AdminInvitationsClient | undefined;

function invitationsClient(): AdminInvitationsClient {
  client ??= createAdminInvitationsClient({ config: getWebServerConfig() }, async () =>
    (await cookies()).toString(),
  );
  return client;
}

/**
 * The operational log of an unexpected failure of an administrator invitation call: one JSON line with the event name,
 * the error class, the client's fixed failure kind, and the class of its cause. Never the message, a cookie, a body, a
 * slug, or an address, because any of them could carry personal data. It is an operational log, not an audit trail,
 * and the event name lives here as `admin-payments-api.ts` does for the refund pages.
 */
export const ADMIN_INVITATIONS_FAILED_EVENT = "admin_invitations_call_failed";

export function adminInvitationsFailureLine(error: unknown): string {
  return JSON.stringify({
    event: ADMIN_INVITATIONS_FAILED_EVENT,
    error: errorClass(error),
    ...(error instanceof ApiClientError ? { kind: error.kind } : {}),
    ...(error instanceof Error && error.cause !== undefined
      ? { cause: errorClass(error.cause) }
      : {}),
  });
}

/** Writes the line to standard error and never throws, so logging cannot change a response. */
export function logAdminInvitationsFailure(
  error: unknown,
  write: (line: string) => void = (line) => console.error(line),
): void {
  try {
    write(adminInvitationsFailureLine(error));
  } catch {
    // A failing sink must not change the response.
  }
}

async function logged<T>(call: (api: AdminInvitationsClient) => Promise<T>): Promise<T> {
  try {
    return await call(invitationsClient());
  } catch (error) {
    logAdminInvitationsFailure(error);
    throw error;
  }
}

/** The same shape as `AdminInvitationsClient`, so the logic in `lib/admin/invitations` accepts either. */
export const adminInvitations = {
  list: (...args: Parameters<AdminInvitationsClient["list"]>) => logged((api) => api.list(...args)),
  detail: (...args: Parameters<AdminInvitationsClient["detail"]>) =>
    logged((api) => api.detail(...args)),
};
