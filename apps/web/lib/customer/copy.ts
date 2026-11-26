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

/**
 * The Spanish name of each omittable section key (T4; S8.4), keyed by the stable English identifier the version's own
 * `x-omittable` declares, because a key is catalog data and never a label. A key this map does not know falls back to
 * the first field it covers (`sectionLabelOf`), so a newer version still reads in Spanish.
 */
export const OMITTABLE_SECTION_LABELS: Readonly<Record<string, string>> = {
  age: "Edad",
  mainPhoto: "Foto principal",
  message: "Mensaje",
  parents: "Padres",
  godparents: "Padrinos",
  honorSponsors: "Padrinos de honor",
  ceremony: "Ceremonia",
  reception: "Recepción",
  dressCode: "Código de vestimenta",
  rsvpContact: "Confirmar asistencia",
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
  mostChosen: "El más elegido",
  changeOccasion: "Cambiar",
  /** Marks a field the pinned schema requires, as a note instead of the HTML `required` attribute. */
  fieldRequired: "Necesario para publicar",
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
  /**
   * The same hint for a package that costs money, or for one whose payment state could not be read (T3; S3): it says
   * what publishing does and promises nothing about the price, because only a free package may promise that.
   */
  publishHintCharged:
    "Cuando la invitación esté completa, publícala para compartirla con tus invitados.",
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
  /**
   * The success panel of a published invitation (T1; S2.2): its title, the three large actions that share it, and the
   * confirmation of the copy. The message carries the absolute link the page resolved from its own request.
   */
  shareHeading: "Tu invitación está publicada",
  shareHint: "Compártela con tus invitados: el enlace abre tu invitación tal como la ven ellos.",
  copyLink: "Copiar enlace",
  copied: "¡Copiado!",
  /** What the copy says when the browser refused the clipboard and the link was selected instead. */
  copySelected: "Seleccionamos el enlace: cópialo con Ctrl+C o manteniéndolo presionado.",
  shareWhatsApp: "Compartir por WhatsApp",
  shareWhatsAppMessage: (url: string) => `Te comparto la invitación: ${url}`,
  /** The third action of the panel, which opens the published page in a new tab. */
  openMine: "Ver mi invitación",
  /** The heading of an invitation the customer has not named yet, from the occasion of its template (T1; S2.1). */
  invitationOf: (occasion: string) => `Tu invitación de ${occasion}`,
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
  designCount: (count: number) => (count === 1 ? "1 diseño" : `${count} diseños`),
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
  createSubmit: "Crear mi invitación",
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
  "rsvp-saved",
  "guest-added",
  "guest-saved",
  "guest-removed",
  "link-rotated",
  "photo-uploaded",
  "gallery-uploaded",
  "media-saved",
  "media-removed",
] as const;
export type InvitationNoticeCode = (typeof INVITATION_NOTICE_CODES)[number];

/** What a finished action confirms; the code travels in the page's query, the text lives here. */
export const INVITATION_NOTICE_COPY: Record<InvitationNoticeCode, string> = {
  created: "¡Listo! Creamos tu invitación. Ahora personalízala a tu gusto.",
  saved: "Listo, guardamos los cambios.",
  archived: "Listo, archivamos tu invitación.",
  published: "Listo, publicamos tu invitación.",
  unpublished: "Listo, tu invitación volvió a borrador.",
  "features-saved": "Listo, guardamos las funcionalidades.",
  "rsvp-saved": "Listo, guardamos la configuración de asistencia.",
  "guest-added": "Listo, agregamos al invitado.",
  "guest-saved": "Listo, guardamos los cambios del invitado.",
  "guest-removed": "Listo, quitamos al invitado de la lista.",
  "link-rotated": "Listo, generamos un enlace nuevo.",
  "photo-uploaded": "Listo, subimos tu foto principal.",
  "gallery-uploaded": "Listo, agregamos la foto a tu galería.",
  "media-saved": "Listo, guardamos los cambios de la galería.",
  "media-removed": "Listo, quitamos la foto de tu galería.",
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
  | "unavailable"
  | MediaErrorCode;

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
  "place-query-invalid": "Escribe al menos tres letras de la dirección para buscar sugerencias.",
  "place-search-rate-limited":
    "Hicimos muchas búsquedas seguidas. Espera un momento o escribe la dirección a mano.",
  "place-invalid": "No pudimos guardar esa ubicación. Vuelve a elegir una sugerencia de la lista.",
  "not-editable": "Esta invitación está archivada y ya no se puede editar.",
  "already-archived": "Esta invitación ya está archivada.",
  "already-published": "Esta invitación ya está publicada.",
  "not-published": "Esta invitación no está publicada, así que no podemos despublicarla.",
  "not-publishable":
    "Todavía no podemos publicar la invitación. Revisa lo que falta y vuelve a intentarlo.",
  "payment-required":
    "Para publicar esta invitación primero tienes que pagar tu paquete: usa el botón «Pagar y publicar» de la invitación.",
  "content-invalid": "Revisa los datos: hay un campo que no cumple el formato de la plantilla.",
  "content-conflict":
    "Tu invitación cambió en otra pestaña o al subir una foto. Vuelve a intentarlo.",
  "content-unavailable":
    "No pudimos comprobar la plantilla de esta invitación. Inténtalo de nuevo en unos minutos.",
  "features-invalid": "Revisa las funcionalidades: hay un dato que no pudimos guardar.",
  "rsvp-settings-invalid":
    "Revisa la configuración de asistencia: hay un dato que no pudimos guardar.",
  "invalid-guest":
    "Revisa los datos del invitado: el nombre, los lugares, el teléfono o la nota no cumplen lo que pide el formulario.",
  "guest-list-unavailable":
    "Esta invitación no incluye la lista de invitados. Se muestra con el paquete Deluxe.",
  "guest-not-found": "No encontramos ese invitado en esta invitación.",
  "guest-not-confirmed":
    "Ese invitado todavía no confirma que asistirá, así que no podemos registrar su entrada.",
  "guest-seats-below-response":
    "No puedes dejar menos lugares de los que la persona ya confirmó. Ajusta primero su respuesta o pide que la cambie.",
  "qr-pass-unavailable":
    "Esta invitación no incluye el pase de acceso con QR. Se muestra con el paquete Deluxe.",
  "payments-disabled":
    "El cobro no está activo en este momento. Vuelve a cargar la invitación para publicarla sin costo.",
  "payment-not-required":
    "Tu paquete no tiene costo, así que puedes publicar la invitación sin pagar.",
  "payment-price-unavailable":
    "No pudimos calcular el precio de tu paquete. Inténtalo de nuevo en unos minutos.",
  "payment-already-paid": "Esta invitación ya está pagada: puedes publicarla.",
  "payment-package-locked":
    "Esta invitación ya tiene un pago aprobado y su paquete no puede cambiar.",
  "payment-provider-unavailable":
    "El servicio de pagos no está disponible en este momento. Inténtalo de nuevo en unos minutos.",
  "simulated-payment-disabled":
    "El pago de prueba no está activo en este entorno, así que no podemos simularlo.",
  "payment-not-found": "No encontramos ese pago.",
  "payment-redirect-refused":
    "No pudimos abrir la página de pago porque no corresponde a esta invitación. Vuelve a intentarlo.",
  unavailable: "No pudimos completar la acción. Inténtalo de nuevo en unos minutos.",
  "media-invalid-upload":
    "Revisa la foto: debe ser un archivo JPEG, PNG o WebP con 8000 píxeles por lado como máximo y dentro del tamaño permitido.",
  "media-invalid-alt": "Escribe un texto alternativo de hasta 120 caracteres.",
  "media-invalid-update": "Revisa el texto alternativo de la foto y vuelve a intentarlo.",
  "media-too-large":
    "La foto pesa más de lo que admite la invitación. Elige una más ligera y vuelve a intentarlo.",
  "media-unsupported-type": "Ese archivo no es una foto JPEG, PNG o WebP.",
  "media-not-found": "No encontramos esa foto en tu invitación.",
  "media-limit-reached":
    "Tu galería ya tiene todas las fotos que admite la invitación. Quita una para subir otra.",
  "media-storage-unavailable":
    "No pudimos guardar la foto. Espera un momento y vuelve a intentarlo; tu invitación no cambió.",
  "gallery-unavailable":
    "Esta invitación no incluye la galería de fotos. Se muestra con los paquetes Premium y Deluxe.",
};

/**
 * The refusals of the media routes, as the page's own codes (M8 S2, S4). The web adds one of its own — `media-invalid-alt`,
 * for alt text over the API's bound that never leaves this server — and the rest mirror the API's stable codes.
 */
export type MediaErrorCode =
  | "media-invalid-upload"
  | "media-invalid-alt"
  | "media-invalid-update"
  | "media-too-large"
  | "media-unsupported-type"
  | "media-not-found"
  | "media-limit-reached"
  | "media-storage-unavailable"
  | "gallery-unavailable";

/**
 * The creator's media controls (M8 S2, S3, S4): the «Subir foto» next to the photo link field and the «Galería»
 * section of a draft. The customer is addressed with "tú", like the rest of the customer pages. The size a hint names
 * is the one the API's own read answered (M9 T13; S5, S8 «Tamaño de foto»), never a number written here: an
 * administrator's save reaches the sentence without a deploy, and a hint that could not read the size names none.
 */
export const MEDIA_COPY = {
  /** The main photo's upload, next to the template's own photo link field (S4). */
  mainPhotoHeading: "Subir foto",
  mainPhotoHint: (megabytes: number | null) =>
    megabytes === null
      ? "Sube una foto JPEG, PNG o WebP. La guardamos en tu invitación y reemplaza la que tenías."
      : `Sube una foto JPEG, PNG o WebP de hasta ${megabytes} MB. La guardamos en tu invitación y reemplaza la que tenías.`,
  mainPhotoCurrent: "Foto actual",
  mainPhotoNone: "Todavía no has subido una foto principal.",
  mainPhotoFileLabel: "Archivo de la foto",
  mainPhotoAccept: "image/jpeg,image/png,image/webp",
  mainPhotoSubmit: "Subir foto",
  /** The «Galería» section of a draft (S3, S4).
   *
   * The photo cap is the one the API's own limits read answered (M9 T15; S8 «Fotos por invitación»), never a number
   * written here: the sentence names the configured limit, and a read that answered nothing names none.
   */
  galleryTitle: "Galería",
  galleryHint: (limit: number | null) =>
    limit === null
      ? "Ordena tus fotos como quieres que las vean tus invitados. Cada foto se abre en grande al tocarla."
      : `Sube hasta ${limit} fotos y ordénalas como quieres que las vean tus invitados. Cada foto se abre en grande al tocarla.`,
  galleryUploadHeading: "Agregar una foto",
  galleryUploadHint: (megabytes: number | null) =>
    megabytes === null
      ? "Sube una foto a la vez. Puedes cambiar el orden y el texto de cada una después."
      : `Sube una foto a la vez, de hasta ${megabytes} MB. Puedes cambiar el orden y el texto de cada una después.`,
  galleryUploadSubmit: "Subir a la galería",
  galleryAltLabel: "Texto alternativo (opcional)",
  galleryAltHint:
    "Describe la foto en una frase de hasta 120 caracteres. Ayuda a quien usa un lector de pantalla.",
  galleryAltSave: "Guardar texto",
  galleryMoveUp: "Subir",
  galleryMoveDown: "Bajar",
  galleryRemove: "Quitar",
  galleryEmpty: "Tu galería todavía no tiene fotos.",
  galleryLimitNote: (limit: number) =>
    `Tu galería ya tiene ${limit} fotos, el máximo de la invitación. Quita una para subir otra.`,
  galleryCount: (count: number, limit: number | null) =>
    limit === null ? `${count} fotos.` : `${count} de ${limit} fotos.`,
  galleryUnavailable:
    "Esta invitación no incluye la galería de fotos. Se muestra con los paquetes Premium y Deluxe.",
  galleryUnavailableRead:
    "No pudimos leer la galería de esta invitación. Inténtalo de nuevo en unos minutos.",
  archiveNote: "Esta invitación está archivada: puedes consultar sus fotos, pero ya no editarlas.",
} as const;

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
  /**
   * The API's own `content.<keys> needs one shown` issue (T4; S8.3): the invitation omits every section of a set, so
   * it would be published without the place it needs. The editor refuses the same state in place with this sentence.
   */
  needsOne: (names: string) => `Tu invitación necesita al menos una de estas secciones: ${names}.`,
} as const;

/**
 * The creator's side of a payment (M7 T2; S1, S4): the «Pagar y publicar» panel of a draft, the return page the
 * provider sends the browser back to, and the development-only simulated page. The state always comes from the API;
 * the copy only names what the API already decided, and it addresses the customer with "tú" like the rest of the
 * customer pages.
 */
export const PAYMENT_COPY = {
  /** The panel of a draft that still has to pay its package. */
  payHeading: "Pagar y publicar",
  pay: "Pagar y publicar",
  payHint:
    "Tu paquete se cobra una sola vez. En cuanto se confirme el pago podrás publicar tu invitación.",
  retryHeading: "Pagar y publicar",
  retry: "Intentar de nuevo",
  retryHint: "El pago anterior no se completó. Puedes intentarlo de nuevo con el mismo botón.",
  /** The panel of a draft whose payment the API already reports as paid. */
  paidHeading: "Pago confirmado",
  paidHint: "Tu paquete está pagado: ya puedes publicar tu invitación.",
  paidOn: (date: string) => `Pagado el ${date}`,
  /** The amount line of every state that shows what the owner pays. */
  total: (amount: string) => `Total: ${amount}`,
  /** What the panel says instead of offering a checkout whose amount it could not read (fail closed). */
  amountUnavailableNote:
    "No pudimos leer el monto de tu pago. Vuelve a cargar la página para intentarlo de nuevo.",
  /** Why the publish button of a draft is not available yet; the API's own 402 remains the guard (S1). */
  publishBlockedHint:
    "Para publicar esta invitación primero hay que pagar el paquete. Usa «Pagar y publicar» aquí arriba, en esta misma pestaña.",
  /** The return page `/cuenta/invitaciones/<id>/pago` (S4). */
  returnTitle: "Pago de tu invitación | InvitaMe",
  returnEyebrow: "Pago de tu invitación",
  pendingHeading: "Estamos confirmando tu pago",
  pendingBody:
    "En cuanto el proveedor de pagos confirme el cobro, esta página mostrará tu pago como confirmado.",
  refresh: "Actualizar",
  paidReturnBody: "Recibimos tu pago. Vuelve a tu invitación para publicarla.",
  backToInvitation: "Volver a la invitación",
  failedHeading: "El pago no se completó",
  failedBody:
    "No se cobró tu paquete. Puedes intentarlo de nuevo cuando quieras; tu invitación sigue guardada como borrador.",
  refundedHeading: "Tu pago fue reembolsado",
  refundedBody:
    "Te devolvimos el importe de tu paquete. Para publicar tu invitación primero hay que pagarla de nuevo.",
  notRequiredHeading: "Esta invitación no necesita pago",
  notRequiredBody: "Puedes publicarla desde su página, sin costo.",
  unavailableHeading: "No pudimos consultar el pago",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  /** The development-only simulated page (S4). */
  simulatedTitle: "Pago de prueba | InvitaMe",
  simulatedEyebrow: "Pago de prueba",
  simulatedHeading: "Pago de prueba",
  simulatedNote:
    "Este pago es de prueba: no se cobra dinero real. Solo sirve para revisar el flujo de pago completo en este entorno.",
  simulatePay: "Pagar",
  simulateFail: "Simular rechazo",
  simulatedUnavailableHeading: "Este pago de prueba no está disponible",
  simulatedUnavailableBody:
    "Puede que el pago ya no exista, que ya esté pagado o que este entorno no use el proveedor de prueba.",
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
  playlistLabel: "Enlace de tu playlist",
  playlistPlaceholder: "https://open.spotify.com/playlist/…",
  playlistHint:
    "Pega el enlace de Spotify, Apple Music, YouTube, Deezer o SoundCloud. Debe empezar con https. Tus invitados verán un solo botón que abre la playlist; no incrustamos el reproductor.",
  automaticHeading: "Lo que verán tus invitados",
  automaticHint:
    "Estas funciones se activan solas según el paquete que elegiste; no necesitas configurarlas.",
  automaticCountdown: "Cuenta regresiva hasta el inicio",
  automaticMap: "Mapa con enlaces a Google Maps y Waze",
  automaticCalendar: "Botón para agregar al calendario",
  automaticNone: "Tu paquete no incluye funciones automáticas por ahora.",
  /** The itinerary block of «Funciones» (F1; L3.4). */
  itineraryTitle: "Itinerario",
  itineraryHint:
    "Agrega los momentos del día en el orden en que ocurren: la hora, el título y, si quieres, el lugar y la dirección para llegar.",
  itineraryAdd: "Agregar momento",
  itineraryRemove: "Quitar",
  itineraryMoveUp: "Subir",
  itineraryMoveDown: "Bajar",
  itineraryMomentLabel: (position: number) => `Momento ${position}`,
  itineraryTimeLabel: "Hora",
  itineraryMomentTitleLabel: "Título",
  itineraryPlaceLabel: "Lugar (opcional)",
  itineraryAddressLabel: "Dirección (opcional)",
  itineraryLimitNote: "Puedes agregar hasta 15 momentos.",
  itineraryIncomplete: "Completa la hora y el título para guardar este momento.",
  itineraryEmpty:
    "Todavía no hay momentos. Agrega el primero para que tus invitados vean el programa del día.",
  itineraryArchivedNote:
    "El itinerario se guarda con la invitación, así que puedes consultarlo aquí aunque ya no se pueda editar.",
  /** The gift registry lives in the invitation content; these name why its block may not show (F7; S7). */
  giftRegistryNoteOne: (packageName: string) =>
    `La mesa de regalos se muestra con el paquete ${packageName}.`,
  giftRegistryNoteMany: (packageNames: string) =>
    `La mesa de regalos se muestra con los paquetes ${packageNames}.`,
  giftRegistryNoteAny: "La mesa de regalos se muestra con un paquete que la incluya.",
  archivedNote:
    "Esta invitación está archivada: puedes consultar sus funcionalidades, pero ya no editarlas.",
} as const;

/**
 * The creator's «Asistencia» section and its responses page (M6 G3; S1, S4). The section configures when answers
 * close and how many people one may name; the page lists every answer with its totals and the CSV download.
 */
export const RSVP_COPY = {
  sectionTitle: "Asistencia",
  sectionHint:
    "Decide hasta cuándo aceptas respuestas y cuántas personas puede confirmar cada invitado. Los invitados no ven a los demás.",
  deadlineLabel: "Fecha y hora límite (opcional)",
  deadlineHint:
    "Después de esta fecha y hora la invitación deja de recibir respuestas. Se lee en la zona horaria de la invitación.",
  partyLimitLabel: "Personas por respuesta",
  partyLimitHint: "Cada invitado puede confirmar de 1 a este número de personas.",
  archivedNote:
    "Esta invitación está archivada: puedes consultar la configuración de asistencia, pero ya no editarla.",
  unavailable:
    "No pudimos leer la configuración de asistencia. Inténtalo de nuevo en unos minutos.",
  responsesLink: "Ver respuestas",
  responsesTitle: "Respuestas de asistencia | InvitaMe",
  responsesEyebrow: "Tu invitación",
  responsesHeading: "Respuestas de asistencia",
  responsesIntro:
    "Aquí están las respuestas que recibió tu invitación, de la más reciente a la más antigua.",
  totalsHeading: "Totales",
  totalAttending: "Personas que asisten",
  totalDeclined: "No asistirán",
  totalResponses: "Respuestas",
  emptyNote:
    "Todavía no hay respuestas. Cuando alguien confirme desde la invitación, aparecerá aquí.",
  download: "Descargar CSV",
  columnName: "Nombre",
  columnAnswer: "¿Asiste?",
  columnParty: "Personas",
  columnPhone: "Teléfono",
  columnMessage: "Mensaje",
  columnAnsweredAt: "Respondió",
  attendingYes: "Sí",
  attendingNo: "No",
  updatedNote: "Actualizada",
  deadlineNone: "Sin fecha límite",
  backToInvitation: "Volver a la invitación",
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
  playlist:
    "Pega un enlace que empiece con https de Spotify, Apple Music, YouTube, Deezer o SoundCloud.",
  itinerary:
    "Revisa el itinerario: cada momento necesita una hora válida y un título de 1 a 60 caracteres; el lugar y la dirección admiten hasta 160.",
  other:
    "Hay un dato de las funcionalidades que no pudimos guardar. Revísalo y vuelve a intentarlo.",
} as const;

/**
 * Why the API refused an RSVP settings save, in Spanish (M6 G3; S4). The API answers deterministic English issues;
 * the action maps each one to a code in its own query and these sentences turn it back.
 */
export const RSVP_SETTINGS_ISSUE_COPY = {
  deadline: "Escribe una fecha y hora válidas para cerrar la confirmación, o deja el campo vacío.",
  party: "Elige un número de personas entre 1 y 10.",
  other: "Hay un dato de la asistencia que no pudimos guardar. Revísalo y vuelve a intentarlo.",
} as const;

/**
 * The autosave status line of the invitation editor (T2a; S2, S4). Every field saves on its own, so one line says
 * whether the work is on its way, already stored, or failed and can be retried; the creator is addressed with "tú"
 * like the rest of the customer pages, and a refused field is named with the same label the editor shows.
 */
export const AUTOSAVE_COPY = {
  /** The three visible states of the status line, in the words the artboard writes. */
  saving: "Guardando…",
  savedMoment: "Guardado hace un momento",
  /** The settled line once the last save is a few seconds old: true until the next change. */
  allSaved: "Todo guardado",
  failed: "No se pudo guardar",
  retry: "Reintentar",
  signIn: "Ingresar",
  /** An ended session: the status line offers the way back instead of a retry that cannot work. */
  signedOut: "Tu sesión terminó. Ingresa de nuevo para seguir editando tu invitación.",
  /** A payload naming a field the pinned template does not declare, which only a stale page can send. */
  unknownField:
    "Ese dato no forma parte de esta plantilla. Recarga la página para ver los campos que puedes editar.",
  /** One field the API refused, named with the label the editor shows for it. */
  fieldIssue: (label: string) => `Revisa «${label}»: el valor no cumple lo que pide la plantilla.`,
  /** A payload whose list of hidden sections is not a list of section keys (T4; S8.2). */
  omittedSections:
    "No pudimos guardar qué secciones quieres ocultar. Recarga la página y vuelve a intentarlo.",
  /** Why a save whose payload could not be read is refused; nothing of it is sent. */
  invalidPayload: "No pudimos guardar ese dato. Recarga la página y vuelve a intentarlo.",
  /** Why the template's fields could not be checked, so no autosave can name an unknown field. */
  catalogUnavailable:
    "No pudimos comprobar los campos de tu invitación. Inténtalo de nuevo en unos minutos.",
  /** The browser's own guard while a change is still on its way. */
  leaveWarning:
    "Todavía estamos guardando tus cambios. Si sales ahora podrías perder lo último que escribiste.",
  /** What the status line is, for the live region's accessible name. */
  regionLabel: "Estado del guardado",
} as const;

/**
 * The address combobox of the editor (S1, S2). Two notes sit under an address field: the confirmation once a stored
 * point matches the text, and the invitation to pick one otherwise. Every failure is quiet — the owner keeps typing,
 * because the words they wrote are what the invitation shows — and never names a provider.
 */
export const PLACE_PICKER_COPY = {
  /** The one note that says the address is precise: a pin and this sentence. */
  confirmed: "Ubicación confirmada en el mapa",
  /** The note under a field with no confirmed point. */
  hint: "Elige una sugerencia para ubicarla con precisión",
  /** The note while the suggestions are on their way. */
  searching: "Buscando direcciones…",
  /** A search that answered nothing. */
  empty: "No encontramos esa dirección. Puedes escribirla a mano.",
  /** A search that failed: the field stays editable, so this is a note and never a block. */
  failed: "No pudimos buscar sugerencias. Puedes escribir la dirección a mano.",
  /** A search the API limited: the same quiet note, naming the wait instead of a failure. */
  limited: "Hicimos muchas búsquedas seguidas. Espera un momento o escribe la dirección a mano.",
  /** A point that could not be stored: the address stays as written and the owner can try again. */
  saveFailed: "No pudimos guardar la ubicación. Vuelve a elegir la sugerencia.",
  /** The invitation a write named no longer exists, or is not this owner's. */
  notFound: "No encontramos esa invitación. Recarga la página.",
  /** The listbox's accessible name. */
  listLabel: "Sugerencias de dirección",
  /** What the field is, for the combobox's accessible name when its label is not enough. */
  fieldHint: "Escribe la dirección y elige una sugerencia para ubicarla en el mapa.",
} as const;

/**
 * The invitation editor's tabs, its live preview, and the notes each tab shows (T2c; S1-S4). The editor is five tabs
 * on one page: the fields themselves, the photos, the features, the attendance settings, and the way to publish. The
 * owner is addressed with "tú" like the rest of the customer pages, and every tab label stays short enough to read on
 * a phone.
 */
export const EDITOR_COPY = {
  /** The accessible name of the two tab lists (the rail on a wide screen, the row on a phone). */
  tabListLabel: "Secciones del editor",
  /** The five tabs, in the order they appear. */
  tabs: {
    contenido: "Contenido",
    fotos: "Fotos",
    funciones: "Funciones",
    asistencia: "Asistencia",
    publicar: "Publicar",
  },
  /** Why the rail says nothing is sent until a field is finished (S4). */
  railNote:
    "La vista previa se actualiza con cada campo. Nada se manda hasta que terminas de escribir un campo.",
  /** Saves everything pending now, without waiting for the field to lose focus. */
  saveNow: "Guardar ahora",
  contentHint: "Los datos que verán tus invitados. Cada campo se guarda al terminar de escribirlo.",
  photosHint: "La foto principal y la galería que verán tus invitados.",
  /** The live preview, beside the fields on a wide screen and in a dialog on a phone (S3, S4). */
  previewCaption: "Vista previa",
  previewNote: "Así la verán tus invitados. Las respuestas no se pueden enviar desde aquí.",
  previewFrameTitle: "Vista previa de tu invitación",
  previewOpen: "Ver vista previa",
  previewClose: "Cerrar la vista previa",
  previewPhoneNote: "Se abre la invitación completa, tal como la verán tus invitados.",
  /** The «Asistencia» tab of a package that grants neither RSVP nor the guest list. */
  attendanceNoRsvp:
    "Tu paquete no incluye la confirmación de asistencia. Se muestra con un paquete que la incluya.",
  attendanceGuestListNote:
    "Tu paquete incluye la lista de invitados: cada invitado responde desde su enlace personal.",
  attendanceGuestListOpen: "Abrir la lista de invitados",
  /** The «Publicar» tab: the state of the draft, its public link, and the one action that changes it. */
  publishMeta: {
    unpaid: "sin pagar",
    paid: "pagado",
    published: "publicada",
  },
  /**
   * The cards of the «Contenido» tab (T2; S1-S4). The template's own sections become a short stack of cards, so the
   * owner reads a few fields at a time instead of the whole form. A title is the section's own name (`INVITATION_COPY`)
   * unless one of these reads better, and a card's state is always in words, never only in color.
   */
  cards: {
    /** Explains the asterisk the card fields carry instead of a note under every label. */
    requiredLegend: "* Necesario para publicar. Lo demás es opcional.",
    /** The celebrant's card when the same section also holds the parents, the sponsors, or the hosts. */
    celebrantFamily: "Festejado y familia",
    /** A wedding, which announces two names instead of one. */
    couple: "Pareja",
    coupleFamily: "Pareja y familia",
    /** A baby shower, whose main people are the ones who invite. */
    hosts: "Anfitriones",
    /** The sections that hold a pair: the date with its time, and the place with its address. */
    when: "Fecha y hora",
    where: "Lugar y dirección",
    /** The «Contenido» section, named for what it actually holds in this template. */
    contentMessage: "Mensaje",
    contentPhoto: "Mensaje y foto",
    contentContact: "Mensaje y contacto",
    /** The last card: every optional field whose whole section is optional, so nothing there stops a publication. */
    extras: "Extras opcionales",
    /** What a closed card says it still owes, or that it owes nothing to publish. */
    stateComplete: "Completo",
    stateMissingOne: "Falta 1",
    stateMissing: (count: number) => `Faltan ${count}`,
    stateOptional: (filled: number, total: number) => `Opcional · ${filled} de ${total}`,
    /** The one-line summary of a card whose fields are all still empty, instead of a value nobody wrote. */
    summaryEmpty: "Aún sin datos",
    /** The footer of the open card: the group that comes next, so the reading never stops at a closed card. */
    next: (title: string) => `Siguiente: ${title}`,
    /**
     * The switch of an omittable card (T4; S3, S7, S8.1): the two words of its own state, the note it shows while it
     * is off, and the note of the essentials, which no switch ever hides.
     */
    showSection: "Mostrar",
    hideSection: "Oculta",
    hiddenSummary: "No se mostrará en tu invitación",
    hiddenNote:
      "Esta sección no se mostrará en tu invitación. Tus datos siguen guardados y vuelven a aparecer si la muestras de nuevo.",
    alwaysShown: "Siempre se muestra",
    /** Why the last shown section of a set cannot be switched off (S8.3), naming the sections of the set. */
    needsOne: PUBLISH_ISSUE_COPY.needsOne,
  },
  /**
   * The «Primeros pasos» card and the progress line above the tabs (T1; S2.1, S2.5): three steps the owner reads at a
   * glance, each one written as done, current, or ahead so the state never depends on a color, and the count the tab
   * label also states. `progressEmpty` is the whole sentence of a template that requires no field, because «0 de 0
   * listos» would read like a failure.
   */
  firstSteps: {
    heading: "Primeros pasos",
    content: "Completa tus datos",
    photos: "Agrega fotos",
    publish: "Publica",
    stateDone: "Listo",
    stateCurrent: "Ahora",
    statePending: "Después",
    progress: (done: number, total: number) => `${done} de ${total} listos`,
    progressEmpty: "Sin datos por completar",
    /** The next step the phone's fixed bar offers, named by the tab it opens. */
    next: (label: string) => `Siguiente: ${label}`,
  },
  /**
   * The fields that still stop a publication, wherever the editor names them (T1; S2.4). Each one is a link that opens
   * the «Contenido» tab with the card of that field open and the field focused, so the note is also the way there.
   */
  missingFields: {
    heading: (count: number) =>
      count === 1 ? "Falta 1 dato para publicar" : `Faltan ${count} datos para publicar`,
    next: "Completar lo que falta",
    showAll: "Ver cuáles",
  },
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

/**
 * The guest's own page (`/i/<slug>/g/<token>`) and their own pase (M6 G4; S1, S4). The guest is greeted by the first
 * name they were registered with, reads how many seats they have, answers with the same sí/no card the open form uses,
 * and sees their access pass once they confirmed. Nothing here promises a delivery, and nothing names another guest.
 */
export const GUEST_PAGE_COPY = {
  pageTitle: "Tu invitación | InvitaMe",
  greeting: (firstName: string) => `Hola, ${firstName}`,
  seatsOne: "Tienes 1 lugar reservado a tu nombre.",
  seatsMany: (seats: number) => `Tienes ${seats} lugares reservados a tu nombre.`,
  answerTitle: "Tu asistencia",
  answerCurrentYes: (party: number) =>
    `Nos dijiste que vienen ${party === 1 ? "1 persona" : `${party} personas`}.`,
  answerCurrentNo: "Nos dijiste que no podrás asistir.",
  answerPending: "Todavía no nos dices si podrás asistir.",
  answerHint: "Puedes cambiar tu respuesta hasta la fecha límite.",
  partyLabel: "Personas que vienen contigo (incluido tú)",
  messageLabel: "Mensaje (opcional)",
  messageHint: "Puedes escribir hasta 280 caracteres.",
  submit: "Guardar respuesta",
  /** The prefilled WhatsApp message of a personal link the creator shares (G4). */
  shareMessage: (firstName: string, url: string) =>
    `Hola ${firstName}, aquí está tu invitación personal: ${url}`,
  passTitle: "Tu pase de acceso",
  passHint: "Muéstralo en la entrada. Es personal: no lo compartas.",
  passAlt: "Código QR de tu pase de acceso",
} as const;

/**
 * The creator's guest list (M6 G4; S1, S4): the totals, the guests with their answer and check-in state, the form
 * that adds and edits one, and the two one-time reveals of a personal link.
 */
export const GUEST_COPY = {
  responsesTitle: "Lista de invitados | InvitaMe",
  responsesEyebrow: "Tu invitación",
  responsesHeading: "Lista de invitados",
  responsesIntro:
    "Aquí están tus invitados con su respuesta y su registro en la entrada. Cada uno recibe un enlace personal.",
  totalGuests: "Invitados",
  totalSeats: "Lugares",
  totalAttending: "Personas que asisten",
  totalDeclined: "No asistirán",
  totalPending: "Sin responder",
  totalCheckedIn: "En la entrada",
  emptyNote:
    "Todavía no tienes invitados. Agrega el primero y comparte su enlace personal cuando lo tengas.",
  columnGuest: "Invitado",
  columnSeats: "Lugares",
  columnAnswer: "¿Asiste?",
  columnParty: "Personas",
  columnCheckIn: "Entrada",
  columnActions: "Acciones",
  answerPending: "Sin responder",
  answerYes: "Sí",
  answerNo: "No",
  checkInDone: (time: string) => `Registrado el ${time}`,
  checkInNone: "Sin registrar",
  updatedNote: "Actualizada",
  addHeading: "Agregar invitado",
  addHint:
    "Escribe el nombre y cuántos lugares le reservas. Al guardar te mostramos su enlace personal una sola vez.",
  nameLabel: "Nombre",
  nameHint: "Hasta 80 caracteres.",
  seatsLabel: "Lugares reservados",
  seatsHint: "De 1 a 10. Es el máximo de personas que puede confirmar.",
  phoneLabel: "Teléfono (opcional)",
  phoneHint:
    "Escribe 10 dígitos o un número internacional que empiece con +. Solo lo usas tú, para contactarlo.",
  noteLabel: "Nota (opcional)",
  noteHint: "Hasta 200 caracteres. Solo la ves tú.",
  add: "Agregar invitado",
  editHeading: (name: string) => `Editar a ${name}`,
  edit: "Editar",
  save: "Guardar cambios",
  cancel: "Cancelar",
  removeHeading: "Quitar invitado",
  removeLink: "Quitar",
  removeQuestion: (name: string) =>
    `¿Quitar a ${name} de la lista? También se borra la respuesta que haya dado.`,
  remove: "Sí, quitar",
  rotateHeading: "Enlace personal",
  rotate: "Generar nuevo enlace",
  rotateWarning: "El enlace anterior dejará de funcionar y la persona necesitará el nuevo.",
  linkHeading: (name: string) => `Enlace personal de ${name}`,
  linkHint: "Cópialo ahora: este enlace se muestra una sola vez. Si lo pierdes, genera uno nuevo.",
  linkLabel: "Enlace personal",
  whatsappShare: "Compartir por WhatsApp",
  linkDismiss: "Entendido",
  deadlineLabel: "Fecha y hora límite",
  partyLimitLabel: "Personas por respuesta",
  download: "Descargar CSV",
  notAvailableHeading: "Esta invitación no incluye lista de invitados",
  notAvailableBody:
    "La lista de invitados se muestra con el paquete Deluxe. Puedes seguir usando la confirmación abierta en la invitación.",
  unavailableHeading: "No pudimos cargar la lista de invitados",
  unavailableBody: "Inténtalo de nuevo en unos minutos.",
  backToInvitation: "Volver a la invitación",
  /** Why the personal link of a guest is not in the list: it is answered once, by the API (S4). */
  linkOnceNote:
    "Los enlaces personales no se guardan a la vista: se muestran una sola vez, al crearlos o al generarlos de nuevo.",
} as const;

/**
 * The owner's check-in page of one QR (`/cuenta/acceso/<slug>/<token>`), (M6 G4; S4). Opening the QR marks the guest
 * present and shows the name, the seats, the confirmed party, and the first check-in instant.
 */
export const CHECK_IN_COPY = {
  pageTitle: "Registro de entrada | InvitaMe",
  eyebrow: "Tu invitación",
  heading: "Registro de entrada",
  intro: "Este es el pase de uno de tus invitados.",
  registeredHeading: (name: string) => `${name} ya está registrado`,
  registeredAgainHeading: (name: string) => `${name} ya estaba registrado`,
  registeredBody: "Puedes volver a mostrar el mismo pase: el registro no se duplica.",
  seatsLabel: "Lugares reservados",
  partyLabel: "Personas confirmadas",
  checkInLabel: "Primer registro",
  notConfirmed: "Este invitado todavía no confirma que asistirá, así que no podemos registrarlo.",
  notFound: "No encontramos este pase. Puede que el enlace se haya generado de nuevo.",
  noPass: "Esta invitación no incluye el pase de acceso, así que este código no sirve.",
  invitationNotFound: "No encontramos esa invitación en tu cuenta.",
  invalidLink: "Este enlace no es un pase de acceso válido.",
  unavailable: "No pudimos registrar la entrada. Inténtalo de nuevo en unos minutos.",
  backToInvitation: "Volver a la invitación",
  backToList: "Volver a mis invitaciones",
  signInHeading: "Ingresa para registrar la entrada",
  signInBody:
    "Este enlace es para quien organiza la invitación. Ingresa con tu cuenta y volvemos aquí.",
  signIn: "Ingresar",
} as const;

/**
 * The guest's open RSVP block (M6 G3; S1, S4). A guest types a name, says whether they will come, and may name how
 * many people, a phone, and a message. The block is one themed card of the features block, it posts without any
 * client script, and it never promises delivery or a personal link.
 */
export const RSVP_FORM_COPY = {
  title: "Confirma tu asistencia",
  hint: "Cuéntanos si podrás acompañarnos.",
  nameLabel: "Tu nombre",
  namePlaceholder: "Nombre y apellido",
  attendingLegend: "¿Asistirás?",
  attendingYes: "Sí, asistiré",
  attendingNo: "No podré asistir",
  partyLabel: "Número de personas",
  partyHint: "Cuántas personas vienen contigo, incluido tú. Si no asistirás, no hace falta elegir.",
  phoneLabel: "Teléfono (opcional)",
  phoneHint: "Solo lo usará quien organiza, por si necesita contactarte.",
  messageLabel: "Mensaje (opcional)",
  messageHint: "Puedes escribir hasta 280 caracteres.",
  submit: "Enviar respuesta",
  /** The one field no person sees: a bot fills it, and the API then answers success without storing anything. */
  honeypotLabel: "No llenes este campo",
  deadlineNote: (deadline: string) => `Confirma antes del ${deadline}.`,
  closedNote: (deadline: string) => `La confirmación de asistencia cerró el ${deadline}.`,
  /** The same news when the stored deadline cannot be read on this runtime's clock. */
  closedGeneric: "La confirmación de asistencia ya cerró.",
} as const;

/**
 * What the guest page says after an answer, read from its own query (M6 G3; S4). Each code is one Spanish
 * sentence, so no API text ever reaches a guest; a code the page does not know shows nothing.
 */
export const RSVP_NOTICE_COPY = {
  received: "¡Gracias! Recibimos tu respuesta.",
  invalid: "Revisa los datos de tu respuesta e inténtalo de nuevo.",
  closed: "La confirmación de asistencia ya cerró.",
  limited: "Recibimos muchos intentos desde tu conexión. Espera unos minutos e inténtalo de nuevo.",
  unavailable: "No pudimos guardar tu respuesta. Inténtalo de nuevo en unos minutos.",
} as const;
