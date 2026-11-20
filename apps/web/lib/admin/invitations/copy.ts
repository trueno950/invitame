import type {
  AccountStatus,
  AdminActionReason,
  AdminInvitationStatus,
} from "../../server/admin-invitations-client.ts";

/**
 * Spanish product copy of the administrator invitation status pages (M9 T3; S1, L3–L5). Administrators are addressed
 * with "tú" in neutral Mexican Spanish, like the rest of the administration (`../copy.ts`). Keep every string of these
 * pages here so the wording is reviewed in one place.
 *
 * The pages show only what the owner decided the administrator may see (L3): the owner's email, and never the
 * invitation content, the owner's display name, or guest data. The copy therefore has no label for any of them.
 */

export const INVITATIONS_PATHS = {
  panel: "/admin",
  index: "/admin/invitaciones",
} as const;

/** `/admin/invitaciones/<id>`: one invitation's status page. An id is a UUID, so it needs no encoding. */
export function invitationDetailPath(invitationId: string): string {
  return `${INVITATIONS_PATHS.index}/${invitationId}`;
}

/** The stored invitation state as the administrator reads it. */
export const INVITATION_STATUS_LABELS: Readonly<Record<AdminInvitationStatus, string>> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicada",
  ARCHIVED: "Archivada",
};

/**
 * The page's closed set of `estado` values, keyed by the query value: `search.ts` maps each one to the stored status,
 * so a value outside this table is no filter and never reaches the API.
 */
export const INVITATION_STATUS_FILTER_LABELS = {
  borrador: "Borrador",
  publicada: "Publicada",
  archivada: "Archivada",
} as const;

export const INVITATIONS_COPY = {
  pageTitle: "Invitaciones | InvitaMe",
  heading: "Invitaciones",
  intro:
    "Busca una invitación por el inicio de su enlace y revisa su estado, su pago y sus fotos. Por privacidad, aquí no se muestra el contenido de la invitación ni datos de los invitados.",
  filtersCaption: "Filtros",
  slugLabel: "Slug",
  slugHint: "Busca por el inicio del enlace público, por ejemplo ana-y.",
  slugPlaceholder: "ana-y-daniel",
  statusLabel: "Estado",
  /** The empty value of the select: no `estado` filter at all, so the API is not asked about one. */
  allStatuses: "Todos los estados",
  search: "Buscar",
  clearFilters: "Limpiar filtros",
  tableCaption: "Invitaciones",
  count: (total: number) => `${total} ${total === 1 ? "invitación" : "invitaciones"}`,
  slugColumn: "Slug",
  statusColumn: "Estado",
  ownerColumn: "Correo del dueño",
  /** Shown where the API answered no owner address at all, instead of inventing one. */
  noOwnerEmail: "Sin correo registrado",
  paymentColumn: "Pago",
  photosColumn: "Fotos",
  createdAtColumn: "Creada",
  empty: "Todavía no hay invitaciones.",
  emptyFiltered:
    "No encontramos invitaciones con esos filtros. Prueba con otro slug o con otro estado.",
  nextPage: "Siguiente página",
  nextPageHint: "Se muestran las invitaciones más recientes primero.",
  /** The unreadable or failed read: the page offers the way back instead of an empty list. */
  unavailableHeading: "No pudimos cargar las invitaciones",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  retry: "Volver a intentar",
  /** The state of a payment as the row shows it: its label and, when it can be formatted, its amount. */
  payment: (statusLabel: string, amount: string) =>
    amount === "" ? statusLabel : `${statusLabel} · ${amount}`,
  noPayment: "Sin pago",
  mainPhoto: "Foto principal",
  noPhotos: "Sin fotos",
  galleryCount: (count: number) => `${count} ${count === 1 ? "foto" : "fotos"} en la galería`,
  photosWithGallery: (count: number) =>
    `${INVITATIONS_COPY.mainPhoto} y ${count} ${count === 1 ? "foto" : "fotos"} en la galería`,
} as const;

/**
 * `/admin/invitaciones/<id>`: one invitation's status. The lifecycle dates are the invitation's own instants; «Sin
 * fecha» marks one the lifecycle never reached, and it is a phrase rather than a dash on purpose.
 */
export const INVITATION_DETAIL_COPY = {
  pageTitle: "Estado de la invitación | InvitaMe",
  heading: "Estado de la invitación",
  intro:
    "Revisa las fechas de la invitación, sus pagos y sus fotos. No se muestra su contenido ni datos de los invitados.",
  summaryHeading: "Resumen",
  ownerLabel: "Correo del dueño",
  statusLabel: "Estado",
  datesHeading: "Fechas",
  createdAtLabel: "Creada",
  publishedAtLabel: "Publicada",
  firstPublishedAtLabel: "Primera publicación",
  archivedAtLabel: "Archivada",
  refundRequestedAtLabel: "Reembolso solicitado",
  noDate: "Sin fecha",
  paymentsHeading: "Pagos",
  paymentsEmpty: "Todavía no hay pagos de esta invitación.",
  paymentsHint: "Se muestran los pagos más recientes primero.",
  paymentStatusColumn: "Estado",
  paymentAmountColumn: "Monto",
  paymentCreatedColumn: "Creado",
  paymentPaidColumn: "Pagado",
  noPaymentDate: "Sin pago",
  photosHeading: "Fotos",
  mainPhotoLabel: "Foto principal",
  galleryLabel: "Galería",
  noPhotos: "Sin fotos",
  photosYes: "Sí",
  photosNo: "No",
  publicHeading: "Enlace público",
  publicHint: "La invitación está publicada, así que cualquiera con el enlace puede verla.",
  publicOpen: "Abrir la invitación",
  notPublished: "La invitación no está publicada, así que todavía no tiene enlace público.",
  backToList: "Volver a las invitaciones",
  unavailableHeading: "No pudimos cargar la invitación",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  notFoundHeading: "No encontramos esa invitación",
  notFoundBody: "Puede que el enlace esté mal escrito o que la invitación ya no exista.",
  retry: "Volver a intentar",
} as const;

/**
 * The reason an administrator gives for a support action (M9 T8; S6, L9), each with its Spanish label. The record is
 * complete for `AdminActionReason`: a reason added to the API would fail the typecheck here instead of rendering
 * unlabelled.
 */
export const INVITATION_UNPUBLISH_REASON_LABELS = {
  ABUSE: "Abuso",
  OWNER_REQUEST: "Petición del dueño",
  PAYMENT_ERROR: "Error de pago",
  OTHER: "Otro",
} satisfies Record<AdminActionReason, string>;

/**
 * The owner's account state as the support card states it (M9 T9; S4). It is the stored `User.status` in Spanish, and
 * it is the whole of what the page says about the account: never a role, a display name, or a session.
 */
export const OWNER_ACCOUNT_STATUS_LABELS = {
  ACTIVE: "Activa",
  DISABLED: "Desactivada",
} satisfies Record<AccountStatus, string>;

/**
 * `/admin/invitaciones/<id>`: the «Acciones de soporte» card (M9 T8; S4, S6). The form is offered only while the
 * invitation is published, the reason is the API's closed set, and the note is as wide as the column. The card says in
 * the page that unpublishing creates no refund, because a support person must never promise one.
 */
export const INVITATION_SUPPORT_COPY = {
  heading: "Acciones de soporte",
  intro:
    "Cada acción queda registrada con tu cuenta y el motivo, en la misma operación que el cambio.",
  unpublishHeading: "Despublicar la invitación",
  unpublishHint:
    "La invitación vuelve a borrador y su enlace público deja de mostrarse hasta que el dueño la publique de nuevo.",
  /** Why the form is not offered: only a published invitation has anything to unpublish (S4). */
  notPublished: "Solo se puede despublicar una invitación publicada.",
  reasonLabel: "Motivo",
  /** The select's empty first option: the administrator names a reason instead of accepting one by accident. */
  reasonPlaceholder: "Elige un motivo",
  noteLabel: "Nota",
  noteHint: "Obligatoria cuando el motivo es «Otro». Máximo 500 caracteres.",
  /** The one fact of the action a support person must not promise away (S4). */
  noRefund: "Despublicar no genera un reembolso.",
  unpublish: "Despublicar",
  /**
   * The owner's account section of the card (T9; S4, L8, L9). It offers «Desactivar cuenta» while the account is
   * active, «Reactivar cuenta» while it is disabled, and «Reenviar código de acceso» while the owner may sign in by
   * code; each is fixed by what the detail answered, and the API still decides.
   */
  ownerHeading: "Cuenta del dueño",
  ownerStatusLabel: "Estado de la cuenta",
  disableHeading: "Desactivar cuenta",
  disableHint:
    "El dueño pierde el acceso de inmediato y se cierran sus sesiones. Sus invitaciones siguen publicadas.",
  disable: "Desactivar cuenta",
  reactivateHeading: "Reactivar cuenta",
  reactivateHint:
    "El dueño recupera el acceso y vuelve a entrar con un código nuevo enviado a su correo.",
  reactivate: "Reactivar cuenta",
  resendHeading: "Reenviar código de acceso",
  resendHint:
    "Le mandamos un código de inicio de sesión a su correo. Aplican los mismos límites que a cualquier usuario.",
  /** Said before the request, so nobody promises a message that delivery or the per-email limit may drop (S4). */
  resendNoticeHint: "El aviso confirma la solicitud del código, no su entrega.",
  resend: "Reenviar código de acceso",
  /** Why no control is offered: a disabled account cannot sign in by code, and an unknown owner has no account. */
  ownerDisabledHint: "La cuenta está desactivada, así que no recibe códigos de acceso.",
  ownerUnknownHint:
    "No encontramos la cuenta del dueño, así que no se ofrecen las acciones de su cuenta.",
  /** The one fact a support person must not promise away (L8). */
  invitationsStayPublished: "Desactivar la cuenta no despublica sus invitaciones.",
  /**
   * The outcomes of the unpublish form that are not a refusal: the API answered the new detail, so the page shows the
   * invitation as a draft. It never says the invitation was deleted, because it was not. The account actions' notices
   * state what the API answered: a new status, and — for the code — that it was requested.
   */
  notice: {
    unpublished: "Despublicamos la invitación. Su enlace público ya no está disponible.",
    "account-disabled": "Desactivamos la cuenta del dueño. Sus invitaciones siguen publicadas.",
    "account-reactivated":
      "Reactivamos la cuenta del dueño. Ya puede volver a entrar con un código.",
    "sign-in-code-requested":
      "Pedimos un código de acceso nuevo para el dueño. No podemos confirmar su entrega ni que lo haya recibido.",
  },
  /**
   * The refusals of the unpublish form, each with its own Spanish sentence: the three codes of
   * `apps/api/src/invitations/presentation/admin-invitation.response.ts` (`INVITATION_NOT_FOUND`,
   * `INVITATION_NOT_PUBLISHED`, `INVITATION_ALREADY_ARCHIVED`), the client's `validation` for a 400 it cannot attribute,
   * and the web's own two — a form it could not read (`invalid-form`) and a call that never reached the API
   * (`unavailable`). The three API refusals exist one to one, so a new code cannot be shown as another one.
   */
  error: {
    "not-found": "No encontramos esa invitación ni la cuenta de su dueño. Vuelve a la lista.",
    "not-published": "La invitación no está publicada, así que no hay nada que despublicar.",
    "already-archived": "La invitación está archivada, así que ya no se puede despublicar.",
    /** The account refusals of the support card (T9; S4, L9), one sentence per code, never one for another. */
    "admin-protected":
      "Esa cuenta es de administración, así que no se puede desactivar desde aquí.",
    "already-disabled": "La cuenta ya estaba desactivada.",
    "already-active": "La cuenta ya estaba activa.",
    "cannot-sign-in-by-code":
      "Esa cuenta no puede iniciar sesión con un código: está desactivada o es de administración.",
    validation: "No pudimos leer la solicitud. Revisa el motivo y la nota.",
    "invalid-form": "No pudimos leer la solicitud. Revisa el motivo y la nota.",
    unavailable: "No pudimos completar la solicitud. Inténtalo de nuevo en unos minutos.",
  },
} as const;

export type InvitationsErrorCode = keyof typeof INVITATION_SUPPORT_COPY.error;
export type InvitationsNoticeCode = keyof typeof INVITATION_SUPPORT_COPY.notice;
