import type { CatalogPublicContract } from "../../catalog/application/public/catalog-public-reader";
import type { CatalogPackagePrice, PaymentCatalog } from "../application/payment-catalog";

// The catalog's price read, delegated (M7 S4). The payments module never queries a catalog table: it consumes the
// catalog's own public contract through this narrow adapter, exactly as the invitations module consumes it through
// `CatalogInvitationReader`.

export class CatalogPaymentPrices implements PaymentCatalog {
  constructor(private readonly catalog: CatalogPublicContract) {}

  async findCurrentPackagePrice(packageId: string): Promise<CatalogPackagePrice | null> {
    return this.catalog.findCurrentPackagePrice(packageId);
  }
}
