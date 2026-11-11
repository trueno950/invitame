import {
  CATALOG_INDEX_COPY,
  CATALOG_PATHS,
  CATALOG_TABLE_COPY,
  ENTRY_COPY,
  type EntrySection,
} from "../../../../lib/admin/catalog/copy.ts";
import { pageNotices } from "../../../../lib/admin/catalog/notices.ts";
import { adminCatalog } from "../../../../lib/server/admin-catalog-api.ts";
import { isCatalogId } from "../../../../lib/server/admin-catalog-validators.ts";
import { AdminShell, type Breadcrumb } from "../../_components/admin-shell.tsx";
import { adminBadge, adminTableCell, adminTableRow } from "../../_components/admin-ui.ts";
import { NewRecordLink } from "../../_components/new-record-link.tsx";
import { attempt, requireCatalogAdministrator, resolveRead } from "../_lib/load.ts";
import {
  createCategoryAction,
  createFeatureAction,
  updateCategoryAction,
  updateFeatureAction,
} from "../actions.ts";
import { CatalogTable, EditCell, NameCell } from "./catalog-table.tsx";
import { EntryForm } from "./entry-form.tsx";
import { Notices } from "./notices.tsx";
import { CatalogUnavailable } from "./unavailable.tsx";

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

const CREATE_ACTION = { categories: createCategoryAction, features: createFeatureAction } as const;
const UPDATE_ACTION = { categories: updateCategoryAction, features: updateFeatureAction } as const;

/** Catálogo / <section> [/ <page>]: the trail above every page of a section. */
function trail(section: EntrySection, page?: string): Breadcrumb[] {
  const list = { label: ENTRY_COPY[section].heading, href: CATALOG_PATHS[section] };
  return [
    { label: CATALOG_INDEX_COPY.heading, href: CATALOG_PATHS.index },
    page === undefined ? { label: list.label } : list,
    ...(page === undefined ? [] : [{ label: page }]),
  ];
}

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
    <AdminShell
      actions={<NewRecordLink href={`${path}/nueva`} label={copy.newLink} />}
      breadcrumbs={trail(section)}
      current={section}
      description={copy.intro}
      heading={copy.heading}
    >
      <Notices error={error?.message} notice={notice} />
      <CatalogTable
        caption={copy.heading}
        columns={[
          { label: CATALOG_TABLE_COPY.name },
          { label: CATALOG_TABLE_COPY.status },
          { label: CATALOG_TABLE_COPY.actions, align: "right", hidden: true },
        ]}
        empty={copy.empty}
        total={loaded.value.length}
      >
        {loaded.value.map((entry) => (
          <tr className={adminTableRow} key={entry.id}>
            <NameCell href={`${path}/${entry.id}`} name={entry.name} recordKey={entry.key} />
            <td className={adminTableCell}>
              <span className={adminBadge(entry.isActive ? "success" : "neutral")}>
                {entry.isActive ? copy.activeBadge : copy.inactiveBadge}
              </span>
            </td>
            <EditCell href={`${path}/${entry.id}`} name={entry.name} />
          </tr>
        ))}
      </CatalogTable>
    </AdminShell>
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
    <AdminShell
      breadcrumbs={trail(section, copy.createHeading)}
      current={section}
      description={copy.createIntro}
      heading={copy.createHeading}
      width="form"
    >
      <Notices error={error?.message} notice={undefined} />
      <EntryForm
        action={CREATE_ACTION[section]}
        cancelHref={CATALOG_PATHS[section]}
        errorCode={error?.code}
        section={section}
      />
    </AdminShell>
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
    <AdminShell
      breadcrumbs={trail(section, entry.name)}
      current={section}
      description={copy.editIntro}
      heading={copy.editHeading}
      width="form"
    >
      <Notices error={error?.message} notice={notice} />
      <EntryForm
        action={UPDATE_ACTION[section]}
        cancelHref={path}
        entry={entry}
        errorCode={error?.code}
        section={section}
      />
    </AdminShell>
  );
}
