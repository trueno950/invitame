import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PublicCatalogPackage } from "../server/public-catalog-api.ts";
import { LANDING_COPY, type PricingPackage } from "./copy.ts";
import { FEATURE_LABELS, planFeatures, planPrice } from "./pricing.ts";

// The landing's price cards (T4; S4). The amount and the feature set come from the catalog the administration
// edits, so the page never invents a price: a package without a current MXN price says «Precio por definir», and
// a package whose catalog entry answers no feature falls back to the seeded list the copy already holds.

const { pricing } = LANDING_COPY;

function plan(key: PricingPackage["key"]): PricingPackage {
  const found = pricing.packages.find((item) => item.key === key);
  assert.ok(found, key);
  return found;
}

const BASIC: PublicCatalogPackage = {
  key: "basic",
  name: "Basic",
  description: "Una selección inicial para empezar a planificar.",
  features: ["COUNTDOWN", "MAP", "WHATSAPP"],
  price: { amountMinor: 19_900, currency: "MXN" },
};

const PREMIUM: PublicCatalogPackage = {
  key: "premium",
  name: "Premium",
  description: null,
  features: ["COUNTDOWN", "MUSIC", "GALLERY", "MAP", "RSVP", "WHATSAPP"],
  price: { amountMinor: 39_900, currency: "MXN" },
};

const CATALOG: readonly PublicCatalogPackage[] = [
  BASIC,
  PREMIUM,
  { key: "deluxe", name: "Deluxe", description: null, features: [], price: null },
];

describe("landing price formatting", () => {
  it("prints the catalog amount in Mexican pesos", () => {
    assert.deepEqual(planPrice(CATALOG, plan("basic")), { amount: "$199", currency: "MXN" });
    assert.deepEqual(planPrice(CATALOG, plan("premium")), { amount: "$399", currency: "MXN" });
  });

  it("keeps the cents of an amount that is not a whole peso and groups the thousands", () => {
    const priced: PublicCatalogPackage = {
      ...BASIC,
      price: { amountMinor: 199_050, currency: "MXN" },
    };

    assert.deepEqual(planPrice([priced], plan("basic")), {
      amount: "$1,990.50",
      currency: "MXN",
    });
  });

  it("answers no price for a package without one, an empty list, or a failed read", () => {
    assert.equal(planPrice(CATALOG, plan("deluxe")), null);
    assert.equal(planPrice([], plan("basic")), null);
    // The API was unreachable: the page passes no catalog at all and must still render its cards.
    assert.equal(planPrice(undefined, plan("basic")), null);
  });
});

describe("landing price card features", () => {
  it("labels the catalog's feature keys in Spanish, in the catalog's order", () => {
    assert.deepEqual(planFeatures(CATALOG, plan("basic")), [
      "Cuenta regresiva",
      "Mapa",
      "Enlace de WhatsApp",
    ]);
    assert.deepEqual(planFeatures(CATALOG, plan("premium")), [
      "Cuenta regresiva",
      "Música",
      "Galería de fotos",
      "Mapa",
      "Confirmar asistencia (RSVP)",
      "Enlace de WhatsApp",
    ]);
  });

  it("falls back to the seeded feature list when the catalog answers no feature", () => {
    assert.deepEqual(planFeatures(CATALOG, plan("deluxe")), plan("deluxe").features);
    assert.deepEqual(planFeatures([], plan("premium")), plan("premium").features);
    assert.deepEqual(planFeatures(undefined, plan("basic")), plan("basic").features);
  });

  it("leaves out a feature key this deployment has no Spanish label for", () => {
    const catalog: readonly PublicCatalogPackage[] = [
      { ...BASIC, features: ["COUNTDOWN", "A_FEATURE_OF_THE_FUTURE"] },
      // A package whose features are all unknown falls back to the seeded list instead of an empty one.
      { ...PREMIUM, features: ["A_FEATURE_OF_THE_FUTURE"] },
    ];

    assert.deepEqual(planFeatures(catalog, plan("basic")), ["Cuenta regresiva"]);
    assert.deepEqual(planFeatures(catalog, plan("premium")), plan("premium").features);
  });

  it("labels every feature key the seeded packages grant", () => {
    for (const key of [
      "COUNTDOWN",
      "MUSIC",
      "GALLERY",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "GIFT_REGISTRY",
      "GUEST_LIST",
      "QR_PASS",
    ]) {
      assert.ok(FEATURE_LABELS[key]?.trim(), key);
    }
  });
});
