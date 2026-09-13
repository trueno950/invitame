import { PackageStatus, PrismaClient, TemplateStatus, TemplateVersionStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const prisma = new PrismaClient();

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

const FEATURE_KEYS = FEATURE_SEEDS.map((feature) => feature.key);

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

const BIRTHDAY_ADVENTURE_SCHEMA = {
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

const BIRTHDAY_ADVENTURE_CONFIGURATION = {
  componentKey: BIRTHDAY_ADVENTURE_COMPONENT_KEY,
  layout: "adventure",
  palette: "sunset",
  typography: "rounded",
  sectionOrder: ["hero", "details", "message"],
} satisfies Prisma.InputJsonObject;

function getRequiredId(records: Map<string, string>, key: string): string {
  const id = records.get(key);

  if (!id) {
    throw new Error(`Missing seeded record for key: ${key}.`);
  }

  return id;
}

async function seedCategories(): Promise<Map<string, string>> {
  const records = await Promise.all(
    CATEGORY_SEEDS.map(async (category) => {
      const record = await prisma.category.upsert({
        where: { key: category.key },
        update: {
          name: category.name,
          description: category.description,
          isActive: true,
        },
        create: {
          key: category.key,
          name: category.name,
          description: category.description,
        },
      });

      return [record.key, record.id] as const;
    }),
  );

  return new Map(records);
}

async function seedFeatures(): Promise<Map<string, string>> {
  const records = await Promise.all(
    FEATURE_SEEDS.map(async (feature) => {
      const record = await prisma.feature.upsert({
        where: { key: feature.key },
        update: {
          name: feature.name,
          description: feature.description,
          isActive: true,
        },
        create: {
          key: feature.key,
          name: feature.name,
          description: feature.description,
        },
      });

      return [record.key, record.id] as const;
    }),
  );

  return new Map(records);
}

async function reconcileFeatureCatalog(): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.packageFeature.deleteMany({
      where: {
        feature: {
          key: {
            notIn: FEATURE_KEYS,
          },
        },
      },
    });

    await transaction.feature.deleteMany({
      where: {
        key: {
          notIn: FEATURE_KEYS,
        },
      },
    });
  });
}

async function seedPackages(featureIds: Map<string, string>): Promise<void> {
  for (const packageSeed of PACKAGE_SEEDS) {
    const packageRecord = await prisma.package.upsert({
      where: { key: packageSeed.key },
      update: {
        name: packageSeed.name,
        description: packageSeed.description,
        status: PackageStatus.ACTIVE,
      },
      create: {
        key: packageSeed.key,
        name: packageSeed.name,
        description: packageSeed.description,
        status: PackageStatus.ACTIVE,
      },
    });

    const packageFeatureIds = packageSeed.featureKeys.map((featureKey) =>
      getRequiredId(featureIds, featureKey),
    );

    await prisma.packageFeature.deleteMany({
      where: {
        packageId: packageRecord.id,
        featureId: {
          notIn: packageFeatureIds,
        },
      },
    });

    await Promise.all(
      packageFeatureIds.map(async (featureId) => {
        await prisma.packageFeature.upsert({
          where: {
            packageId_featureId: {
              packageId: packageRecord.id,
              featureId,
            },
          },
          update: {
            included: true,
          },
          create: {
            packageId: packageRecord.id,
            featureId,
          },
        });
      }),
    );
  }
}

async function seedBirthdayAdventure(categoryIds: Map<string, string>): Promise<void> {
  const template = await prisma.template.upsert({
    where: { key: "birthday-adventure" },
    update: {
      categoryId: getRequiredId(categoryIds, "birthday"),
      name: "Birthday Adventure",
      description: "Una aventura colorida para celebrar un cumpleaños.",
      status: TemplateStatus.PUBLISHED,
    },
    create: {
      categoryId: getRequiredId(categoryIds, "birthday"),
      key: "birthday-adventure",
      name: "Birthday Adventure",
      description: "Una aventura colorida para celebrar un cumpleaños.",
      status: TemplateStatus.PUBLISHED,
    },
  });

  await prisma.templateVersion.upsert({
    where: {
      templateId_version: {
        templateId: template.id,
        version: 1,
      },
    },
    update: {},
    create: {
      templateId: template.id,
      version: 1,
      status: TemplateVersionStatus.PUBLISHED,
      componentKey: BIRTHDAY_ADVENTURE_COMPONENT_KEY,
      schema: BIRTHDAY_ADVENTURE_SCHEMA,
      configuration: BIRTHDAY_ADVENTURE_CONFIGURATION,
    },
  });
}

async function main(): Promise<void> {
  const [categoryIds, featureIds] = await Promise.all([seedCategories(), seedFeatures()]);

  await reconcileFeatureCatalog();
  await seedPackages(featureIds);
  await seedBirthdayAdventure(categoryIds);

  console.info("Database seed completed.");
}

void main()
  .catch((error: unknown) => {
    console.error("Database seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
