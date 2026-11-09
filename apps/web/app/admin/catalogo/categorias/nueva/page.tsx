import type { Metadata } from "next";

import { ENTRY_COPY } from "../../../../../lib/admin/catalog/copy.ts";
import { EntryCreatePage } from "../../_components/entry-pages.tsx";

export const metadata: Metadata = { title: ENTRY_COPY.categories.createPageTitle };

/** `/admin/catalogo/categorias/nueva` (M3 T8a; S1): the create form. */
export default function CategoryCreateRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <EntryCreatePage searchParams={searchParams} section="categories" />;
}
