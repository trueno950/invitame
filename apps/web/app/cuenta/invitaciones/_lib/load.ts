import { redirect } from "next/navigation";

import { CUSTOMER_SIGN_IN_PATH } from "../../../../lib/customer/invitations.ts";
import type { InvitationResult } from "../../../../lib/server/invitations-api.ts";

/**
 * Shared steps of the three invitation pages (M4 T5; S1, S6, S7). The page is never the guard: the API
 * authorizes every call. These steps only choose what to render, as the catalog pages do.
 */

/** A call that failed in an unexpected way (already logged by the server wrapper) is `unavailable`. */
export async function attempt<T>(
  call: () => Promise<InvitationResult<T>>,
): Promise<InvitationResult<T> | "unavailable"> {
  try {
    return await call();
  } catch {
    return "unavailable";
  }
}

export type Loaded<T> =
  | { status: "ok"; value: T }
  | { status: "not-found" }
  | { status: "unavailable" };

/**
 * Turns a read into what the page renders. An ended session goes to sign-in; a missing draft is
 * `not-found`, and any other refusal or failure of a read is `unavailable`.
 */
export function resolveRead<T>(result: InvitationResult<T> | "unavailable"): Loaded<T> {
  if (result === "unavailable") {
    return { status: "unavailable" };
  }
  if (result.ok) {
    return { status: "ok", value: result.value };
  }
  if (result.failure === "signed-out") {
    redirect(CUSTOMER_SIGN_IN_PATH);
  }
  return result.failure === "not-found" ? { status: "not-found" } : { status: "unavailable" };
}
