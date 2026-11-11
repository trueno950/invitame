import { CATALOG_UNAVAILABLE_COPY } from "../../../../lib/admin/catalog/copy.ts";
import { AdminCenteredShell } from "../../_components/admin-centered-shell.tsx";
import { adminButtonOutline } from "../../_components/admin-ui.ts";

interface CatalogUnavailableProperties {
  /** The page to try again, a plain link so it works without JavaScript. */
  retryPath: string;
  heading?: string;
  body?: string;
  linkLabel?: string;
}

/** The page's notice when the session or the catalog could not be read (a retry, never raw data). */
export function CatalogUnavailable({
  retryPath,
  heading = CATALOG_UNAVAILABLE_COPY.heading,
  body = CATALOG_UNAVAILABLE_COPY.body,
  linkLabel = CATALOG_UNAVAILABLE_COPY.retry,
}: CatalogUnavailableProperties) {
  return (
    <AdminCenteredShell heading={heading} intro={body}>
      <div className="flex">
        <a className={adminButtonOutline} href={retryPath}>
          {linkLabel}
        </a>
      </div>
    </AdminCenteredShell>
  );
}
