import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { CATALOG_INDEX_COPY } from "../../lib/admin/catalog/copy.ts";
import { ADMIN_PANEL_COPY } from "../../lib/admin/copy.ts";
import { loadAdminView, routeAdminPage } from "../../lib/admin/session.ts";
import { getAuthSession } from "../../lib/server/session-api.ts";
import { AdminCard } from "./_components/admin-card.tsx";
import { AdminCenteredShell } from "./_components/admin-centered-shell.tsx";
import { AdminShell } from "./_components/admin-shell.tsx";
import { adminButtonOutline, adminCardBody, adminFocus } from "./_components/admin-ui.ts";

export const metadata: Metadata = {
  title: ADMIN_PANEL_COPY.pageTitle,
};

/**
 * `/admin`: the administrator panel (M2 T8d; S6, S21, S36), with the account's address and a shortcut
 * to each catalog area; sign-out lives in the sidebar. The session comes from `get-session` on the web
 * server: anonymous visitors go to `/admin/ingresar`, pending administrators to `/admin/activar`, and
 * customers to `/cuenta`. The API authorizes every administrative action; this page is never the guard.
 */
export default async function AdminPanelPage() {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAdminView(getAuthSession);
  const target = routeAdminPage("panel", view.kind);

  if (target !== null) {
    redirect(target);
  }

  if (view.kind !== "administrator") {
    return (
      <AdminCenteredShell
        heading={ADMIN_PANEL_COPY.unavailableHeading}
        intro={ADMIN_PANEL_COPY.unavailableBody}
      >
        <a className={adminButtonOutline} href="/admin">
          {ADMIN_PANEL_COPY.retry}
        </a>
      </AdminCenteredShell>
    );
  }

  return (
    <AdminShell
      current="panel"
      description={ADMIN_PANEL_COPY.intro}
      heading={ADMIN_PANEL_COPY.heading}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <AdminCard id="panel-account" title={ADMIN_PANEL_COPY.emailLabel}>
          <div className={adminCardBody}>
            <dl>
              <dt className="sr-only">{ADMIN_PANEL_COPY.emailLabel}</dt>
              <dd className="text-sm font-medium break-all text-admin-ink">{view.email}</dd>
            </dl>
            <p className="mt-3 text-xs leading-5 text-admin-muted">
              {ADMIN_PANEL_COPY.sessionNote}
            </p>
          </div>
        </AdminCard>

        <AdminCard
          className="lg:col-span-2"
          description={CATALOG_INDEX_COPY.intro}
          id="panel-catalog"
          title={CATALOG_INDEX_COPY.heading}
        >
          <ul className="grid gap-px overflow-hidden rounded-b-xl bg-admin-border sm:grid-cols-2">
            {CATALOG_INDEX_COPY.sections.map((section) => (
              <li className="bg-admin-surface" key={section.path}>
                <Link
                  className={`block h-full px-5 py-4 transition-colors hover:bg-admin-subtle ${adminFocus}`}
                  href={section.path}
                >
                  <span className="block text-sm font-medium text-admin-ink">{section.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-admin-muted">
                    {section.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </AdminCard>
      </div>
    </AdminShell>
  );
}
