import { MAX_AMOUNT_MINOR } from "../../server/admin-catalog-validators.ts";
import {
  CATALOG_ERROR_COPY,
  CATALOG_NOTICE_COPY,
  type CatalogErrorCode,
  type CatalogNoticeCode,
} from "./copy.ts";
import { formatMxn } from "./price.ts";

/**
 * How the outcome of a catalog action reaches the page (M3 T8a). An action ends with a redirect after
 * POST (303), so a form works without JavaScript and a reload never resubmits it. The result travels
 * in the target's query as `?notice=<code>` or `?error=<code>`: only a code from a fixed list, never
 * text, a key, or a name, and the page looks the code up in its own tables, so a forged query can show
 * only one of the fixed messages.
 */

type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

export function errorMessage(code: CatalogErrorCode): string {
  return code === "price-too-large"
    ? `${CATALOG_ERROR_COPY[code]} El máximo es ${formatMxn(MAX_AMOUNT_MINOR, "MXN")}.`
    : CATALOG_ERROR_COPY[code];
}

export function noticeTarget(path: string, code: CatalogNoticeCode): string {
  return `${path}?notice=${code}`;
}

export function errorTarget(path: string, code: CatalogErrorCode): string {
  return `${path}?error=${code}`;
}

function lookup<T extends string>(
  table: Readonly<Record<T, string>>,
  value: string | string[] | undefined,
): value is T {
  return typeof value === "string" && Object.hasOwn(table, value);
}

export interface PageNotices {
  notice?: string;
  /** The code names which field the error concerns; the message is the Spanish text. */
  error?: { code: CatalogErrorCode; message: string };
}

/** The messages the page shows for its query, if any; an unknown or repeated value shows nothing. */
export function pageNotices(parameters: SearchParameters): PageNotices {
  const { notice, error } = parameters;
  return {
    ...(lookup(CATALOG_NOTICE_COPY, notice) ? { notice: CATALOG_NOTICE_COPY[notice] } : {}),
    ...(lookup(CATALOG_ERROR_COPY, error)
      ? { error: { code: error, message: errorMessage(error) } }
      : {}),
  };
}
