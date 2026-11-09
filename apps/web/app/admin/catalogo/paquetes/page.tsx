import type { Metadata } from "next";

import { PACKAGE_COPY } from "../../../../lib/admin/catalog/copy.ts";
import { PackageListPage } from "../_components/package-pages.tsx";

export const metadata: Metadata = { title: PACKAGE_COPY.pageTitle };

/** `/admin/catalogo/paquetes` (M3 T8a; S1, S4): the packages with their status and current price. */
export default function PackageListRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <PackageListPage searchParams={searchParams} />;
}
