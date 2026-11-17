// What payments needs from the catalog (M7 S4): the price in force of the package an invitation is pinned to. This
// is a deliberate public application contract, as `docs/architecture/module-template.md` requires: the payments
// module never imports a catalog repository or queries a catalog table. The catalog owns the read and exposes it
// through `CatalogPublicReader.findCurrentPackagePrice`; the adapter in `infrastructure/` delegates to it.

/** The price in force: the amount in the smallest currency unit and its ISO code, or null when none is set. */
export interface CatalogPackagePrice {
  amountMinor: number;
  currency: string;
}

export interface PaymentCatalog {
  /** The current price of one package, or null when no package has this id or it has no price in force. */
  findCurrentPackagePrice(packageId: string): Promise<CatalogPackagePrice | null>;
}

export const PAYMENT_CATALOG = Symbol("PaymentCatalog");
