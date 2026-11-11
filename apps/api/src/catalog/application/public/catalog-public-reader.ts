import type { PackageStatus } from "../../domain/package";

// The catalog's public application contract for other modules and for the creator-facing reads (M4 T3 and T4;
// S3, S6, S8, A1, A5). `docs/architecture/module-template.md` requires it: a module that needs catalog data
// consumes a deliberate public contract from the owning capability instead of importing a catalog repository or
// querying its tables. The reads here are narrow on purpose: they answer exactly what an invitation needs to pin
// a published snapshot, to validate a draft against the snapshot it is already pinned to, to check package
// entitlements, and what a creator sees when choosing a template and a package (S8).
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
 * A template a creator may start an invitation from (S8, A5): the template and one of its versions are
 * PUBLISHED, so the version can be pinned. Only what the chooser and the editor need is here; the taxonomy and
 * the version history stay in the administration reads.
 */
export interface CreatorTemplateSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: { key: string; name: string };
  publishedVersion: {
    id: string;
    version: number;
    componentKey: string;
    schema: unknown;
  };
}

/**
 * A package a creator may choose (S8, A5): it is ACTIVE, so it can be checked against a version. The feature
 * keys are the ones it actually includes (A1), and the price is the one in force, or null while none is set.
 */
export interface CreatorPackageSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  currentPrice: { amountMinor: number; currency: string } | null;
  includedFeatureKeys: readonly string[];
}

/**
 * Read-only catalog contract for other modules and for the creator catalog route. Ids that name nothing answer
 * null. A package or a version that exists but is not usable is answered as stored, so the consuming module
 * states its own rule instead of inheriting one from the catalog.
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

  /**
   * Every template a creator may start from (S8), ordered by key: only a PUBLISHED template with a PUBLISHED
   * version whose `componentKey` the registry still knows. A DRAFT or ARCHIVED template, a template without a
   * PUBLISHED version, and a published version the API can no longer render are left out, exactly as
   * `findPublishedVersion` refuses them.
   */
  listPublishedTemplates(): Promise<CreatorTemplateSummary[]>;

  /**
   * Every package a creator may choose (S8), ordered by key: only an ACTIVE package, each with the feature keys
   * it includes and the price in force (null while the package has none).
   */
  listActivePackages(): Promise<CreatorPackageSummary[]>;
}

export const CATALOG_PUBLIC_READER = Symbol("CatalogPublicReader");
