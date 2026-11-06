import type { SessionResult } from "../server/api-client.ts";
import type { AuthSessionUser } from "../server/auth-session.ts";

/**
 * Which administrator page a visitor sees (M2 T8d; S6, S21, S36). The pages read the session on the
 * web server with `get-session`, because a pending administrator cannot read `/me` (ADR 0004
 * decision 3). These rules only choose a page: the API authorizes every action, so a page is never
 * the security guard.
 *
 * - anonymous: the sign-in page;
 * - customer: `/cuenta`, the customer's own page;
 * - pending administrator (role ADMIN, `twoFactorEnabled` not true): the enrollment page;
 * - administrator (enrolled): the panel;
 * - unavailable (the read failed): the page renders a retry notice, or the sign-in form.
 */

export type SessionKind =
  | "anonymous"
  | "customer"
  | "pending-administrator"
  | "administrator"
  | "unavailable";

export type AdminView =
  | { kind: "anonymous" | "customer" | "pending-administrator" | "unavailable" }
  | { kind: "administrator"; email: string };

export type AdminPage = "panel" | "sign-in" | "enrollment";

/** The page each kind of visitor belongs on; `null` marks the page that renders for that kind. */
const HOME: Record<Exclude<SessionKind, "unavailable">, string> = {
  anonymous: "/admin/ingresar",
  customer: "/cuenta",
  "pending-administrator": "/admin/activar",
  administrator: "/admin",
};

const PAGE_PATH: Record<AdminPage, string> = {
  panel: "/admin",
  "sign-in": "/admin/ingresar",
  enrollment: "/admin/activar",
};

export async function loadAdminView(
  read: () => Promise<SessionResult<AuthSessionUser>>,
): Promise<AdminView> {
  let result: SessionResult<AuthSessionUser>;

  try {
    result = await read();
  } catch {
    return { kind: "unavailable" };
  }

  if (!result.signedIn) {
    return { kind: "anonymous" };
  }
  if (result.value.role !== "ADMIN") {
    return { kind: "customer" };
  }
  return result.value.twoFactorEnabled
    ? { kind: "administrator", email: result.value.email }
    : { kind: "pending-administrator" };
}

/** The path to redirect to, or `null` when `page` renders for this kind of visitor. */
export function routeAdminPage(page: AdminPage, kind: SessionKind): string | null {
  if (kind === "unavailable") {
    return null;
  }
  const home = HOME[kind];
  return home === PAGE_PATH[page] ? null : home;
}
