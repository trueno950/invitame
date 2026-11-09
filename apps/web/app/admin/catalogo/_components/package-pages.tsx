import Link from "next/link";

import {
  CATALOG_FIELD_COPY,
  CATALOG_PATHS,
  PACKAGE_COPY,
  PACKAGE_STATUS_LABELS,
} from "../../../../lib/admin/catalog/copy.ts";
import { formatInstant } from "../../../../lib/admin/catalog/format.ts";
import { pageNotices } from "../../../../lib/admin/catalog/notices.ts";
import { formatMxn, formatPesosField } from "../../../../lib/admin/catalog/price.ts";
import { ADMIN_PANEL_COPY } from "../../../../lib/admin/copy.ts";
import { adminCatalog } from "../../../../lib/server/admin-catalog-api.ts";
import {
  type CatalogPackage,
  isCatalogId,
  PACKAGE_STATUSES,
} from "../../../../lib/server/admin-catalog-validators.ts";
import { CustomerShell } from "../../../_components/customer-shell.tsx";
import { fieldLabel, primaryButton, quietButton, textButton } from "../../../_components/ui.ts";
import { attempt, requireCatalogAdministrator, resolveRead } from "../_lib/load.ts";
import {
  createPackageAction,
  setPackageFeaturesAction,
  setPackagePriceAction,
  updatePackageAction,
} from "../actions.ts";
import { CheckboxField, SelectField, TextAreaField, TextField } from "./fields.tsx";
import { Notices } from "./notices.tsx";
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

const sectionHeading = "font-display text-xl font-semibold text-ink";

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
    <CustomerShell
      eyebrow={ADMIN_PANEL_COPY.eyebrow}
      heading={PACKAGE_COPY.heading}
      intro={PACKAGE_COPY.intro}
    >
      <div className="flex flex-col gap-6">
        <Notices error={error?.message} notice={notice} />
        <div className="flex justify-center">
          <Link className={quietButton} href={`${CATALOG_PATHS.packages}/nuevo`}>
            {PACKAGE_COPY.newLink}
          </Link>
        </div>
        {loaded.value.length === 0 ? (
          <p className="text-center leading-7 text-muted">{PACKAGE_COPY.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {loaded.value.map((stored) => {
              const price = currentMxn(stored);
              return (
                <li key={stored.id}>
                  <Link
                    className="flex items-center justify-between gap-4 rounded-field border-[1.5px] border-field-border px-4.5 py-3 transition-colors hover:border-primary"
                    href={`${CATALOG_PATHS.packages}/${stored.id}`}
                  >
                    <span className="min-w-0">
                      <span className="block break-words font-medium text-ink">{stored.name}</span>
                      <span className="block break-all font-mono text-xs text-muted">
                        {stored.key}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className="block font-medium text-ink">
                        {price === undefined
                          ? PACKAGE_COPY.noPrice
                          : formatMxn(price.amountMinor, price.currency)}
                      </span>
                      <span className="block text-xs font-medium uppercase tracking-[0.12em] text-primary">
                        {PACKAGE_STATUS_LABELS[stored.status]}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
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

/** `/admin/catalogo/paquetes/nuevo`: the create form. */
export async function PackageCreatePage({ searchParams }: { searchParams: SearchParameters }) {
  const administrator = await requireCatalogAdministrator();

  if (!administrator) {
    return <CatalogUnavailable retryPath={`${CATALOG_PATHS.packages}/nuevo`} />;
  }

  const { error } = pageNotices(await searchParams);
  const invalidKey = error?.code === "key-taken" || error?.code === "validation";

  return (
    <CustomerShell
      eyebrow={ADMIN_PANEL_COPY.eyebrow}
      heading={PACKAGE_COPY.createHeading}
      intro={PACKAGE_COPY.createIntro}
    >
      <div className="flex flex-col gap-6">
        <Notices error={error?.message} notice={undefined} />
        <form action={createPackageAction} className="flex flex-col gap-5">
          <TextField
            hint={PACKAGE_COPY.keyHint}
            id="catalog-key"
            invalid={invalidKey}
            label={CATALOG_FIELD_COPY.keyLabel}
            name="key"
            placeholder={PACKAGE_COPY.keyPlaceholder}
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
          <button className={primaryButton} type="submit">
            {PACKAGE_COPY.createSubmit}
          </button>
        </form>
        <div className="flex justify-center">
          <Link className={textButton} href={CATALOG_PATHS.packages}>
            {PACKAGE_COPY.backToList}
          </Link>
        </div>
      </div>
    </CustomerShell>
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
    <CustomerShell
      eyebrow={ADMIN_PANEL_COPY.eyebrow}
      heading={PACKAGE_COPY.editHeading}
      intro={PACKAGE_COPY.editIntro}
    >
      <div className="flex flex-col gap-8">
        <Notices error={error?.message} notice={notice} />

        <section aria-labelledby="package-details" className="flex flex-col gap-5">
          <h2 className={sectionHeading} id="package-details">
            {PACKAGE_COPY.detailsHeading}
          </h2>
          <form action={updatePackageAction} className="flex flex-col gap-5">
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
              defaultValue={stored.status}
              hint={PACKAGE_COPY.statusHint}
              id="catalog-status"
              label={PACKAGE_COPY.statusLabel}
              name="status"
              options={STATUS_OPTIONS}
            />
            <button className={primaryButton} type="submit">
              {CATALOG_FIELD_COPY.save}
            </button>
          </form>
        </section>

        <section
          aria-labelledby="package-features"
          className="flex flex-col gap-5 border-t border-gold/40 pt-8"
        >
          <h2 className={sectionHeading} id="package-features">
            {PACKAGE_COPY.featuresHeading}
          </h2>
          <form action={setPackageFeaturesAction} className="flex flex-col gap-3">
            <input name="id" type="hidden" value={stored.id} />
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm leading-6 text-muted">{PACKAGE_COPY.featuresHint}</legend>
              {features.value.length === 0 ? (
                <p className="py-2 text-sm text-muted">{PACKAGE_COPY.featuresEmpty}</p>
              ) : (
                features.value.map((feature) => (
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
                ))
              )}
            </fieldset>
            <button className={primaryButton} type="submit">
              {PACKAGE_COPY.featuresSave}
            </button>
          </form>
        </section>

        <section
          aria-labelledby="package-price"
          className="flex flex-col gap-5 border-t border-gold/40 pt-8"
        >
          <h2 className={sectionHeading} id="package-price">
            {PACKAGE_COPY.priceHeading}
          </h2>
          <p className="text-sm text-muted">
            {PACKAGE_COPY.priceCurrent}:{" "}
            <strong className="text-base font-semibold text-ink">
              {price === undefined
                ? PACKAGE_COPY.noPrice
                : formatMxn(price.amountMinor, price.currency)}
            </strong>
          </p>
          <form action={setPackagePriceAction} className="flex flex-col gap-5">
            <input name="id" type="hidden" value={stored.id} />
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
            <button className={primaryButton} type="submit">
              {PACKAGE_COPY.priceSave}
            </button>
          </form>

          <h3 className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
            {PACKAGE_COPY.historyHeading}
          </h3>
          {history.value.length === 0 ? (
            <p className="text-sm text-muted">{PACKAGE_COPY.historyEmpty}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {history.value.map((row) => (
                <li
                  className="rounded-field border border-field-border px-4 py-3 text-sm"
                  key={`${row.createdAt}-${row.currency}-${row.amountMinor}`}
                >
                  <span className="block text-base font-medium text-ink">
                    {formatMxn(row.amountMinor, row.currency)}
                  </span>
                  <span className="block text-muted">
                    {PACKAGE_COPY.historySince}{" "}
                    <time dateTime={row.createdAt}>{formatInstant(row.createdAt)}</time>
                    {" · "}
                    {row.retiredAt === null ? (
                      PACKAGE_COPY.historyCurrent
                    ) : (
                      <>
                        {PACKAGE_COPY.historyUntil}{" "}
                        <time dateTime={row.retiredAt}>{formatInstant(row.retiredAt)}</time>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="flex justify-center">
          <Link className={textButton} href={CATALOG_PATHS.packages}>
            {PACKAGE_COPY.backToList}
          </Link>
        </div>
      </div>
    </CustomerShell>
  );
}
