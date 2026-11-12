/**
 * Spanish product copy of the landing page (M2 T8l; S37, L45), addressed with "tú" in neutral Mexican
 * Spanish. The landing is an honest pre-launch page: today only customer sign-in, the own account,
 * and the administrator pages exist, so
 *
 * - «Ingresar» (to `/ingresar`) is the only active product action;
 * - every other product action is a `ComingSoonAction` labeled «Próximamente» that goes nowhere;
 * - in-page anchors only scroll to a section of the page;
 * - features that do not exist yet are described in the future tense or shown as examples.
 *
 * Keep every landing string here; `copy.test.ts` checks the rules above. When a feature ships, its
 * section changes here, after the owner reviews the claim.
 */

/** The only active product action of the landing. */
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

/** A product action that does not exist yet: shown, never a link or a button. */
export interface ComingSoonAction {
  readonly kind: "coming-soon";
  readonly label: "Próximamente";
}

export type ProductAction = SignInAction | ComingSoonAction;

/** The ids of the sections that anchors may scroll to; the page renders each one. */
export const LANDING_SECTION_IDS = ["contenido", "disenos", "como-funcionara"] as const;
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
const COMING_SOON: ComingSoonAction = { kind: "coming-soon", label: "Próximamente" };
const ACCOUNT: AccountAction = { kind: "account", label: "Mi cuenta", href: "/cuenta" };

/**
 * The landing's account button: «Ingresar» without a session, «Mi cuenta» with one. It only picks a link;
 * `/cuenta` still checks the session on the server and sends an expired one back to `/ingresar`.
 */
export function accountAction(signedIn: boolean): SignInAction | AccountAction {
  return signedIn ? ACCOUNT : SIGN_IN;
}

const TO_DESIGNS: PageAnchor = { kind: "anchor", label: "Diseños de muestra", href: "#disenos" };
const TO_STEPS: PageAnchor = { kind: "anchor", label: "Así funcionará", href: "#como-funcionara" };

/** Text printed on the sample stationery; it describes no feature. */
export interface SampleCard {
  readonly kicker?: string;
  readonly name: string;
  readonly date: string;
}

export const LANDING_COPY = {
  metadata: {
    title: "InvitaMe | Invitaciones digitales, próximamente",
    description:
      "Estamos preparando InvitaMe, invitaciones digitales para XV años, bodas y cumpleaños. Mira los diseños de muestra y conoce cómo funcionará.",
  },
  skipLink: { kind: "anchor", label: "Saltar al contenido", href: "#contenido" } as PageAnchor,
  nav: {
    label: "Principal",
    links: [TO_DESIGNS, TO_STEPS],
    signIn: SIGN_IN,
  },
  hero: {
    eyebrow: "Invitaciones digitales",
    heading: {
      before: "Invitaciones que ",
      accent: "enamoran",
      after: " desde el primer vistazo",
    } as Heading,
    lead: "Muy pronto podrás elegir un diseño para XV años, bodas o cumpleaños, personalizarlo y compartirlo con tus invitados.",
    primary: { kind: "anchor", label: "Ver diseños de muestra", href: "#disenos" } as PageAnchor,
    secondary: TO_STEPS,
    notes: [
      "Lanzamiento próximamente",
      "Ya puedes ingresar con tu correo",
      "Sin contraseñas: te enviamos un código",
    ],
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
  occasions: {
    label: "Ocasiones",
    lead: "Para cada celebración",
    items: ["XV años", "Bodas", "Cumpleaños infantiles"],
  },
  gallery: {
    badge: "Próximamente",
    heading: { before: "Diseños de ", accent: "muestra" } as Heading,
    intro:
      "Así se verán algunas de las invitaciones que estamos preparando. Podrás elegirlas y personalizarlas cuando abramos.",
    designs: [
      {
        tag: "Boda",
        name: "Jardín de rosas",
        sample: {
          kicker: "Nuestra boda",
          name: "Sofía & Diego",
          date: "12 de junio",
        } as SampleCard,
        action: COMING_SOON,
      },
      {
        tag: "XV años",
        name: "Vals en rosa",
        sample: {
          kicker: "Mis XV años",
          name: "Camila",
          date: "Sábado 9 de mayo · 20:00 h",
        } as SampleCard,
        action: COMING_SOON,
      },
      {
        tag: "Boda",
        name: "Sello de vino",
        sample: {
          kicker: "Nuestra boda",
          name: "Regina & Pablo",
          date: "3 de octubre",
        } as SampleCard,
        monogram: "RP",
        action: COMING_SOON,
      },
      {
        tag: "Cumpleaños",
        name: "Fiesta de globos",
        sample: { name: "Emilia", date: "¡Ven a celebrar!" } as SampleCard,
        turns: "cumple",
        age: "3",
        action: COMING_SOON,
      },
    ],
  },
  steps: {
    eyebrow: "Tres pasos",
    heading: { before: "Así ", accent: "funcionará" } as Heading,
    intro:
      "Cuando abramos, pasarás de la idea al enlace en una tarde tranquila, sin diseñadores ni imprentas.",
    items: [
      {
        title: "Elegirás tu diseño",
        body: "Explorarás diseños de XV años, bodas y cumpleaños y te quedarás con el que te enamore.",
      },
      {
        title: "Personalizarás cada detalle",
        body: "Escribirás los nombres, la fecha, el salón y tu mensaje, y verás el resultado al instante.",
      },
      {
        title: "La compartirás con un enlace",
        body: "Tus invitados la abrirán en su celular y podrán confirmar su asistencia.",
      },
    ],
  },
  experience: {
    eyebrow: "La experiencia",
    heading: { before: "Tus invitados ", accent: "lo vivirán así" } as Heading,
    intro:
      "Al abrir el enlace, la invitación se desplegará como papel fino: portada, cuenta regresiva, ubicación y confirmación de asistencia.",
    perks: [
      { title: "Cuenta regresiva", body: "Cada visita les recordará cuántos días faltan." },
      { title: "Cómo llegar", body: "El salón y la ubicación estarán siempre a la mano." },
      { title: "Confirmación en un toque", body: "Verás quién confirma su asistencia." },
    ],
    phoneBadge: "Ejemplo de invitación",
    phoneLabel:
      "Ejemplo de invitación en un celular: portada de la boda de Ana y Luis, fecha, salón, cuenta regresiva y un botón para confirmar asistencia.",
    countdownChip: { value: "23 días", label: "para el gran día" },
    phone: {
      kicker: "Nuestra boda",
      name: "Ana & Luis",
      date: "Sábado 21 de noviembre · 18:00 h",
      venue: "Salón Jardín Las Rosas",
      venueNote: "Recepción desde las 20:00 h",
      countdownLabel: "Faltan 23 días",
      countdown: [
        { value: "23", unit: "días" },
        { value: "06", unit: "horas" },
        { value: "41", unit: "min" },
        { value: "12", unit: "seg" },
      ],
      reply: "Confirmar asistencia",
    },
  },
  closing: {
    heading: "Tu celebración merece una invitación inolvidable",
    body: "Estamos preparando InvitaMe para tu próxima celebración. Mientras tanto, ya puedes ingresar con tu correo.",
    signIn: SIGN_IN,
    upcoming: { feature: "Crear tu invitación", action: COMING_SOON },
  },
  footer: {
    label: "Pie de página",
    links: [TO_DESIGNS, TO_STEPS],
    signIn: SIGN_IN,
    copyright: (year: number) => `© ${year} InvitaMe · Hecho con cariño`,
  },
} as const;
