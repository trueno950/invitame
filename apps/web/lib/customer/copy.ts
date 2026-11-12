import type { InvitationFailure } from "../server/invitations-api.ts";

/**
 * Spanish product copy of the customer pages (M2 T8c; L39). Customers are addressed with "tú" in
 * neutral Mexican Spanish. Keep every customer-facing string here so the wording is reviewed in one
 * place. Sign-in copy never says whether an address has an account or what kind (S24).
 */

/**
 * The sign-in code policy the copy states. The API sets it (`SIGN_IN_CODE_LENGTH` and
 * `SIGN_IN_CODE_EXPIRES_IN_SECONDS` in `apps/api/src/auth/sign-in-code/sign-in-code-message.ts`);
 * the web never imports API code, so these values mirror it by hand. `copy.test.ts` pins every
 * number of digits and minutes in the copy to them, and `sign-in.ts` checks a code's length with
 * `digits`.
 */
export const SIGN_IN_CODE_POLICY = { digits: 6, validityMinutes: 5 } as const;

export const SIGN_IN_COPY = {
  pageTitle: "Ingresar | InvitaMe",
  eyebrow: "Tu cuenta",
  heading: "Ingresa con tu correo",
  intro: "Ingresa tu correo y te enviamos un código de 6 dígitos. No necesitas contraseña.",
  asideHeading: "Sin contraseñas que recordar",
  asideBody:
    "Cada vez que ingreses, pides un código nuevo a tu correo. Sirve una sola vez y vence en 5 minutos.",
  emailLabel: "Correo electrónico",
  emailPlaceholder: "nombre@ejemplo.com",
  emailInvalid: "Escribe un correo válido, por ejemplo nombre@ejemplo.com.",
  sendCode: "Enviar código",
  sending: "Enviando…",
  /** Shown only when the browser runs no JavaScript: the form needs it to ask for a code. */
  noScript: "Para pedir tu código, activa JavaScript en tu navegador.",
  codeHeading: "Revisa tu correo",
  codeRequested: (email: string) =>
    `Pedimos un código para ${email}. Puede tardar un par de minutos en llegar y vence en 5 minutos.`,
  newCodeRequested: (email: string) =>
    `Pedimos un código nuevo para ${email}. Usa el más reciente.`,
  codeLabel: "Código de acceso",
  codeHint: "Son 6 dígitos. Si no lo ves, revisa tu carpeta de correo no deseado.",
  codeIncomplete: "Escribe los 6 dígitos del código.",
  signIn: "Ingresar",
  verifying: "Verificando…",
  resendCode: "Enviar un código nuevo",
  changeEmail: "Cambiar correo",
  signedIn: "Listo, ya ingresaste. Te llevamos a tu cuenta…",
  invalidCode: "El código no es correcto o ya venció. Revísalo o pide uno nuevo.",
  tooManyAttempts: "Hiciste demasiados intentos. Espera un minuto y vuelve a intentarlo.",
  unavailable:
    "No pudimos continuar. Espera un momento y vuelve a intentarlo; si sigue sin funcionar, pide un código nuevo.",
} as const;

export const ACCOUNT_COPY = {
  pageTitle: "Tu cuenta | InvitaMe",
  eyebrow: "Cuenta",
  heading: "Tu cuenta",
  intro: "Aquí ves los datos con los que ingresas a InvitaMe.",
  emailLabel: "Correo electrónico",
  nameLabel: "Nombre para mostrar",
  nameEmpty: "Aún no agregas un nombre.",
  nameHint: "Es opcional, de hasta 120 caracteres. Déjalo vacío para quitarlo.",
  saveName: "Guardar nombre",
  saving: "Guardando…",
  nameSaved: "Listo, guardamos tu nombre.",
  nameCleared: "Listo, quitamos tu nombre.",
  nameInvalid: "Revisa tu nombre: debe tener entre 1 y 120 caracteres.",
  nameFailed: "No pudimos guardar tu nombre. Inténtalo de nuevo en unos minutos.",
  signOut: "Cerrar sesión",
  signingOut: "Cerrando sesión…",
  noScript: "Para cerrar sesión, activa JavaScript en tu navegador.",
  signOutFailed: "No pudimos cerrar tu sesión. Inténtalo de nuevo.",
  unavailableHeading: "No pudimos cargar tu cuenta",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  retry: "Volver a intentar",
  notCustomer: "Esta página es para cuentas de clientes.",
  /** The administrator notice links to the panel (M2 T8d; S36); no public page links to `/admin`. */
  adminPanel: "Ir al panel de administración",
  home: "Ir al inicio",
  /** The customer navigation of `CustomerShell` (M4 T5): the two pages a signed-in customer owns. */
  accountLink: "Mi cuenta",
  invitationsLink: "Mis invitaciones",
} as const;

/**
 * The two statuses a Milestone 4 draft can have (A3); M5 adds publication. The label is always shown
 * with the badge, so color is never the only signal.
 */
export const INVITATION_STATUS_LABELS = {
  DRAFT: "Borrador",
  ARCHIVED: "Archivada",
} as const;

/**
 * The Spanish label of each data field of the pinned `birthday-adventure-01` template (M4 T5). Keyed by
 * the property name the schema declares, because the schema's own `title` is technical catalog data; an
 * unlabelled property of another renderer falls back to its name.
 */
export const INVITATION_FIELD_LABELS: Readonly<Record<string, string>> = {
  celebrantName: "Nombre del festejado",
  age: "Edad",
  date: "Fecha",
  time: "Hora",
  location: "Lugar",
  address: "Dirección",
  mainPhoto: "Foto principal (URL)",
  message: "Mensaje",
};

/** Copy of the three invitation pages under `/cuenta` (M4 T5; S1, S6, S7). */
export const INVITATION_COPY = {
  pageTitle: "Mis invitaciones | InvitaMe",
  listEyebrow: "Tus invitaciones",
  listHeading: "Mis invitaciones",
  listIntro:
    "Aquí están los borradores que has creado. Puedes editarlos cuando quieras antes de publicarlos.",
  listEmpty: "Aún no tienes invitaciones. Crea una cuando quieras: es gratis.",
  newLink: "Nueva invitación",
  createdOn: (date: string) => `Creada el ${date}`,
  statusLabel: "Estado",
  slugLabel: "Dirección pública",
  slugHint: "Podrás compartirla cuando publiques tu invitación.",
  missingLabel: (names: string) => `Faltan: ${names}.`,
  save: "Guardar cambios",
  archive: "Archivar",
  archivedNote: "Esta invitación está archivada: puedes consultarla, pero ya no editarla.",
  readOnlyVersionNote:
    "Esta versión de la plantilla ya no está disponible en el catálogo, así que solo puedes consultar el contenido guardado.",
  detailPageTitle: "Tu invitación | InvitaMe",
  detailEyebrow: "Tu invitación",
  detailHeading: "Edita tu invitación",
  archivedHeading: "Tu invitación archivada",
  valueEmpty: "Sin definir",
  detailIntro:
    "Completa los datos cuando quieras. Puedes guardar el borrador aunque falte información.",
  backToList: "Volver a mis invitaciones",
  notFoundHeading: "No encontramos esa invitación",
  notFoundBody: "Puede que el enlace no sea correcto o que la invitación ya no exista.",
  unavailableHeading: "No pudimos cargar tus invitaciones",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  retry: "Volver a intentar",
  createPageTitle: "Nueva invitación | InvitaMe",
  createEyebrow: "Nueva invitación",
  createHeading: "Crea tu invitación",
  createIntro:
    "Elige una plantilla y un paquete. Crear y editar el borrador es gratis; el cobro del paquete se hace al publicar.",
  templateLabel: "Plantilla",
  packageLabel: "Paquete",
  createSubmit: "Crear borrador",
  priceMissing: "sin precio",
  noTemplates: "Aún no hay plantillas publicadas. Vuelve más tarde.",
  noPackages: "Aún no hay paquetes disponibles. Vuelve más tarde.",
  backToAccount: "Volver a mi cuenta",
} as const;

export const INVITATION_NOTICE_CODES = ["created", "saved", "archived"] as const;
export type InvitationNoticeCode = (typeof INVITATION_NOTICE_CODES)[number];

/** What a finished action confirms; the code travels in the page's query, the text lives here. */
export const INVITATION_NOTICE_COPY: Record<InvitationNoticeCode, string> = {
  created: "Listo, creamos tu borrador.",
  saved: "Listo, guardamos los cambios.",
  archived: "Listo, archivamos tu invitación.",
};

/**
 * Every refusal a server action can report, as a code in the page's query: the failure names of
 * `InvitationFailure` (except the sign-in redirect) plus the two the web adds before or around the
 * call, and `unavailable` for a failure the client could not classify.
 */
export type InvitationErrorCode =
  | Exclude<InvitationFailure, "signed-out">
  | "invalid-form"
  | "content-unavailable"
  | "unavailable";

export const INVITATION_ERROR_COPY: Record<InvitationErrorCode, string> = {
  "invalid-form": "Revisa los datos: hay un campo que no tiene el formato esperado.",
  validation: "Revisa los datos e inténtalo de nuevo.",
  "package-does-not-fit":
    "Ese paquete no incluye las funciones que necesita la plantilla. Elige otro paquete.",
  "version-not-published":
    "Esa versión de la plantilla ya no está publicada. Elige otra plantilla.",
  "package-not-found": "Ese paquete ya no está disponible. Elige otro.",
  "not-found": "No encontramos esa invitación.",
  "not-editable": "Esta invitación está archivada y ya no se puede editar.",
  "already-archived": "Esta invitación ya está archivada.",
  "content-invalid": "Revisa los datos: hay un campo que no cumple el formato de la plantilla.",
  "content-unavailable":
    "No pudimos comprobar la plantilla de esta invitación. Inténtalo de nuevo en unos minutos.",
  unavailable: "No pudimos completar la acción. Inténtalo de nuevo en unos minutos.",
};
