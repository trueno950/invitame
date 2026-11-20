/**
 * Spanish product copy of the administrator analytics page `/admin/analitica` and of the aperturas card of one
 * invitation (M9 T12; S2, S3, S7, L12). Administrators are addressed with "tú" in neutral Mexican Spanish, like the rest
 * of the administration (`../copy.ts`). Keep every string of these pages here so the wording is reviewed in one place.
 *
 * The owner's decision fixes the word: a view is «cada apertura del enlace», reloads and the owner's own visit included
 * (L12), so the copy says «aperturas» and never «personas», «visitantes», or «únicos» — an «apertura» is a request the
 * API counted, not a person it identified, and the API stores no visitor datum at all (S7).
 */

export const ANALYTICS_PATHS = {
  panel: "/admin",
  index: "/admin/analitica",
} as const;

export const ANALYTICS_COPY = {
  pageTitle: "Analítica | InvitaMe",
  heading: "Analítica",
  intro:
    "Revisa las aperturas de los enlaces y el embudo de compra del periodo. Los días se cuentan en la hora de Ciudad de México.",
  /** The form: a plain GET form, so the period lives in the query and a reload or a bookmark keeps it. */
  filtersCaption: "Periodo",
  fromLabel: "Desde",
  toLabel: "Hasta",
  apply: "Consultar",
  reset: "Ver los últimos 30 días",
  /** The window the page is showing, in the administrator's own words. */
  windowNote: (from: string, to: string) => `Del ${from} al ${to}.`,
  /** Said when the query named no usable period, so nobody thinks a forged or mistyped window was applied. */
  defaultWindowNote: "Mostramos los últimos 30 días porque el periodo que pediste no se pudo leer.",
  viewsHeading: "Aperturas por día",
  viewsIntro: "Cada apertura del enlace cuenta, incluidas las recargas y la visita del dueño.",
  /** The retention of the view rows, so nobody expects an older season to still be there (S3). */
  retentionNote: "Se conservan los últimos 90 días de aperturas.",
  viewsTableCaption: "Aperturas por día",
  dayColumn: "Día",
  publicColumn: "Público",
  guestColumn: "Invitados",
  totalColumn: "Total",
  totalsRow: "Total del periodo",
  viewsEmpty: "No hay aperturas en este periodo.",
  funnelHeading: "Embudo de compra",
  funnelIntro:
    "Totales diarios de los borradores creados, los pagos iniciados, los pagos aprobados y las publicaciones.",
  funnelTableCaption: "Embudo de compra por día",
  draftsColumn: "Borradores",
  checkoutsColumn: "Pagos iniciados",
  paymentsColumn: "Pagos aprobados",
  publicationsColumn: "Publicaciones",
  funnelEmpty: "No hay actividad del embudo en este periodo.",
  topHeading: "Invitaciones con más aperturas",
  topIntro: "Las 20 invitaciones con más aperturas del periodo.",
  topTableCaption: "Invitaciones con más aperturas",
  topSlugColumn: "Invitación",
  topEmpty: "No hay invitaciones con aperturas en este periodo.",
  /** The unreadable or failed read: the page offers the way back instead of an empty table. */
  unavailableHeading: "No pudimos cargar la analítica",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  retry: "Volver a intentar",
} as const;

/**
 * `/admin/invitaciones/<id>`: the aperturas and RSVP totals card (M9 T12; S2, S7). The aperturas are the last 90 days
 * the API keeps (S3), and the RSVP totals are the bounded aggregate, never the owner's own read: attending people,
 * declined answers, and responses.
 */
export const INVITATION_ANALYTICS_COPY = {
  heading: "Aperturas y respuestas",
  intro:
    "Las aperturas del enlace en los últimos 90 días y los totales de respuestas de la invitación.",
  viewsHeading: "Aperturas (últimos 90 días)",
  publicLabel: "Público",
  guestLabel: "Invitados",
  viewsHint: "Cuenta cada apertura, incluidas las recargas y la visita del dueño.",
  rsvpHeading: "Respuestas",
  attendingLabel: "Asistentes",
  declinedLabel: "No asistirán",
  responsesLabel: "Respuestas",
} as const;
