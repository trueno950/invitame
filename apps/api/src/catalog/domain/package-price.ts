/**
 * The currencies a package price may use (S4, L4): MXN only today. The database stores any `CHAR(3)` ISO
 * code shaped `[A-Z]{3}`, so allowing another currency is a change to this list, not a migration.
 */
export const SUPPORTED_CURRENCIES = ["MXN"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** The largest value of the `PackagePrice.amountMinor` column (PostgreSQL `INTEGER`). */
export const MAX_PRICE_AMOUNT_MINOR = 2_147_483_647;

/** A price as the catalog accepts it: an amount in minor units (centavos for MXN) and its currency. */
export interface PackagePriceInput {
  readonly currency: SupportedCurrency;
  readonly amountMinor: number;
}

export class InvalidPackagePriceCurrencyError extends Error {
  constructor(readonly currency: unknown) {
    super(
      `Unsupported price currency: ${typeof currency === "string" ? JSON.stringify(currency) : String(currency)}`,
    );
    this.name = "InvalidPackagePriceCurrencyError";
  }
}

export class InvalidPackagePriceAmountError extends Error {
  constructor(readonly amountMinor: unknown) {
    super(`Invalid price amount: ${String(amountMinor)}`);
    this.name = "InvalidPackagePriceAmountError";
  }
}

function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return SUPPORTED_CURRENCIES.some((currency) => currency === value);
}

/**
 * Validates an untrusted price. The currency must match the allow-list exactly (no case folding or
 * trimming) and the amount must be a non-negative safe integer that fits the column. The currency is
 * checked first. Only the two price fields are returned.
 */
export function parsePackagePrice(input: {
  readonly currency: unknown;
  readonly amountMinor: unknown;
}): PackagePriceInput {
  const { currency, amountMinor } = input;

  if (!isSupportedCurrency(currency)) {
    throw new InvalidPackagePriceCurrencyError(currency);
  }
  if (
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    amountMinor > MAX_PRICE_AMOUNT_MINOR
  ) {
    throw new InvalidPackagePriceAmountError(amountMinor);
  }

  return { currency, amountMinor };
}
