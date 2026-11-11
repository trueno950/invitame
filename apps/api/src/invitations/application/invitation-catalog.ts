// What invitations need from the catalog (M4 T3; S3, S6, A1). This is a deliberate public application
// contract, as `docs/architecture/module-template.md` requires: the invitations module never imports a
// catalog repository, a Prisma model, or a catalog table. The catalog owns the reads and exposes them through
// this narrow port; `infrastructure/catalog-invitation-reader.ts` delegates to the catalog's own public
// contract. Statuses and feature keys are data compared by equality, never names that select behavior.

/** A pinned snapshot another module may see: the renderer identity, its schema, and what it needs (A1). */
export interface CatalogTemplateVersionSnapshot {
  id: string;
  templateId: string;
  componentKey: string;
  schema: unknown;
  /** The feature keys a package must include for this version to fit it (A1); `[]` needs none. */
  requiredFeatureKeys: readonly string[];
}

/** The stored schema of one version, whatever its status, so a pinned invitation keeps validating (S3). */
export interface CatalogVersionSchema {
  id: string;
  schema: unknown;
}

/** The status and included feature keys of one package, as the package-fit rule reads them (S6, A1). */
export interface CatalogPackageEntitlements {
  /** The stored package status; the domain accepts only `ACTIVE` and fails closed on anything else. */
  status: string;
  includedFeatureKeys: readonly string[];
}

/**
 * The catalog reads an invitation needs. Ids that name nothing answer null; a package or version that
 * exists but is not usable by a new draft is answered as stored, so the application states its own rule.
 */
export interface InvitationCatalog {
  /**
   * The version only while the version is PUBLISHED and its template is also PUBLISHED; null otherwise, so a
   * draft can never pin a draft or retired snapshot (S3, S6).
   */
  findPublishedVersion(versionId: string): Promise<CatalogTemplateVersionSnapshot | null>;

  /**
   * The stored schema of the version an invitation is already pinned to, regardless of the version's current
   * status (S3): the draft continues to validate against the snapshot it was created with, even after the
   * template catalog publishes a newer version and retires this one.
   */
  findVersionSchema(versionId: string): Promise<CatalogVersionSchema | null>;

  /** The status and included feature keys of a package; null when no package has this id. */
  findPackageEntitlements(packageId: string): Promise<CatalogPackageEntitlements | null>;
}

export const INVITATION_CATALOG = Symbol("InvitationCatalog");
