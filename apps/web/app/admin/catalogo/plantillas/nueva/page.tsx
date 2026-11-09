import type { Metadata } from "next";

import { TEMPLATE_COPY } from "../../../../../lib/admin/catalog/copy.ts";
import { TemplateCreatePage } from "../../_components/template-pages.tsx";

export const metadata: Metadata = { title: TEMPLATE_COPY.createPageTitle };

/** `/admin/catalogo/plantillas/nueva` (M3 T8b; S1): the create form. */
export default function TemplateCreateRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TemplateCreatePage searchParams={searchParams} />;
}
