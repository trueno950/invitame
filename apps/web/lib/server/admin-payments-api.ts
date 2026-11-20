import "server-only";

import { cookies } from "next/headers";

import { type AdminPaymentsClient, createAdminPaymentsClient } from "./admin-payments-client.ts";
import { ApiClientError } from "./api-client.ts";
import { getWebServerConfig } from "./config.ts";
import { errorClass } from "./server-log.ts";

/**
 * The administrator payments API for the refund pages and their one server action (M7 T3; S1, S3). One stateless client
 * per server process, created on first use; each call reads the current request's cookies and keeps nothing.
 * `server-only` makes a client-component import fail the build, so the cookie and the proxy secret never reach a
 * browser bundle. An unexpected failure (a thrown `ApiClientError`) is logged once here and rethrown.
 */
let client: AdminPaymentsClient | undefined;

function paymentsClient(): AdminPaymentsClient {
  client ??= createAdminPaymentsClient({ config: getWebServerConfig() }, async () =>
    (await cookies()).toString(),
  );
  return client;
}

/**
 * The operational log of an unexpected failure of an administrator payments call: one JSON line with the event name,
 * the error class, the client's fixed failure kind, and the class of its cause. Never the message, a cookie, a body, or
 * a reference the API returned, because any of them could carry personal data. It is an operational log, not an audit
 * trail. The event name lives here, as `admin-catalog-log.ts` does for the catalog, because the names of
 * `server-log.ts` are the closed list of the session calls.
 */
export const ADMIN_PAYMENTS_FAILED_EVENT = "admin_payments_call_failed";

export function adminPaymentsFailureLine(error: unknown): string {
  return JSON.stringify({
    event: ADMIN_PAYMENTS_FAILED_EVENT,
    error: errorClass(error),
    ...(error instanceof ApiClientError ? { kind: error.kind } : {}),
    ...(error instanceof Error && error.cause !== undefined
      ? { cause: errorClass(error.cause) }
      : {}),
  });
}

/** Writes the line to standard error and never throws, so logging cannot change a response. */
export function logAdminPaymentsFailure(
  error: unknown,
  write: (line: string) => void = (line) => console.error(line),
): void {
  try {
    write(adminPaymentsFailureLine(error));
  } catch {
    // A failing sink must not change the response.
  }
}

async function logged<T>(call: (api: AdminPaymentsClient) => Promise<T>): Promise<T> {
  try {
    return await call(paymentsClient());
  } catch (error) {
    logAdminPaymentsFailure(error);
    throw error;
  }
}

/** The same shape as `AdminPaymentsClient`, so the logic in `lib/admin/payments` accepts either. */
export const adminPayments = {
  list: () => logged((api) => api.list()),
  refund: (paymentId: Parameters<AdminPaymentsClient["refund"]>[0]) =>
    logged((api) => api.refund(paymentId)),
  /** `GET /admin/payments/:paymentId`: one payment and its newest events (M9 T7; S4). */
  detail: (paymentId: Parameters<AdminPaymentsClient["detail"]>[0]) =>
    logged((api) => api.detail(paymentId)),
};
