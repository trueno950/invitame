import { formatMxn } from "../admin/catalog/price.ts";
import {
  type InvitationPayment,
  type InvitationsClient,
  isInvitationId,
} from "../server/invitations-api.ts";
import { PAYMENT_COPY } from "./copy.ts";
import {
  formatDate,
  INVITATION_PATHS,
  invitationErrorTarget,
  invitationFailureTarget,
  sendInvitationCall,
} from "./invitations.ts";

/**
 * The creator's side of a payment (M7 T2, T3; S1, S4): the «Pagar y publicar» panel of a draft, the checkout redirect
 * allow-list of both providers, the return page Mercado Pago sends the browser back to, and the development-only
 * simulated page. Every state here is the API's answer (`GET /invitations/:id/payment`); nothing reads a query
 * parameter, a cookie, or a client value to decide whether an invitation is paid — the provider's own `status` hint on
 * the return URL included — and the publish button is only a convenience: the API's own payment gate remains the guard
 * (S1).
 */

/** The payment pages of one invitation, next to the draft they belong to. */
export const PAYMENT_PATHS = {
  /** Where the provider (or the simulated page) sends the browser back to (S4). */
  returnPage: (id: string) => `${INVITATION_PATHS.detail(id)}/pago`,
  /** The development-only simulated provider page (S4). */
  simulatedPage: (id: string, paymentId: string) =>
    `${INVITATION_PATHS.detail(id)}/pago/simulado/${paymentId}`,
} as const;

/**
 * An amount of minor units as money in Mexican Spanish, in its own currency, such as `$1,500.00` (S4). It answers
 * nothing for an amount or a currency it cannot format, so a panel never prints a number it could not read.
 */
export function formatPaymentAmount(amountMinor: number, currency: string): string | undefined {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    return undefined;
  }

  try {
    return formatMxn(amountMinor, currency);
  } catch {
    // `Intl` refuses an unknown currency code with a `RangeError`; that currency is not one this page can show.
    return undefined;
  }
}

/** A canonical UUID, as the API mints every id this page puts in a path. */
const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * An absolute https URL on a Mercado Pago or Mercado Libre host is the provider's own Checkout Pro page, and the one
 * external address this page may follow (M7 T3; S1). It mirrors the API adapter's own allow-list
 * (`CHECKOUT_HOST_PATTERN` in `mercadopago-payment-provider.ts`) rather than inventing a second rule: the label must
 * be exactly `mercadopago` or `mercadolibre` on `.com` or `.com.mx` (the MXN market), and the host must end there, so
 * `mercadopago.com.mx.evil.example`, `www.mercadopago.evil.com`, and `evilmercadopago.com` are all refused.
 */
const PROVIDER_CHECKOUT_HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*(?:mercadopago|mercadolibre)\.com(?:\.mx)?$/;

/** The one path a checkout may send the browser to under the simulated provider: the invitation's own page. */
const SIMULATED_REDIRECT_PATH = new RegExp(
  `^/cuenta/invitaciones/(${UUID_SOURCE})/pago/simulado/(${UUID_SOURCE})$`,
  "i",
);

/**
 * The provider's page, exactly as the API answered it, or nothing when the address is not one (M7 T3; S1). Only the
 * host allow-list and the transport protect this decision: the path, the query, and the preference id are the
 * provider's own, so they are followed as answered, while credentials and a fragment are refused.
 */
function providerCheckoutUrl(url: URL): string | undefined {
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    !PROVIDER_CHECKOUT_HOST.test(url.hostname)
  ) {
    return undefined;
  }

  return url.href;
}

/**
 * The address to redirect to, or nothing when the API's answer is neither the provider's own Checkout Pro page nor
 * exactly this invitation's simulated page on this request's own origin (M7 T3; S1, S4). The browser's next address is
 * always chosen by the API's answer, allow-listed here, and never by a value a visitor could supply:
 *
 * - a Mercado Pago or Mercado Libre https page is followed as answered, and needs no origin of this page;
 * - the simulated page is followed only as this origin's relative path, so simulated mode works exactly as before;
 * - everything else is refused: another origin, a protocol-relative or non-`http(s)` URL, credentials, a query or a
 *   fragment on the simulated page, a trailing slash, a different path, and another invitation's id.
 */
export function checkoutRedirectPath(
  redirectUrl: string,
  invitationId: string,
  origin: string | undefined,
): string | undefined {
  if (!isInvitationId(invitationId)) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(redirectUrl);
  } catch {
    return undefined;
  }

  const providerUrl = providerCheckoutUrl(url);
  if (providerUrl !== undefined) {
    return providerUrl;
  }

  if (
    origin === undefined ||
    origin === "" ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.origin !== origin ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return undefined;
  }

  const match = SIMULATED_REDIRECT_PATH.exec(url.pathname);

  if (match === null || match[1]?.toLowerCase() !== invitationId.toLowerCase()) {
    return undefined;
  }

  return PAYMENT_PATHS.simulatedPage(invitationId.toLowerCase(), (match[2] ?? "").toLowerCase());
}

/**
 * The query parameters Mercado Pago appends to a `back_url`. They are untrusted hints about a payment the provider
 * will notify separately: no page here reads them, and the return page drops them before it reads its own notice
 * codes, so no provider value — and no forged one — can ever select a message or a payment state (M7 T3; S1).
 */
export const PROVIDER_RETURN_PARAMETERS: readonly string[] = [
  "collection_status",
  "external_reference",
  "merchant_account_id",
  "merchant_order_id",
  "payment_id",
  "payment_type",
  "preference_id",
  "processing_mode",
  "site_id",
  "status",
];

const PROVIDER_RETURN_PARAMETER_SET = new Set(PROVIDER_RETURN_PARAMETERS);

type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

/**
 * The return page's query without the provider's hints (M7 T3; S1). The page then reads only its own `error`,
 * `notice`, and `issues` codes, which it looks up in fixed tables, so an appointment with the provider's `status`
 * cannot decide anything. The parameter names are matched case-insensitively, because a forged spelling deserves no
 * more trust than the real one. The input is left as it was.
 */
export function withoutProviderReturnParameters(parameters: SearchParameters): SearchParameters {
  const kept: Record<string, string | string[] | undefined> = {};

  for (const [name, value] of Object.entries(parameters)) {
    if (!PROVIDER_RETURN_PARAMETER_SET.has(name.toLowerCase())) {
      kept[name] = value;
    }
  }

  return kept;
}

/** The amount and its currency, such as `$1,500.00 MXN`, or nothing when the API's snapshot is unreadable (S4). */
function paymentAmount(payment: InvitationPayment): string | undefined {
  if (payment.amountMinor === null || payment.currency === null) {
    return undefined;
  }

  const formatted = formatPaymentAmount(payment.amountMinor, payment.currency);

  return formatted === undefined ? undefined : `${formatted} ${payment.currency}`;
}

/** «Pagado el 12 nov 2026», or "" when the API stored no paid instant (S4). */
function paidOn(paidAt: string | null): string {
  return paidAt === null ? "" : PAYMENT_COPY.paidOn(formatDate(paidAt));
}

/** Whether the payment is no longer valid, so the owner may start another one (S4). */
function isRetryable(status: InvitationPayment["status"]): boolean {
  return status === "failed" || status === "expired" || status === "refunded";
}

/**
 * What the draft page's aside renders (S4):
 * - `hidden` when the deployment sells nothing, so a free draft looks exactly as it did before M7;
 * - `pay` while the invitation still has to pay, with the amount and «Pagar y publicar»;
 * - `retry` after a failed, expired, or refunded payment, with the same button and what happened;
 * - `paid` with the amount and the date, once the API reports the payment as paid;
 * - `amount-unavailable` when the API requires a payment but its amount cannot be read: the panel refuses to offer
 *   a checkout whose total it cannot show, so no one pays an amount nobody displayed.
 */
export type PaymentPanelView =
  | { readonly kind: "hidden" }
  | {
      readonly kind: "pay" | "retry";
      readonly heading: string;
      readonly amount: string;
      readonly hint: string;
      readonly action: string;
    }
  | { readonly kind: "amount-unavailable"; readonly heading: string; readonly note: string }
  | {
      readonly kind: "paid";
      readonly heading: string;
      readonly amount: string;
      readonly paidOn: string;
      readonly hint: string;
    };

export function paymentPanelView(payment: InvitationPayment): PaymentPanelView {
  const amount = paymentAmount(payment);

  if (payment.status === "paid") {
    return {
      kind: "paid",
      heading: PAYMENT_COPY.paidHeading,
      amount: amount ?? "",
      paidOn: paidOn(payment.paidAt),
      hint: PAYMENT_COPY.paidHint,
    };
  }

  if (!payment.paymentRequired) {
    return { kind: "hidden" };
  }

  if (amount === undefined) {
    return {
      kind: "amount-unavailable",
      heading: PAYMENT_COPY.payHeading,
      note: PAYMENT_COPY.amountUnavailableNote,
    };
  }

  return isRetryable(payment.status)
    ? {
        kind: "retry",
        heading: PAYMENT_COPY.retryHeading,
        amount,
        hint: PAYMENT_COPY.retryHint,
        action: PAYMENT_COPY.retry,
      }
    : {
        kind: "pay",
        heading: PAYMENT_COPY.payHeading,
        amount,
        hint: PAYMENT_COPY.payHint,
        action: PAYMENT_COPY.pay,
      };
}

/**
 * What `GET /invitations/:id/payment` means on the return page (S1, S4): the state is the API's, so a reload after the
 * provider's verified notification shows the new one, and a query parameter can never make a page say "paid". A
 * refunded payment gets its own message, because the money was charged and returned, not never charged.
 */
export type PaymentReturnView =
  | {
      readonly kind: "pending";
      readonly heading: string;
      readonly body: string;
      readonly refresh: string;
    }
  | {
      readonly kind: "paid";
      readonly heading: string;
      readonly body: string;
      readonly amount: string;
      readonly paidOn: string;
    }
  | {
      readonly kind: "failed" | "refunded";
      readonly heading: string;
      readonly body: string;
      readonly amount: string;
      readonly retry: string;
    }
  | { readonly kind: "not-required"; readonly heading: string; readonly body: string };

export function paymentReturnView(payment: InvitationPayment): PaymentReturnView {
  if (payment.status === "paid") {
    return {
      kind: "paid",
      heading: PAYMENT_COPY.paidHeading,
      body: PAYMENT_COPY.paidReturnBody,
      amount: paymentAmount(payment) ?? "",
      paidOn: paidOn(payment.paidAt),
    };
  }

  if (!payment.paymentRequired) {
    return {
      kind: "not-required",
      heading: PAYMENT_COPY.notRequiredHeading,
      body: PAYMENT_COPY.notRequiredBody,
    };
  }

  if (payment.status === "refunded") {
    return {
      kind: "refunded",
      heading: PAYMENT_COPY.refundedHeading,
      body: PAYMENT_COPY.refundedBody,
      amount: paymentAmount(payment) ?? "",
      retry: PAYMENT_COPY.retry,
    };
  }

  if (isRetryable(payment.status)) {
    return {
      kind: "failed",
      heading: PAYMENT_COPY.failedHeading,
      body: PAYMENT_COPY.failedBody,
      amount: paymentAmount(payment) ?? "",
      retry: PAYMENT_COPY.retry,
    };
  }

  return {
    kind: "pending",
    heading: PAYMENT_COPY.pendingHeading,
    body: PAYMENT_COPY.pendingBody,
    refresh: PAYMENT_COPY.refresh,
  };
}

/**
 * What the development-only simulated page renders (S4). It offers the two buttons only when the API still asks for
 * that payment and its amount can be shown; anything else — a missing or foreign payment, one already paid, a free
 * deployment, or an unreadable amount — is the one note that this test payment is not available.
 */
export type SimulatedPaymentView =
  | {
      readonly kind: "available";
      readonly heading: string;
      readonly note: string;
      readonly amount: string;
      readonly pay: string;
      readonly reject: string;
    }
  | { readonly kind: "unavailable"; readonly heading: string; readonly body: string };

export function simulatedPaymentView(payment: InvitationPayment | undefined): SimulatedPaymentView {
  const amount = payment === undefined ? undefined : paymentAmount(payment);

  if (
    payment === undefined ||
    !payment.paymentRequired ||
    payment.status === "paid" ||
    amount === undefined
  ) {
    return {
      kind: "unavailable",
      heading: PAYMENT_COPY.simulatedUnavailableHeading,
      body: PAYMENT_COPY.simulatedUnavailableBody,
    };
  }

  return {
    kind: "available",
    heading: PAYMENT_COPY.simulatedHeading,
    note: PAYMENT_COPY.simulatedNote,
    amount,
    pay: PAYMENT_COPY.simulatePay,
    reject: PAYMENT_COPY.simulateFail,
  };
}

/** The client calls this module makes, so a test can hand it a fake and see exactly what it sent. */
export type PaymentClient = Pick<
  InvitationsClient,
  "checkout" | "payment" | "emitSimulatedPayment"
>;

/** A form value as text, or undefined when the field is missing or repeated. */
function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/**
 * Starts or resumes the checkout through `POST /invitations/:id/checkout` and answers the redirect the action
 * follows (M7 T3; S1, S4). The API owns the amount, the snapshot, and the provider's reference, and its answer names the
 * next page: in `PAYMENTS_MODE=mercadopago` that is the provider's own Checkout Pro URL, and in the simulated mode it is
 * this invitation's simulated page. This function only follows the redirect the API answered, and only when
 * `checkoutRedirectPath` accepts it. A refused redirect is this page's own error notice, because the browser was about
 * to leave for an address the API did not prove it owns.
 */
export async function startCheckout(
  api: PaymentClient,
  form: FormData,
  origin: string | undefined,
): Promise<string> {
  const id = text(form, "id");

  if (id === undefined || !isInvitationId(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const started = await sendInvitationCall(() => api.checkout(id));

  if (!started.ok) {
    return invitationFailureTarget(path, started.failure);
  }

  return (
    checkoutRedirectPath(started.value.redirectUrl, id, origin) ??
    invitationErrorTarget(path, "payment-redirect-refused")
  );
}

/**
 * The simulated page's one write (S4): `POST /payments/simulated/<paymentId>/emit` signs an event and posts it
 * through the real verified intake, so development exercises the whole flow instead of writing a status. On success
 * the browser goes to the return page, which reads the state from the API like any other return; a refusal keeps it
 * on the simulated page with its code. The ids come from the page itself, so a value that is not a UUID, or an
 * outcome other than these two, never becomes a request or a path segment.
 */
export async function emitSimulatedPayment(api: PaymentClient, form: FormData): Promise<string> {
  const id = text(form, "id");
  const paymentId = text(form, "paymentId");
  const outcome = text(form, "outcome");

  if (id === undefined || !isInvitationId(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }
  if (paymentId === undefined || !isInvitationId(paymentId)) {
    return invitationErrorTarget(PAYMENT_PATHS.returnPage(id), "invalid-form");
  }
  if (outcome !== "paid" && outcome !== "failed") {
    return invitationErrorTarget(PAYMENT_PATHS.returnPage(id), "invalid-form");
  }

  const emitted = await sendInvitationCall(() => api.emitSimulatedPayment(paymentId, outcome));

  return emitted.ok
    ? PAYMENT_PATHS.returnPage(id)
    : invitationFailureTarget(PAYMENT_PATHS.simulatedPage(id, paymentId), emitted.failure);
}
