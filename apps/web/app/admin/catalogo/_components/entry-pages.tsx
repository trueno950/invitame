import Link from "next/link";

import {
  CATALOG_FIELD_COPY,
  CATALOG_PATHS,
  ENTRY_COPY,
  type EntrySection,
} from "../../../../lib/admin/catalog/copy.ts";
import { pageNotices } from "../../../../lib/admin/catalog/notices.ts";
import { ADMIN_PANEL_COPY } from "../../../../lib/admin/copy.ts";
import { adminCatalog } from "../../../../lib/server/admin-catalog-api.ts";
import { isCatalogId } from "../../../../lib/server/admin-catalog-validators.ts";
import { CustomerShell } from "../../../_components/customer-shell.tsx";
import { quietButton, textButton } from "../../../_components/ui.ts";
import { attempt, requireCatalogAdministrator, resolveRead } from "../_lib/load.ts";
import {
  createCategoryAction,
  createFeatureAction,
  updateCategoryAction,
  updateFeatureAction,
} from "../actions.ts";
import { EntryForm } from "./entry-form.tsx";
import { Notices } from "./notices.tsx";
import { CatalogUnavailable } from "./unavailable.tsx";

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

const CREATE_ACTION = { categories: createCategoryAction, features: createFeatureAction } as const;
const UPDATE_ACTION = { categories: updateCategoryAction, features: updateFeatureAction } as const;

/** `/admin/catalogo/categorias` and `/funciones`: every record with a link to its edit page. */
export async function EntryListPage({
  section,
  searchParams,
}: {
  section: EntrySection;
  searchParams: SearchParameters;
}) {
  const copy = ENTRY_COPY[section];
  const path = CATALOG_PATHS[section];
  const administrator = await requireCatalogAdministrator();
  const loaded = administrator
    ? resolveRead(await attempt(() => adminCatalog[section].list()))
    : ({ status: "unavailable" } as const);

  if (loaded.status !== "ok") {
    return <CatalogUnavailable retryPath={path} />;
  }

  const { notice, error } = pageNotices(await searchParams);

  return (
    <CustomerShell eyebrow={ADMIN_PANEL_COPY.eyebrow} heading={copy.heading} intro={copy.intro}>
      <div className="flex flex-col gap-6">
        <Notices error={error?.message} notice={notice} />
        <div className="flex justify-center">
          <Link className={quietButton} href={`${path}/nueva`}>
            {copy.newLink}
          </Link>
        </div>
        {loaded.value.length === 0 ? (
          <p className="text-center leading-7 text-muted">{copy.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {loaded.value.map((entry) => (
              <li key={entry.id}>
                <Link
                  className="flex items-center justify-between gap-4 rounded-field border-[1.5px] border-field-border px-4.5 py-3 transition-colors hover:border-primary"
                  href={`${path}/${entry.id}`}
                >
                  <span className="min-w-0">
                    <span className="block break-words font-medium text-ink">{entry.name}</span>
                    <span className="block break-all font-mono text-xs text-muted">
                      {entry.key}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium uppercase tracking-[0.12em] text-primary">
                    {entry.isActive ? copy.activeBadge : copy.inactiveBadge}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-center">
          <Link className={textButton} href={CATALOG_PATHS.index}>
            {CATALOG_FIELD_COPY.backToCatalog}
          </Link>
        </div>
      </div>
    </CustomerShell>
  );
}

/** `…/nueva`: the create form. */
export async function EntryCreatePage({
  section,
  searchParams,
}: {
  section: EntrySection;
  searchParams: SearchParameters;
}) {
  const copy = ENTRY_COPY[section];
  const administrator = await requireCatalogAdministrator();

  if (!administrator) {
    return <CatalogUnavailable retryPath={`${CATALOG_PATHS[section]}/nueva`} />;
  }

  const { error } = pageNotices(await searchParams);

  return (
    <CustomerShell
      eyebrow={ADMIN_PANEL_COPY.eyebrow}
      heading={copy.createHeading}
      intro={copy.createIntro}
    >
      <div className="flex flex-col gap-6">
        <Notices error={error?.message} notice={undefined} />
        <EntryForm action={CREATE_ACTION[section]} errorCode={error?.code} section={section} />
        <div className="flex justify-center">
          <Link className={textButton} href={CATALOG_PATHS[section]}>
            {copy.backToList}
          </Link>
        </div>
      </div>
    </CustomerShell>
  );
}

/**
 * `…/[id]`: the edit form. The API has no read-by-id, so the record is found in the list; an id that
 * is not a UUID or is not in the list shows the not-found notice.
 */
export async function EntryEditPage({
  section,
  id,
  searchParams,
}: {
  section: EntrySection;
  id: string;
  searchParams: SearchParameters;
}) {
  const copy = ENTRY_COPY[section];
  const path = CATALOG_PATHS[section];
  const administrator = await requireCatalogAdministrator();

  if (!administrator) {
    return <CatalogUnavailable retryPath={`${path}/${isCatalogId(id) ? id : ""}`} />;
  }

  const loaded = isCatalogId(id)
    ? resolveRead(await attempt(() => adminCatalog[section].list()))
    : ({ status: "not-found" } as const);

  if (loaded.status === "unavailable") {
    return <CatalogUnavailable retryPath={`${path}/${id}`} />;
  }

  const entry =
    loaded.status === "ok"
      ? loaded.value.find((candidate) => candidate.id.toLowerCase() === id.toLowerCase())
      : undefined;

  if (entry === undefined) {
    return (
      <CatalogUnavailable
        body={copy.notFoundBody}
        heading={copy.notFoundHeading}
        linkLabel={copy.backToList}
        retryPath={path}
      />
    );
  }

  const { notice, error } = pageNotices(await searchParams);

  return (
    <CustomerShell
      eyebrow={ADMIN_PANEL_COPY.eyebrow}
      heading={copy.editHeading}
      intro={copy.editIntro}
    >
      <div className="flex flex-col gap-6">
        <Notices error={error?.message} notice={notice} />
        <EntryForm
          action={UPDATE_ACTION[section]}
          entry={entry}
          errorCode={error?.code}
          section={section}
        />
        <div className="flex justify-center">
          <Link className={textButton} href={path}>
            {copy.backToList}
          </Link>
        </div>
      </div>
    </CustomerShell>
  );
}
