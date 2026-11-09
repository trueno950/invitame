import Link from "next/link";

import {
  CATALOG_FIELD_COPY,
  CATALOG_PATHS,
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
import { ADMIN_PANEL_COPY } from "../../../../lib/admin/copy.ts";
import { adminCatalog } from "../../../../lib/server/admin-catalog-api.ts";
import {
  type CatalogEntry,
  type CatalogTemplate,
  type CatalogTemplateVersion,
  isCatalogId,
  TEMPLATE_STATUSES,
} from "../../../../lib/server/admin-catalog-validators.ts";
import { CustomerShell } from "../../../_components/customer-shell.tsx";
import { fieldLabel, primaryButton, quietButton, textButton } from "../../../_components/ui.ts";
import { attempt, requireCatalogAdministrator, resolveRead } from "../_lib/load.ts";
import {
  createTemplateAction,
  publishTemplateVersionAction,
  retireTemplateVersionAction,
  updateTemplateAction,
} from "../actions.ts";
import { SelectField, TextAreaField, TextField } from "./fields.tsx";
import { Notices } from "./notices.tsx";
import { CatalogUnavailable } from "./unavailable.tsx";
import { VersionForm } from "./version-form.tsx";

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

const STATUS_OPTIONS = TEMPLATE_STATUSES.map((status) => ({
  value: status,
  label: TEMPLATE_STATUS_LABELS[status],
}));

const sectionHeading = "font-display text-xl font-semibold text-ink";

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
    <CustomerShell
      eyebrow={ADMIN_PANEL_COPY.eyebrow}
      heading={TEMPLATE_COPY.heading}
      intro={TEMPLATE_COPY.intro}
    >
      <div className="flex flex-col gap-6">
        <Notices error={error?.message} notice={notice} />
        <div className="flex justify-center">
          <Link className={quietButton} href={`${CATALOG_PATHS.templates}/nueva`}>
            {TEMPLATE_COPY.newLink}
          </Link>
        </div>
        {loaded.value.length === 0 ? (
          <p className="text-center leading-7 text-muted">{TEMPLATE_COPY.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {loaded.value.map((stored) => (
              <li key={stored.id}>
                <Link
                  className="flex items-center justify-between gap-4 rounded-field border-[1.5px] border-field-border px-4.5 py-3 transition-colors hover:border-primary"
                  href={`${CATALOG_PATHS.templates}/${stored.id}`}
                >
                  <span className="min-w-0">
                    <span className="block break-words font-medium text-ink">{stored.name}</span>
                    <span className="block break-all font-mono text-xs text-muted">
                      {stored.key}
                    </span>
                    <span className="block break-words text-xs text-muted">
                      {stored.category.name}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <span className="block text-xs font-medium uppercase tracking-[0.12em] text-primary">
                      {TEMPLATE_STATUS_LABELS[stored.status]}
                    </span>
                    <span className="block text-muted">
                      {stored.publishedVersion === null
                        ? TEMPLATE_COPY.noPublishedVersion
                        : `${TEMPLATE_COPY.publishedVersion} ${stored.publishedVersion.version}`}
                    </span>
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
  const invalid = error?.code === "validation" || error?.code === "key-taken";
  const options = categoryOptions(categories.value);

  return (
    <CustomerShell
      eyebrow={ADMIN_PANEL_COPY.eyebrow}
      heading={TEMPLATE_COPY.createHeading}
      intro={TEMPLATE_COPY.createIntro}
    >
      <div className="flex flex-col gap-6">
        <Notices error={error?.message} notice={undefined} />
        {options.length === 0 ? (
          <p className="text-center leading-7 text-muted">{TEMPLATE_COPY.noCategories}</p>
        ) : (
          <form action={createTemplateAction} className="flex flex-col gap-5">
            <TextField
              hint={TEMPLATE_COPY.keyHint}
              id="catalog-key"
              invalid={invalid}
              label={CATALOG_FIELD_COPY.keyLabel}
              name="key"
              placeholder={TEMPLATE_COPY.keyPlaceholder}
              required
            />
            <TextField
              hint={CATALOG_FIELD_COPY.nameHint}
              id="catalog-name"
              invalid={error?.code === "validation"}
              label={CATALOG_FIELD_COPY.nameLabel}
              name="name"
              required
            />
            <TextAreaField
              hint={CATALOG_FIELD_COPY.descriptionHint}
              id="catalog-description"
              invalid={error?.code === "validation"}
              label={CATALOG_FIELD_COPY.descriptionLabel}
              name="description"
            />
            <SelectField
              defaultValue={options[0]?.value ?? ""}
              hint={TEMPLATE_COPY.categoryHint}
              id="catalog-category"
              label={TEMPLATE_COPY.categoryLabel}
              name="categoryId"
              options={options}
            />
            <button className={primaryButton} type="submit">
              {TEMPLATE_COPY.createSubmit}
            </button>
          </form>
        )}
        <div className="flex justify-center">
          <Link className={textButton} href={CATALOG_PATHS.templates}>
            {TEMPLATE_COPY.backToList}
          </Link>
        </div>
      </div>
    </CustomerShell>
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
    <li className="rounded-field border border-field-border px-4 py-3 text-sm">
      <div className="flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-base font-medium text-ink">
            {VERSION_COPY.versionLabel} {version.version}
          </span>
          <span className="block break-all font-mono text-xs text-muted">
            {version.componentKey}
          </span>
          <span className="block text-muted">
            {VERSION_COPY.createdLabel}{" "}
            <time dateTime={version.createdAt}>{formatInstant(version.createdAt)}</time>
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium uppercase tracking-[0.12em] text-primary">
          {VERSION_STATUS_LABELS[version.status]}
        </span>
      </div>
      {action === null ? null : (
        <form
          action={action === "publish" ? publishTemplateVersionAction : retireTemplateVersionAction}
          className="mt-3 flex flex-col gap-2"
        >
          <input name="id" type="hidden" value={template.id} />
          <input name="versionId" type="hidden" value={version.id} />
          <button className={quietButton} disabled={retireBlocked} type="submit">
            {action === "publish" ? VERSION_COPY.publish : VERSION_COPY.retire}
          </button>
          {retireBlocked ? <p className="text-muted">{VERSION_COPY.retireBlocked}</p> : null}
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
    <CustomerShell
      eyebrow={ADMIN_PANEL_COPY.eyebrow}
      heading={TEMPLATE_COPY.editHeading}
      intro={TEMPLATE_COPY.editIntro}
    >
      <div className="flex flex-col gap-8">
        <Notices error={error?.message} notice={notice} />

        <section aria-labelledby="template-details" className="flex flex-col gap-5">
          <h2 className={sectionHeading} id="template-details">
            {TEMPLATE_COPY.detailsHeading}
          </h2>
          <form action={updateTemplateAction} className="flex flex-col gap-5">
            <input name="id" type="hidden" value={stored.id} />
            <div>
              <p className={fieldLabel}>{CATALOG_FIELD_COPY.keyLabel}</p>
              <p className="mt-1 break-all font-mono text-sm text-ink">{stored.key}</p>
              <p className="mt-1 text-sm text-muted">{CATALOG_FIELD_COPY.keyReadOnlyHint}</p>
            </div>
            <TextField
              defaultValue={stored.name}
              hint={CATALOG_FIELD_COPY.nameHint}
              id="catalog-name"
              invalid={textInvalid}
              label={CATALOG_FIELD_COPY.nameLabel}
              name="name"
              required
            />
            <TextAreaField
              defaultValue={stored.description ?? ""}
              hint={CATALOG_FIELD_COPY.descriptionHint}
              id="catalog-description"
              invalid={textInvalid}
              label={CATALOG_FIELD_COPY.descriptionLabel}
              name="description"
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
            <button className={primaryButton} type="submit">
              {CATALOG_FIELD_COPY.save}
            </button>
          </form>
        </section>

        <section
          aria-labelledby="template-versions"
          className="flex flex-col gap-5 border-t border-gold/40 pt-8"
        >
          <h2 className={sectionHeading} id="template-versions">
            {VERSION_COPY.heading}
          </h2>
          <p className="text-sm leading-6 text-muted">{VERSION_COPY.intro}</p>
          {versions.value.length === 0 ? (
            <p className="text-sm text-muted">{VERSION_COPY.empty}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {versions.value.map((version) => (
                <VersionRow key={version.id} template={stored} version={version} />
              ))}
            </ol>
          )}
        </section>

        <section
          aria-labelledby="template-new-version"
          className="flex flex-col gap-5 border-t border-gold/40 pt-8"
        >
          <h2 className={sectionHeading} id="template-new-version">
            {VERSION_COPY.formHeading}
          </h2>
          <p className="text-sm leading-6 text-muted">{VERSION_COPY.formIntro}</p>
          <p className="text-sm leading-6 text-muted">
            {source === undefined
              ? VERSION_COPY.notPrefilled
              : VERSION_COPY.prefilled(source.version, VERSION_STATUS_LABELS[source.status])}
          </p>
          {rendererKeys.length === 0 ? (
            <p className="text-sm text-muted">{VERSION_COPY.noRenderers}</p>
          ) : (
            <VersionForm
              prefill={prefillValues(source, rendererKeys)}
              rendererKeys={rendererKeys}
              templateId={stored.id}
            />
          )}
        </section>

        <div className="flex justify-center">
          <Link className={textButton} href={CATALOG_PATHS.templates}>
            {TEMPLATE_COPY.backToList}
          </Link>
        </div>
      </div>
    </CustomerShell>
  );
}
