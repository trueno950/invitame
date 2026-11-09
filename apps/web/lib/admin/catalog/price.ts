import { MAX_AMOUNT_MINOR } from "../../server/admin-catalog-validators.ts";

/**
 * Prices in pesos (M3 T8a; S4). The API stores an integer number of centavos (`amountMinor`, MXN only
 * today) and the form asks for pesos, so the conversion is done on the text with integer arithmetic:
 * a float such as `0.07 * 100` is not a whole number of centavos. The API validates the amount again.
 */

/** The largest price in pesos: `MAX_AMOUNT_MINOR` (the API's `MAX_PRICE_AMOUNT_MINOR`) as text. */
export const MAX_PESOS_TEXT = formatPesosField(MAX_AMOUNT_MINOR);

export type PesosParse =
  | { ok: true; amountMinor: number }
  | { ok: false; reason: "empty" | "format" | "too-large" };

// ASCII digits only (no `u` flag, so `\d` is `[0-9]`), then an optional dot and one or two decimals.
const PESOS = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses what an administrator typed: optional surrounding spaces, ASCII digits, and an optional dot
 * with one or two decimals (`10`, `10.5`, `10.05`, `0`). Everything else is refused, never guessed: a
 * comma (`1,000` reads as a thousand in Mexico and as one elsewhere), a symbol, a sign, an exponent, a
 * missing digit (`.5`, `10.`), and a third decimal. Zero is a valid price (a free package).
 */
export function parsePesos(input: string): PesosParse {
  const text = input.trim();

  if (text === "") {
    return { ok: false, reason: "empty" };
  }

  const match = PESOS.exec(text);

  if (match === null) {
    return { ok: false, reason: "format" };
  }

  const pesos = (match[1] ?? "").replace(/^0+(?=\d)/, "");
  const centavos = (match[2] ?? "").padEnd(2, "0");
  // A number too long for a double becomes a huge value or Infinity, which is above the maximum.
  const amountMinor = Number(pesos) * 100 + Number(centavos);
  return amountMinor > MAX_AMOUNT_MINOR
    ? { ok: false, reason: "too-large" }
    : { ok: true, amountMinor };
}

/** Centavos as the text `parsePesos` accepts: `1050` is `10.50`, `1000` is `10`. */
export function formatPesosField(amountMinor: number): string {
  const pesos = Math.floor(amountMinor / 100);
  const centavos = amountMinor % 100;
  return centavos === 0 ? String(pesos) : `${pesos}.${String(centavos).padStart(2, "0")}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Centavos as money in Mexican Spanish, such as `$1,500.00`; another currency keeps its own code. */
export function formatMxn(amountMinor: number, currency: string): string {
  let formatter = formatters.get(currency);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat("es-MX", { style: "currency", currency });
    formatters.set(currency, formatter);
  }
  return formatter.format(amountMinor / 100);
}
