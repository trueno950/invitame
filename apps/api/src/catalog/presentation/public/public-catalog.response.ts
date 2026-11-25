import type { CreatorPackageSummary } from "../../application/public/catalog-public-reader";

// The stable REST shape of the landing's price list (T4; S4). A landing's visitor is anonymous, so this shape
// carries only what a price card shows: the package's key, its name and description, the feature keys it includes,
// and its current price in Mexican pesos. No id, status, duration, owner, or timestamp travels here: an anonymous
// body names nothing an administrator or an owner owns.

/** The currency the landing sells in (S4): the owner confirmed every package price in Mexican pesos. */
const MXN = "MXN";

/** The price in force of one package, in the smallest currency unit. */
export interface PublicCatalogPrice {
  amountMinor: number;
  currency: string;
}

/** The stable REST shape of one package of the landing's price list. */
export interface PublicCatalogPackageResponse {
  key: string;
  name: string;
  description: string | null;
  /**
   * The keys of the features the package includes, ordered by key. The catalog's public contract answers keys, and
   * `apps/web` owns the Spanish label of each one, so a feature renamed in the database stays one place.
   */
  features: string[];
  /** The price in force in MXN, or null while the package has no MXN price (the card says «Precio por definir»). */
  price: PublicCatalogPrice | null;
}

/**
 * One package of the landing's price list. Only the MXN price is answered: the landing sells in pesos (S4), and a
 * package priced in another currency has no price to show, so it answers null like an unpriced one instead of
 * printing a foreign amount. The key and the name are the catalog's own data, compared by equality and never
 * selecting behavior (AGENTS.md).
 */
export function toPublicCatalogPackageResponse(
  stored: CreatorPackageSummary,
): PublicCatalogPackageResponse {
  const current = stored.currentPrice;

  return {
    key: stored.key,
    name: stored.name,
    description: stored.description,
    // A copy: the contract's list is `readonly`, the REST body is an ordinary array.
    features: [...stored.includedFeatureKeys],
    price:
      current !== null && current.currency === MXN
        ? { amountMinor: current.amountMinor, currency: current.currency }
        : null,
  };
}
