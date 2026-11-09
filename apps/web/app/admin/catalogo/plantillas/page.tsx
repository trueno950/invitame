import type { Metadata } from "next";

import { TEMPLATE_COPY } from "../../../../lib/admin/catalog/copy.ts";
import { TemplateListPage } from "../_components/template-pages.tsx";

export const metadata: Metadata = { title: TEMPLATE_COPY.pageTitle };

/** `/admin/catalogo/plantillas` (M3 T8b; S1, S5): the templates with their category and version. */
export default function TemplateListRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TemplateListPage searchParams={searchParams} />;
}
