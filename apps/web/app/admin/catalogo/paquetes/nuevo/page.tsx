import type { Metadata } from "next";

import { PACKAGE_COPY } from "../../../../../lib/admin/catalog/copy.ts";
import { PackageCreatePage } from "../../_components/package-pages.tsx";

export const metadata: Metadata = { title: PACKAGE_COPY.createPageTitle };

/** `/admin/catalogo/paquetes/nuevo` (M3 T8a; S1): the create form. */
export default function PackageCreateRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PackageCreatePage searchParams={searchParams} />;
}
