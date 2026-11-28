import { DEFAULT_LOCALE, type Locale } from "./locale.ts";

/**
 * The typed dictionary of every fixed guest-facing text of an invitation (F14; S2.14, L19.2). It follows the shape of
 * `./dictionary.ts`: Spanish is the source of truth, every key is declared once in `SPANISH_GUEST_TEXTS`, the values
 * are the product copy a guest reads today, and `ENGLISH_GUEST_TEXTS` is typed by those very keys — so adding a key
 * without its English value fails `tsc` instead of rendering a blank line.
 *
 * Two halves, because a dictionary of one language is two kinds of value:
 *
 * - the fixed lines, which are one string per locale and travel through `guestText` or `guestTexts`;
 * - the interpolated ones — counts, dates, names, and the accessible names that wrap them — which are a function per
 *   locale (`guestFormats`), typed by the Spanish declaration so both languages take exactly the same arguments.
 *
 * Nothing here is machine translated: each English value is written for a warm, natural invitation. And nothing here
 * is the owner's content: the celebration's name, the message, the hotel names, and every other word the owner typed
 * stay exactly as written, in either language.
 *
 * This module is deliberately self-contained (it imports only the locale it renders) because the pure guest modules it
 * serves — the countdown, the calendar, the event facts — are imported by the features block that reads it back. The
 * Spanish values it declares are the ones those modules already export, and `guest-texts.test.ts` pins every one of
 * them to its original constant, so the two can never drift and Spanish output stays byte-identical.
 */

/** Every fixed guest-facing line, in neutral Spanish (L19.2). */
export const SPANISH_GUEST_TEXTS = {
  /** The features block's own heading, when the guest page has no greeting of its own (S4). */
  "block.heading": "Todo lo que necesitas",

  // The countdown (S3, S4).
  "countdown.title": "Cuenta regresiva",
  "countdown.today": "¡Hoy es el día!",
  "countdown.live": "¡Es hoy!",
  "countdown.passed": "La celebración ya pasó",
  "countdown.soon": "Falta menos de un minuto",
  "countdown.firstMoment": "Primer momento",

  // The map and the two link services (S1, S2).
  "map.title": "Cómo llegar",
  "map.googleMaps": "Google Maps",
  "map.waze": "Waze",
  /** The two data sources the map's own attribution names, always visible under the box (S2). */
  "map.attribution": "© OpenStreetMap contributors · Mapas: OpenFreeMap",

  // The calendar card (S4).
  "calendar.title": "Agregar al calendario",
  "calendar.hint": "Guarda la fecha para no olvidarla.",
  "calendar.google": "Google Calendar",
  "calendar.download": "Descargar .ics",
  /** The `PRODID` of the `.ics` file: the product, what it produces, and the language it was written in. */
  "calendar.prodid": "-//InvitaMe//Invitaciones//ES",

  // The WhatsApp card (S4).
  "whatsapp.title": "Escribir por WhatsApp",
  "whatsapp.hint": "Escribe para confirmar tu asistencia.",
  "whatsapp.action": "Escribir por WhatsApp",

  // The playlist card (F6; S7).
  "music.title": "Escucha nuestra playlist",
  "music.coverAlt": "Portada de la playlist",
  "music.hint": "La música que elegimos para esta celebración.",

  // The plan of the day (F1; L3.5).
  "itinerary.title": "Itinerario",
  "itinerary.hint": "El programa del día, momento por momento.",
  "itinerary.directions": "Cómo llegar",

  // The gift registry (F2; L4.5).
  "giftRegistry.title": "Mesa de regalos",
  "giftRegistry.hint":
    "Tu presencia es nuestro mejor regalo; si quieres consentirnos, aquí te dejamos opciones.",
  "giftRegistry.transferTitle": "Transferencia",
  "giftRegistry.bank": "Banco",
  "giftRegistry.holder": "Titular",
  "giftRegistry.clabe": "CLABE",
  "giftRegistry.viewStore": "Ver mesa",
  "giftRegistry.copyClabe": "Copiar CLABE",
  "giftRegistry.copied": "¡Copiada!",
  "giftRegistry.envelopes": "También puedes darnos tu regalo en un sobre el día del evento.",

  // The lodging and transport (F4; L7.5).
  "lodging.kicker": "Para quienes vienen de fuera",
  "lodging.title": "Hospedaje",
  "lodging.hint": "Te dejamos opciones para hospedarte cerca del evento.",
  "lodging.transportTitle": "Transporte",
  "lodging.groupCode": "Código de grupo",
  "lodging.book": "Reservar",

  // The livestream (F9; L12.3, L12.5).
  "livestream.title": "Míralo en vivo",
  "livestream.open": "Abrir la transmisión",
  "livestream.play": "Reproducir la transmisión",
  "livestream.fallback": "Si no carga, ábrela aquí",
  "livestream.iframeTitle": "Transmisión en vivo",

  // The creator's gallery (M8 S3, S4).
  "gallery.title": "Galería",
  "gallery.hint": "Algunos momentos de esta celebración.",
  "gallery.alt": "Foto de la galería",

  // The album of the guests' photos (F8; L11.5).
  "album.title": "Nuestras fotos",
  "album.hint": "Comparte las fotos que tomes durante la fiesta.",
  "album.upload": "Subir mis fotos",
  "album.fileLabel": "Tu foto",
  "album.fileHint": "JPG, PNG o WebP, dentro del tamaño que admite la invitación.",
  "album.uploaderLabel": "Tu nombre (opcional)",
  "album.uploaderHint": "Así sabrán quién subió la foto.",
  "album.uploaderPlaceholder": "Nombre",
  "album.empty": "Todavía no hay fotos publicadas. ¡Sube la primera!",
  "album.closed": "El álbum de fotos se cerró cuando terminó la invitación.",
  "album.altFallback": "Foto del álbum de invitados",

  // The open RSVP card (M6 G3; S4).
  "rsvp.title": "Confirma tu asistencia",
  "rsvp.hint": "Cuéntanos si podrás acompañarnos.",
  "rsvp.nameLabel": "Tu nombre",
  "rsvp.namePlaceholder": "Nombre y apellido",
  "rsvp.attendingLegend": "¿Asistirás?",
  "rsvp.attendingYes": "Sí, asistiré",
  "rsvp.attendingNo": "No podré asistir",
  "rsvp.partyLabel": "¿Cuántos van contigo?",
  "rsvp.partyHint":
    "Cuántas personas vienen contigo, incluido tú. Si no asistirás, no hace falta elegir.",
  "rsvp.companionsLegend": "Nombres de tus acompañantes",
  "rsvp.companionsHint":
    "Escribe el nombre de cada persona que viene contigo. Si todavía no lo sabes, puedes dejarlo en blanco.",
  "rsvp.companionPlaceholder": "Nombre",
  "rsvp.companionChild": "Niño",
  "rsvp.dietaryLabel": "Restricciones alimentarias (opcional)",
  "rsvp.dietaryHint":
    "Cuéntanos si alguien necesita un menú especial. Puedes escribir hasta 300 caracteres.",
  "rsvp.phoneLabel": "Teléfono (opcional)",
  "rsvp.phoneHint": "Solo lo usará quien organiza, por si necesita contactarte.",
  "rsvp.messageLabel": "Mensaje (opcional)",
  "rsvp.messageHint": "Puedes escribir hasta 280 caracteres.",
  "rsvp.submit": "Enviar respuesta",
  "rsvp.honeypot": "No llenes este campo",
  "rsvp.closedGeneric": "La confirmación de asistencia ya cerró.",

  // The page title a browser tab and a share preview read, and the personal page of one guest (M6 G4; S4; F5).
  "invitation.titleFallback": "Invitación",
  "guestPage.pageTitle": "Tu invitación | InvitaMe",
  "guestPage.answerTitle": "Tu asistencia",
  "guestPage.partyLabel": "Personas que vienen contigo (incluido tú)",
  "guestPage.messageLabel": "Mensaje (opcional)",
  "guestPage.messageHint": "Puedes escribir hasta 280 caracteres.",
  "guestPage.submit": "Guardar respuesta",
  "guestPage.answerCurrentNo": "Nos dijiste que no podrás asistir.",
  "guestPage.answerPending": "Todavía no nos dices si podrás asistir.",
  "guestPage.answerHint": "Puedes cambiar tu respuesta hasta la fecha límite.",
  "guestPage.passKicker": "Pase de acceso",
  "guestPage.passTable": "Mesa",
  "guestPage.passPeople": "Personas",
  "guestPage.passHint": "Muéstralo en la entrada. Es personal: no lo compartas.",
  "guestPage.passAlt": "Código QR de tu pase de acceso",

  // The guestbook wall (F7; L10.3, L10.5).
  "guestbook.title": "Libro de firmas",
  "guestbook.hint": "Déjale tus mejores deseos a quien celebra.",
  "guestbook.nameLabel": "Tu nombre",
  "guestbook.namePlaceholder": "Nombre y apellido",
  "guestbook.messageLabel": "Tu mensaje",
  "guestbook.messagePlaceholder": "Escribe tu mensaje",
  "guestbook.messageHint": "Puedes escribir hasta 500 caracteres.",
  "guestbook.submit": "Firmar el libro",
  "guestbook.empty": "Todavía no hay mensajes. ¡Sé la primera persona en firmar!",
  "guestbook.closed": "El libro de firmas se cerró cuando terminó la invitación.",
  "guestbook.honeypot": "No llenes este campo",

  // The notices a guest page reads from its own query (M6 G3, F7, F8; S4). Only the sentence varies: the code of each
  // notice is what the server action redirects with, and it never changes with the locale.
  "notice.rsvp.received": "¡Gracias! Recibimos tu respuesta.",
  "notice.rsvp.invalid": "Revisa los datos de tu respuesta e inténtalo de nuevo.",
  "notice.rsvp.closed": "La confirmación de asistencia ya cerró.",
  "notice.rsvp.limited":
    "Recibimos muchos intentos desde tu conexión. Espera unos minutos e inténtalo de nuevo.",
  "notice.rsvp.unavailable": "No pudimos guardar tu respuesta. Inténtalo de nuevo en unos minutos.",
  "notice.guestbook.signed": "¡Gracias! Tu mensaje ya está en el libro de firmas.",
  "notice.guestbook.invalid": "Revisa tu nombre y tu mensaje e inténtalo de nuevo.",
  "notice.guestbook.closed": "El libro de firmas ya cerró.",
  "notice.guestbook.limited":
    "Recibimos muchos intentos desde tu conexión. Espera unos minutos e inténtalo de nuevo.",
  "notice.guestbook.unavailable":
    "No pudimos guardar tu mensaje. Inténtalo de nuevo en unos minutos.",
  "notice.album.uploaded": "Gracias, tu foto aparecerá cuando la aprueben.",
  "notice.album.invalid":
    "Revisa tu foto: debe ser un archivo JPG, PNG o WebP y pesar menos de lo permitido.",
  "notice.album.closed": "El álbum de fotos ya cerró.",
  "notice.album.full": "El álbum de fotos de esta invitación ya está lleno.",
  "notice.album.pendingFull": "Hay muchas fotos esperando revisión. Inténtalo de nuevo más tarde.",
  "notice.album.limited":
    "Recibimos muchas fotos desde tu conexión. Espera unos minutos e inténtalo de nuevo.",
  "notice.album.unavailable": "No pudimos subir tu foto. Inténtalo de nuevo en unos minutos.",

  // The lock screen of an invitation that stores an access code (F13; L18.1, L18.3).
  "lock.privateTitle": "Invitación privada",
  "lock.privateLine": "Esta invitación es privada. Escribe la contraseña que te compartieron.",
  "lock.fieldLabel": "Contraseña",
  "lock.submit": "Ver invitación",
  "lock.hint": "¿No la tienes? Pídesela a quien te invitó.",
  "lock.rejected": "Esa contraseña no es correcta.",
  "lock.limited": "Demasiados intentos. Espera unos minutos.",
  "lock.writeRefused": "Esta invitación pide contraseña. Vuelve a abrirla para escribirla.",

  // The envelope of the opening animation (F10; L14.2).
  "opening.tap": "Toca para abrir",

  // The label the fixed parts of the celebration carry, and the footer credit (A8).
  "event.place": "Lugar",
  "event.ceremony": "Ceremonia",
  "event.reception": "Recepción",
  "footer.madeWith": "Hecha con InvitaMe",
} as const;

/** One fixed line of the dictionary: declared by the Spanish source, never by a caller. */
export type GuestTextKey = keyof typeof SPANISH_GUEST_TEXTS;

/** The same keys with their English text; a missing or unknown key does not compile. */
export const ENGLISH_GUEST_TEXTS: Readonly<Record<GuestTextKey, string>> = {
  "block.heading": "Everything you need",

  "countdown.title": "Countdown",
  "countdown.today": "Today is the day!",
  "countdown.live": "It's happening today!",
  "countdown.passed": "The celebration is over",
  "countdown.soon": "Less than a minute to go",
  "countdown.firstMoment": "First moment",

  "map.title": "Getting there",
  "map.googleMaps": "Google Maps",
  "map.waze": "Waze",
  "map.attribution": "© OpenStreetMap contributors · Maps: OpenFreeMap",

  "calendar.title": "Add to calendar",
  "calendar.hint": "Save the date so you don't forget it.",
  "calendar.google": "Google Calendar",
  "calendar.download": "Download .ics",
  "calendar.prodid": "-//InvitaMe//Invitations//EN",

  "whatsapp.title": "Message on WhatsApp",
  "whatsapp.hint": "Write to confirm you're coming.",
  "whatsapp.action": "Message on WhatsApp",

  "music.title": "Listen to our playlist",
  "music.coverAlt": "Playlist cover",
  "music.hint": "The music we chose for this celebration.",

  "itinerary.title": "Itinerary",
  "itinerary.hint": "The plan for the day, moment by moment.",
  "itinerary.directions": "Directions",

  "giftRegistry.title": "Gift registry",
  "giftRegistry.hint":
    "Your presence is our best gift; if you'd like to treat us, here are a few options.",
  "giftRegistry.transferTitle": "Bank transfer",
  "giftRegistry.bank": "Bank",
  "giftRegistry.holder": "Account holder",
  "giftRegistry.clabe": "CLABE",
  "giftRegistry.viewStore": "View registry",
  "giftRegistry.copyClabe": "Copy CLABE",
  "giftRegistry.copied": "Copied!",
  "giftRegistry.envelopes":
    "You can also give us your gift in an envelope on the day of the event.",

  "lodging.kicker": "For those coming from out of town",
  "lodging.title": "Where to stay",
  "lodging.hint": "Here are a few places to stay near the event.",
  "lodging.transportTitle": "Transportation",
  "lodging.groupCode": "Group code",
  "lodging.book": "Book",

  "livestream.title": "Watch it live",
  "livestream.open": "Open the stream",
  "livestream.play": "Play the stream",
  "livestream.fallback": "If it doesn't load, open it here",
  "livestream.iframeTitle": "Live stream",

  "gallery.title": "Gallery",
  "gallery.hint": "A few moments from this celebration.",
  "gallery.alt": "Gallery photo",

  "album.title": "Our photos",
  "album.hint": "Share the photos you take at the party.",
  "album.upload": "Upload my photos",
  "album.fileLabel": "Your photo",
  "album.fileHint": "JPG, PNG, or WebP, within the size the invitation allows.",
  "album.uploaderLabel": "Your name (optional)",
  "album.uploaderHint": "So everyone knows who uploaded the photo.",
  "album.uploaderPlaceholder": "Name",
  "album.empty": "No photos yet. Be the first to upload one!",
  "album.closed": "The photo album closed when the invitation ended.",
  "album.altFallback": "Guest album photo",

  "rsvp.title": "RSVP",
  "rsvp.hint": "Let us know if you can join us.",
  "rsvp.nameLabel": "Your name",
  "rsvp.namePlaceholder": "First and last name",
  "rsvp.attendingLegend": "Will you attend?",
  "rsvp.attendingYes": "Yes, I'll be there",
  "rsvp.attendingNo": "No, I won't be able to make it",
  "rsvp.partyLabel": "How many are coming with you?",
  "rsvp.partyHint":
    "How many people are coming with you, yourself included. If you can't make it, there's nothing to choose.",
  "rsvp.companionsLegend": "The names of your guests",
  "rsvp.companionsHint":
    "Write the name of each person coming with you. If you don't know yet, you can leave it blank.",
  "rsvp.companionPlaceholder": "Name",
  "rsvp.companionChild": "Child",
  "rsvp.dietaryLabel": "Dietary restrictions (optional)",
  "rsvp.dietaryHint": "Tell us if anyone needs a special menu. You can write up to 300 characters.",
  "rsvp.phoneLabel": "Phone (optional)",
  "rsvp.phoneHint": "Only the host will use it, in case they need to reach you.",
  "rsvp.messageLabel": "Message (optional)",
  "rsvp.messageHint": "You can write up to 280 characters.",
  "rsvp.submit": "Send RSVP",
  "rsvp.honeypot": "Don't fill in this field",
  "rsvp.closedGeneric": "RSVP has closed.",

  "invitation.titleFallback": "Invitation",
  "guestPage.pageTitle": "Your invitation | InvitaMe",
  "guestPage.answerTitle": "Your RSVP",
  "guestPage.partyLabel": "People coming with you (yourself included)",
  "guestPage.messageLabel": "Message (optional)",
  "guestPage.messageHint": "You can write up to 280 characters.",
  "guestPage.submit": "Save my answer",
  "guestPage.answerCurrentNo": "You told us you won't be able to make it.",
  "guestPage.answerPending": "You haven't told us yet whether you can make it.",
  "guestPage.answerHint": "You can change your answer until the deadline.",
  "guestPage.passKicker": "Access pass",
  "guestPage.passTable": "Table",
  "guestPage.passPeople": "Guests",
  "guestPage.passHint": "Show it at the entrance. It's personal: please don't share it.",
  "guestPage.passAlt": "QR code of your access pass",

  "guestbook.title": "Guestbook",
  "guestbook.hint": "Leave your best wishes for whoever is celebrating.",
  "guestbook.nameLabel": "Your name",
  "guestbook.namePlaceholder": "First and last name",
  "guestbook.messageLabel": "Your message",
  "guestbook.messagePlaceholder": "Write your message",
  "guestbook.messageHint": "You can write up to 500 characters.",
  "guestbook.submit": "Sign the guestbook",
  "guestbook.empty": "No messages yet. Be the first to sign!",
  "guestbook.closed": "The guestbook closed when the invitation ended.",
  "guestbook.honeypot": "Don't fill in this field",

  "notice.rsvp.received": "Thank you! We received your answer.",
  "notice.rsvp.invalid": "Please check your answer and try again.",
  "notice.rsvp.closed": "RSVP has already closed.",
  "notice.rsvp.limited":
    "We received many attempts from your connection. Wait a few minutes and try again.",
  "notice.rsvp.unavailable": "We couldn't save your answer. Please try again in a few minutes.",
  "notice.guestbook.signed": "Thank you! Your message is now in the guestbook.",
  "notice.guestbook.invalid": "Please check your name and your message and try again.",
  "notice.guestbook.closed": "The guestbook has already closed.",
  "notice.guestbook.limited":
    "We received many attempts from your connection. Wait a few minutes and try again.",
  "notice.guestbook.unavailable":
    "We couldn't save your message. Please try again in a few minutes.",
  "notice.album.uploaded": "Thank you, your photo will appear once it's approved.",
  "notice.album.invalid":
    "Please check your photo: it must be a JPG, PNG, or WebP file and within the allowed size.",
  "notice.album.closed": "The photo album has already closed.",
  "notice.album.full": "This invitation's photo album is already full.",
  "notice.album.pendingFull": "Many photos are waiting for review. Please try again later.",
  "notice.album.limited":
    "We received many photos from your connection. Wait a few minutes and try again.",
  "notice.album.unavailable": "We couldn't upload your photo. Please try again in a few minutes.",

  "lock.privateTitle": "Private invitation",
  "lock.privateLine": "This invitation is private. Enter the password you were given.",
  "lock.fieldLabel": "Password",
  "lock.submit": "View invitation",
  "lock.hint": "Don't have it? Ask whoever invited you.",
  "lock.rejected": "That password isn't right.",
  "lock.limited": "Too many attempts. Wait a few minutes.",
  "lock.writeRefused": "This invitation asks for a password. Open it again to enter it.",

  "opening.tap": "Tap to open",

  "event.place": "Venue",
  "event.ceremony": "Ceremony",
  "event.reception": "Reception",
  "footer.madeWith": "Made with InvitaMe",
};

/**
 * The interpolated guest texts: counts, dates, names, and the accessible names that wrap them. Each one is a function
 * of the values the page already holds, written once per locale, so an English page never writes a Spanish sentence
 * around a name and a Spanish page never pluralizes like English.
 */
export const SPANISH_GUEST_FORMATS = {
  /** One countdown unit, agreeing with its number: «1 día», «3 días» (S3). */
  countdownDays: (value: number): string => (value === 1 ? "día" : "días"),
  countdownHours: (value: number): string => (value === 1 ? "hora" : "horas"),
  countdownMinutes: (value: number): string => (value === 1 ? "minuto" : "minutos"),
  /** The countdown as one sentence, for the accessible name of the block: «Faltan 4 días y 2 horas». */
  countdownSentence: (
    shown: readonly { readonly value: number; readonly unit: string }[],
  ): string => {
    const chunks = shown.map((part) => `${part.value} ${part.unit}`);
    // «Falta 1 día» but «Faltan 40 minutos»: the verb agrees with the amount it counts.
    const singular = shown.length === 1 && shown[0]?.value === 1;

    return `${singular ? "Falta" : "Faltan"} ${joinSpanish(chunks)}`;
  },
  /** The seats of one invitation, as the answer card states them: «Lugares para 3 personas.» */
  partyLimitNote: (people: number): string =>
    people === 1 ? "Lugares para 1 persona." : `Lugares para ${people} personas.`,
  /** The label of one companion row: «Acompañante 2» (F3). */
  companionRow: (index: number): string => `Acompañante ${index}`,
  /** When the answers close, or that they already closed (S4). */
  deadlineNote: (deadline: string): string => `Confirma antes del ${deadline}.`,
  closedNote: (deadline: string): string => `La confirmación de asistencia cerró el ${deadline}.`,
  /** The answer a guest already gave (G4). */
  answerCurrentYes: (party: number): string =>
    `Nos dijiste que vienen ${party === 1 ? "1 persona" : `${party} personas`}.`,
  /** The share title of one invitation: the celebration's own title in words (A8). */
  invitationTitle: (celebrantName: string): string => `Invitación de ${celebrantName}`,
  invitationCoupleTitle: (first: string, second: string): string => `Boda de ${first} y ${second}`,
  /** The greeting of the personal page: «Hola, Ana». */
  greeting: (firstName: string): string => `Hola, ${firstName}`,
  /** The seats a guest holds: «Tienes 1 lugar reservado a tu nombre.» */
  seatsSentence: (seats: number): string =>
    seats === 1
      ? "Tienes 1 lugar reservado a tu nombre."
      : `Tienes ${seats} lugares reservados a tu nombre.`,
  /** The venue the pass admits the guest to (F5; L8.4). */
  passVenueHint: (venue: string): string => `Muestra este código en la entrada · ${venue}`,
  /** The playlist action, naming the service: «Abrir en Spotify». */
  musicButton: (service: string): string => `Abrir en ${service}`,
  /** The published photos the album holds: «1 foto publicada», «12 fotos publicadas». */
  albumCount: (count: number): string =>
    count === 1 ? "1 foto publicada" : `${count} fotos publicadas`,
  /** The description of one uploaded photo, named by its uploader. */
  albumPhotoAlt: (uploaderName: string | null): string => {
    const name = uploaderName?.trim() ?? "";

    return name === "" ? SPANISH_GUEST_TEXTS["album.altFallback"] : `Foto que subió ${name}`;
  },
  /** The description of one gallery photo: the creator's own words, or the fallback one. */
  galleryPhotoAlt: (alt: string | null): string => {
    const text = alt?.trim() ?? "";

    return text === "" ? SPANISH_GUEST_TEXTS["gallery.alt"] : text;
  },
  /** The accessible name of a store's link. */
  storeLinkAria: (name: string): string =>
    `${SPANISH_GUEST_TEXTS["giftRegistry.viewStore"]} de ${name} en una pestaña nueva`,
  /** The accessible name of a hotel's booking and directions actions (F4). */
  hotelBookAria: (name: string): string => `Reservar en ${name} en una pestaña nueva`,
  hotelDirectionsAria: (name: string): string => `Cómo llegar a ${name} en Google Maps`,
  /** The accessible name of one moment's directions link (F1). */
  itineraryDirectionsAria: (title: string): string => `Cómo llegar a ${title} en Google Maps`,
  /** The accessible name of one place's link, which names its service (S2). */
  mapDirectionsAria: (place: string, service: string): string =>
    `Cómo llegar a ${place} en ${service}`,
  /** The accessible name of the WhatsApp action, naming the celebration. */
  whatsappAria: (title: string): string => `Escribir por WhatsApp sobre ${title}`,
  /** The accessible name of the livestream's open action. */
  livestreamOpenAria: (): string =>
    `${SPANISH_GUEST_TEXTS["livestream.open"]} en una pestaña nueva`,
  /** What the map box says for a guest who cannot see it: one place, or several named by their labels. */
  mapAltOne: (name: string): string => `Mapa de ${name}.`,
  mapAltSeveral: (labels: readonly string[]): string => `Mapa de ${joinSpanish(labels)}.`,
  /** The greeting WhatsApp opens with, naming the celebration (S4). */
  whatsappGreeting: (title: string): string => `¡Hola! Te escribo por la invitación de ${title}.`,
  /** The celebration's own title, per layout: the fixed words the facts carry into the calendar and the envelope. */
  eventBirthdayTitle: (name: string): string => `Cumpleaños de ${name}`,
  eventBabyShowerTitle: (name: string): string => `Baby shower de ${name}`,
  eventBaptismTitle: (name: string): string => `Bautizo de ${name}`,
  eventXvTitle: (name: string): string => `XV años de ${name}`,
  eventWeddingTitle: (first: string, second: string): string => `Boda de ${first} y ${second}`,
} as const;

/** One interpolated text of the dictionary. */
export type GuestFormatKey = keyof typeof SPANISH_GUEST_FORMATS;

/** The whole set of interpolated texts of one locale, typed by the Spanish declaration. */
export type GuestFormats = { readonly [K in GuestFormatKey]: (typeof SPANISH_GUEST_FORMATS)[K] };

/** The same interpolated texts in English: warm, natural, and with English plurals and date words. */
export const ENGLISH_GUEST_FORMATS: GuestFormats = {
  countdownDays: (value: number): string => (value === 1 ? "day" : "days"),
  countdownHours: (value: number): string => (value === 1 ? "hour" : "hours"),
  countdownMinutes: (value: number): string => (value === 1 ? "minute" : "minutes"),
  countdownSentence: (shown): string =>
    `To go: ${joinEnglish(shown.map((part) => `${part.value} ${part.unit}`))}`,
  partyLimitNote: (people: number): string =>
    people === 1 ? "Seats for 1 person." : `Seats for ${people} people.`,
  companionRow: (index: number): string => `Guest ${index}`,
  deadlineNote: (deadline: string): string => `Please answer before ${deadline}.`,
  closedNote: (deadline: string): string => `RSVP closed on ${deadline}.`,
  answerCurrentYes: (party: number): string =>
    `You told us ${party === 1 ? "1 person is" : `${party} people are`} coming.`,
  invitationTitle: (celebrantName: string): string => `${celebrantName}'s invitation`,
  invitationCoupleTitle: (first: string, second: string): string =>
    `${first} and ${second}'s wedding`,
  greeting: (firstName: string): string => `Hi, ${firstName}`,
  seatsSentence: (seats: number): string =>
    seats === 1
      ? "You have 1 seat reserved in your name."
      : `You have ${seats} seats reserved in your name.`,
  passVenueHint: (venue: string): string => `Show this code at the entrance · ${venue}`,
  musicButton: (service: string): string => `Open in ${service}`,
  albumCount: (count: number): string =>
    count === 1 ? "1 photo published" : `${count} photos published`,
  albumPhotoAlt: (uploaderName: string | null): string => {
    const name = uploaderName?.trim() ?? "";

    return name === "" ? ENGLISH_GUEST_TEXTS["album.altFallback"] : `Photo uploaded by ${name}`;
  },
  galleryPhotoAlt: (alt: string | null): string => {
    const text = alt?.trim() ?? "";

    return text === "" ? ENGLISH_GUEST_TEXTS["gallery.alt"] : text;
  },
  storeLinkAria: (name: string): string =>
    `${ENGLISH_GUEST_TEXTS["giftRegistry.viewStore"]} for ${name} in a new tab`,
  hotelBookAria: (name: string): string => `Book ${name} in a new tab`,
  hotelDirectionsAria: (name: string): string => `Directions to ${name} on Google Maps`,
  itineraryDirectionsAria: (title: string): string => `Directions to ${title} on Google Maps`,
  mapDirectionsAria: (place: string, service: string): string =>
    `Directions to ${place} on ${service}`,
  whatsappAria: (title: string): string => `Write on WhatsApp about ${title}`,
  livestreamOpenAria: (): string => `${ENGLISH_GUEST_TEXTS["livestream.open"]} in a new tab`,
  mapAltOne: (name: string): string => `Map of ${name}.`,
  mapAltSeveral: (labels: readonly string[]): string => `Map of ${joinEnglish(labels)}.`,
  whatsappGreeting: (title: string): string => `Hi! I'm writing about the invitation for ${title}.`,
  eventBirthdayTitle: (name: string): string => `${name}'s birthday`,
  eventBabyShowerTitle: (name: string): string => `${name}'s baby shower`,
  eventBaptismTitle: (name: string): string => `${name}'s baptism`,
  eventXvTitle: (name: string): string => `${name}'s quinceañera`,
  eventWeddingTitle: (first: string, second: string): string => `${first} and ${second}'s wedding`,
};

/** `a`, `a y b`, `a, b y c`: the Spanish list of a sentence. */
function joinSpanish(chunks: readonly string[]): string {
  if (chunks.length <= 1) {
    return chunks.join("");
  }

  return `${chunks.slice(0, -1).join(", ")} y ${chunks.at(-1) ?? ""}`;
}

/** `a`, `a and b`, `a, b, and c`: the English list of a sentence. */
function joinEnglish(chunks: readonly string[]): string {
  if (chunks.length <= 1) {
    return chunks.join("");
  }
  if (chunks.length === 2) {
    return `${chunks[0] ?? ""} and ${chunks[1] ?? ""}`;
  }

  return `${chunks.slice(0, -1).join(", ")}, and ${chunks.at(-1) ?? ""}`;
}

/** Both dictionaries, keyed by the locale they render. */
export const GUEST_DICTIONARIES: Readonly<Record<Locale, Readonly<Record<GuestTextKey, string>>>> =
  {
    es: SPANISH_GUEST_TEXTS,
    en: ENGLISH_GUEST_TEXTS,
  };

/** Both sets of interpolated texts, keyed by the locale they render. */
export const GUEST_FORMAT_DICTIONARIES: Readonly<Record<Locale, GuestFormats>> = {
  es: SPANISH_GUEST_FORMATS,
  en: ENGLISH_GUEST_FORMATS,
};

/** Every fixed line the dictionary declares, in the order the Spanish source declares them. */
export function guestTextKeys(): readonly GuestTextKey[] {
  return Object.keys(SPANISH_GUEST_TEXTS) as GuestTextKey[];
}

/**
 * The whole dictionary of one locale, for a component that reads several lines of the same page. It is never a
 * fallback: a locale answers its own texts, and the page already decided which locale it renders (L19.3).
 */
export function guestTexts(locale: Locale): Readonly<Record<GuestTextKey, string>> {
  return GUEST_DICTIONARIES[locale] ?? GUEST_DICTIONARIES[DEFAULT_LOCALE];
}

/** The one fixed line of a locale (L19.2); this accessor, or `guestTexts`, is how a fixed text reaches markup. */
export function guestText(locale: Locale, key: GuestTextKey): string {
  return guestTexts(locale)[key];
}

/** The interpolated texts of one locale, which a component reads once and calls per value. */
export function guestFormats(locale: Locale): GuestFormats {
  return GUEST_FORMAT_DICTIONARIES[locale] ?? GUEST_FORMAT_DICTIONARIES[DEFAULT_LOCALE];
}
