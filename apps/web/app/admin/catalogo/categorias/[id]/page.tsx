import type { Metadata } from "next";

import { ENTRY_COPY } from "../../../../../lib/admin/catalog/copy.ts";
import { EntryEditPage } from "../../_components/entry-pages.tsx";

export const metadata: Metadata = { title: ENTRY_COPY.categories.editPageTitle };

/** `/admin/catalogo/categorias/[id]` (M3 T8a; S1): the edit form of one record. */
export default async function CategoryEditRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  return <EntryEditPage id={id} searchParams={searchParams} section="categories" />;
}
