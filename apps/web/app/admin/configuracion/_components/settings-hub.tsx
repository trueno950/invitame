import Link from "next/link";

import { CATALOG_INDEX_COPY } from "../../../../lib/admin/catalog/copy.ts";
import { SETTINGS_COPY } from "../../../../lib/admin/settings/copy.ts";
import { adminCard, adminFocus } from "../../_components/admin-ui.ts";

/**
 * The hub of `/admin/configuracion` (M9 T14; S5, S8): one card linking the four catalog sections the administrator
 * already has — categories, features, packages with prices, and templates. It reuses the catalog's own paths and copy,
 * so the entry reads the same here as on `/admin/catalogo`; nothing of the catalog is duplicated or changed.
 */
export function SettingsHub() {
  return (
    <nav aria-label={SETTINGS_COPY.hubHeading}>
      <ul className="grid gap-4 px-5 py-4 sm:grid-cols-2">
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
  );
}
