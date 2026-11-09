import { PackageStatus, TemplateStatus, TemplateVersionStatus } from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";

// Seeds the base catalog (M3 T2; S7). It only creates what is missing: a row whose key (or composite
// key) already exists is never updated, reactivated, or deleted, because an administrator may have
// changed it on purpose. Prices are not seeded: amounts are set through the admin API (L4).

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
    featureKeys: ["COUNTDOWN", "MAP", "WHATSAPP"],
  },
  {
    key: "premium",
    name: "Premium",
    description: "Más recursos para una experiencia visual completa.",
    featureKeys: ["COUNTDOWN", "MUSIC", "GALLERY", "MAP", "RSVP", "WHATSAPP"],
  },
  {
    key: "deluxe",
    name: "Deluxe",
    description: "El catálogo más amplio para celebraciones con más necesidades.",
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

const BIRTHDAY_ADVENTURE_COMPONENT_KEY = "birthday-adventure-01";

export const BIRTHDAY_ADVENTURE_SCHEMA = {
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

export const BIRTHDAY_ADVENTURE_CONFIGURATION = {
  componentKey: BIRTHDAY_ADVENTURE_COMPONENT_KEY,
  layout: "adventure",
  palette: "sunset",
  typography: "rounded",
  sectionOrder: ["hero", "details", "message"],
} satisfies Prisma.InputJsonObject;

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

async function seedBirthdayAdventure(
  transaction: Transaction,
): Promise<{ templates: number; templateVersions: number }> {
  const category = await transaction.category.findUnique({
    where: { key: "birthday" },
    select: { id: true },
  });

  if (!category) {
    throw new Error("Missing seeded record for key: birthday.");
  }

  const templates = await transaction.template.createMany({
    data: [
      {
        categoryId: category.id,
        key: "birthday-adventure",
        name: "Birthday Adventure",
        description: "Una aventura colorida para celebrar un cumpleaños.",
        status: TemplateStatus.PUBLISHED,
      },
    ],
    skipDuplicates: true,
  });

  // Like a package's feature links, version 1 belongs to a template this run created: an existing
  // template's versions are the administrator's, and it may already have another published version.
  if (templates.count === 0) {
    return { templates: 0, templateVersions: 0 };
  }

  const template = await transaction.template.findUniqueOrThrow({
    where: { key: "birthday-adventure" },
    select: { id: true },
  });
  const templateVersions = await transaction.templateVersion.createMany({
    data: [
      {
        templateId: template.id,
        version: 1,
        status: TemplateVersionStatus.PUBLISHED,
        componentKey: BIRTHDAY_ADVENTURE_COMPONENT_KEY,
        schema: BIRTHDAY_ADVENTURE_SCHEMA,
        configuration: BIRTHDAY_ADVENTURE_CONFIGURATION,
      },
    ],
    skipDuplicates: true,
  });

  return { templates: templates.count, templateVersions: templateVersions.count };
}

/** Inserts the base catalog records that do not exist yet, in one transaction. */
export async function seedCatalog(prisma: PrismaClient): Promise<CatalogSeedSummary> {
  return prisma.$transaction(async (transaction) => {
    const categories = await seedCategories(transaction);
    const features = await seedFeatures(transaction);
    const { packages, packageFeatures } = await seedPackages(transaction);
    const { templates, templateVersions } = await seedBirthdayAdventure(transaction);

    return { categories, features, packages, packageFeatures, templates, templateVersions };
  });
}
