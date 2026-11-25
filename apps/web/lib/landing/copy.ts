/**
 * Spanish product copy of the launch landing (odd/tasks/launch-landing.md; S1-S6), addressed with
 * "tú" in neutral Mexican Spanish. The page sells the product that already exists:
 *
 * - the main action is «Crear mi invitación», a real link to `/cuenta/invitaciones/nueva` (S2);
 * - the gallery names the published occasion lines and their theme counts (S3);
 * - the pricing shows the three seeded packages and the MXN prices the catalog answers live, reading no
 *   amount from this file (S4);
 * - the steps are written in the present tense because choosing, filling, paying, and sharing all
 *   work today (S5);
 * - the FAQ answers the duration, RSVP, payment, and refund questions (S6).
 *
 * Keep every landing string here; `copy.test.ts` checks the rules above. When a claim changes, it
 * changes here first, after the owner reviews it.
 */

/** «Ingresar»: the way into an existing account. */
export interface SignInAction {
  readonly kind: "sign-in";
  readonly label: "Ingresar";
  readonly href: "/ingresar";
}

/** What a signed-in customer sees instead of «Ingresar»: the way back to their account. */
export interface AccountAction {
  readonly kind: "account";
  readonly label: "Mi cuenta";
  readonly href: "/cuenta";
}

/** The primary product action of the landing: it starts a new invitation (S2). */
export interface CreateInvitationAction {
  readonly kind: "create-invitation";
  readonly label: string;
  readonly href: "/cuenta/invitaciones/nueva";
}

export type ProductAction = SignInAction | CreateInvitationAction;

/** The ids of the sections that anchors may scroll to; the page renders each one. */
export const LANDING_SECTION_IDS = [
  "contenido",
  "disenos",
  "precios",
  "como-funciona",
  "faq",
] as const;
export type LandingSectionId = (typeof LANDING_SECTION_IDS)[number];

/** A link that only scrolls to a section of the landing. */
export interface PageAnchor {
  readonly kind: "anchor";
  readonly label: string;
  readonly href: `#${LandingSectionId}`;
}

/** A heading with one accented phrase, set in the wine italic. */
export interface Heading {
  readonly before: string;
  readonly accent: string;
  readonly after?: string;
}

export function headingText({ before, accent, after = "" }: Heading): string {
  return `${before}${accent}${after}`;
}

const SIGN_IN: SignInAction = { kind: "sign-in", label: "Ingresar", href: "/ingresar" };
const ACCOUNT: AccountAction = { kind: "account", label: "Mi cuenta", href: "/cuenta" };

/** «Crear mi invitación»: the main action of the hero, the gallery, the closing band, and the packages. */
export const CREATE_INVITATION: CreateInvitationAction = {
  kind: "create-invitation",
  label: "Crear mi invitación",
  href: "/cuenta/invitaciones/nueva",
};

/** The label of a single package card, where each plan invites the same first step. */
const START_PLAN: CreateInvitationAction = {
  kind: "create-invitation",
  label: "Empezar",
  href: "/cuenta/invitaciones/nueva",
};

/**
 * The landing's account button: «Ingresar» without a session, «Mi cuenta» with one. It only picks a link;
 * `/cuenta` still checks the session on the server and sends an expired one back to `/ingresar`.
 */
export function accountAction(signedIn: boolean): SignInAction | AccountAction {
  return signedIn ? ACCOUNT : SIGN_IN;
}

const TO_DESIGNS: PageAnchor = { kind: "anchor", label: "Diseños", href: "#disenos" };
const TO_PRICING: PageAnchor = { kind: "anchor", label: "Precios", href: "#precios" };
const TO_FAQ: PageAnchor = { kind: "anchor", label: "Dudas", href: "#faq" };
const TO_GALLERY: PageAnchor = { kind: "anchor", label: "Ver diseños", href: "#disenos" };

/** Text printed on the sample stationery; it describes no feature. */
export interface SampleCard {
  readonly kicker?: string;
  readonly name: string;
  readonly date: string;
}

/** The four mini stationery layouts of `stationery.tsx`, one per kind of celebration. */
export type GalleryThumbnail = "garden" | "xv" | "wine" | "party";

/** One occasion card of the gallery: the published line and how many themes it holds (S3). */
export interface GalleryDesign {
  readonly occasion: string;
  readonly name: string;
  readonly detail: string;
  readonly themeCount: number;
  readonly thumbnail: GalleryThumbnail;
  readonly sample: SampleCard;
  readonly action: CreateInvitationAction;
  readonly monogram?: string;
  readonly turns?: string;
  readonly age?: string;
}

/** The key of a seeded package; the ids of the three price cards, matched against the catalog by key (S4). */
export type PackageKey = "basic" | "premium" | "deluxe";

/** One package card: the seeded feature set and the action that starts an invitation (S4). */
export interface PricingPackage {
  readonly key: PackageKey;
  readonly name: string;
  readonly summary: string;
  readonly features: readonly string[];
  readonly action: CreateInvitationAction;
  readonly featured: boolean;
  readonly badge?: string;
}

const GALLERY_DESIGNS: readonly GalleryDesign[] = [
  {
    occasion: "XV años",
    name: "Línea elegante",
    detail: "8 temas",
    themeCount: 8,
    thumbnail: "xv",
    sample: { kicker: "Mis XV años", name: "Valeria", date: "Sábado 14 de marzo · 19:00 h" },
    action: START_PLAN,
  },
  {
    occasion: "Boda",
    name: "Línea elegante",
    detail: "8 temas",
    themeCount: 8,
    thumbnail: "garden",
    sample: { kicker: "Nuestra boda", name: "Ana & Luis", date: "21 de noviembre" },
    action: START_PLAN,
  },
  {
    occasion: "Cumpleaños",
    name: "Temas infantiles",
    detail: "8 temas",
    themeCount: 8,
    thumbnail: "party",
    sample: { name: "Mateo", date: "¡Ven a celebrar!" },
    turns: "cumple",
    age: "5",
    action: START_PLAN,
  },
  {
    occasion: "Baby shower",
    name: "Línea clásica",
    detail: "8 temas",
    themeCount: 8,
    thumbnail: "garden",
    sample: { kicker: "Baby shower", name: "Sofía", date: "Domingo 12 de abril · 12:00 h" },
    action: START_PLAN,
  },
  {
    occasion: "Bautizo",
    name: "Línea clásica",
    detail: "6 temas",
    themeCount: 6,
    thumbnail: "wine",
    sample: { kicker: "Bautizo", name: "Mateo", date: "Sábado 6 de junio · 13:00 h" },
    monogram: "MB",
    action: START_PLAN,
  },
];

const PRICING_PACKAGES: readonly PricingPackage[] = [
  {
    key: "basic",
    name: "Basic",
    summary: "La invitación esencial: fecha, ubicación y un enlace para compartir.",
    features: ["Cuenta regresiva", "Mapa", "Enlace de WhatsApp"],
    action: START_PLAN,
    featured: false,
  },
  {
    key: "premium",
    name: "Premium",
    summary: "Suma música, fotos y confirmación de asistencia para celebrar sin preguntas.",
    features: ["Todo lo de Basic", "Música", "Galería de fotos", "Confirmar asistencia (RSVP)"],
    action: START_PLAN,
    featured: true,
    badge: "El más elegido",
  },
  {
    key: "deluxe",
    name: "Deluxe",
    summary: "Todo el catálogo, con mesa de regalos, lista de invitados y pase con código QR.",
    features: ["Todo lo de Premium", "Mesa de regalos", "Lista de invitados", "Pase con código QR"],
    action: START_PLAN,
    featured: false,
  },
];

export const LANDING_COPY = {
  metadata: {
    title: "InvitaMe | Invitaciones digitales para tu celebración",
    description:
      "Elige un diseño para XV años, boda, cumpleaños, baby shower o bautizo, personalízalo con tus datos y comparte tu invitación en minutos.",
  },
  skipLink: { kind: "anchor", label: "Saltar al contenido", href: "#contenido" } as PageAnchor,
  nav: {
    label: "Principal",
    links: [TO_DESIGNS, TO_PRICING, TO_FAQ],
    signIn: SIGN_IN,
  },
  hero: {
    eyebrow: "Invitaciones digitales",
    heading: {
      before: "Invitaciones que ",
      accent: "enamoran",
      after: " desde el primer vistazo",
    } as Heading,
    lead: "Elige un diseño para XV años, boda, cumpleaños, baby shower o bautizo, personalízalo con tus datos y compártelo en minutos.",
    primary: CREATE_INVITATION,
    secondary: TO_GALLERY,
    notes: ["Sin contraseñas", "Pagas en pesos (MXN)", "Lista hoy mismo"],
    illustrationLabel:
      "Ilustración de muestra: invitaciones de XV años, boda y cumpleaños que salen de un sobre con sello de cera, junto a un celular con una invitación abierta.",
    monogram: "IM",
    xv: {
      kicker: "Mis XV años",
      name: "Valeria",
      date: "Sábado 14 de marzo · 19:00 h",
    } as SampleCard,
    wedding: { kicker: "Nuestra boda", name: "Ana & Luis", date: "21 de noviembre" } as SampleCard,
    birthday: { name: "Mateo", date: "¡Ven a celebrar!", turns: "cumple", age: "5" },
    phone: {
      kicker: "Mis XV años",
      name: "Valeria",
      date: "Sábado 14 de marzo · 19:00 h",
      countdownLabel: "Faltan 23 días",
      countdown: [
        { value: "23", unit: "días" },
        { value: "08", unit: "horas" },
        { value: "45", unit: "min" },
      ],
      reply: "Confirmar asistencia",
    },
  },
  gallery: {
    eyebrow: "Galería",
    heading: { before: "Diseños para cada ", accent: "celebración" } as Heading,
    intro:
      "Cada ocasión tiene su propia línea de temas, elegidos uno a uno. Empieza por la que vas a celebrar.",
    designs: GALLERY_DESIGNS,
  },
  pricing: {
    eyebrow: "Paquetes",
    heading: { before: "Elige tu ", accent: "paquete" } as Heading,
    intro:
      "Un solo pago por invitación. Cada paquete incluye cuenta regresiva, mapa y enlace de WhatsApp; los demás suman funciones.",
    note: "Precios en pesos mexicanos (MXN), por invitación.",
    /** The line of a card whose package the administration has not priced yet, or whose read failed (S4). */
    unknownPrice: "Precio por definir",
    packages: PRICING_PACKAGES,
  },
  steps: {
    eyebrow: "Cuatro pasos",
    heading: { before: "Cómo ", accent: "funciona" } as Heading,
    intro: "De cero a compartida en cuatro pasos.",
    items: [
      {
        title: "Elige un diseño",
        body: "Filtra por ocasión y quédate con el tema que más te guste.",
      },
      {
        title: "Llena tus datos",
        body: "Escribe nombres, fecha, lugar y los detalles que quieras compartir.",
      },
      {
        title: "Paga y publica",
        body: "Paga con tarjeta en pesos mexicanos y publica tu invitación al instante.",
      },
      {
        title: "Comparte el enlace",
        body: "Manda el enlace por WhatsApp o por donde prefieras; tus invitados la abren sin instalar nada.",
      },
    ],
  },
  faq: {
    eyebrow: "Dudas",
    heading: { before: "Preguntas ", accent: "frecuentes" } as Heading,
    intro: "Lo que más nos preguntan antes de empezar.",
    items: [
      {
        question: "¿Cuánto tiempo dura mi invitación?",
        answer:
          "Según tu paquete: Basic 30 días, Premium 90 días y Deluxe 180 días desde que la publicas. Después sigue visible, pero se cierra la confirmación de asistencia.",
      },
      {
        question: "¿Cómo confirman mis invitados?",
        answer:
          "Con el RSVP, incluido en Premium y Deluxe. Reciben tu enlace y confirman sin crear cuenta.",
      },
      {
        question: "¿Cómo pago?",
        answer:
          "Con tarjeta a través de Mercado Pago, en pesos mexicanos. No guardamos los datos de tu tarjeta.",
      },
      {
        question: "¿Puedo pedir un reembolso?",
        answer:
          "Una vez publicada, la invitación no es reembolsable. Antes de publicar puedes editarla o archivarla sin costo.",
      },
    ],
  },
  closing: {
    heading: "Tu celebración merece una invitación inolvidable",
    body: "Elige el diseño, llena tus datos y comparte el enlace. En minutos tienes tu invitación lista para enviar.",
    create: CREATE_INVITATION,
    account: SIGN_IN,
  },
  footer: {
    label: "Pie de página",
    links: [TO_DESIGNS, TO_PRICING, TO_FAQ],
    signIn: SIGN_IN,
    copyright: (year: number) => `© ${year} InvitaMe · Hecho con cariño`,
  },
} as const;
