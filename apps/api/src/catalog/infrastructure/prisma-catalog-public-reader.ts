import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  CatalogPackageEntitlements,
  CatalogPublicReader,
  PublishedTemplateVersion,
  StoredVersionSchema,
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

type PublishedVersionRow = Prisma.TemplateVersionGetPayload<{
  select: typeof PUBLISHED_VERSION_SELECT;
}>;
type PackageEntitlementsRow = Prisma.PackageGetPayload<{
  select: typeof PACKAGE_ENTITLEMENTS_SELECT;
}>;

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
 * The catalog's public reader on PostgreSQL (M4 T3; S3, S6, A1). It answers a version only while the version is
 * PUBLISHED and its template is PUBLISHED, which those two conditions decide inside the same query; DRAFT,
 * RETIRED, and ARCHIVED rows answer null like an id that names nothing, so a consuming module cannot start work
 * against an unusable snapshot. `requiredFeatureKeys` comes from the in-code renderer registry (A1), never from
 * the database: a PUBLISHED version whose `componentKey` is no longer in the allow-list answers null, because
 * the API can no longer render it. The stored schema is answered in any status, so a caller already pinned to a
 * version keeps validating against that snapshot after the catalog publishes a newer one (S3).
 */
export class PrismaCatalogPublicReader implements CatalogPublicReader {
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
}
