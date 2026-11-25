import type { PublicCatalogPackage } from "../server/public-catalog-api.ts";
import type { PricingPackage } from "./copy.ts";

/**
 * The landing's price cards (T4; S4). The amount and the feature set of every card come from the public catalog
 * the administration edits, so the page never states a price nobody set: a package without a current MXN price
 * says «Precio por definir», and a package whose catalog entry answers no known feature falls back to the seeded
 * list the copy already holds.
 *
 * `apps/web` owns the Spanish label of each catalog feature key, so a label change is one change here and a
 * feature key renamed in the database is never printed to a guest. A key this deployment has no label for is left
 * out instead of being shown raw.
 */
export const FEATURE_LABELS: Readonly<Record<string, string>> = {
  COUNTDOWN: "Cuenta regresiva",
  MUSIC: "Música",
  GALLERY: "Galería de fotos",
  MAP: "Mapa",
  RSVP: "Confirmar asistencia (RSVP)",
  WHATSAPP: "Enlace de WhatsApp",
  GIFT_REGISTRY: "Mesa de regalos",
  GUEST_LIST: "Lista de invitados",
  QR_PASS: "Pase con código QR",
};

/** The catalog the page read, or `undefined` when the read failed and the page renders its own fallbacks. */
export type LandingCatalog = readonly PublicCatalogPackage[] | undefined;

/** The catalog entry of one card, matched by key: keys are data compared by equality, never a name (AGENTS.md). */
function catalogEntry(catalog: LandingCatalog, key: PricingPackage["key"]) {
  return catalog?.find((stored) => stored.key === key);
}

/** The amount as Mexican pesos: a whole amount prints no cents, and the thousands are grouped. */
function amountText(amountMinor: number): string {
  const whole = String(Math.floor(amountMinor / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = amountMinor % 100;

  return cents === 0 ? whole : `${whole}.${String(cents).padStart(2, "0")}`;
}

/**
 * The price line of one card, ready to set: the amount in the display size and the currency in the small trailing
 * style. Null while the package has no current MXN price, or while the catalog could not be read, and then the card
 * prints the copy's «Precio por definir» instead of an amount.
 */
export interface PlanPrice {
  /** The amount as the card prints it: «$199», «$1,990.50». */
  readonly amount: string;
  /** The currency, in the small trailing style: «MXN». */
  readonly currency: "MXN";
}

/**
 * The price of one card: the current MXN amount the catalog answers, or null while the package has no price or the
 * catalog could not be read. The landing never states an amount the administration has not set (S4).
 */
export function planPrice(catalog: LandingCatalog, item: PricingPackage): PlanPrice | null {
  const price = catalogEntry(catalog, item.key)?.price;

  return price === null || price === undefined
    ? null
    : { amount: `$${amountText(price.amountMinor)}`, currency: price.currency };
}

/**
 * The feature list of one card: the catalog's included keys, labelled in Spanish and in the catalog's order, or
 * the seeded list of the copy when the catalog answers no feature this deployment can label.
 */
export function planFeatures(catalog: LandingCatalog, item: PricingPackage): readonly string[] {
  const labelled = (catalogEntry(catalog, item.key)?.features ?? []).flatMap((key) => {
    const label = FEATURE_LABELS[key];
    return label === undefined ? [] : [label];
  });

  return labelled.length > 0 ? labelled : item.features;
}
