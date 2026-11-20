import type {
  PaymentEventOutcome,
  PaymentEventType,
  PaymentStatus,
} from "../../server/admin-payments-client.ts";

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

/** `/admin/pagos/<id>`: one payment's detail. An id is a UUID, so it needs no encoding. */
export function paymentDetailPath(paymentId: string): string {
  return `${PAYMENTS_PATHS.index}/${paymentId}`;
}

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
 * The seven codes of the refund page, each with its Spanish sentence: the four refusals of
 * `apps/api/src/payments/presentation/payment.response.ts` (`PAYMENT_NOT_FOUND`, `PAYMENT_NOT_REFUNDABLE`,
 * `INVITATION_ALREADY_PUBLISHED`, `PAYMENT_PROVIDER_UNAVAILABLE`), the client's `validation` for a 400 it cannot
 * attribute to one of them, and the web's own two — a form it could not read (`invalid-form`) and a call that never
 * reached the API (`unavailable`). The four API refusals exist one to one, so a new code cannot be shown silently as
 * another one.
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

/**
 * `/admin/pagos/<id>`: one payment's detail (M9 T7; S4). «Ver el detalle de un pago» is the support read of the S4
 * list: its state, its amount, and the events Mercado Pago sent, with no card and no payer datum — so the copy has no
 * label for one. The page never promises a refund and never edits the payment.
 */
export const PAYMENT_DETAIL_COPY = {
  pageTitle: "Detalle del pago | InvitaMe",
  heading: "Detalle del pago",
  intro:
    "Revisa el estado del pago y los eventos que recibimos de Mercado Pago. No se muestran datos de la tarjeta ni del pagador.",
  summaryHeading: "Resumen",
  paymentIdLabel: "Pago",
  statusLabel: "Estado",
  amountLabel: "Monto",
  /** Shown instead of an amount the page could not format; the page never prints a number it could not read. */
  noAmount: "—",
  providerLabel: "Proveedor",
  createdAtLabel: "Creado",
  paidAtLabel: "Pagado",
  noPaymentDate: "Sin pago",
  eventsHeading: "Eventos recibidos",
  eventsHint: "Se muestran los eventos más recientes primero, hasta 50.",
  eventsEmpty: "Todavía no hay eventos de este pago.",
  eventTypeColumn: "Evento",
  eventOutcomeColumn: "Resultado",
  eventReceivedColumn: "Recibido",
  eventProcessedColumn: "Procesado",
  /** An event row the intake never completed: the page says so instead of inventing an instant. */
  notProcessed: "Sin procesar",
  /** The neutral labels of a value outside the closed sets the API writes; the page never fails on a new value. */
  unknownEventType: "Otro evento",
  unknownOutcome: "Otro resultado",
  invitationHeading: "Invitación",
  invitationHint: "El enlace abre el estado de la invitación de este pago.",
  openInvitation: "Ver la invitación",
  backToList: "Volver a los pagos",
  unavailableHeading: "No pudimos cargar el pago",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  notFoundHeading: "No encontramos ese pago",
  notFoundBody: "Puede que el enlace esté mal escrito o que el pago ya no exista.",
  retry: "Volver a intentar",

  /**
   * The event types the verified intake writes (`PAYMENT_EVENT_TYPE`), each with its Spanish label. The record is
   * complete for `PaymentEventType`: a new type would fail the typecheck here instead of rendering unlabelled.
   */
  eventTypes: {
    paid: "Pago aprobado",
    failed: "Pago rechazado",
    expired: "Pago vencido",
    refunded: "Pago reembolsado",
  } satisfies Record<PaymentEventType, string>,

  /**
   * What each event decided (`PAYMENT_EVENT_OUTCOME`), in the terms a support person reads: whether the payment moved,
   * and why it did not when it did not.
   */
  eventOutcomes: {
    applied: "Aplicado",
    ignored_transition: "Ignorado: el cambio no era válido",
    ignored_unknown_payment: "Ignorado: pago desconocido",
    refused_amount: "Rechazado: monto distinto al contratado",
    refused_currency: "Rechazado: moneda distinta a la contratada",
  } satisfies Record<PaymentEventOutcome, string>,
} as const;

/**
 * The Spanish label of one event type, or the neutral sentence for a value outside the closed set the API writes. The
 * lookup uses `Object.hasOwn`, so `__proto__` and `toString` are unknown values rather than inherited properties.
 */
export function paymentEventTypeLabel(type: string): string {
  return Object.hasOwn(PAYMENT_DETAIL_COPY.eventTypes, type)
    ? PAYMENT_DETAIL_COPY.eventTypes[type as PaymentEventType]
    : PAYMENT_DETAIL_COPY.unknownEventType;
}

/** The Spanish label of one event outcome, or the neutral sentence for a value outside the closed set. */
export function paymentEventOutcomeLabel(outcome: string): string {
  return Object.hasOwn(PAYMENT_DETAIL_COPY.eventOutcomes, outcome)
    ? PAYMENT_DETAIL_COPY.eventOutcomes[outcome as PaymentEventOutcome]
    : PAYMENT_DETAIL_COPY.unknownOutcome;
}
