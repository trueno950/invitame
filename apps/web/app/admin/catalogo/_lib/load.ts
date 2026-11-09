import { redirect } from "next/navigation";
import { connection } from "next/server";

import { SIGN_IN_PATH } from "../../../../lib/admin/catalog/commands.ts";
import { loadAdminView, routeAdminPage } from "../../../../lib/admin/session.ts";
import type { CatalogResult } from "../../../../lib/server/admin-catalog-client.ts";
import { getAuthSession } from "../../../../lib/server/session-api.ts";

/**
 * Shared steps of every `/admin/catalogo` page (M3 T8a; S1, S9). The page is never the guard: the API
 * authorizes each call. These steps only choose what to render, as `/admin` does.
 */

/**
 * Reads the session on the web server and redirects a visitor who is not an enrolled administrator
 * (`routeAdminPage("catalog", …)`). Returns `true` to render the page and `false` when the session
 * read failed, so the page shows its unavailable notice instead of data.
 */
export async function requireCatalogAdministrator(): Promise<boolean> {
  // Render per request: the session read swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAdminView(getAuthSession);
  const target = routeAdminPage("catalog", view.kind);

  if (target !== null) {
    redirect(target);
  }
  return view.kind === "administrator";
}

/** A call that failed in an unexpected way (already logged by the server wrapper) is `unavailable`. */
export async function attempt<T>(
  read: () => Promise<CatalogResult<T>>,
): Promise<CatalogResult<T> | "unavailable"> {
  try {
    return await read();
  } catch {
    return "unavailable";
  }
}

export type Loaded<T> =
  | { status: "ok"; value: T }
  | { status: "not-found" }
  | { status: "unavailable" };

/**
 * Turns a read's result into what the page renders. An ended session goes to sign-in, an account that
 * is no longer an administrator to `/cuenta`; a missing record is `not-found`, and any other failure
 * of a read is `unavailable`.
 */
export function resolveRead<T>(result: CatalogResult<T> | "unavailable"): Loaded<T> {
  if (result === "unavailable") {
    return { status: "unavailable" };
  }
  if (result.ok) {
    return { status: "ok", value: result.value };
  }
  if (result.failure === "signed-out") {
    redirect(SIGN_IN_PATH);
  }
  if (result.failure === "forbidden") {
    redirect("/cuenta");
  }
  if (result.failure === "not-found") {
    return { status: "not-found" };
  }
  return { status: "unavailable" };
}
