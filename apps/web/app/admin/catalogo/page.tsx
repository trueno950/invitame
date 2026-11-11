import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { CATALOG_INDEX_COPY, CATALOG_PATHS } from "../../../lib/admin/catalog/copy.ts";
import { ADMIN_SHELL_COPY } from "../../../lib/admin/copy.ts";
import { loadAdminView, routeAdminPage } from "../../../lib/admin/session.ts";
import { getAuthSession } from "../../../lib/server/session-api.ts";
import { AdminShell } from "../_components/admin-shell.tsx";
import { adminCard, adminFocus } from "../_components/admin-ui.ts";
import { CatalogUnavailable } from "./_components/unavailable.tsx";

export const metadata: Metadata = { title: CATALOG_INDEX_COPY.pageTitle };

/**
 * `/admin/catalogo`: the catalog's index (M3 T8a; S1), with a link to each area. Like the panel, it needs
 * an enrolled administrator; the API authorizes every call the pages under it make.
 */
export default async function CatalogIndexPage() {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAdminView(getAuthSession);
  const target = routeAdminPage("catalog", view.kind);

  if (target !== null) {
    redirect(target);
  }

  if (view.kind !== "administrator") {
    return <CatalogUnavailable retryPath={CATALOG_PATHS.index} />;
  }

  return (
    <AdminShell
      breadcrumbs={[
        { label: ADMIN_SHELL_COPY.panel, href: CATALOG_PATHS.panel },
        { label: CATALOG_INDEX_COPY.heading },
      ]}
      current="catalog"
      description={CATALOG_INDEX_COPY.intro}
      heading={CATALOG_INDEX_COPY.heading}
    >
      <nav aria-label={CATALOG_INDEX_COPY.heading}>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {CATALOG_INDEX_COPY.sections.map((section) => (
            <li key={section.path}>
              <Link
                className={`${adminCard} block h-full px-5 py-4 transition-colors hover:bg-admin-subtle ${adminFocus}`}
                href={section.path}
              >
                <span className="block text-sm font-semibold text-admin-ink">{section.title}</span>
                <span className="mt-1 block text-xs leading-5 text-admin-muted">
                  {section.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </AdminShell>
  );
}
