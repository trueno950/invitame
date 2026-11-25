import { ApiClientError, type ApiClientOptions, sendApiRequest } from "./api-client.ts";

/**
 * The web server's client of the landing's public price list (T4; S4). A landing's visitor is anonymous, so this
 * client sends no cookie at all — not even a cookie the browser happened to send with the page request — and keeps
 * only the web-to-API proxy secret, reusing the request primitive of the signed-in clients.
 *
 * The API authorizes nothing here: it decides on its own which packages it sells. It answers ACTIVE packages
 * ordered by key, each with the keys of the features it includes and its current MXN price or null. This client
 * refuses any body that is not exactly that contract, so the landing falls back to its own «Precio por definir»
 * instead of printing an amount nobody confirmed.
 *
 * This module deliberately has no `server-only` marker, so `node --test` can prove the mapping; the wiring that
 * imports it is `app/page.tsx`, a server component.
 */

/** The currency the landing sells in (S4): the owner confirmed every package price in Mexican pesos. */
const MXN = "MXN";

const PACKAGES_PATH = "/public/catalog/packages";

/** The catalog's own bounds for a key, a name, a description, and a feature key (see `catalog-entry.ts`). */
const MAX_PACKAGE_KEY_LENGTH = 64;
const MAX_PACKAGE_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_FEATURE_KEYS = 50;
const MAX_FEATURE_KEY_LENGTH = 100;
/** The largest amount this client reads: one million pesos in the smallest unit, which no package reaches. */
const MAX_AMOUNT_MINOR = 100_000_000;

/** A seeded package key: lower-case words joined by single hyphens, such as `basic` or `premium`. */
const PACKAGE_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
/** A seeded feature key: UPPER_SNAKE starting with a letter, such as `RSVP` or `QR_PASS`. */
const FEATURE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** The price in force of one package, in the smallest unit of the currency the landing sells in. */
export interface PublicCatalogPrice {
  readonly amountMinor: number;
  readonly currency: "MXN";
}

/** One package of the landing's price list, as the public read answers it. */
export interface PublicCatalogPackage {
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  /** The keys of the features the package includes; the landing owns their Spanish label. */
  readonly features: readonly string[];
  /** The current MXN price, or null while the package has none (the card says «Precio por definir»). */
  readonly price: PublicCatalogPrice | null;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function boundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();

  return trimmed.length === 0 || [...trimmed].length > maxLength ? undefined : trimmed;
}

/** The price in force: an amount in the smallest unit of the MXN, or null when the package has none. */
function parsePrice(value: unknown): PublicCatalogPrice | null | undefined {
  if (value === null) {
    return null;
  }

  const price = record(value);
  const amountMinor = price?.amountMinor;

  if (
    price === undefined ||
    // The landing sells in Mexican pesos (S4): another currency is not this contract, so it is refused whole.
    price.currency !== MXN ||
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    amountMinor > MAX_AMOUNT_MINOR
  ) {
    return undefined;
  }

  return { amountMinor, currency: MXN };
}

/** The feature keys the package includes: a bounded list of UPPER_SNAKE keys, or nothing at all. */
function parseFeatureKeys(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_FEATURE_KEYS) {
    return undefined;
  }

  const keys: string[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !FEATURE_KEY_PATTERN.test(item) ||
      item.length > MAX_FEATURE_KEY_LENGTH ||
      keys.includes(item)
    ) {
      return undefined;
    }
    keys.push(item);
  }
  return keys;
}

/** One package of the price list, or `undefined` when it breaks the documented contract. */
function parsePackage(value: unknown): PublicCatalogPackage | undefined {
  const stored = record(value);
  const key = boundedText(stored?.key, MAX_PACKAGE_KEY_LENGTH);
  const name = boundedText(stored?.name, MAX_PACKAGE_NAME_LENGTH);
  const features = parseFeatureKeys(stored?.features);
  const price = parsePrice(stored?.price);
  const description = stored?.description ?? null;

  if (
    key === undefined ||
    !PACKAGE_KEY_PATTERN.test(key) ||
    name === undefined ||
    features === undefined ||
    price === undefined ||
    !(
      description === null ||
      (typeof description === "string" && [...description].length <= MAX_DESCRIPTION_LENGTH)
    )
  ) {
    return undefined;
  }

  return { key, name, description, features, price };
}

/**
 * The price list of a success body, or `undefined` when it breaks the documented contract. Only the fields of the
 * contract are kept, so a body that grows an id, a status, a duration, or an owner never reaches the page. Two
 * packages with one key are refused too: they would render two cards under one identity.
 */
export function parsePublicCatalogPackages(value: unknown): PublicCatalogPackage[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const packages: PublicCatalogPackage[] = [];
  for (const item of value) {
    const parsed = parsePackage(item);
    if (parsed === undefined || packages.some((stored) => stored.key === parsed.key)) {
      return undefined;
    }
    packages.push(parsed);
  }
  return packages;
}

const isSuccess = (status: number): boolean => status >= 200 && status < 300;

export interface PublicCatalogClient {
  /** `GET /public/catalog/packages`: the packages the landing shows, with their MXN prices (S4). */
  listPackages(): Promise<PublicCatalogPackage[]>;
}

/** A stateless client of the landing's public price list: no cookie, no cache, and nothing stored. */
export function createPublicCatalogClient(options: ApiClientOptions): PublicCatalogClient {
  return {
    async listPackages(): Promise<PublicCatalogPackage[]> {
      const { status, text } = await sendApiRequest(
        options,
        { method: "GET", path: PACKAGES_PATH },
        isSuccess,
      );

      if (!isSuccess(status)) {
        throw new ApiClientError(status >= 500 ? "unavailable" : "rejected", status);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text ?? "");
      } catch {
        payload = undefined;
      }

      const packages = parsePublicCatalogPackages(payload);

      if (packages === undefined) {
        throw new ApiClientError("invalid-response", status);
      }
      return packages;
    },
  };
}
