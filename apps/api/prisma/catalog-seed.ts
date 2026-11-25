import type { Prisma, PrismaClient } from "@prisma/client";
import { PackageStatus, TemplateStatus, TemplateVersionStatus } from "@prisma/client";
import {
  omittableSectionsExtension,
  omittedSectionsProperty,
} from "../src/catalog/domain/omittable-section-groups";
import {
  BABY_SHOWER_THEMES,
  type BabyShowerTheme,
} from "../src/catalog/domain/renderers/baby-shower-themes";
import { BAPTISM_THEMES, type BaptismTheme } from "../src/catalog/domain/renderers/baptism-themes";
import {
  BIRTHDAY_THEMES,
  type BirthdayTheme,
} from "../src/catalog/domain/renderers/birthday-themes";
import { ELEGANT_THEMES, type ElegantTheme } from "../src/catalog/domain/renderers/elegant-themes";

// Seeds the base catalog (M3 T2; S7). It only creates what is missing: a row whose key (or composite
// key) already exists is never updated, reactivated, or deleted, because an administrator may have
// changed it on purpose. Prices are not seeded: amounts are set through the admin API (L4).
// The layouts and themes come from the renderer allow-lists (S2, S8, S13): one template per layout and
// theme, each with a PUBLISHED version 1 only when this run creates the template.

const CATEGORY_SEEDS = [
  {
    key: "birthday",
    name: "Cumpleaños",
    description: "Celebraciones personales para todas las edades.",
  },
  {
    key: "wedding",
    name: "Boda",
    description: "Celebraciones de unión y momentos compartidos.",
  },
  {
    key: "quinceanera",
    name: "XV años",
    description: "Celebraciones de quince años con un estilo elegante.",
  },
  {
    key: "baby-shower",
    name: "Baby shower",
    description: "Bienvenidas para nuevas familias.",
  },
  {
    key: "baptism",
    name: "Bautizos",
    description: "Ceremonias de bautizo para compartir en familia.",
  },
  {
    key: "graduation",
    name: "Graduación",
    description: "Logros académicos y nuevos comienzos.",
  },
  {
    key: "anniversary",
    name: "Aniversario",
    description: "Fechas que merecen volver a celebrarse.",
  },
  {
    key: "corporate-event",
    name: "Evento corporativo",
    description: "Encuentros profesionales con una identidad clara.",
  },
] as const;

const FEATURE_SEEDS = [
  {
    key: "COUNTDOWN",
    name: "Cuenta regresiva",
    description: "Un contador para acompañar la espera hasta el evento.",
  },
  {
    key: "MUSIC",
    name: "Música",
    description: "Una selección musical para ambientar la invitación.",
  },
  {
    key: "GALLERY",
    name: "Galería",
    description: "Un espacio visual para compartir imágenes del evento.",
  },
  {
    key: "MAP",
    name: "Mapa",
    description: "Una referencia clara para llegar a la ubicación.",
  },
  {
    key: "RSVP",
    name: "Confirmación de asistencia",
    description: "Una opción para confirmar la asistencia al evento.",
  },
  {
    key: "WHATSAPP",
    name: "WhatsApp",
    description: "Un acceso directo para comunicarse con la organización.",
  },
  {
    key: "GIFT_REGISTRY",
    name: "Mesa de regalos",
    description: "Información para compartir opciones de regalos.",
  },
  {
    key: "GUEST_LIST",
    name: "Lista de invitados",
    description: "Una lista para organizar a las personas invitadas.",
  },
  {
    key: "QR_PASS",
    name: "Pase con código QR",
    description: "Un pase digital con código QR para el acceso.",
  },
] as const;

const PACKAGE_SEEDS = [
  {
    key: "basic",
    name: "Basic",
    description: "Una selección inicial para empezar a planificar.",
    // S1: «Básico 30 días». Each package states its own lifetime, counted from the publication instant.
    durationDays: 30,
    featureKeys: ["COUNTDOWN", "MAP", "WHATSAPP"],
  },
  {
    key: "premium",
    name: "Premium",
    description: "Más recursos para una experiencia visual completa.",
    // S1: «Premium 90 días».
    durationDays: 90,
    featureKeys: ["COUNTDOWN", "MUSIC", "GALLERY", "MAP", "RSVP", "WHATSAPP"],
  },
  {
    key: "deluxe",
    name: "Deluxe",
    description: "El catálogo más amplio para celebraciones con más necesidades.",
    // S1: «Deluxe 180 días».
    durationDays: 180,
    featureKeys: [
      "COUNTDOWN",
      "MUSIC",
      "GALLERY",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "GIFT_REGISTRY",
      "GUEST_LIST",
      "QR_PASS",
    ],
  },
] as const;

/**
 * The content schema every birthday layout shares: the eight invitation fields with the same types, limits,
 * and required list, so the creator form is the same for all of them (S8).
 */
const BIRTHDAY_BASE_CONTENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["celebrantName", "age", "date", "time", "location", "address", "mainPhoto", "message"],
  properties: {
    celebrantName: {
      type: "string",
      title: "Nombre de la persona festejada",
      minLength: 1,
      maxLength: 80,
    },
    age: {
      type: "integer",
      title: "Edad",
      minimum: 1,
      maximum: 120,
    },
    date: {
      type: "string",
      title: "Fecha",
      format: "date",
    },
    time: {
      type: "string",
      title: "Hora",
      pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
    },
    location: {
      type: "string",
      title: "Lugar",
      minLength: 1,
      maxLength: 120,
    },
    address: {
      type: "string",
      title: "Dirección",
      minLength: 1,
      maxLength: 200,
    },
    mainPhoto: {
      type: "string",
      title: "Foto principal",
      format: "uri",
    },
    message: {
      type: "string",
      title: "Mensaje",
      minLength: 1,
      maxLength: 500,
    },
  },
} satisfies Prisma.InputJsonObject;

/**
 * The version schema the seed publishes for every birthday template: the base schema above
 * plus the birthday omittable sections, the sets that keep one group shown, and the
 * `omittedSections` property that stores the omitted keys (S8.1-S8.4). The seed writes it as
 * version 1 of a template it creates.
 */
export const BIRTHDAY_CONTENT_SCHEMA = {
  ...BIRTHDAY_BASE_CONTENT_SCHEMA,
  ...omittableSectionsExtension("birthday"),
  properties: {
    ...BIRTHDAY_BASE_CONTENT_SCHEMA.properties,
    omittedSections: omittedSectionsProperty("birthday"),
  },
} satisfies Prisma.InputJsonObject;

/**
 * The content schema of the `baby-shower-classic-01` layout (S13): a baby shower announces no age, so the
 * hosts, the date and time, the place, the message, and who confirms attendance are required, while the
 * baby's name, the gender reveal, the gift registry, and the main photo are optional. Every required string
 * is bounded like the birthday fields; an optional string declares no `minLength`, so an empty value is valid
 * and renders nothing, except `mainPhoto`, which declares `format: "uri"` and must be omitted instead of
 * sent empty.
 */
const BABY_SHOWER_BASE_CONTENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["hosts", "date", "time", "location", "address", "message", "rsvpContact"],
  properties: {
    hosts: {
      type: "string",
      title: "Anfitrionas o anfitriones",
      minLength: 1,
      maxLength: 120,
    },
    date: {
      type: "string",
      title: "Fecha",
      format: "date",
    },
    time: {
      type: "string",
      title: "Hora",
      pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
    },
    location: {
      type: "string",
      title: "Lugar",
      minLength: 1,
      maxLength: 120,
    },
    address: {
      type: "string",
      title: "Dirección",
      minLength: 1,
      maxLength: 200,
    },
    message: {
      type: "string",
      title: "Mensaje",
      minLength: 1,
      maxLength: 500,
    },
    rsvpContact: {
      type: "string",
      title: "Confirmar asistencia",
      minLength: 1,
      maxLength: 120,
    },
    babyName: {
      type: "string",
      title: "Nombre del bebé",
      maxLength: 80,
    },
    genderReveal: {
      type: "boolean",
      title: "Revelación de género",
    },
    // A gift registry is short free text or a URL: “Tienda, código y enlace” on the board, so it is a
    // bounded string instead of `format: "uri"`, which would refuse a store name and a code.
    giftRegistry: {
      type: "string",
      title: "Mesa de regalos",
      maxLength: 200,
    },
    mainPhoto: {
      type: "string",
      title: "Foto principal",
      format: "uri",
    },
  },
} satisfies Prisma.InputJsonObject;

/**
 * The version schema the seed publishes for every baby shower template: the base schema above
 * plus the baby shower omittable sections, the sets that keep one group shown, and the
 * `omittedSections` property that stores the omitted keys (S8.1-S8.4). The seed writes it as
 * version 1 of a template it creates.
 */
export const BABY_SHOWER_CONTENT_SCHEMA = {
  ...BABY_SHOWER_BASE_CONTENT_SCHEMA,
  ...omittableSectionsExtension("babyShower"),
  properties: {
    ...BABY_SHOWER_BASE_CONTENT_SCHEMA.properties,
    omittedSections: omittedSectionsProperty("babyShower"),
  },
} satisfies Prisma.InputJsonObject;

/**
 * The content schema of the `baptism-classic-01` layout (S13): a baptism announces a person instead of an
 * age and usually happens in two places, so the ceremony and the reception are separate required blocks of
 * place, address, and time, together with the parents, the godparents, the message, and who confirms
 * attendance. The main photo and the gift registry are optional, bounded the same way as the baby shower ones.
 */
const BAPTISM_BASE_CONTENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "celebrantName",
    "date",
    "parents",
    "godparents",
    "ceremonyPlace",
    "ceremonyAddress",
    "ceremonyTime",
    "receptionPlace",
    "receptionAddress",
    "receptionTime",
    "message",
    "rsvpContact",
  ],
  properties: {
    celebrantName: {
      type: "string",
      title: "Nombre de la persona bautizada",
      minLength: 1,
      maxLength: 80,
    },
    date: {
      type: "string",
      title: "Fecha",
      format: "date",
    },
    parents: {
      type: "string",
      title: "Padres",
      minLength: 1,
      maxLength: 160,
    },
    godparents: {
      type: "string",
      title: "Padrinos",
      minLength: 1,
      maxLength: 160,
    },
    ceremonyPlace: {
      type: "string",
      title: "Lugar de la ceremonia",
      minLength: 1,
      maxLength: 120,
    },
    ceremonyAddress: {
      type: "string",
      title: "Dirección de la ceremonia",
      minLength: 1,
      maxLength: 200,
    },
    ceremonyTime: {
      type: "string",
      title: "Hora de la ceremonia",
      pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
    },
    receptionPlace: {
      type: "string",
      title: "Lugar de la recepción",
      minLength: 1,
      maxLength: 120,
    },
    receptionAddress: {
      type: "string",
      title: "Dirección de la recepción",
      minLength: 1,
      maxLength: 200,
    },
    receptionTime: {
      type: "string",
      title: "Hora de la recepción",
      pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
    },
    message: {
      type: "string",
      title: "Mensaje",
      minLength: 1,
      maxLength: 500,
    },
    rsvpContact: {
      type: "string",
      title: "Confirmar asistencia",
      minLength: 1,
      maxLength: 120,
    },
    mainPhoto: {
      type: "string",
      title: "Foto principal",
      format: "uri",
    },
    giftRegistry: {
      type: "string",
      title: "Mesa de regalos",
      maxLength: 200,
    },
  },
} satisfies Prisma.InputJsonObject;

/**
 * The version schema the seed publishes for every baptism template: the base schema above
 * plus the baptism omittable sections, the sets that keep one group shown, and the
 * `omittedSections` property that stores the omitted keys (S8.1-S8.4). The seed writes it as
 * version 1 of a template it creates.
 */
export const BAPTISM_CONTENT_SCHEMA = {
  ...BAPTISM_BASE_CONTENT_SCHEMA,
  ...omittableSectionsExtension("baptism"),
  properties: {
    ...BAPTISM_BASE_CONTENT_SCHEMA.properties,
    omittedSections: omittedSectionsProperty("baptism"),
  },
} satisfies Prisma.InputJsonObject;

/**
 * The content schema of the `xv-arch-01` layout (S4), the elegant «Arco y foto» form for XV años, from
 * `design/elegant-line/05-datos-por-ocasion.html`. A fifteenth birthday announces the celebrant and never an
 * age, because the age is always fifteen, and it has the same two-place shape as the themed baptism: the
 * ceremony and the reception are separate required blocks of place, address, and time. The parents, the honor
 * sponsors, the dress code, the message, and who confirms attendance are required; the chambelanes, the gift
 * registry, and the main photo are optional. Lists are one bounded text field with one name per line, because
 * the renderer contract only declares primitive fields. An optional string declares no `minLength`, so an empty
 * value is valid and renders nothing, except `mainPhoto`, which declares `format: "uri"` and must be omitted
 * instead of sent empty.
 */
const XV_ARCH_BASE_CONTENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "celebrantName",
    "date",
    "parents",
    "honorSponsors",
    "ceremonyPlace",
    "ceremonyAddress",
    "ceremonyTime",
    "receptionPlace",
    "receptionAddress",
    "receptionTime",
    "dressCode",
    "message",
    "rsvpContact",
  ],
  properties: {
    celebrantName: {
      type: "string",
      title: "Nombre de la festejada",
      minLength: 1,
      maxLength: 80,
    },
    date: {
      type: "string",
      title: "Fecha",
      format: "date",
    },
    parents: {
      type: "string",
      title: "Padres",
      description: "Un nombre por línea.",
      minLength: 1,
      maxLength: 400,
    },
    honorSponsors: {
      type: "string",
      title: "Padrinos de honor",
      description: "Un nombre por línea.",
      minLength: 1,
      maxLength: 400,
    },
    ceremonyPlace: {
      type: "string",
      title: "Lugar de la misa",
      minLength: 1,
      maxLength: 120,
    },
    ceremonyAddress: {
      type: "string",
      title: "Dirección de la misa",
      minLength: 1,
      maxLength: 200,
    },
    ceremonyTime: {
      type: "string",
      title: "Hora de la misa",
      pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
    },
    receptionPlace: {
      type: "string",
      title: "Lugar de la recepción",
      minLength: 1,
      maxLength: 120,
    },
    receptionAddress: {
      type: "string",
      title: "Dirección de la recepción",
      minLength: 1,
      maxLength: 200,
    },
    receptionTime: {
      type: "string",
      title: "Hora de la recepción",
      pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
    },
    dressCode: {
      type: "string",
      title: "Código de vestimenta",
      minLength: 1,
      maxLength: 120,
    },
    message: {
      type: "string",
      title: "Mensaje",
      minLength: 1,
      maxLength: 500,
    },
    rsvpContact: {
      type: "string",
      title: "Confirmar asistencia",
      minLength: 1,
      maxLength: 120,
    },
    chambelanes: {
      type: "string",
      title: "Chambelanes",
      description: "Un nombre por línea.",
      maxLength: 400,
    },
    giftRegistry: {
      type: "string",
      title: "Mesa de regalos",
      maxLength: 200,
    },
    mainPhoto: {
      type: "string",
      title: "Foto principal",
      format: "uri",
    },
  },
} satisfies Prisma.InputJsonObject;

/**
 * The version schema the seed publishes for every XV años template: the base schema above
 * plus the XV años omittable sections, the sets that keep one group shown, and the
 * `omittedSections` property that stores the omitted keys (S8.1-S8.4). The seed writes it as
 * version 1 of a template it creates.
 */
export const XV_ARCH_CONTENT_SCHEMA = {
  ...XV_ARCH_BASE_CONTENT_SCHEMA,
  ...omittableSectionsExtension("xv"),
  properties: {
    ...XV_ARCH_BASE_CONTENT_SCHEMA.properties,
    omittedSections: omittedSectionsProperty("xv"),
  },
} satisfies Prisma.InputJsonObject;

/**
 * The content schema of the `wedding-arch-01` layout (S4), the elegant «Arco y foto» form for weddings, from
 * `design/elegant-line/05-datos-por-ocasion.html`. A wedding announces the couple in two names and has the
 * same two-place shape as XV años: the ceremony and the reception are separate required blocks of place,
 * address, and time. The dress code, the message, and who confirms attendance are required. The two families,
 * the wedding sponsors, the gift registry, the main photo, and the hashtag are optional, with the same bounds
 * and the same one-name-per-line rule for the lists as the XV años schema.
 */
const WEDDING_ARCH_BASE_CONTENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "coupleNameOne",
    "coupleNameTwo",
    "date",
    "ceremonyPlace",
    "ceremonyAddress",
    "ceremonyTime",
    "receptionPlace",
    "receptionAddress",
    "receptionTime",
    "dressCode",
    "message",
    "rsvpContact",
  ],
  properties: {
    coupleNameOne: {
      type: "string",
      title: "Primer nombre de la pareja",
      minLength: 1,
      maxLength: 80,
    },
    coupleNameTwo: {
      type: "string",
      title: "Segundo nombre de la pareja",
      minLength: 1,
      maxLength: 80,
    },
    date: {
      type: "string",
      title: "Fecha",
      format: "date",
    },
    ceremonyPlace: {
      type: "string",
      title: "Lugar de la ceremonia",
      minLength: 1,
      maxLength: 120,
    },
    ceremonyAddress: {
      type: "string",
      title: "Dirección de la ceremonia",
      minLength: 1,
      maxLength: 200,
    },
    ceremonyTime: {
      type: "string",
      title: "Hora de la ceremonia",
      pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
    },
    receptionPlace: {
      type: "string",
      title: "Lugar de la recepción",
      minLength: 1,
      maxLength: 120,
    },
    receptionAddress: {
      type: "string",
      title: "Dirección de la recepción",
      minLength: 1,
      maxLength: 200,
    },
    receptionTime: {
      type: "string",
      title: "Hora de la recepción",
      pattern: "^([01]\\d|2[0-3]):[0-5]\\d$",
    },
    dressCode: {
      type: "string",
      title: "Código de vestimenta",
      minLength: 1,
      maxLength: 120,
    },
    message: {
      type: "string",
      title: "Mensaje",
      minLength: 1,
      maxLength: 500,
    },
    rsvpContact: {
      type: "string",
      title: "Confirmar asistencia",
      minLength: 1,
      maxLength: 120,
    },
    firstFamilyParents: {
      type: "string",
      title: "Padres de una parte",
      description: "Un nombre por línea.",
      maxLength: 400,
    },
    secondFamilyParents: {
      type: "string",
      title: "Padres de la otra parte",
      description: "Un nombre por línea.",
      maxLength: 400,
    },
    weddingSponsors: {
      type: "string",
      title: "Padrinos",
      description: "Un nombre por línea.",
      maxLength: 400,
    },
    giftRegistry: {
      type: "string",
      title: "Mesa de regalos",
      maxLength: 200,
    },
    mainPhoto: {
      type: "string",
      title: "Foto principal",
      format: "uri",
    },
    hashtag: {
      type: "string",
      title: "Hashtag",
      maxLength: 60,
    },
  },
} satisfies Prisma.InputJsonObject;

/**
 * The version schema the seed publishes for every wedding template: the base schema above
 * plus the wedding omittable sections, the sets that keep one group shown, and the
 * `omittedSections` property that stores the omitted keys (S8.1-S8.4). The seed writes it as
 * version 1 of a template it creates.
 */
export const WEDDING_ARCH_CONTENT_SCHEMA = {
  ...WEDDING_ARCH_BASE_CONTENT_SCHEMA,
  ...omittableSectionsExtension("wedding"),
  properties: {
    ...WEDDING_ARCH_BASE_CONTENT_SCHEMA.properties,
    omittedSections: omittedSectionsProperty("wedding"),
  },
} satisfies Prisma.InputJsonObject;

/** One seeded template and the version 1 it receives when this run creates the template. */
export interface CatalogTemplateSeed {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly componentKey: string;
  readonly schema: Prisma.InputJsonObject;
  readonly configuration: Prisma.InputJsonObject;
}

/** A themed template: one layout key plus the theme it applies (S2, S8, S13). */
export interface ThemedTemplateSeed<TTheme extends string> extends CatalogTemplateSeed {
  readonly theme: TTheme;
}

/** A birthday layout template: one layout key plus the theme it applies (S2, S8). */
export type BirthdayLayoutTemplateSeed = ThemedTemplateSeed<BirthdayTheme>;

/** A baby shower template: the «Clásica» layout plus the theme it applies (S13). */
export type BabyShowerTemplateSeed = ThemedTemplateSeed<BabyShowerTheme>;

/** A themed baptism template: the «Clásica» layout plus the theme it applies (S13). */
export type BaptismTemplateSeed = ThemedTemplateSeed<BaptismTheme>;

/** An elegant template of one layout and occasion plus the elegant theme it applies (S4, S5). */
export type ElegantTemplateSeed = ThemedTemplateSeed<ElegantTheme>;

/** An elegant «Arco y foto» template for one occasion plus the elegant theme it applies (S4). */
export type ElegantArchTemplateSeed = ElegantTemplateSeed;

/** One row per layout the catalog publishes; its key, Spanish label, and short neutral description (S8). */
const BIRTHDAY_LAYOUT_SEEDS = [
  {
    slug: "map",
    componentKey: "birthday-map-01",
    label: "Mapa",
    description:
      "Un mapa con los detalles de la fiesta para invitaciones de cumpleaños infantiles.",
  },
  {
    slug: "poster",
    componentKey: "birthday-poster-01",
    label: "Cartel",
    description: "Un cartel festivo que pone los datos del cumpleaños en primer plano.",
  },
  {
    slug: "story",
    componentKey: "birthday-story-01",
    label: "Cuento",
    description: "Un cuento ilustrado que narra la fiesta de cumpleaños paso a paso.",
  },
] as const;

/** The Spanish display name of each theme; the keys and their order come from the renderer allow-list. */
const BIRTHDAY_THEME_NAMES: Readonly<Record<BirthdayTheme, string>> = {
  "ice-kingdom": "Reino de hielo",
  "rescue-team": "Equipo de rescate",
  "spider-hero": "Héroe arácnido",
  "classic-mouse": "Ratón clásico",
  dinosaurs: "Dinosaurios",
  "under-the-sea": "Bajo el mar",
  "fairytale-princess": "Princesa de cuento",
  "blocks-and-pixels": "Bloques y píxeles",
};

/**
 * One published birthday layout template per layout and theme (3 layouts x 8 themes), in the theme order
 * the owner chose (S8). Every template shares the birthday content schema and takes exactly
 * `{ componentKey, theme }` as configuration. Catalog names stay generic: a theme name never names a
 * character or a brand (S5).
 */
export const BIRTHDAY_LAYOUT_TEMPLATE_SEEDS: readonly BirthdayLayoutTemplateSeed[] =
  BIRTHDAY_LAYOUT_SEEDS.flatMap((layout) =>
    BIRTHDAY_THEMES.map((theme) => ({
      key: `birthday-${layout.slug}-${theme}`,
      name: `${layout.label} · ${BIRTHDAY_THEME_NAMES[theme]}`,
      description: layout.description,
      componentKey: layout.componentKey,
      schema: BIRTHDAY_CONTENT_SCHEMA,
      configuration: { componentKey: layout.componentKey, theme },
      theme,
    })),
  );

/** The Spanish display name of each baby shower theme; keys and order come from its renderer allow-list. */
const BABY_SHOWER_THEME_NAMES: Readonly<Record<BabyShowerTheme, string>> = {
  "teddy-honey": "Osito y miel",
  "clouds-stars": "Nubes y estrellas",
  "baby-safari": "Safari bebé",
  "hot-air-balloons": "Globos aerostáticos",
  "boho-rainbow": "Arcoíris boho",
  "little-moon": "Lunita",
  "woodland-friends": "Amigos del bosque",
  "sweet-bunny": "Conejito dulce",
};

/** The Spanish display name of each themed baptism theme; keys and order come from its renderer allow-list. */
const BAPTISM_THEME_NAMES: Readonly<Record<BaptismTheme, string>> = {
  "dove-olive": "Paloma y olivo",
  "little-angels": "Angelitos",
  "sky-clouds": "Cielo y nubes",
  "soft-floral": "Floral suave",
  "little-lamb": "Corderito",
  "star-light": "Luz de estrella",
};

/**
 * The «Clásica» baby shower layout (S13): its renderer key, its Spanish label, and one short neutral
 * description. Like the birthday seeds, the description names no character, brand, or protected name (S5).
 */
const BABY_SHOWER_CLASSIC_SEED = {
  key: "baby-shower-classic-01",
  label: "Clásica",
  description:
    "Una invitación clásica de baby shower con las anfitrionas, los datos del evento y la mesa de regalos.",
} as const;

/** The «Clásica» themed baptism layout (S13), with the same neutral naming rule as the birthday seeds. */
const BAPTISM_CLASSIC_SEED = {
  key: "baptism-classic-01",
  label: "Clásica",
  description:
    "Una invitación clásica de bautizo con la ceremonia, la recepción y los datos de la familia.",
} as const;

/**
 * One published baby shower template per theme, in the theme order the owner chose (S13). Every template
 * shares the baby shower content schema and takes exactly `{ componentKey, theme }` as configuration.
 */
export const BABY_SHOWER_TEMPLATE_SEEDS: readonly BabyShowerTemplateSeed[] = BABY_SHOWER_THEMES.map(
  (theme) => ({
    key: `baby-shower-classic-${theme}`,
    name: `${BABY_SHOWER_CLASSIC_SEED.label} · ${BABY_SHOWER_THEME_NAMES[theme]}`,
    description: BABY_SHOWER_CLASSIC_SEED.description,
    componentKey: BABY_SHOWER_CLASSIC_SEED.key,
    schema: BABY_SHOWER_CONTENT_SCHEMA,
    configuration: { componentKey: BABY_SHOWER_CLASSIC_SEED.key, theme },
    theme,
  }),
);

/**
 * One published themed baptism template per theme, in the theme order the owner chose (S13). Every template
 * shares the baptism content schema and takes exactly `{ componentKey, theme }` as configuration.
 */
export const BAPTISM_TEMPLATE_SEEDS: readonly BaptismTemplateSeed[] = BAPTISM_THEMES.map(
  (theme) => ({
    key: `baptism-classic-${theme}`,
    name: `${BAPTISM_CLASSIC_SEED.label} · ${BAPTISM_THEME_NAMES[theme]}`,
    description: BAPTISM_CLASSIC_SEED.description,
    componentKey: BAPTISM_CLASSIC_SEED.key,
    schema: BAPTISM_CONTENT_SCHEMA,
    configuration: { componentKey: BAPTISM_CLASSIC_SEED.key, theme },
    theme,
  }),
);

/** The Spanish display name of each elegant theme; keys and order come from its renderer allow-list (S4). */
const ELEGANT_THEME_NAMES: Readonly<Record<ElegantTheme, string>> = {
  "blush-gold": "Rosa empolvado y oro",
  "ivory-black": "Marfil y negro",
  "midnight-gold": "Azul medianoche y oro",
  "olive-cream": "Verde olivo y crema",
  champagne: "Champaña",
  "lavender-silver": "Lavanda y plata",
  "terracotta-sage": "Terracota y salvia",
  "burgundy-gold": "Borgoña y oro",
};

/** One elegant layout the catalog publishes: its key prefix, category, renderer, label, schema, and blurb. */
interface ElegantLayoutSeed {
  readonly slug: string;
  readonly categoryKey: string;
  readonly componentKey: string;
  readonly label: string;
  readonly schema: Prisma.InputJsonObject;
  readonly description: string;
}

/**
 * One row per elegant «Arco y foto» layout the catalog publishes: its key prefix, the category it belongs to,
 * its renderer key, its Spanish label, its own content schema, and one short neutral description per occasion
 * (S4). The three layouts are the same visual direction, but each occasion keeps its own content schema.
 */
const ELEGANT_ARCH_LAYOUT_SEEDS = [
  {
    slug: "xv-arch",
    categoryKey: "quinceanera",
    componentKey: "xv-arch-01",
    label: "Arco y foto",
    schema: XV_ARCH_CONTENT_SCHEMA,
    description:
      "Una invitación elegante de XV años con la misa, la recepción y los padrinos de honor.",
  },
  {
    slug: "wedding-arch",
    categoryKey: "wedding",
    componentKey: "wedding-arch-01",
    label: "Arco y foto",
    schema: WEDDING_ARCH_CONTENT_SCHEMA,
    description:
      "Una invitación elegante de boda con la ceremonia, la recepción y los datos de la pareja.",
  },
  {
    slug: "baptism-arch",
    categoryKey: "baptism",
    componentKey: "baptism-arch-01",
    label: "Arco y foto",
    // The formal baptism reuses the themed baptism schema exactly (S4), so both share one content contract.
    schema: BAPTISM_CONTENT_SCHEMA,
    description:
      "Una invitación elegante de bautizo con la ceremonia, la recepción y los datos de la familia.",
  },
] as const satisfies readonly ElegantLayoutSeed[];

/**
 * One row per elegant «Ornamental — papelería clásica» layout the catalog publishes (S5): the centered card
 * with a double rule, textured paper, and a fine-line laurel. Each occasion reuses the content schema of its
 * «Arco y foto» sibling, so the two elegant layouts of an occasion share one content contract and one form.
 */
const ELEGANT_ORNAMENTAL_LAYOUT_SEEDS = [
  {
    slug: "xv-ornamental",
    categoryKey: "quinceanera",
    componentKey: "xv-ornamental-01",
    label: "Ornamental",
    schema: XV_ARCH_CONTENT_SCHEMA,
    description:
      "Una invitación de XV años con tarjeta centrada, doble filete y un ornamento botánico.",
  },
  {
    slug: "wedding-ornamental",
    categoryKey: "wedding",
    componentKey: "wedding-ornamental-01",
    label: "Ornamental",
    schema: WEDDING_ARCH_CONTENT_SCHEMA,
    description:
      "Una invitación de boda con tarjeta centrada, doble filete y un ornamento botánico.",
  },
  {
    slug: "baptism-ornamental",
    categoryKey: "baptism",
    componentKey: "baptism-ornamental-01",
    label: "Ornamental",
    schema: BAPTISM_CONTENT_SCHEMA,
    description:
      "Una invitación de bautizo con tarjeta centrada, doble filete y un ornamento botánico.",
  },
] as const satisfies readonly ElegantLayoutSeed[];

/**
 * One published template per elegant layout and theme, in the theme order the owner chose (S4, S5). Every
 * template takes exactly `{ componentKey, theme }` as configuration and its occasion's content schema, so the
 * two elegant layouts of an occasion differ only in the renderer they name. Catalog names stay generic: a theme
 * name never names a character or a brand (S3).
 */
function elegantTemplateSeeds(
  layouts: readonly ElegantLayoutSeed[],
): readonly ElegantTemplateSeed[] {
  return layouts.flatMap((layout) =>
    ELEGANT_THEMES.map((theme) => ({
      key: `${layout.slug}-${theme}`,
      name: `${layout.label} · ${ELEGANT_THEME_NAMES[theme]}`,
      description: layout.description,
      componentKey: layout.componentKey,
      schema: layout.schema,
      configuration: { componentKey: layout.componentKey, theme },
      theme,
    })),
  );
}

/** The elegant «Arco y foto» templates (3 layouts x 8 themes), in the owner's theme order (S4). */
export const ELEGANT_ARCH_TEMPLATE_SEEDS: readonly ElegantTemplateSeed[] =
  elegantTemplateSeeds(ELEGANT_ARCH_LAYOUT_SEEDS);

/** The elegant «Ornamental» templates (3 layouts x 8 themes), in the owner's theme order (S5). */
export const ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS: readonly ElegantTemplateSeed[] =
  elegantTemplateSeeds(ELEGANT_ORNAMENTAL_LAYOUT_SEEDS);

/** The templates of one elegant layout, in the theme order the owner chose. */
function elegantSeedsOf(
  seeds: readonly ElegantTemplateSeed[],
  componentKey: string,
): readonly ElegantTemplateSeed[] {
  return seeds.filter((seed) => seed.componentKey === componentKey);
}

/** The elegant templates of XV años, in the theme order the owner chose (S4). */
export const XV_ARCH_TEMPLATE_SEEDS: readonly ElegantTemplateSeed[] = elegantSeedsOf(
  ELEGANT_ARCH_TEMPLATE_SEEDS,
  "xv-arch-01",
);

/** The elegant templates of weddings, in the theme order the owner chose (S4). */
export const WEDDING_ARCH_TEMPLATE_SEEDS: readonly ElegantTemplateSeed[] = elegantSeedsOf(
  ELEGANT_ARCH_TEMPLATE_SEEDS,
  "wedding-arch-01",
);

/** The elegant templates of formal baptisms, in the theme order the owner chose (S4). */
export const BAPTISM_ARCH_TEMPLATE_SEEDS: readonly ElegantTemplateSeed[] = elegantSeedsOf(
  ELEGANT_ARCH_TEMPLATE_SEEDS,
  "baptism-arch-01",
);

/** The ornamental templates of XV años, in the theme order the owner chose (S5). */
export const XV_ORNAMENTAL_TEMPLATE_SEEDS: readonly ElegantTemplateSeed[] = elegantSeedsOf(
  ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS,
  "xv-ornamental-01",
);

/** The ornamental templates of weddings, in the theme order the owner chose (S5). */
export const WEDDING_ORNAMENTAL_TEMPLATE_SEEDS: readonly ElegantTemplateSeed[] = elegantSeedsOf(
  ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS,
  "wedding-ornamental-01",
);

/** The ornamental templates of formal baptisms, in the theme order the owner chose (S5). */
export const BAPTISM_ORNAMENTAL_TEMPLATE_SEEDS: readonly ElegantTemplateSeed[] = elegantSeedsOf(
  ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS,
  "baptism-ornamental-01",
);

/** How many rows one run created; all zero when the catalog was already seeded. */
export interface CatalogSeedSummary {
  categories: number;
  features: number;
  packages: number;
  packageFeatures: number;
  templates: number;
  templateVersions: number;
}

type Transaction = Prisma.TransactionClient;

function getRequiredId(records: Map<string, string>, key: string): string {
  const id = records.get(key);

  if (!id) {
    throw new Error(`Missing seeded record for key: ${key}.`);
  }

  return id;
}

async function seedCategories(transaction: Transaction): Promise<number> {
  const { count } = await transaction.category.createMany({
    data: CATEGORY_SEEDS.map((category) => ({ ...category })),
    skipDuplicates: true,
  });

  return count;
}

async function seedFeatures(transaction: Transaction): Promise<number> {
  const { count } = await transaction.feature.createMany({
    data: FEATURE_SEEDS.map((feature) => ({ ...feature })),
    skipDuplicates: true,
  });

  return count;
}

/**
 * Creates each missing package and, only for a package this run created, its feature links: an
 * administrator may have removed a link of an existing package on purpose.
 */
async function seedPackages(
  transaction: Transaction,
): Promise<{ packages: number; packageFeatures: number }> {
  const features = await transaction.feature.findMany({
    where: { key: { in: FEATURE_SEEDS.map((feature) => feature.key) } },
    select: { id: true, key: true },
  });
  const featureIds = new Map(features.map((feature) => [feature.key, feature.id]));
  let packages = 0;
  let packageFeatures = 0;

  for (const packageSeed of PACKAGE_SEEDS) {
    const { count } = await transaction.package.createMany({
      data: [
        {
          key: packageSeed.key,
          name: packageSeed.name,
          description: packageSeed.description,
          status: PackageStatus.ACTIVE,
          // The package's own lifetime in days (S1, T1): 30, 90, or 180, written explicitly so the seed states the
          // value rather than inheriting whatever the column was created with.
          durationDays: packageSeed.durationDays,
        },
      ],
      skipDuplicates: true,
    });

    if (count === 0) {
      continue;
    }

    const packageRecord = await transaction.package.findUniqueOrThrow({
      where: { key: packageSeed.key },
      select: { id: true },
    });
    const links = await transaction.packageFeature.createMany({
      data: packageSeed.featureKeys.map((featureKey) => ({
        packageId: packageRecord.id,
        featureId: getRequiredId(featureIds, featureKey),
      })),
      skipDuplicates: true,
    });

    packages += count;
    packageFeatures += links.count;
  }

  return { packages, packageFeatures };
}

/**
 * Creates each missing template and, only for a template this run created, its PUBLISHED version 1. Like a
 * package's feature links, version 1 belongs to a template this run created: an existing template's
 * versions are the administrator's, and it may already have another published version.
 */
async function seedTemplates(
  transaction: Transaction,
  categoryId: string,
  seeds: readonly CatalogTemplateSeed[],
): Promise<{ templates: number; templateVersions: number }> {
  let templates = 0;
  let templateVersions = 0;

  for (const seed of seeds) {
    const { count } = await transaction.template.createMany({
      data: [
        {
          categoryId,
          key: seed.key,
          name: seed.name,
          description: seed.description,
          status: TemplateStatus.PUBLISHED,
        },
      ],
      skipDuplicates: true,
    });

    if (count === 0) {
      continue;
    }

    const template = await transaction.template.findUniqueOrThrow({
      where: { key: seed.key },
      select: { id: true },
    });
    const versions = await transaction.templateVersion.createMany({
      data: [
        {
          templateId: template.id,
          version: 1,
          status: TemplateVersionStatus.PUBLISHED,
          componentKey: seed.componentKey,
          schema: seed.schema,
          configuration: seed.configuration,
        },
      ],
      skipDuplicates: true,
    });

    templates += count;
    templateVersions += versions.count;
  }

  return { templates, templateVersions };
}

/**
 * Creates the layout-and-theme templates of every catalog category (S8, S13). Each category is seeded from
 * the allow-lists of the renderers it publishes, so a theme reviewed for one occasion never lands in another.
 */
async function seedThemedTemplates(
  transaction: Transaction,
): Promise<{ templates: number; templateVersions: number }> {
  const families = [
    { categoryKey: "birthday", seeds: BIRTHDAY_LAYOUT_TEMPLATE_SEEDS },
    { categoryKey: "baby-shower", seeds: BABY_SHOWER_TEMPLATE_SEEDS },
    { categoryKey: "baptism", seeds: BAPTISM_TEMPLATE_SEEDS },
    { categoryKey: "quinceanera", seeds: XV_ARCH_TEMPLATE_SEEDS },
    { categoryKey: "wedding", seeds: WEDDING_ARCH_TEMPLATE_SEEDS },
    // The formal baptism joins the themed one in the same category (S4, L1).
    { categoryKey: "baptism", seeds: BAPTISM_ARCH_TEMPLATE_SEEDS },
    { categoryKey: "quinceanera", seeds: XV_ORNAMENTAL_TEMPLATE_SEEDS },
    { categoryKey: "wedding", seeds: WEDDING_ORNAMENTAL_TEMPLATE_SEEDS },
    { categoryKey: "baptism", seeds: BAPTISM_ORNAMENTAL_TEMPLATE_SEEDS },
  ] as const;
  let templates = 0;
  let templateVersions = 0;

  for (const family of families) {
    const category = await transaction.category.findUnique({
      where: { key: family.categoryKey },
      select: { id: true },
    });

    if (!category) {
      throw new Error(`Missing seeded record for key: ${family.categoryKey}.`);
    }

    const created = await seedTemplates(transaction, category.id, family.seeds);

    templates += created.templates;
    templateVersions += created.templateVersions;
  }

  return { templates, templateVersions };
}

/** Inserts the base catalog records that do not exist yet, in one transaction. */
export async function seedCatalog(prisma: PrismaClient): Promise<CatalogSeedSummary> {
  return prisma.$transaction(async (transaction) => {
    const categories = await seedCategories(transaction);
    const features = await seedFeatures(transaction);
    const { packages, packageFeatures } = await seedPackages(transaction);
    const { templates, templateVersions } = await seedThemedTemplates(transaction);

    return { categories, features, packages, packageFeatures, templates, templateVersions };
  });
}
