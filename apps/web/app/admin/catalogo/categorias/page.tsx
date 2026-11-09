import type { Metadata } from "next";

import { ENTRY_COPY } from "../../../../lib/admin/catalog/copy.ts";
import { EntryListPage } from "../_components/entry-pages.tsx";

export const metadata: Metadata = { title: ENTRY_COPY.categories.pageTitle };

/** `/admin/catalogo/categorias` (M3 T8a; S1): the list, with a link to each record and to the create form. */
export default function CategoryListRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <EntryListPage searchParams={searchParams} section="categories" />;
}
