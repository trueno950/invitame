import { CATALOG_UNAVAILABLE_COPY } from "../../../../lib/admin/catalog/copy.ts";
import { ADMIN_PANEL_COPY } from "../../../../lib/admin/copy.ts";
import { CustomerShell } from "../../../_components/customer-shell.tsx";
import { quietButton } from "../../../_components/ui.ts";

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
    <CustomerShell eyebrow={ADMIN_PANEL_COPY.eyebrow} heading={heading} intro={body}>
      <div className="flex justify-center">
        <a className={quietButton} href={retryPath}>
          {linkLabel}
        </a>
      </div>
    </CustomerShell>
  );
}
