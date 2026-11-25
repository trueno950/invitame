/**
 * Response validators of the administrator catalog API (M3 T8a; S1, S9). The web never trusts a shape:
 * each validator returns a fresh object holding only the fields the pages use, or `undefined` when the
 * value does not match the contract, and the client then fails closed with `invalid-response`. The
 * contracts mirror `apps/api/src/catalog/presentation/**` (`catalog-entry.response.ts`,
 * `package.response.ts`, and `templates/template.response.ts`); the web never imports API code, so they are kept equal by hand. Unknown
 * extra fields are ignored so the API may add fields without breaking the pages.
 */

export const PACKAGE_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const TEMPLATE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const TEMPLATE_VERSION_STATUSES = ["DRAFT", "PUBLISHED", "RETIRED"] as const;
export type TemplateVersionStatus = (typeof TEMPLATE_VERSION_STATUSES)[number];

/** The largest `amountMinor` the API accepts (PostgreSQL `INTEGER`, `MAX_PRICE_AMOUNT_MINOR`). */
export const MAX_AMOUNT_MINOR = 2_147_483_647;

/** A category or a feature, as `GET /admin/catalog/categories` and `/features` return it. */
export interface CatalogEntry {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogPackageFeature {
  id: string;
  key: string;
  name: string;
  included: boolean;
}

export interface CatalogPackagePrice {
  currency: string;
  amountMinor: number;
  createdAt: string;
}

export interface CatalogPackage {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: PackageStatus;
  /**
   * How many days a published invitation of this package stays live, counted from its publication instant (S1, T1).
   * The API states the bounds; this client only refuses a value that is not a whole number inside them.
   */
  durationDays: number;
  createdAt: string;
  updatedAt: string;
  features: CatalogPackageFeature[];
  currentPrices: CatalogPackagePrice[];
}

/** The shortest and longest duration the API accepts for a package, mirrored from its own domain rule (S1, T1). */
export const MIN_PACKAGE_DURATION_DAYS = 1;
export const MAX_PACKAGE_DURATION_DAYS = 3650;
/** The lifetime a package gets when its form names none: the basic month, the same value the column defaults to. */
export const DEFAULT_PACKAGE_DURATION_DAYS = 30;

/** One row of `GET /admin/catalog/packages/:id/prices`; `retiredAt` is null for the current price. */
export interface CatalogPriceHistoryEntry {
  currency: string;
  amountMinor: number;
  createdAt: string;
  retiredAt: string | null;
}

/** One row of `GET /admin/catalog/templates`: the template, its category, and its version summary. */
export interface CatalogTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: TemplateStatus;
  category: { id: string; key: string; name: string };
  createdAt: string;
  updatedAt: string;
  publishedVersion: { id: string; version: number } | null;
  versionCount: number;
}

/** One immutable snapshot; `schema` and `configuration` are JSON the registry contract validated. */
export interface CatalogTemplateVersion {
  id: string;
  version: number;
  status: TemplateVersionStatus;
  componentKey: string;
  schema: unknown;
  configuration: unknown;
  createdAt: string;
}

/** One entry of `GET /admin/catalog/renderers`. */
export interface CatalogRenderer {
  componentKey: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;

/** Whether the text is a canonical UUID: the only shape of a catalog id, so also safe in a path. */
export function isCatalogId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** An ISO-8601 instant as the API serializes it (`Date#toISOString`). */
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function isAmountMinor(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_AMOUNT_MINOR
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPackageStatus(value: unknown): value is PackageStatus {
  return PACKAGE_STATUSES.some((status) => status === value);
}

function isTemplateStatus(value: unknown): value is TemplateStatus {
  return TEMPLATE_STATUSES.some((status) => status === value);
}

function isTemplateVersionStatus(value: unknown): value is TemplateVersionStatus {
  return TEMPLATE_VERSION_STATUSES.some((status) => status === value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function mapAll<T>(items: unknown, parse: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(items)) {
    return undefined;
  }

  const parsed: T[] = [];
  for (const item of items) {
    const value = parse(item);
    if (value === undefined) {
      return undefined;
    }
    parsed.push(value);
  }
  return parsed;
}

export function parseCatalogEntry(value: unknown): CatalogEntry | undefined {
  const entry = record(value);

  if (
    entry === undefined ||
    !isCatalogId(entry.id) ||
    !isNonEmptyString(entry.key) ||
    !isNonEmptyString(entry.name) ||
    !(typeof entry.description === "string" || entry.description === null) ||
    typeof entry.isActive !== "boolean" ||
    !isTimestamp(entry.createdAt) ||
    !isTimestamp(entry.updatedAt)
  ) {
    return undefined;
  }

  return {
    id: entry.id,
    key: entry.key,
    name: entry.name,
    description: entry.description,
    isActive: entry.isActive,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export function parseCatalogEntries(value: unknown): CatalogEntry[] | undefined {
  return mapAll(value, parseCatalogEntry);
}

function parsePackageFeature(value: unknown): CatalogPackageFeature | undefined {
  const feature = record(value);

  if (
    feature === undefined ||
    !isCatalogId(feature.id) ||
    !isNonEmptyString(feature.key) ||
    !isNonEmptyString(feature.name) ||
    typeof feature.included !== "boolean"
  ) {
    return undefined;
  }

  return { id: feature.id, key: feature.key, name: feature.name, included: feature.included };
}

function parseCurrentPrice(value: unknown): CatalogPackagePrice | undefined {
  const price = record(value);

  if (
    price === undefined ||
    typeof price.currency !== "string" ||
    !CURRENCY.test(price.currency) ||
    !isAmountMinor(price.amountMinor) ||
    !isTimestamp(price.createdAt)
  ) {
    return undefined;
  }

  return { currency: price.currency, amountMinor: price.amountMinor, createdAt: price.createdAt };
}

/** Whether a value is a whole number of days inside the bounds the API states (S1, T1). */
function isPackageDurationDays(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_PACKAGE_DURATION_DAYS &&
    value <= MAX_PACKAGE_DURATION_DAYS
  );
}

export function parseCatalogPackage(value: unknown): CatalogPackage | undefined {
  const stored = record(value);

  if (
    stored === undefined ||
    !isCatalogId(stored.id) ||
    !isNonEmptyString(stored.key) ||
    !isNonEmptyString(stored.name) ||
    !(typeof stored.description === "string" || stored.description === null) ||
    !isPackageStatus(stored.status) ||
    !isPackageDurationDays(stored.durationDays) ||
    !isTimestamp(stored.createdAt) ||
    !isTimestamp(stored.updatedAt)
  ) {
    return undefined;
  }

  const features = mapAll(stored.features, parsePackageFeature);
  const currentPrices = mapAll(stored.currentPrices, parseCurrentPrice);

  if (features === undefined || currentPrices === undefined) {
    return undefined;
  }

  return {
    id: stored.id,
    key: stored.key,
    name: stored.name,
    description: stored.description,
    status: stored.status,
    durationDays: stored.durationDays,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    features,
    currentPrices,
  };
}

export function parseCatalogPackages(value: unknown): CatalogPackage[] | undefined {
  return mapAll(value, parseCatalogPackage);
}

function parsePriceHistoryEntry(value: unknown): CatalogPriceHistoryEntry | undefined {
  const price = record(value);

  if (
    price === undefined ||
    typeof price.currency !== "string" ||
    !CURRENCY.test(price.currency) ||
    !isAmountMinor(price.amountMinor) ||
    !isTimestamp(price.createdAt) ||
    !(price.retiredAt === null || isTimestamp(price.retiredAt))
  ) {
    return undefined;
  }

  return {
    currency: price.currency,
    amountMinor: price.amountMinor,
    createdAt: price.createdAt,
    retiredAt: price.retiredAt,
  };
}

export function parsePriceHistory(value: unknown): CatalogPriceHistoryEntry[] | undefined {
  return mapAll(value, parsePriceHistoryEntry);
}

function parseTemplateCategory(value: unknown): CatalogTemplate["category"] | undefined {
  const category = record(value);

  if (
    category === undefined ||
    !isCatalogId(category.id) ||
    !isNonEmptyString(category.key) ||
    !isNonEmptyString(category.name)
  ) {
    return undefined;
  }

  return { id: category.id, key: category.key, name: category.name };
}

function parsePublishedVersion(value: unknown): CatalogTemplate["publishedVersion"] | undefined {
  if (value === null) {
    return null;
  }

  const published = record(value);
  return published !== undefined &&
    isCatalogId(published.id) &&
    isPositiveInteger(published.version)
    ? { id: published.id, version: published.version }
    : undefined;
}

export function parseCatalogTemplate(value: unknown): CatalogTemplate | undefined {
  const stored = record(value);

  if (
    stored === undefined ||
    !isCatalogId(stored.id) ||
    !isNonEmptyString(stored.key) ||
    !isNonEmptyString(stored.name) ||
    !(typeof stored.description === "string" || stored.description === null) ||
    !isTemplateStatus(stored.status) ||
    !isTimestamp(stored.createdAt) ||
    !isTimestamp(stored.updatedAt) ||
    typeof stored.versionCount !== "number" ||
    !Number.isSafeInteger(stored.versionCount) ||
    stored.versionCount < 0
  ) {
    return undefined;
  }

  const category = parseTemplateCategory(stored.category);
  const publishedVersion = parsePublishedVersion(stored.publishedVersion);

  if (category === undefined || publishedVersion === undefined) {
    return undefined;
  }

  return {
    id: stored.id,
    key: stored.key,
    name: stored.name,
    description: stored.description,
    status: stored.status,
    category,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    publishedVersion,
    versionCount: stored.versionCount,
  };
}

export function parseCatalogTemplates(value: unknown): CatalogTemplate[] | undefined {
  return mapAll(value, parseCatalogTemplate);
}

export function parseCatalogTemplateVersion(value: unknown): CatalogTemplateVersion | undefined {
  const stored = record(value);

  if (
    stored === undefined ||
    !isCatalogId(stored.id) ||
    !isPositiveInteger(stored.version) ||
    !isTemplateVersionStatus(stored.status) ||
    !isNonEmptyString(stored.componentKey) ||
    // JSON has no `undefined`: a missing snapshot part is a contract violation, `null` is a value.
    !Object.hasOwn(stored, "schema") ||
    !Object.hasOwn(stored, "configuration") ||
    !isTimestamp(stored.createdAt)
  ) {
    return undefined;
  }

  return {
    id: stored.id,
    version: stored.version,
    status: stored.status,
    componentKey: stored.componentKey,
    schema: stored.schema,
    configuration: stored.configuration,
    createdAt: stored.createdAt,
  };
}

export function parseCatalogTemplateVersions(value: unknown): CatalogTemplateVersion[] | undefined {
  return mapAll(value, parseCatalogTemplateVersion);
}

export function parseCatalogRenderers(value: unknown): CatalogRenderer[] | undefined {
  return mapAll(value, (item) => {
    const renderer = record(item);
    return renderer !== undefined && isNonEmptyString(renderer.componentKey)
      ? { componentKey: renderer.componentKey }
      : undefined;
  });
}

/** At most this many contract issues, each at most this many characters, ever reach a page. */
export const MAX_CONTRACT_ISSUES = 20;
export const MAX_CONTRACT_ISSUE_LENGTH = 300;

/**
 * The `issues` of a `CATALOG_RENDERER_CONTRACT_INVALID` body, bounded for display: only strings
 * count, control characters become spaces, each issue is cut to `MAX_CONTRACT_ISSUE_LENGTH`
 * characters, and no more than `MAX_CONTRACT_ISSUES` are kept. The API's text is technical English
 * and may echo what the administrator typed, so a page shows it only as text, in a bounded list.
 */
export function boundContractIssues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const issues: string[] = [];
  for (const item of value) {
    if (issues.length === MAX_CONTRACT_ISSUES) {
      break;
    }
    if (typeof item !== "string") {
      continue;
    }

    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is removed.
    const clean = item.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
    if (clean !== "") {
      issues.push(
        clean.length > MAX_CONTRACT_ISSUE_LENGTH
          ? `${clean.slice(0, MAX_CONTRACT_ISSUE_LENGTH - 1)}…`
          : clean,
      );
    }
  }
  return issues;
}
