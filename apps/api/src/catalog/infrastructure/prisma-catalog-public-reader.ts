import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  CatalogPackageEntitlements,
  CatalogPublicContract,
  CreatorPackageSummary,
  CreatorTemplateSummary,
  PublishedTemplateVersion,
  StoredVersionSchema,
  VersionRenderData,
} from "../application/public/catalog-public-reader";
import { findRenderer } from "../domain/renderers/renderer-registry";

const PUBLISHED_VERSION_SELECT = {
  id: true,
  templateId: true,
  componentKey: true,
  schema: true,
} satisfies Prisma.TemplateVersionSelect;

const VERSION_SCHEMA_SELECT = {
  id: true,
  templateId: true,
  schema: true,
} satisfies Prisma.TemplateVersionSelect;

// The public rendering read (M5 T3; A1): the renderer identity, its configuration, and its schema, in any
// status. No status, template id, or version number is selected, because a public page needs none of them.
const VERSION_RENDER_SELECT = {
  componentKey: true,
  configuration: true,
  schema: true,
} satisfies Prisma.TemplateVersionSelect;

const PACKAGE_ENTITLEMENTS_SELECT = {
  id: true,
  status: true,
  // Only the links the package actually grants; an excluded feature is not an entitlement (S6, A1).
  packageFeatures: {
    where: { included: true },
    orderBy: { feature: { key: "asc" } },
    select: { feature: { select: { key: true } } },
  },
} satisfies Prisma.PackageSelect;

// The creator chooser (S8): the taxonomy name and the version a draft can be pinned to, and nothing else. The
// version's own configuration travels with it so the chooser can preview the template as published (S9).
const CREATOR_TEMPLATE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  category: { select: { key: true, name: true } },
  versions: {
    where: { status: "PUBLISHED" },
    orderBy: { version: "desc" },
    take: 1,
    select: { id: true, version: true, componentKey: true, schema: true, configuration: true },
  },
} satisfies Prisma.TemplateSelect;

const CREATOR_PACKAGE_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  packageFeatures: {
    where: { included: true },
    orderBy: { feature: { key: "asc" } },
    select: { feature: { select: { key: true } } },
  },
  // The price in force only: a retired row is history, not what a creator is offered.
  prices: {
    where: { retiredAt: null },
    orderBy: { currency: "asc" },
    take: 1,
    select: { currency: true, amountMinor: true },
  },
} satisfies Prisma.PackageSelect;

type PublishedVersionRow = Prisma.TemplateVersionGetPayload<{
  select: typeof PUBLISHED_VERSION_SELECT;
}>;
type PackageEntitlementsRow = Prisma.PackageGetPayload<{
  select: typeof PACKAGE_ENTITLEMENTS_SELECT;
}>;
type CreatorTemplateRow = Prisma.TemplateGetPayload<{ select: typeof CREATOR_TEMPLATE_SELECT }>;
type CreatorPackageRow = Prisma.PackageGetPayload<{ select: typeof CREATOR_PACKAGE_SELECT }>;

function toPublishedVersion(
  row: PublishedVersionRow,
  requiredFeatureKeys: readonly string[],
): PublishedTemplateVersion {
  return {
    id: row.id,
    templateId: row.templateId,
    componentKey: row.componentKey,
    schema: row.schema,
    requiredFeatureKeys: [...requiredFeatureKeys],
  };
}

function toEntitlements(row: PackageEntitlementsRow): CatalogPackageEntitlements {
  return {
    packageId: row.id,
    status: row.status,
    includedFeatureKeys: row.packageFeatures.map((link) => link.feature.key),
  };
}

/**
 * A creator-facing template, or null when it must not be offered. `versions` holds at most one row (the partial
 * unique index `TemplateVersion_templateId_published_key` allows one PUBLISHED version per template), but an
 * empty list means the template became PUBLISHED without a publishable version, so it is left out.
 */
function toCreatorTemplate(row: CreatorTemplateRow): CreatorTemplateSummary | null {
  const published = row.versions[0];
  // Fail closed: a key the registry does not know cannot be rendered, so it is not offered either.
  if (!published || findRenderer(published.componentKey) === undefined) {
    return null;
  }

  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    category: { key: row.category.key, name: row.category.name },
    publishedVersion: {
      id: published.id,
      version: published.version,
      componentKey: published.componentKey,
      schema: published.schema,
      configuration: published.configuration,
    },
  };
}

/** The price in force, or null while the package has none; `prices` is already ordered by currency. */
function toCreatorPackage(row: CreatorPackageRow): CreatorPackageSummary {
  const current = row.prices[0];

  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    currentPrice: current ? { amountMinor: current.amountMinor, currency: current.currency } : null,
    includedFeatureKeys: row.packageFeatures.map((link) => link.feature.key),
  };
}

/**
 * The catalog's public reader on PostgreSQL (M4 T3; S3, S6, A1). It answers a version only while the version is
 * PUBLISHED and its template is PUBLISHED, which those two conditions decide inside the same query; DRAFT,
 * RETIRED, and ARCHIVED rows answer null like an id that names nothing, so a consuming module cannot start work
 * against an unusable snapshot. `requiredFeatureKeys` comes from the in-code renderer registry (A1), never from
 * the database: a PUBLISHED version whose `componentKey` is no longer in the allow-list answers null, because
 * the API can no longer render it. The stored schema is answered in any status, so a caller already pinned to a
 * version keeps validating against that snapshot after the catalog publishes a newer one (S3). The render data
 * of a pinned version is answered in any status too, so an already published invitation keeps rendering the
 * version it pinned after the catalog retires it (M5 T3; A1), while `isRendererRegistered` answers the in-code
 * allow-list without a query.
 */
export class PrismaCatalogPublicReader implements CatalogPublicContract {
  constructor(private readonly prisma: PrismaClient) {}

  async findPublishedVersion(versionId: string): Promise<PublishedTemplateVersion | null> {
    const row = await this.prisma.templateVersion.findFirst({
      where: { id: versionId, status: "PUBLISHED", template: { status: "PUBLISHED" } },
      select: PUBLISHED_VERSION_SELECT,
    });
    if (row === null) {
      return null;
    }

    // Fail closed: a key the registry does not know cannot state its feature requirements.
    const renderer = findRenderer(row.componentKey);

    return renderer === undefined ? null : toPublishedVersion(row, renderer.requiredFeatureKeys);
  }

  async findVersionSchema(versionId: string): Promise<StoredVersionSchema | null> {
    return this.prisma.templateVersion.findUnique({
      where: { id: versionId },
      select: VERSION_SCHEMA_SELECT,
    });
  }

  async findPackageEntitlements(packageId: string): Promise<CatalogPackageEntitlements | null> {
    const row = await this.prisma.package.findUnique({
      where: { id: packageId },
      select: PACKAGE_ENTITLEMENTS_SELECT,
    });
    return row === null ? null : toEntitlements(row);
  }

  async findVersionRenderData(versionId: string): Promise<VersionRenderData | null> {
    const row = await this.prisma.templateVersion.findUnique({
      where: { id: versionId },
      select: VERSION_RENDER_SELECT,
    });
    if (row === null) {
      return null;
    }

    return { componentKey: row.componentKey, configuration: row.configuration, schema: row.schema };
  }

  isRendererRegistered(componentKey: string): boolean {
    return findRenderer(componentKey) !== undefined;
  }

  /**
   * The creator chooser's templates (S8). The two conditions are in the query, so an unpublished template or one
   * without a PUBLISHED version never leaves the database; a row whose published version the registry no longer
   * knows is dropped here, the same fail-closed rule `findPublishedVersion` applies.
   */
  async listPublishedTemplates(): Promise<CreatorTemplateSummary[]> {
    const rows = await this.prisma.template.findMany({
      where: { status: "PUBLISHED", versions: { some: { status: "PUBLISHED" } } },
      select: CREATOR_TEMPLATE_SELECT,
      orderBy: { key: "asc" },
    });

    const offered: CreatorTemplateSummary[] = [];
    for (const row of rows) {
      const template = toCreatorTemplate(row);
      if (template !== null) {
        offered.push(template);
      }
    }
    return offered;
  }

  /** The creator chooser's packages (S8): ACTIVE only, each with its included feature keys and price in force. */
  async listActivePackages(): Promise<CreatorPackageSummary[]> {
    const rows = await this.prisma.package.findMany({
      where: { status: "ACTIVE" },
      select: CREATOR_PACKAGE_SELECT,
      orderBy: { key: "asc" },
    });

    return rows.map(toCreatorPackage);
  }
}
