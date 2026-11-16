import type { InvitationTimeZone } from "../invitation-features/time-zones.ts";
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
 * The three statuses of an invitation (M5 T1; A2): M5 adds publication. The label is always shown with
 * the badge, so color is never the only signal.
 */
export const INVITATION_STATUS_LABELS = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicada",
  ARCHIVED: "Archivada",
} as const;

/**
 * The Spanish label of each data field of the pinned birthday templates (M4 T5). Keyed by
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
  // Baby shower and themed baptism (T7c; S13): every new field of the two occasions.
  hosts: "Anfitriones",
  babyName: "Nombre del bebé (opcional)",
  genderReveal: "Revelación de género",
  giftRegistry: "Mesa de regalos",
  rsvpContact: "Confirmación de asistencia",
  parents: "Padres",
  godparents: "Padrinos",
  ceremonyPlace: "Lugar de la ceremonia",
  ceremonyAddress: "Dirección de la ceremonia",
  ceremonyTime: "Hora de la ceremonia",
  receptionPlace: "Lugar de la recepción",
  receptionAddress: "Dirección de la recepción",
  receptionTime: "Hora de la recepción",
  // Elegant line (E3c; S4): XV años and weddings. A list is one text field with one name per line, and an
  // optional field says so in its own label, as the baby's name already does.
  coupleNameOne: "Primer nombre de la pareja",
  coupleNameTwo: "Segundo nombre de la pareja",
  honorSponsors: "Padrinos de honor",
  chambelanes: "Chambelanes (opcional)",
  firstFamilyParents: "Padres de una parte (opcional)",
  secondFamilyParents: "Padres de la otra parte (opcional)",
  weddingSponsors: "Padrinos de la boda (opcional)",
  dressCode: "Código de vestimenta",
  hashtag: "Hashtag (opcional)",
};

/** Copy of the three invitation pages under `/cuenta` (M4 T5; S1, S6, S7). */
export const INVITATION_COPY = {
  pageTitle: "Mis invitaciones | InvitaMe",
  listEyebrow: "Tus invitaciones",
  listHeading: "Mis invitaciones",
  listIntro:
    "Aquí están las invitaciones que has creado. Puedes editarlas cuando quieras; las publicadas ya se ven en su enlace público.",
  listEmpty: "Aún no tienes invitaciones. Crea una cuando quieras: es gratis.",
  newLink: "Nueva invitación",
  editLink: "Editar",
  chosen: "Elegido",
  /** Marks a field the pinned schema requires, as a note instead of the HTML `required` attribute. */
  fieldRequired: "Necesario para publicar",
  /** Why no field is HTML-required: a draft may stay incomplete until publication (S7). */
  fieldsHint:
    "Puedes guardar el borrador con campos vacíos. Los campos marcados como «Necesario para publicar» hacen falta para publicar la invitación.",
  urlPlaceholder: "https://…",
  /** The short groups of the draft's form, in the order they appear. */
  sectionCelebrant: "Festejado",
  sectionWhen: "Cuándo",
  sectionWhere: "Dónde",
  /** The ceremony and the reception are two places of a baptism, each with its own address and time. */
  sectionCeremony: "Ceremonia",
  sectionReception: "Recepción",
  sectionContent: "Contenido",
  sectionOther: "Otros datos",
  detailAsideHeading: "Resumen",
  createdOn: (date: string) => `Creada el ${date}`,
  statusLabel: "Estado",
  slugLabel: "Dirección pública",
  slugHint: "Podrás compartirla cuando publiques tu invitación.",
  missingLabel: (names: string) => `Faltan: ${names}.`,
  /** One missing field, as the publish panel names it once the API refused the publication (S7). */
  missingOneLabel: (name: string) => `Falta: ${name}.`,
  save: "Guardar cambios",
  archive: "Archivar",
  /** The block of the side column that archives the draft, and what archiving does (S7). */
  archiveHeading: "Archivar",
  archiveHint: "Archivar no borra la invitación: la guarda y deja de poder editarse.",
  archivedNote: "Esta invitación está archivada: puedes consultarla, pero ya no editarla.",
  readOnlyVersionNote:
    "Esta versión de la plantilla ya no está disponible en el catálogo, así que solo puedes consultar el contenido guardado.",
  detailPageTitle: "Tu invitación | InvitaMe",
  detailEyebrow: "Tu invitación",
  detailHeading: "Edita tu invitación",
  archivedHeading: "Tu invitación archivada",
  /** The publish block of a draft, and what publishing does (S7). */
  publishHeading: "Publicar",
  publishHint:
    "Cuando la invitación esté completa, publícala para compartirla con tus invitados. Publicar no tiene costo.",
  publish: "Publicar",
  /** Why a refused publication is listed field by field instead of as one sentence (S7). */
  publishIssuesHeading: "Falta esto para publicar",
  /** The unpublish block of a published invitation (S7). */
  unpublishHeading: "Despublicar",
  unpublishHint:
    "La invitación vuelve a borrador y su enlace deja de funcionar. Puedes publicarla de nuevo cuando quieras.",
  unpublish: "Despublicar",
  /** Editing stays available while published, so the page says the change is already live (S7). */
  publishedNote:
    "Esta invitación está publicada: los cambios que guardes se ven al instante en la invitación publicada.",
  publicLinkLabel: "Enlace de la invitación",
  publicLinkHint: "Compártelo con tus invitados. Se abre en una pestaña nueva.",
  openPublic: "Abrir la invitación publicada",
  /** The same way to the public page, from a card of the list (S7). */
  viewPublic: "Ver invitación",
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
    "Primero el diseño, después el tema y al final el paquete. Crear y editar el borrador es gratis; el cobro del paquete se hace al publicar.",
  templateLabel: "Plantilla",
  /** The three steps of the chooser, in the order the stepper shows them (T10b; S10). */
  stepDesign: "Diseño",
  stepTheme: "Tema",
  stepPackage: "Paquete",
  stepsLabel: "Pasos",
  stepOf: (step: number) => `Paso ${step} de 3`,
  /** What the stepper says besides the name of a step, for screen readers only. */
  stepDone: "completado",
  stepCurrent: "paso actual",
  stepDesignHeading: "Elige el diseño",
  stepThemeHeading: "Elige el tema",
  stepPackageHeading: "Elige el paquete",
  /** The note of a step whose choice is already made, as the artboard writes it. */
  chosenNote: (label: string) => `Elegido: ${label}`,
  designStepHint: "Toca un diseño para verlo en sus temas, con datos de ejemplo.",
  /** How many styles one design offers, so a design with one style is not a surprise. */
  styleCount: (count: number) => (count === 1 ? "1 estilo" : `${count} temas`),
  singleStyle: "Estilo único",
  singleStyleNote:
    "Este diseño tiene un solo estilo, así que ya está elegido. Puedes verlo en grande y continuar.",
  /** The occasion the whole flow belongs to: a catalog category that publishes templates. */
  occasionLabel: "Ocasión",
  /** The stage of step 2: the real renderer with the fixed sample content (S9). */
  stageTitle: "Así se ve tu invitación",
  themeNote:
    "El tema cambia los colores, la tipografía y los adornos; la estructura del diseño no cambia.",
  packageNote: "El cobro se hace al publicar. Puedes cambiarlo después.",
  continueStep: "Continuar",
  backStep: "Atrás",
  /** Shown instead of the stage when a renderer refuses its sample: no miniature, no error page. */
  sampleMissing: "No pudimos cargar la vista previa de este diseño. Puedes seguir con tu elección.",
  /** The switches of a layout card: one per published theme, named as the theme board names it. */
  themeLabel: "Tema",
  /** The link that opens the full sample invitation of the selected theme (S9). */
  viewFull: "Ver completa",
  /** What a preview is, so nobody mistakes the sample for their own invitation (S9). */
  sampleNote: "Datos de ejemplo",
  previewPageTitle: "Vista previa | InvitaMe",
  previewEyebrow: "Vista previa",
  previewIntro:
    "Así se ve la invitación con datos de ejemplo. Si te gusta, elige esta plantilla y escribe los tuyos.",
  previewHeading: (name: string) => `Vista previa de «${name}»`,
  previewChoose: "Elegir esta plantilla",
  previewBack: "Volver a elegir el tema",
  previewNotFoundHeading: "No encontramos esa plantilla",
  previewNotFoundBody: "Puede que ya no esté publicada. Vuelve a elegir una plantilla.",
  previewUnavailableHeading: "No pudimos cargar la vista previa",
  packageLabel: "Paquete",
  createSubmit: "Crear borrador",
  priceMissing: "sin precio",
  noTemplates: "Aún no hay plantillas publicadas. Vuelve más tarde.",
  noPackages: "Aún no hay paquetes disponibles. Vuelve más tarde.",
  backToAccount: "Volver a mi cuenta",
} as const;

export const INVITATION_NOTICE_CODES = [
  "created",
  "saved",
  "archived",
  "published",
  "unpublished",
  "features-saved",
] as const;
export type InvitationNoticeCode = (typeof INVITATION_NOTICE_CODES)[number];

/** What a finished action confirms; the code travels in the page's query, the text lives here. */
export const INVITATION_NOTICE_COPY: Record<InvitationNoticeCode, string> = {
  created: "Listo, creamos tu borrador.",
  saved: "Listo, guardamos los cambios.",
  archived: "Listo, archivamos tu invitación.",
  published: "Listo, publicamos tu invitación.",
  unpublished: "Listo, tu invitación volvió a borrador.",
  "features-saved": "Listo, guardamos las funcionalidades.",
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
  "invalid-form":
    "Revisa los datos: hay un valor fuera del rango permitido o con un formato que no corresponde, como la fecha o la hora.",
  validation: "Revisa los datos e inténtalo de nuevo.",
  "package-does-not-fit":
    "Ese paquete no incluye las funciones que necesita la plantilla. Elige otro paquete.",
  "version-not-published":
    "Esa versión de la plantilla ya no está publicada. Elige otra plantilla.",
  "package-not-found": "Ese paquete ya no está disponible. Elige otro.",
  "not-found": "No encontramos esa invitación.",
  "not-editable": "Esta invitación está archivada y ya no se puede editar.",
  "already-archived": "Esta invitación ya está archivada.",
  "already-published": "Esta invitación ya está publicada.",
  "not-published": "Esta invitación no está publicada, así que no podemos despublicarla.",
  "not-publishable":
    "Todavía no podemos publicar la invitación. Revisa lo que falta y vuelve a intentarlo.",
  "payment-required":
    "Publicar requiere un pago que todavía no podemos procesar. Inténtalo de nuevo más tarde.",
  "content-invalid": "Revisa los datos: hay un campo que no cumple el formato de la plantilla.",
  "content-unavailable":
    "No pudimos comprobar la plantilla de esta invitación. Inténtalo de nuevo en unos minutos.",
  "features-invalid": "Revisa las funcionalidades: hay un dato que no pudimos guardar.",
  unavailable: "No pudimos completar la acción. Inténtalo de nuevo en unos minutos.",
};

/**
 * Why the API refused to publish an invitation, in Spanish (M5 T5; S7). The API answers English readiness
 * issues such as `content.date is required to publish`; the page maps each one to a code in its own query
 * and back to one of these sentences, so raw English never reaches the customer. A field issue names the
 * field with the same label the editor uses; an issue this module does not recognize is `other`.
 */
export const PUBLISH_ISSUE_COPY = {
  package:
    "El paquete que elegiste ya no incluye lo que necesita esta plantilla. Elige otro paquete.",
  version: "La versión de la plantilla de esta invitación ya no está publicada.",
  other: "Hay un dato que no cumple lo que pide la plantilla. Revísalo y vuelve a intentarlo.",
} as const;

/**
 * The «Funcionalidades» section of a draft (F3; S3, S4). The data lives per invitation, not per template: the
 * creator picks the time zone every guest clock is read in, may add a WhatsApp contact, and sees the automatic
 * features their package turns on. Only the WhatsApp field depends on the package; the time zone is always
 * theirs to choose, and the calendar is always offered to a guest.
 */
export const FEATURE_COPY = {
  sectionTitle: "Funcionalidades",
  sectionHint:
    "Estas funciones se guardan con la invitación, no con la plantilla: puedes cambiar de plantilla sin perderlas.",
  timeZoneLabel: "Zona horaria",
  timeZoneHint:
    "La cuenta regresiva y el botón del calendario usan esta zona horaria. Elige la del lugar de la celebración.",
  whatsappLabel: "Número de WhatsApp",
  whatsappPlaceholder: "55 1234 5678",
  whatsappHint:
    "Escribe 10 dígitos o un número internacional que empiece con +. Lo verán tus invitados solo si tu paquete incluye WhatsApp.",
  automaticHeading: "Lo que verán tus invitados",
  automaticHint:
    "Estas funciones se activan solas según el paquete que elegiste; no necesitas configurarlas.",
  automaticCountdown: "Cuenta regresiva hasta el inicio",
  automaticMap: "Mapa con enlaces a Google Maps y Waze",
  automaticCalendar: "Botón para agregar al calendario",
  automaticNone: "Tu paquete no incluye funciones automáticas por ahora.",
  save: "Guardar funcionalidades",
  archivedNote:
    "Esta invitación está archivada: puedes consultar sus funcionalidades, pero ya no editarlas.",
} as const;

/**
 * The Spanish label of each zone the creator may pick (S4). Each one names the place and keeps the IANA id in
 * parentheses, because several zones serve neighboring cities and the id is what the invitation stores.
 */
export const INVITATION_TIME_ZONE_LABELS: Readonly<Record<InvitationTimeZone, string>> = {
  "America/Mexico_City": "Ciudad de México y centro del país",
  "America/Cancun": "Cancún y Quintana Roo",
  "America/Mazatlan": "Mazatlán, Sinaloa y Nayarit",
  "America/Hermosillo": "Hermosillo, Sonora",
  "America/Chihuahua": "Chihuahua",
  "America/Tijuana": "Tijuana y Baja California",
  "America/Matamoros": "Matamoros, Tamaulipas",
  "America/Monterrey": "Monterrey",
  "America/Merida": "Mérida",
  "America/Ojinaga": "Ojinaga",
  "America/Bahia_Banderas": "Bahía de Banderas",
};

/**
 * Why the API refused a feature save, in Spanish (F3; S4). The API answers deterministic English issues such as
 * `timeZone must be one of the supported time zones`; the action maps each one to a code in its own query and
 * these sentences turn it back, so no English text ever reaches the customer. An issue this module does not
 * recognize is `other`.
 */
export const FEATURE_ISSUE_COPY = {
  timezone: "Elige una zona horaria de la lista.",
  phone:
    "Escribe un número de 10 dígitos o un número internacional que empiece con + y tenga entre 8 y 15 dígitos.",
  "phone-type": "El número de WhatsApp no tiene un formato válido.",
  other:
    "Hay un dato de las funcionalidades que no pudimos guardar. Revísalo y vuelve a intentarlo.",
} as const;

/**
 * The guest's page of a published invitation (M5 T5; S1, S5, A3, A5). A guest is not a customer here: the
 * page shows the invitation and nothing about the owner's account, and it asks search engines to stay away.
 */
export const PUBLIC_INVITATION_COPY = {
  /** The title when the content has no celebrant name to show (A8). */
  titleFallback: "Invitación",
  title: (celebrantName: string) => `Invitación de ${celebrantName}`,
  /** A wedding names the couple, because neither name alone describes the celebration (E3c; S4). */
  coupleTitle: (first: string, second: string) => `Boda de ${first} y ${second}`,
  notFoundTitle: "Esta invitación no está disponible",
  notFoundBody:
    "Puede que el enlace no sea correcto, que la invitación ya no esté publicada o que la dirección haya cambiado.",
  unavailableTitle: "No pudimos cargar la invitación",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  home: "Ir al inicio",
  /** The discreet footer credit that links back to the site (S1). */
  madeWith: "Hecha con InvitaMe",
} as const;
