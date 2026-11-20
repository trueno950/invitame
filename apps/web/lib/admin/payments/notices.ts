import {
  PAYMENTS_ERROR_COPY,
  PAYMENTS_NOTICE_COPY,
  type PaymentsErrorCode,
  type PaymentsNoticeCode,
} from "./copy.ts";

/**
 * How the outcome of the refund action reaches the page (M7 T3; S3). The action ends with a redirect after POST (303),
 * so the form works without JavaScript and a reload never resubmits it. The result travels in the target's query as
 * `?notice=<code>` or `?error=<code>`: only a code from a fixed list, never text, an id, or a slug, and the page looks
 * the code up in its own tables, so a forged query can show only one of the fixed messages.
 */

type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

export function paymentsErrorTarget(path: string, code: PaymentsErrorCode): string {
  return `${path}?error=${code}`;
}

export function paymentsNoticeTarget(path: string, code: PaymentsNoticeCode): string {
  return `${path}?notice=${code}`;
}

function lookup<T extends string>(
  table: Readonly<Record<T, string>>,
  value: string | string[] | undefined,
): value is T {
  return typeof value === "string" && Object.hasOwn(table, value);
}

export interface PaymentsPageNotices {
  notice?: string;
  /** The code names which refusal it was; the message is the Spanish text. */
  error?: { code: PaymentsErrorCode; message: string };
}

/** The messages the page shows for its query, if any; an unknown or repeated value shows nothing. */
export function paymentsPageNotices(parameters: SearchParameters): PaymentsPageNotices {
  const { notice, error } = parameters;

  return {
    ...(lookup(PAYMENTS_NOTICE_COPY, notice) ? { notice: PAYMENTS_NOTICE_COPY[notice] } : {}),
    ...(lookup(PAYMENTS_ERROR_COPY, error)
      ? { error: { code: error, message: PAYMENTS_ERROR_COPY[error] } }
      : {}),
  };
}
