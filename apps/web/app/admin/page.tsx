import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { ADMIN_PANEL_COPY } from "../../lib/admin/copy.ts";
import { loadAdminView, routeAdminPage } from "../../lib/admin/session.ts";
import { getAuthSession } from "../../lib/server/session-api.ts";
import { CustomerShell } from "../_components/customer-shell.tsx";
import { SignOutButton } from "../_components/sign-out-button.tsx";
import { quietButton } from "../_components/ui.ts";

export const metadata: Metadata = {
  title: ADMIN_PANEL_COPY.pageTitle,
};

/**
 * `/admin`: the minimal administrator panel (M2 T8d; S6, S21, S36), with the account's address and
 * sign-out. The session comes from `get-session` on the web server: anonymous visitors go to
 * `/admin/ingresar`, pending administrators to `/admin/activar`, and customers to `/cuenta`. The
 * API authorizes every administrative action; this page is never the guard.
 */
export default async function AdminPanelPage() {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAdminView(getAuthSession);
  const target = routeAdminPage("panel", view.kind);

  if (target !== null) {
    redirect(target);
  }

  const unavailable = view.kind !== "administrator";

  return (
    <CustomerShell
      eyebrow={ADMIN_PANEL_COPY.eyebrow}
      heading={unavailable ? ADMIN_PANEL_COPY.unavailableHeading : ADMIN_PANEL_COPY.heading}
      intro={unavailable ? ADMIN_PANEL_COPY.unavailableBody : ADMIN_PANEL_COPY.intro}
    >
      {view.kind === "administrator" ? (
        <div className="flex flex-col gap-8">
          <dl className="grid gap-5">
            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                {ADMIN_PANEL_COPY.emailLabel}
              </dt>
              <dd className="mt-1 text-lg font-medium break-all text-ink">{view.email}</dd>
            </div>
          </dl>
          <div className="flex justify-center">
            <Link className={quietButton} href="/admin/catalogo">
              {ADMIN_PANEL_COPY.catalog}
            </Link>
          </div>
          <p className="text-sm leading-6 text-muted">{ADMIN_PANEL_COPY.sessionNote}</p>
          <div className="border-t border-gold/40 pt-8">
            <SignOutButton
              failedMessage={ADMIN_PANEL_COPY.signOutFailed}
              label={ADMIN_PANEL_COPY.signOut}
              pendingLabel={ADMIN_PANEL_COPY.signingOut}
              signInPath="/admin/ingresar"
            />
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <a className={quietButton} href="/admin">
            {ADMIN_PANEL_COPY.retry}
          </a>
        </div>
      )}
    </CustomerShell>
  );
}
