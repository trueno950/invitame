import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  InvalidPackagePriceAmountError,
  InvalidPackagePriceCurrencyError,
  MAX_PRICE_AMOUNT_MINOR,
  SUPPORTED_CURRENCIES,
  parsePackagePrice,
} from "./package-price";

// A package price at its source (M3 T4; S4, L4): MXN only, an integer amount in minor units (centavos)
// that fits the `PackagePrice.amountMinor` INTEGER column. The database CHECK constraints repeat the
// shape; the allow-list lives only here, so adding a currency needs no migration.

describe("supported currencies", () => {
  it("allows only MXN today", () => {
    assert.deepEqual([...SUPPORTED_CURRENCIES], ["MXN"]);
  });

  it("caps the amount at the largest PostgreSQL INTEGER", () => {
    assert.equal(MAX_PRICE_AMOUNT_MINOR, 2_147_483_647);
  });
});

describe("parsePackagePrice", () => {
  it("accepts an allowed currency with a non-negative integer amount", () => {
    assert.deepEqual(parsePackagePrice({ currency: "MXN", amountMinor: 49_900 }), {
      currency: "MXN",
      amountMinor: 49_900,
    });
  });

  it("accepts the boundaries 0 and 2147483647", () => {
    assert.equal(parsePackagePrice({ currency: "MXN", amountMinor: 0 }).amountMinor, 0);
    assert.equal(
      parsePackagePrice({ currency: "MXN", amountMinor: 2_147_483_647 }).amountMinor,
      2_147_483_647,
    );
  });

  it("returns only the two price fields", () => {
    const parsed = parsePackagePrice({ currency: "MXN", amountMinor: 1, extra: "x" } as never);

    assert.deepEqual(Object.keys(parsed).sort(), ["amountMinor", "currency"]);
  });

  for (const currency of ["USD", "mxn", "Mxn", " MXN", "MXN ", "MX", "MXNN", "", "EUR"]) {
    it(`refuses the currency ${JSON.stringify(currency)} without normalizing it`, () => {
      assert.throws(
        () => parsePackagePrice({ currency, amountMinor: 100 }),
        (error: unknown) =>
          error instanceof InvalidPackagePriceCurrencyError &&
          error.currency === currency &&
          error.message === `Unsupported price currency: ${JSON.stringify(currency)}`,
      );
    });
  }

  for (const currency of [undefined, null, 484, {}]) {
    it(`refuses the non-string currency ${String(currency)}`, () => {
      assert.throws(
        () => parsePackagePrice({ currency, amountMinor: 100 }),
        InvalidPackagePriceCurrencyError,
      );
    });
  }

  const BAD_AMOUNTS: ReadonlyArray<readonly [string, unknown]> = [
    ["negative", -1],
    ["fractional", 10.5],
    ["above the INTEGER limit", 2_147_483_648],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["beyond the safe integers", Number.MAX_SAFE_INTEGER + 1],
    ["a numeric string", "100"],
    ["a bigint", 100n],
    ["null", null],
    ["undefined", undefined],
  ];

  for (const [label, amountMinor] of BAD_AMOUNTS) {
    it(`refuses an amount that is ${label}`, () => {
      assert.throws(
        () => parsePackagePrice({ currency: "MXN", amountMinor }),
        (error: unknown) =>
          error instanceof InvalidPackagePriceAmountError &&
          error.message === `Invalid price amount: ${String(amountMinor)}`,
      );
    });
  }

  it("reports the currency before the amount when both are invalid", () => {
    assert.throws(
      () => parsePackagePrice({ currency: "USD", amountMinor: -1 }),
      InvalidPackagePriceCurrencyError,
    );
  });
});
