import {
  CATALOG_FIELD_COPY,
  CATALOG_INDEX_COPY,
  CATALOG_PATHS,
  CATALOG_TABLE_COPY,
  TEMPLATE_COPY,
  TEMPLATE_STATUS_LABELS,
  VERSION_COPY,
  VERSION_STATUS_LABELS,
} from "../../../../lib/admin/catalog/copy.ts";
import { formatInstant } from "../../../../lib/admin/catalog/format.ts";
import { pageNotices } from "../../../../lib/admin/catalog/notices.ts";
import {
  prefillValues,
  prefillVersion,
  versionAction,
} from "../../../../lib/admin/catalog/versions.ts";
import { adminCatalog } from "../../../../lib/server/admin-catalog-api.ts";
import {
  type CatalogEntry,
  type CatalogTemplate,
  type CatalogTemplateVersion,
  isCatalogId,
  TEMPLATE_STATUSES,
} from "../../../../lib/server/admin-catalog-validators.ts";
import { AdminCard, AdminCardEmpty } from "../../_components/admin-card.tsx";
import { AdminDetailLayout } from "../../_components/admin-detail-layout.tsx";
import { AdminShell, type Breadcrumb } from "../../_components/admin-shell.tsx";
import {
  adminButtonVariant,
  adminCard,
  adminTableCell,
  adminTableRow,
} from "../../_components/admin-ui.ts";
import { NewRecordLink } from "../../_components/new-record-link.tsx";
import { StatusBadge } from "../../_components/status-badge.tsx";
import { attempt, requireCatalogAdministrator, resolveRead } from "../_lib/load.ts";
import {
  createTemplateAction,
  publishTemplateVersionAction,
  retireTemplateVersionAction,
  updateTemplateAction,
} from "../actions.ts";
import { CatalogTable, EditCell, NameCell } from "./catalog-table.tsx";
import { FormBody, SelectField, SubmitFooter } from "./fields.tsx";
import { Notices } from "./notices.tsx";
import { RecordBasicsFields } from "./record-basics.tsx";
import { CatalogUnavailable } from "./unavailable.tsx";
import { VersionForm } from "./version-form.tsx";

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

const STATUS_OPTIONS = TEMPLATE_STATUSES.map((status) => ({
  value: status,
  label: TEMPLATE_STATUS_LABELS[status],
}));

/** Catálogo / Plantillas [/ <page>]: the trail above every template page. */
function trail(page?: string): Breadcrumb[] {
  return [
    { label: CATALOG_INDEX_COPY.heading, href: CATALOG_PATHS.index },
    page === undefined
      ? { label: TEMPLATE_COPY.heading }
      : { label: TEMPLATE_COPY.heading, href: CATALOG_PATHS.templates },
    ...(page === undefined ? [] : [{ label: page }]),
  ];
}

const categoryOptions = (categories: readonly CatalogEntry[]) =>
  categories.map((category) => ({
    value: category.id,
    label: category.isActive
      ? category.name
      : `${category.name} (${TEMPLATE_COPY.categoryInactive})`,
  }));

/** `/admin/catalogo/plantillas`: every template with its status, category, and published version. */
export async function TemplateListPage({ searchParams }: { searchParams: SearchParameters }) {
  const administrator = await requireCatalogAdministrator();
  const loaded = administrator
    ? resolveRead(await attempt(() => adminCatalog.templates.list()))
    : ({ status: "unavailable" } as const);

  if (loaded.status !== "ok") {
    return <CatalogUnavailable retryPath={CATALOG_PATHS.templates} />;
  }

  const { notice, error } = pageNotices(await searchParams);

  return (
    <AdminShell
      actions={
        <NewRecordLink href={`${CATALOG_PATHS.templates}/nueva`} label={TEMPLATE_COPY.newLink} />
      }
      breadcrumbs={trail()}
      current="templates"
      description={TEMPLATE_COPY.intro}
      heading={TEMPLATE_COPY.heading}
    >
      <Notices error={error?.message} notice={notice} />
      <CatalogTable
        caption={TEMPLATE_COPY.heading}
        columns={[
          { label: CATALOG_TABLE_COPY.name },
          { label: CATALOG_TABLE_COPY.category },
          { label: CATALOG_TABLE_COPY.status },
          { label: CATALOG_TABLE_COPY.publishedVersion },
          { label: CATALOG_TABLE_COPY.actions, align: "right", hidden: true },
        ]}
        empty={TEMPLATE_COPY.empty}
        total={loaded.value.length}
      >
        {loaded.value.map((stored) => {
          const href = `${CATALOG_PATHS.templates}/${stored.id}`;
          return (
            <tr className={adminTableRow} key={stored.id}>
              <NameCell href={href} name={stored.name} recordKey={stored.key} />
              <td className={`${adminTableCell} text-admin-muted`}>{stored.category.name}</td>
              <td className={adminTableCell}>
                <StatusBadge label={TEMPLATE_STATUS_LABELS[stored.status]} status={stored.status} />
              </td>
              <td className={`${adminTableCell} whitespace-nowrap`}>
                {stored.publishedVersion === null ? (
                  <span className="text-admin-muted">{TEMPLATE_COPY.noPublishedVersion}</span>
                ) : (
                  `${VERSION_COPY.versionLabel} ${stored.publishedVersion.version}`
                )}
              </td>
              <EditCell href={href} name={stored.name} />
            </tr>
          );
        })}
      </CatalogTable>
    </AdminShell>
  );
}

/** `/admin/catalogo/plantillas/nueva`: the create form, with the categories to choose from. */
export async function TemplateCreatePage({ searchParams }: { searchParams: SearchParameters }) {
  const administrator = await requireCatalogAdministrator();

  if (!administrator) {
    return <CatalogUnavailable retryPath={`${CATALOG_PATHS.templates}/nueva`} />;
  }

  const categories = resolveRead(await attempt(() => adminCatalog.categories.list()));

  if (categories.status !== "ok") {
    return <CatalogUnavailable retryPath={`${CATALOG_PATHS.templates}/nueva`} />;
  }

  const { error } = pageNotices(await searchParams);
  const invalidKey = error?.code === "validation" || error?.code === "key-taken";
  const invalidText = error?.code === "validation";
  const options = categoryOptions(categories.value);

  return (
    <AdminShell
      breadcrumbs={trail(TEMPLATE_COPY.createHeading)}
      current="templates"
      description={TEMPLATE_COPY.createIntro}
      heading={TEMPLATE_COPY.createHeading}
      width="form"
    >
      <Notices error={error?.message} notice={undefined} />
      {options.length === 0 ? (
        <p className={`${adminCard} px-5 py-6 text-sm text-admin-muted`}>
          {TEMPLATE_COPY.noCategories}
        </p>
      ) : (
        <form action={createTemplateAction} className={adminCard}>
          <FormBody>
            <RecordBasicsFields
              invalidKey={invalidKey}
              invalidText={invalidText}
              keyHint={TEMPLATE_COPY.keyHint}
              keyPlaceholder={TEMPLATE_COPY.keyPlaceholder}
            />
            <SelectField
              defaultValue={options[0]?.value ?? ""}
              hint={TEMPLATE_COPY.categoryHint}
              id="catalog-category"
              label={TEMPLATE_COPY.categoryLabel}
              name="categoryId"
              options={options}
            />
          </FormBody>
          <SubmitFooter cancelHref={CATALOG_PATHS.templates} label={TEMPLATE_COPY.createSubmit} />
        </form>
      )}
    </AdminShell>
  );
}

function VersionRow({
  template,
  version,
}: {
  template: CatalogTemplate;
  version: CatalogTemplateVersion;
}) {
  const action = versionAction(version.status);
  // The API refuses to retire the published version while the template itself is published (L4).
  const retireBlocked = action === "retire" && template.status === "PUBLISHED";

  return (
    <li className="px-5 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-medium text-admin-ink">
            {VERSION_COPY.versionLabel} {version.version}
          </span>
          <span className="block font-mono text-xs break-all text-admin-muted">
            {version.componentKey}
          </span>
          <span className="block text-xs text-admin-muted">
            {VERSION_COPY.createdLabel}{" "}
            <time dateTime={version.createdAt}>{formatInstant(version.createdAt)}</time>
          </span>
        </span>
        <StatusBadge label={VERSION_STATUS_LABELS[version.status]} status={version.status} />
      </div>
      {action === null ? null : (
        <form
          action={action === "publish" ? publishTemplateVersionAction : retireTemplateVersionAction}
          className="mt-2 flex flex-col items-start gap-1.5"
        >
          <input name="id" type="hidden" value={template.id} />
          <input name="versionId" type="hidden" value={version.id} />
          <button
            className={adminButtonVariant(action === "publish" ? "solid" : "outline", "small")}
            disabled={retireBlocked}
            type="submit"
          >
            {action === "publish" ? VERSION_COPY.publish : VERSION_COPY.retire}
          </button>
          {retireBlocked ? (
            <p className="text-xs text-admin-muted">{VERSION_COPY.retireBlocked}</p>
          ) : null}
        </form>
      )}
    </li>
  );
}

/**
 * `/admin/catalogo/plantillas/[id]`: the template's data and its versions, newest first, with the
 * publish and retire buttons and the form that creates a new version from a copy of the published
 * (or latest) one. The API has no read-by-id, so the template is found in the list; the four reads
 * run together.
 */
export async function TemplateEditPage({
  id,
  searchParams,
}: {
  id: string;
  searchParams: SearchParameters;
}) {
  const path = `${CATALOG_PATHS.templates}/${id}`;
  const administrator = await requireCatalogAdministrator();

  if (!administrator) {
    return <CatalogUnavailable retryPath={path} />;
  }

  const notFoundPage = (
    <CatalogUnavailable
      body={TEMPLATE_COPY.notFoundBody}
      heading={TEMPLATE_COPY.notFoundHeading}
      linkLabel={TEMPLATE_COPY.backToList}
      retryPath={CATALOG_PATHS.templates}
    />
  );

  if (!isCatalogId(id)) {
    return notFoundPage;
  }

  const [templatesResult, categoriesResult, versionsResult, renderersResult] = await Promise.all([
    attempt(() => adminCatalog.templates.list()),
    attempt(() => adminCatalog.categories.list()),
    attempt(() => adminCatalog.templates.versions(id)),
    attempt(() => adminCatalog.renderers.list()),
  ]);
  const templates = resolveRead(templatesResult);
  const categories = resolveRead(categoriesResult);
  const versions = resolveRead(versionsResult);
  const renderers = resolveRead(renderersResult);

  if (
    templates.status === "unavailable" ||
    categories.status !== "ok" ||
    versions.status === "unavailable" ||
    renderers.status !== "ok"
  ) {
    return <CatalogUnavailable retryPath={path} />;
  }

  const stored =
    templates.status === "ok"
      ? templates.value.find((candidate) => candidate.id.toLowerCase() === id.toLowerCase())
      : undefined;

  if (stored === undefined || versions.status !== "ok") {
    return notFoundPage;
  }

  const { notice, error } = pageNotices(await searchParams);
  const rendererKeys = renderers.value.map((renderer) => renderer.componentKey);
  const source = prefillVersion(versions.value);
  const textInvalid = error?.code === "validation";

  return (
    <AdminShell
      actions={<StatusBadge label={TEMPLATE_STATUS_LABELS[stored.status]} status={stored.status} />}
      breadcrumbs={trail(stored.name)}
      current="templates"
      description={TEMPLATE_COPY.editIntro}
      heading={TEMPLATE_COPY.editHeading}
    >
      <Notices error={error?.message} notice={notice} />

      <AdminDetailLayout
        aside={
          <AdminCard
            description={VERSION_COPY.intro}
            id="template-versions"
            title={VERSION_COPY.heading}
          >
            {versions.value.length === 0 ? (
              <AdminCardEmpty>{VERSION_COPY.empty}</AdminCardEmpty>
            ) : (
              <ol className="max-h-[70vh] divide-y divide-admin-border overflow-y-auto">
                {versions.value.map((version) => (
                  <VersionRow key={version.id} template={stored} version={version} />
                ))}
              </ol>
            )}
          </AdminCard>
        }
        main={
          <>
            <AdminCard id="template-details" title={TEMPLATE_COPY.detailsHeading}>
              <form action={updateTemplateAction}>
                <FormBody>
                  <RecordBasicsFields
                    invalidText={textInvalid}
                    keyHint={TEMPLATE_COPY.keyHint}
                    keyPlaceholder={TEMPLATE_COPY.keyPlaceholder}
                    record={stored}
                  />
                  <SelectField
                    defaultValue={stored.category.id}
                    hint={TEMPLATE_COPY.categoryHint}
                    id="catalog-category"
                    label={TEMPLATE_COPY.categoryLabel}
                    name="categoryId"
                    options={categoryOptions(categories.value)}
                  />
                  <SelectField
                    defaultValue={stored.status}
                    hint={TEMPLATE_COPY.statusHint}
                    id="catalog-status"
                    label={TEMPLATE_COPY.statusLabel}
                    name="status"
                    options={STATUS_OPTIONS}
                  />
                </FormBody>
                <SubmitFooter label={CATALOG_FIELD_COPY.save} />
              </form>
            </AdminCard>

            <AdminCard
              description={
                <>
                  {VERSION_COPY.formIntro}{" "}
                  {source === undefined
                    ? VERSION_COPY.notPrefilled
                    : VERSION_COPY.prefilled(source.version, VERSION_STATUS_LABELS[source.status])}
                </>
              }
              id="template-new-version"
              title={VERSION_COPY.formHeading}
            >
              {rendererKeys.length === 0 ? (
                <AdminCardEmpty>{VERSION_COPY.noRenderers}</AdminCardEmpty>
              ) : (
                <VersionForm
                  prefill={prefillValues(source, rendererKeys)}
                  rendererKeys={rendererKeys}
                  templateId={stored.id}
                />
              )}
            </AdminCard>
          </>
        }
        stickyAside
      />
    </AdminShell>
  );
}
