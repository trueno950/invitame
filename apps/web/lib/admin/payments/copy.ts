import type { PaymentStatus } from "../../server/admin-payments-client.ts";

/**
 * Spanish product copy of the administrator refund pages (M7 T3; S3). Administrators are addressed with "tú" in
 * neutral Mexican Spanish, like the rest of the administration (`../copy.ts`). Keep every string of these pages here
 * so the wording is reviewed in one place: the refund rule is «Sin reembolso tras publicar», and the page says so
 * without promising when the provider will confirm it.
 */

export const PAYMENTS_PATHS = {
  panel: "/admin",
  index: "/admin/pagos",
} as const;

export const PAYMENTS_COPY = {
  pageTitle: "Pagos y reembolsos | InvitaMe",
  heading: "Pagos y reembolsos",
  intro:
    "Aquí ves los pagos confirmados. Solo se puede reembolsar la invitación que nunca se publicó.",
  /** The heading of the table: the payments and their one action. */
  tableCaption: "Pagos confirmados",
  empty: "Todavía no hay pagos confirmados.",
  slugColumn: "Invitación",
  paymentColumn: "Pago",
  amountColumn: "Monto",
  paidAtColumn: "Fecha de pago",
  actionColumn: "Reembolso",
  paidOn: (date: string) => `Pagado el ${date}`,
  refund: "Reembolsar",
  refundHint:
    "Se solicita a Mercado Pago un reembolso total. El pago se actualizará cuando Mercado Pago lo confirme.",
  /** Why a paid payment has no refund button: the rule the API enforces, shown even though the button is absent. */
  notRefundableNote: "No se puede reembolsar: la invitación ya se publicó.",
  /** The unreadable or failed read: the page offers the way back instead of an empty list. */
  unavailableHeading: "No pudimos cargar los pagos",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  retry: "Volver a intentar",
  backToPanel: "Volver al panel",
} as const;

/** The stored payment state as the administrator reads it. */
export const PAYMENTS_STATUS_LABELS: Readonly<Record<PaymentStatus, string>> = {
  pending: "Pendiente",
  paid: "Pagado",
  failed: "Rechazado",
  expired: "Vencido",
  refunded: "Reembolsado",
};

/**
 * The refusal codes of the refund page, each with its Spanish sentence. They come from
 * `apps/api/src/payments/presentation/payment.response.ts` (`PAYMENT_NOT_FOUND`, `PAYMENT_NOT_REFUNDABLE`,
 * `INVITATION_ALREADY_PUBLISHED`, `PAYMENT_PROVIDER_UNAVAILABLE`), plus the web's own two: a form it could not read,
 * and a call that never reached the API. The four API refusals exist one to one, so a new code cannot be shown
 * silently as another one.
 */
export const PAYMENTS_ERROR_COPY = {
  "not-found": "No encontramos ese pago. Vuelve a cargar la lista.",
  "not-refundable":
    "Ese pago no se puede reembolsar: solo se reembolsan los pagos que siguen confirmados.",
  "already-published": "La invitación ya se publicó, así que no tiene reembolso.",
  "provider-unavailable": "Mercado Pago no respondió. Inténtalo de nuevo en unos minutos.",
  validation: "No pudimos leer la solicitud. Vuelve a intentarlo.",
  unavailable: "No pudimos completar la solicitud. Inténtalo de nuevo en unos minutos.",
  "invalid-form": "No pudimos leer la solicitud. Vuelve a intentarlo.",
} as const;

export type PaymentsErrorCode = keyof typeof PAYMENTS_ERROR_COPY;

/**
 * The outcomes that are not a refusal: the refund was requested and the provider — not this page — will confirm it
 * (S3). The text never says the payment is already refunded, because the API changes it only from the verified
 * provider notification.
 */
export const PAYMENTS_NOTICE_COPY = {
  "refund-requested":
    "Solicitamos el reembolso a Mercado Pago. El estado del pago se actualizará cuando Mercado Pago lo confirme.",
} as const;

export type PaymentsNoticeCode = keyof typeof PAYMENTS_NOTICE_COPY;
