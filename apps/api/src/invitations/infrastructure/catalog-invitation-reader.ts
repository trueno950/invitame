import type { CatalogPublicReader } from "../../catalog/application/public/catalog-public-reader";
import type {
  CatalogPackageEntitlements,
  CatalogTemplateVersionSnapshot,
  CatalogVersionSchema,
  InvitationCatalog,
} from "../application/invitation-catalog";

/**
 * The invitations side of the cross-module boundary (M4 T3; S3, S6, A1). The invitations application states
 * what it needs in `InvitationCatalog`; this adapter answers it by delegating to the catalog's own public
 * contract. Nothing here knows a catalog table, a Prisma model, or a catalog repository: the catalog owner
 * keeps every query, and the module composition binds `CATALOG_PUBLIC_READER` to it.
 *
 * The mapping is deliberately thin: the catalog contract already answers exactly these three questions, so the
 * adapter only restates the shapes the invitations module owns. An id that names nothing stays null.
 */
export class CatalogInvitationReader implements InvitationCatalog {
  constructor(private readonly catalog: CatalogPublicReader) {}

  async findPublishedVersion(versionId: string): Promise<CatalogTemplateVersionSnapshot | null> {
    const version = await this.catalog.findPublishedVersion(versionId);
    if (version === null) {
      return null;
    }

    return {
      id: version.id,
      templateId: version.templateId,
      componentKey: version.componentKey,
      schema: version.schema,
      // A renderer's declaration is a `readonly` list; copy it so a caller cannot influence the registry.
      requiredFeatureKeys: [...version.requiredFeatureKeys],
    };
  }

  async findVersionSchema(versionId: string): Promise<CatalogVersionSchema | null> {
    const stored = await this.catalog.findVersionSchema(versionId);
    if (stored === null) {
      return null;
    }

    return { id: stored.id, schema: stored.schema };
  }

  async findPackageEntitlements(packageId: string): Promise<CatalogPackageEntitlements | null> {
    const entitlements = await this.catalog.findPackageEntitlements(packageId);
    if (entitlements === null) {
      return null;
    }

    return {
      status: entitlements.status,
      includedFeatureKeys: [...entitlements.includedFeatureKeys],
    };
  }
}
