import {
  CATALOG_FIELD_COPY,
  CATALOG_INDEX_COPY,
  CATALOG_PATHS,
  CATALOG_TABLE_COPY,
  PACKAGE_COPY,
  PACKAGE_STATUS_LABELS,
} from "../../../../lib/admin/catalog/copy.ts";
import { formatInstant } from "../../../../lib/admin/catalog/format.ts";
import { pageNotices } from "../../../../lib/admin/catalog/notices.ts";
import { formatMxn, formatPesosField } from "../../../../lib/admin/catalog/price.ts";
import { adminCatalog } from "../../../../lib/server/admin-catalog-api.ts";
import {
  type CatalogPackage,
  DEFAULT_PACKAGE_DURATION_DAYS,
  isCatalogId,
  PACKAGE_STATUSES,
} from "../../../../lib/server/admin-catalog-validators.ts";
import { AdminCard, AdminCardEmpty } from "../../_components/admin-card.tsx";
import { AdminDetailLayout } from "../../_components/admin-detail-layout.tsx";
import { AdminShell, type Breadcrumb } from "../../_components/admin-shell.tsx";
import {
  adminBadge,
  adminCard,
  adminCardBody,
  adminTableCell,
  adminTableRow,
} from "../../_components/admin-ui.ts";
import { NewRecordLink } from "../../_components/new-record-link.tsx";
import { StatusBadge } from "../../_components/status-badge.tsx";
import { attempt, requireCatalogAdministrator, resolveRead } from "../_lib/load.ts";
import {
  createPackageAction,
  setPackageFeaturesAction,
  setPackagePriceAction,
  updatePackageAction,
} from "../actions.ts";
import { CatalogTable, EditCell, NameCell } from "./catalog-table.tsx";
import { CheckboxField, FormBody, SelectField, SubmitFooter, TextField } from "./fields.tsx";
import { Notices } from "./notices.tsx";
import { RecordBasicsFields } from "./record-basics.tsx";
import { CatalogUnavailable } from "./unavailable.tsx";

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

const STATUS_OPTIONS = PACKAGE_STATUSES.map((status) => ({
  value: status,
  label: PACKAGE_STATUS_LABELS[status],
}));

/** The package's current MXN price, if one is set. */
function currentMxn(stored: CatalogPackage) {
  return stored.currentPrices.find((price) => price.currency === "MXN");
}

/** Catálogo / Paquetes [/ <page>]: the trail above every package page. */
function trail(page?: string): Breadcrumb[] {
  return [
    { label: CATALOG_INDEX_COPY.heading, href: CATALOG_PATHS.index },
    page === undefined
      ? { label: PACKAGE_COPY.heading }
      : { label: PACKAGE_COPY.heading, href: CATALOG_PATHS.packages },
    ...(page === undefined ? [] : [{ label: page }]),
  ];
}

/** `/admin/catalogo/paquetes`: every package with its status and current price. */
export async function PackageListPage({ searchParams }: { searchParams: SearchParameters }) {
  const administrator = await requireCatalogAdministrator();
  const loaded = administrator
    ? resolveRead(await attempt(() => adminCatalog.packages.list()))
    : ({ status: "unavailable" } as const);

  if (loaded.status !== "ok") {
    return <CatalogUnavailable retryPath={CATALOG_PATHS.packages} />;
  }

  const { notice, error } = pageNotices(await searchParams);

  return (
    <AdminShell
      actions={
        <NewRecordLink href={`${CATALOG_PATHS.packages}/nuevo`} label={PACKAGE_COPY.newLink} />
      }
      breadcrumbs={trail()}
      current="packages"
      description={PACKAGE_COPY.intro}
      heading={PACKAGE_COPY.heading}
    >
      <Notices error={error?.message} notice={notice} />
      <CatalogTable
        caption={PACKAGE_COPY.heading}
        columns={[
          { label: CATALOG_TABLE_COPY.name },
          { label: CATALOG_TABLE_COPY.status },
          { label: CATALOG_TABLE_COPY.price, align: "right" },
          { label: CATALOG_TABLE_COPY.actions, align: "right", hidden: true },
        ]}
        empty={PACKAGE_COPY.empty}
        total={loaded.value.length}
      >
        {loaded.value.map((stored) => {
          const price = currentMxn(stored);
          const href = `${CATALOG_PATHS.packages}/${stored.id}`;
          return (
            <tr className={adminTableRow} key={stored.id}>
              <NameCell href={href} name={stored.name} recordKey={stored.key} />
              <td className={adminTableCell}>
                <StatusBadge label={PACKAGE_STATUS_LABELS[stored.status]} status={stored.status} />
              </td>
              <td className={`${adminTableCell} text-right whitespace-nowrap tabular-nums`}>
                {price === undefined ? (
                  <span className="text-admin-muted">{PACKAGE_COPY.noPrice}</span>
                ) : (
                  formatMxn(price.amountMinor, price.currency)
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

/** `/admin/catalogo/paquetes/nuevo`: the create form. */
export async function PackageCreatePage({ searchParams }: { searchParams: SearchParameters }) {
  const administrator = await requireCatalogAdministrator();

  if (!administrator) {
    return <CatalogUnavailable retryPath={`${CATALOG_PATHS.packages}/nuevo`} />;
  }

  const { error } = pageNotices(await searchParams);
  const invalidKey = error?.code === "key-taken" || error?.code === "validation";
  const invalidText = error?.code === "validation";

  return (
    <AdminShell
      breadcrumbs={trail(PACKAGE_COPY.createHeading)}
      current="packages"
      description={PACKAGE_COPY.createIntro}
      heading={PACKAGE_COPY.createHeading}
      width="form"
    >
      <Notices error={error?.message} notice={undefined} />
      <form action={createPackageAction} className={adminCard}>
        <FormBody>
          <RecordBasicsFields
            invalidKey={invalidKey}
            invalidText={invalidText}
            keyHint={PACKAGE_COPY.keyHint}
            keyPlaceholder={PACKAGE_COPY.keyPlaceholder}
          />
          <TextField
            defaultValue={String(DEFAULT_PACKAGE_DURATION_DAYS)}
            hint={PACKAGE_COPY.durationHint}
            id="catalog-duration"
            inputMode="numeric"
            label={PACKAGE_COPY.durationLabel}
            name="durationDays"
            required
          />
        </FormBody>
        <SubmitFooter cancelHref={CATALOG_PATHS.packages} label={PACKAGE_COPY.createSubmit} />
      </form>
    </AdminShell>
  );
}

/**
 * `/admin/catalogo/paquetes/[id]`: the package's data, its included features, its price, and the
 * price history, each in its own form. The API has no read-by-id, so the package is found in the
 * list; the three reads run together.
 */
export async function PackageEditPage({
  id,
  searchParams,
}: {
  id: string;
  searchParams: SearchParameters;
}) {
  const path = `${CATALOG_PATHS.packages}/${id}`;
  const administrator = await requireCatalogAdministrator();

  if (!administrator) {
    return <CatalogUnavailable retryPath={path} />;
  }

  const notFoundPage = (
    <CatalogUnavailable
      body={PACKAGE_COPY.notFoundBody}
      heading={PACKAGE_COPY.notFoundHeading}
      linkLabel={PACKAGE_COPY.backToList}
      retryPath={CATALOG_PATHS.packages}
    />
  );

  if (!isCatalogId(id)) {
    return notFoundPage;
  }

  const [packagesResult, featuresResult, historyResult] = await Promise.all([
    attempt(() => adminCatalog.packages.list()),
    attempt(() => adminCatalog.features.list()),
    attempt(() => adminCatalog.packages.priceHistory(id)),
  ]);
  const packages = resolveRead(packagesResult);
  const features = resolveRead(featuresResult);
  const history = resolveRead(historyResult);

  if (packages.status === "unavailable" || features.status === "unavailable") {
    return <CatalogUnavailable retryPath={path} />;
  }

  const stored =
    packages.status === "ok"
      ? packages.value.find((candidate) => candidate.id.toLowerCase() === id.toLowerCase())
      : undefined;

  if (stored === undefined || features.status !== "ok" || history.status !== "ok") {
    return history.status === "unavailable" ? (
      <CatalogUnavailable retryPath={path} />
    ) : (
      notFoundPage
    );
  }

  const { notice, error } = pageNotices(await searchParams);
  const included = new Set(
    stored.features.filter((feature) => feature.included).map((feature) => feature.id),
  );
  const price = currentMxn(stored);
  const priceInvalid = error?.code.startsWith("price-") ?? false;
  const textInvalid = error?.code === "validation";

  return (
    <AdminShell
      actions={<StatusBadge label={PACKAGE_STATUS_LABELS[stored.status]} status={stored.status} />}
      breadcrumbs={trail(stored.name)}
      current="packages"
      description={PACKAGE_COPY.editIntro}
      heading={PACKAGE_COPY.editHeading}
    >
      <Notices error={error?.message} notice={notice} />

      <AdminDetailLayout
        aside={
          <>
            <AdminCard id="package-price" title={PACKAGE_COPY.priceHeading}>
              <div className={adminCardBody}>
                <p className="text-xs text-admin-muted">{PACKAGE_COPY.priceCurrent}</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight text-admin-ink tabular-nums">
                  {price === undefined
                    ? PACKAGE_COPY.noPrice
                    : formatMxn(price.amountMinor, price.currency)}
                </p>
              </div>
              <form action={setPackagePriceAction} className="border-t border-admin-border">
                <input name="id" type="hidden" value={stored.id} />
                <div className="px-5 py-4">
                  <TextField
                    defaultValue={price === undefined ? "" : formatPesosField(price.amountMinor)}
                    hint={`${PACKAGE_COPY.priceHint} ${PACKAGE_COPY.priceNote}`}
                    id="catalog-price"
                    inputMode="decimal"
                    invalid={priceInvalid}
                    label={PACKAGE_COPY.priceLabel}
                    name="price"
                    required
                  />
                </div>
                <SubmitFooter label={PACKAGE_COPY.priceSave} />
              </form>
            </AdminCard>

            <AdminCard id="package-history" title={PACKAGE_COPY.historyHeading}>
              {history.value.length === 0 ? (
                <AdminCardEmpty>{PACKAGE_COPY.historyEmpty}</AdminCardEmpty>
              ) : (
                <ol className="max-h-80 divide-y divide-admin-border overflow-y-auto">
                  {history.value.map((row) => (
                    <li
                      className="flex items-start justify-between gap-3 px-5 py-2.5 text-sm"
                      key={`${row.createdAt}-${row.currency}-${row.amountMinor}`}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium text-admin-ink tabular-nums">
                          {formatMxn(row.amountMinor, row.currency)}
                        </span>
                        <span className="block text-xs text-admin-muted">
                          {PACKAGE_COPY.historySince}{" "}
                          <time dateTime={row.createdAt}>{formatInstant(row.createdAt)}</time>
                          {row.retiredAt === null ? null : (
                            <>
                              {" · "}
                              {PACKAGE_COPY.historyUntil}{" "}
                              <time dateTime={row.retiredAt}>{formatInstant(row.retiredAt)}</time>
                            </>
                          )}
                        </span>
                      </span>
                      {row.retiredAt === null ? (
                        <span className={adminBadge("success")}>{PACKAGE_COPY.historyCurrent}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </AdminCard>
          </>
        }
        main={
          <>
            <AdminCard id="package-details" title={PACKAGE_COPY.detailsHeading}>
              <form action={updatePackageAction}>
                <FormBody>
                  <RecordBasicsFields
                    invalidText={textInvalid}
                    keyHint={PACKAGE_COPY.keyHint}
                    keyPlaceholder={PACKAGE_COPY.keyPlaceholder}
                    record={stored}
                  />
                  <SelectField
                    defaultValue={stored.status}
                    hint={PACKAGE_COPY.statusHint}
                    id="catalog-status"
                    label={PACKAGE_COPY.statusLabel}
                    name="status"
                    options={STATUS_OPTIONS}
                  />
                  <TextField
                    defaultValue={String(stored.durationDays)}
                    hint={PACKAGE_COPY.durationHint}
                    id="catalog-duration"
                    inputMode="numeric"
                    label={PACKAGE_COPY.durationLabel}
                    name="durationDays"
                    required
                  />
                </FormBody>
                <SubmitFooter label={CATALOG_FIELD_COPY.save} />
              </form>
            </AdminCard>

            <AdminCard
              description={PACKAGE_COPY.featuresHint}
              id="package-features"
              title={PACKAGE_COPY.featuresHeading}
            >
              <form action={setPackageFeaturesAction}>
                <input name="id" type="hidden" value={stored.id} />
                <fieldset className="px-5 py-4">
                  <legend className="sr-only">{PACKAGE_COPY.featuresHint}</legend>
                  {features.value.length === 0 ? (
                    <p className="text-sm text-admin-muted">{PACKAGE_COPY.featuresEmpty}</p>
                  ) : (
                    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                      {features.value.map((feature) => (
                        <CheckboxField
                          defaultChecked={included.has(feature.id)}
                          id={`feature-${feature.id}`}
                          key={feature.id}
                          label={
                            feature.isActive
                              ? feature.name
                              : `${feature.name} (${PACKAGE_COPY.featureInactive})`
                          }
                          name="featureId"
                          value={feature.id}
                        />
                      ))}
                    </div>
                  )}
                </fieldset>
                <SubmitFooter label={PACKAGE_COPY.featuresSave} />
              </form>
            </AdminCard>
          </>
        }
      />
    </AdminShell>
  );
}
