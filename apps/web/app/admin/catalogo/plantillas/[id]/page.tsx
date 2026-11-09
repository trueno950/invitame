import type { Metadata } from "next";

import { TEMPLATE_COPY } from "../../../../../lib/admin/catalog/copy.ts";
import { TemplateEditPage } from "../../_components/template-pages.tsx";

export const metadata: Metadata = { title: TEMPLATE_COPY.editPageTitle };

/** `/admin/catalogo/plantillas/[id]` (M3 T8b; S1, S5, S8): data, versions, and the new-version form. */
export default async function TemplateEditRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  return <TemplateEditPage id={id} searchParams={searchParams} />;
}
