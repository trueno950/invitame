import type { Metadata } from "next";

import { PACKAGE_COPY } from "../../../../../lib/admin/catalog/copy.ts";
import { PackageEditPage } from "../../_components/package-pages.tsx";

export const metadata: Metadata = { title: PACKAGE_COPY.editPageTitle };

/** `/admin/catalogo/paquetes/[id]` (M3 T8a; S1, S4): data, features, price, and price history. */
export default async function PackageEditRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  return <PackageEditPage id={id} searchParams={searchParams} />;
}
