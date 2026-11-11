import type { PackageStatus } from "../../domain/package";

// The catalog's public application contract for other modules (M4 T3; S3, S6, A1). `docs/architecture/
// module-template.md` requires it: a module that needs catalog data consumes a deliberate public contract from
// the owning capability instead of importing a catalog repository or querying its tables. The reads here are
// narrow on purpose: they answer exactly what an invitation needs to pin a published snapshot, to validate a
// draft against the snapshot it is already pinned to, and to check package entitlements.
//
// Keys and statuses are data compared by equality; no name selects behavior (AGENTS.md). The catalog keeps the
// queries and the renderer allow-list, and this contract never exposes a Prisma type.

/**
 * A template version another module may start work against: the version is PUBLISHED and its template is also
 * PUBLISHED (S3, S6). `requiredFeatureKeys` is the renderer's own declaration of what a package must include
 * (A1), read from the in-code registry rather than from the database.
 */
export interface PublishedTemplateVersion {
  id: string;
  templateId: string;
  componentKey: string;
  schema: unknown;
  requiredFeatureKeys: readonly string[];
}

/** The stored schema of one version, answered whatever its current status is (S3). */
export interface StoredVersionSchema {
  id: string;
  templateId: string;
  schema: unknown;
}

/** What a package grants right now: its status and the feature keys it includes (S6, A1). */
export interface CatalogPackageEntitlements {
  packageId: string;
  status: PackageStatus;
  /** Keys of the package's features whose link has `included = true`; excluded features are not keys here. */
  includedFeatureKeys: readonly string[];
}

/**
 * Read-only catalog contract for other modules. Ids that name nothing answer null. A package or a version that
 * exists but is not usable is answered as stored, so the consuming module states its own rule instead of
 * inheriting one from the catalog.
 */
export interface CatalogPublicReader {
  /**
   * The version only while the version is PUBLISHED and its template is PUBLISHED; null for a DRAFT or
   * RETIRED version, for a version whose template is DRAFT or ARCHIVED, and for an id that names nothing.
   */
  findPublishedVersion(versionId: string): Promise<PublishedTemplateVersion | null>;

  /**
   * The stored schema of a version in any status, so a caller already pinned to it keeps validating against
   * that snapshot after the catalog publishes a newer version and retires this one (S3). Null when no version
   * has this id.
   */
  findVersionSchema(versionId: string): Promise<StoredVersionSchema | null>;

  /** The status and included feature keys of a package; null when no package has this id. */
  findPackageEntitlements(packageId: string): Promise<CatalogPackageEntitlements | null>;
}

export const CATALOG_PUBLIC_READER = Symbol("CatalogPublicReader");
