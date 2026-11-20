import { isCatalogId } from "../../server/admin-catalog-validators.ts";
import type { AdminPaymentsClient, PaymentsResult } from "../../server/admin-payments-client.ts";
import { SIGN_IN_PATH } from "../catalog/commands.ts";
import { PAYMENTS_PATHS } from "./copy.ts";
import { paymentsErrorTarget, paymentsNoticeTarget } from "./notices.ts";

/**
 * The logic of the refund server action (M7 T3; S3, S4). It reads the submitted payment id, calls the API client at
 * most once, and answers the path to redirect to — always a 303 after POST, with the outcome as a code in the query
 * (`notices.ts`). The API applies the rule and asks the provider; nothing here decides whether a payment may be
 * refunded, and nothing here changes a payment's state.
 *
 * The only checks made here are those needed to build a request at all: the id is one text value, and the shared
 * validator `isCatalogId` — the one the API client also uses — says it is a UUID, so it is safe as a path segment. A
 * missing, repeated, or malformed value never becomes a request. An unexpected failure (already logged by the server
 * wrapper) is reported as `unavailable` instead of pretending the refund was requested.
 */

/**
 * A form value as text, or undefined when the field is missing, repeated, or not text. A repeated field is refused
 * instead of read: a form that names two payments names none, so the request is never sent for a guess.
 */
function text(form: FormData, name: string): string | undefined {
  const values = form.getAll(name);
  const value = values[0];

  return values.length === 1 && typeof value === "string" ? value : undefined;
}

export async function refundPayment(api: AdminPaymentsClient, form: FormData): Promise<string> {
  const paymentId = text(form, "paymentId");

  if (paymentId === undefined || !isCatalogId(paymentId)) {
    return paymentsErrorTarget(PAYMENTS_PATHS.index, "invalid-form");
  }

  let result: PaymentsResult<unknown>;
  try {
    result = await api.refund(paymentId);
  } catch {
    return paymentsErrorTarget(PAYMENTS_PATHS.index, "unavailable");
  }

  if (result.ok) {
    return paymentsNoticeTarget(PAYMENTS_PATHS.index, "refund-requested");
  }
  if (result.failure === "signed-out") {
    return SIGN_IN_PATH;
  }
  if (result.failure === "forbidden") {
    return "/cuenta";
  }

  return paymentsErrorTarget(PAYMENTS_PATHS.index, result.failure);
}
