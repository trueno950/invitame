import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { CATALOG_INDEX_COPY, CATALOG_PATHS } from "../../../lib/admin/catalog/copy.ts";
import { loadAdminView, routeAdminPage } from "../../../lib/admin/session.ts";
import { getAuthSession } from "../../../lib/server/session-api.ts";
import { CustomerShell } from "../../_components/customer-shell.tsx";
import { focusRing, quietButton } from "../../_components/ui.ts";
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
    <CustomerShell
      eyebrow={CATALOG_INDEX_COPY.eyebrow}
      heading={CATALOG_INDEX_COPY.heading}
      intro={CATALOG_INDEX_COPY.intro}
    >
      <div className="flex flex-col gap-6">
        <nav aria-label={CATALOG_INDEX_COPY.heading}>
          <ul className="flex flex-col gap-3">
            {CATALOG_INDEX_COPY.sections.map((section) => (
              <li key={section.path}>
                <Link
                  className={`block rounded-field border-[1.5px] border-field-border px-4.5 py-3.5 transition-colors hover:border-primary ${focusRing}`}
                  href={section.path}
                >
                  <span className="block font-display text-lg font-semibold text-ink">
                    {section.title}
                  </span>
                  <span className="mt-0.5 block text-sm leading-6 text-muted">
                    {section.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex justify-center">
          <Link className={quietButton} href={CATALOG_PATHS.panel}>
            {CATALOG_INDEX_COPY.backToPanel}
          </Link>
        </div>
      </div>
    </CustomerShell>
  );
}
