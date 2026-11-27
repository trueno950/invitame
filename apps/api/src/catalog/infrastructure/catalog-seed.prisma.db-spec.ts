import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { PackageStatus, PrismaClient } from "@prisma/client";
import {
  BABY_SHOWER_TEMPLATE_SEEDS,
  BAPTISM_ARCH_TEMPLATE_SEEDS,
  BAPTISM_ORNAMENTAL_TEMPLATE_SEEDS,
  BAPTISM_TEMPLATE_SEEDS,
  BIRTHDAY_LAYOUT_TEMPLATE_SEEDS,
  ELEGANT_ARCH_TEMPLATE_SEEDS,
  ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS,
  seedCatalog,
  WEDDING_ARCH_TEMPLATE_SEEDS,
  WEDDING_ORNAMENTAL_TEMPLATE_SEEDS,
  XV_ARCH_TEMPLATE_SEEDS,
  XV_ORNAMENTAL_TEMPLATE_SEEDS,
} from "../../../prisma/catalog-seed";
import { requireLocalDatabaseUrl } from "../../../test/database";
import { listRendererKeys } from "../../catalog/domain/renderers/renderer-registry";

// The catalog seed (M3 T2; S7, L4) on real PostgreSQL: it only creates what is missing and never
// updates, reactivates, or deletes a row an administrator changed. Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL.
//
// The suites share one database and other suites may rely on the seed's base rows, so this suite
// leaves them in place, restores every seeded row it edits in `after()`, and deletes only the rows
// it created under its own unique keys.

const SEEDED_CATEGORY_KEYS = [
  "birthday",
  "wedding",
  "quinceanera",
  "baby-shower",
  "baptism",
  "graduation",
  "anniversary",
  "corporate-event",
];
const SEEDED_FEATURE_KEYS = [
  "ITINERARY",
  "COUNTDOWN",
  "MUSIC",
  "GALLERY",
  "MAP",
  "RSVP",
  "WHATSAPP",
  "GIFT_REGISTRY",
  "LODGING",
  "GUESTBOOK",
  "WHATSAPP_REMINDERS",
  "GUEST_LIST",
  "QR_PASS",
];
const SEEDED_PACKAGE_KEYS = ["basic", "premium", "deluxe"];
const PREMIUM_FEATURE_KEYS = [
  "ITINERARY",
  "COUNTDOWN",
  "MUSIC",
  "GALLERY",
  "MAP",
  "RSVP",
  "WHATSAPP",
  "LODGING",
  "GUESTBOOK",
];

const ZERO_SUMMARY = {
  categories: 0,
  features: 0,
  packages: 0,
  packageFeatures: 0,
  templates: 0,
  templateVersions: 0,
};

describe("catalog seed (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const runId = randomUUID();
  const extraFeatureKey = `SEED_TEST_${runId}`;

  // Seeded values this suite edits, restored in after().
  const seededCategoryName = "Boda";
  const seededFeatureKey = "MUSIC";
  const seededPackageKey = "basic";
  const removedLinkPackageKey = "premium";
  const removedLinkFeatureKey = "GALLERY";

  before(async () => {
    // Start from a known baseline in case an earlier crashed run left an edit behind.
    await restoreSeededEdits();
  });

  after(async () => {
    try {
      await restoreSeededEdits();
      await prisma.feature.deleteMany({ where: { key: extraFeatureKey } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function restoreSeededEdits(): Promise<void> {
    await prisma.category.updateMany({
      where: { key: "wedding", name: { not: seededCategoryName } },
      data: { name: seededCategoryName },
    });
    await prisma.feature.updateMany({
      where: { key: seededFeatureKey, isActive: false },
      data: { isActive: true },
    });
    await prisma.package.updateMany({
      where: { key: seededPackageKey, status: { not: PackageStatus.ACTIVE } },
      data: { status: PackageStatus.ACTIVE },
    });
    const premium = await prisma.package.findUnique({ where: { key: removedLinkPackageKey } });
    const gallery = await prisma.feature.findUnique({ where: { key: removedLinkFeatureKey } });
    if (premium && gallery) {
      await prisma.packageFeature.createMany({
        data: [{ packageId: premium.id, featureId: gallery.id }],
        skipDuplicates: true,
      });
    }
  }

  async function countSeededRows() {
    const [categories, features, packages] = await Promise.all([
      prisma.category.count({ where: { key: { in: SEEDED_CATEGORY_KEYS } } }),
      prisma.feature.count({ where: { key: { in: SEEDED_FEATURE_KEYS } } }),
      prisma.package.count({ where: { key: { in: SEEDED_PACKAGE_KEYS } } }),
    ]);
    return { categories, features, packages };
  }

  it("creates only the missing base rows and creates nothing on a second run", async () => {
    const before = await countSeededRows();

    const first = await seedCatalog(prisma);

    assert.equal(first.categories, SEEDED_CATEGORY_KEYS.length - before.categories);
    assert.equal(first.features, SEEDED_FEATURE_KEYS.length - before.features);
    assert.equal(first.packages, SEEDED_PACKAGE_KEYS.length - before.packages);
    assert.deepEqual(await countSeededRows(), {
      categories: SEEDED_CATEGORY_KEYS.length,
      features: SEEDED_FEATURE_KEYS.length,
      packages: SEEDED_PACKAGE_KEYS.length,
    });

    const second = await seedCatalog(prisma);

    assert.deepEqual(second, ZERO_SUMMARY);
  });

  it("seeds one birthday layout template per layout and theme with a published version 1", async () => {
    await seedCatalog(prisma);

    const templates = await prisma.template.findMany({
      where: { key: { in: BIRTHDAY_LAYOUT_TEMPLATE_SEEDS.map((seed) => seed.key) } },
      include: { category: true, versions: true },
    });

    assert.equal(templates.length, BIRTHDAY_LAYOUT_TEMPLATE_SEEDS.length);

    for (const seed of BIRTHDAY_LAYOUT_TEMPLATE_SEEDS) {
      const template = templates.find((row) => row.key === seed.key);
      assert.ok(template, seed.key);
      assert.equal(template.category.key, "birthday", seed.key);
      assert.equal(template.name, seed.name, seed.key);
      assert.equal(template.description, seed.description, seed.key);
      assert.equal(template.status, "PUBLISHED", seed.key);

      const versionOne = template.versions.find((version) => version.version === 1);
      assert.ok(versionOne, seed.key);
      assert.equal(versionOne.componentKey, seed.componentKey, seed.key);
      assert.equal(versionOne.status, "PUBLISHED", seed.key);
      assert.deepEqual(versionOne.configuration, seed.configuration, seed.key);
    }
  });

  it("seeds the celebration categories and the 14 baby shower and baptism templates (S13)", async () => {
    await seedCatalog(prisma);

    const [babyShower, baptism] = await Promise.all([
      prisma.category.findUniqueOrThrow({ where: { key: "baby-shower" } }),
      prisma.category.findUniqueOrThrow({ where: { key: "baptism" } }),
    ]);

    assert.equal(babyShower.name, "Baby shower");
    assert.ok(babyShower.description && babyShower.description.length > 0);
    assert.equal(baptism.name, "Bautizos");
    assert.ok(baptism.description && baptism.description.length > 0);

    const seeds = [...BABY_SHOWER_TEMPLATE_SEEDS, ...BAPTISM_TEMPLATE_SEEDS];
    const templates = await prisma.template.findMany({
      where: { key: { in: seeds.map((seed) => seed.key) } },
      include: { category: true, versions: true },
    });

    assert.equal(templates.length, 14);

    for (const seed of seeds) {
      const template = templates.find((row) => row.key === seed.key);
      const expectedCategory =
        seed.componentKey === "baby-shower-classic-01" ? "baby-shower" : "baptism";

      assert.ok(template, seed.key);
      assert.equal(template.category.key, expectedCategory, seed.key);
      assert.equal(template.name, seed.name, seed.key);
      assert.equal(template.description, seed.description, seed.key);
      assert.equal(template.status, "PUBLISHED", seed.key);

      const versionOne = template.versions.find((version) => version.version === 1);
      assert.ok(versionOne, seed.key);
      assert.equal(versionOne.componentKey, seed.componentKey, seed.key);
      assert.equal(versionOne.status, "PUBLISHED", seed.key);
      assert.deepEqual(versionOne.schema, seed.schema, seed.key);
      assert.deepEqual(versionOne.configuration, seed.configuration, seed.key);
    }
  });

  it("seeds the 24 elegant arch templates in their own categories and occasions (S4)", async () => {
    await seedCatalog(prisma);

    const categories = await Promise.all(
      ["quinceanera", "wedding", "baptism"].map((key) =>
        prisma.category.findUniqueOrThrow({ where: { key } }),
      ),
    );
    const categoryIdOf = new Map(categories.map((category) => [category.key, category.id]));

    const templates = await prisma.template.findMany({
      where: { key: { in: ELEGANT_ARCH_TEMPLATE_SEEDS.map((seed) => seed.key) } },
      include: { category: true, versions: true },
    });

    assert.equal(templates.length, 24);

    for (const [seeds, categoryKey] of [
      [XV_ARCH_TEMPLATE_SEEDS, "quinceanera"],
      [WEDDING_ARCH_TEMPLATE_SEEDS, "wedding"],
      [BAPTISM_ARCH_TEMPLATE_SEEDS, "baptism"],
    ] as const) {
      assert.equal(seeds.length, 8, categoryKey);

      for (const seed of seeds) {
        const template = templates.find((row) => row.key === seed.key);

        assert.ok(template, seed.key);
        assert.equal(template.category.key, categoryKey, seed.key);
        assert.equal(template.category.id, categoryIdOf.get(categoryKey), seed.key);
        assert.equal(template.name, seed.name, seed.key);
        assert.match(template.name, /^Arco y foto · \S/, seed.key);
        assert.equal(template.description, seed.description, seed.key);
        assert.equal(template.status, "PUBLISHED", seed.key);

        const versionOne = template.versions.find((version) => version.version === 1);
        assert.ok(versionOne, seed.key);
        assert.equal(versionOne.componentKey, seed.componentKey, seed.key);
        assert.equal(versionOne.status, "PUBLISHED", seed.key);
        assert.deepEqual(versionOne.schema, seed.schema, seed.key);
        assert.deepEqual(versionOne.configuration, seed.configuration, seed.key);
        assert.deepEqual(
          template.versions.map((version) => version.version),
          [1],
          seed.key,
        );
      }
    }
  });

  it("seeds the 24 elegant ornamental templates in their own categories and occasions (S5)", async () => {
    await seedCatalog(prisma);

    const categories = await Promise.all(
      ["quinceanera", "wedding", "baptism"].map((key) =>
        prisma.category.findUniqueOrThrow({ where: { key } }),
      ),
    );
    const categoryIdOf = new Map(categories.map((category) => [category.key, category.id]));

    const templates = await prisma.template.findMany({
      where: { key: { in: ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS.map((seed) => seed.key) } },
      include: { category: true, versions: true },
    });

    assert.equal(templates.length, 24);

    for (const [seeds, categoryKey] of [
      [XV_ORNAMENTAL_TEMPLATE_SEEDS, "quinceanera"],
      [WEDDING_ORNAMENTAL_TEMPLATE_SEEDS, "wedding"],
      [BAPTISM_ORNAMENTAL_TEMPLATE_SEEDS, "baptism"],
    ] as const) {
      assert.equal(seeds.length, 8, categoryKey);

      for (const seed of seeds) {
        const template = templates.find((row) => row.key === seed.key);

        assert.ok(template, seed.key);
        assert.equal(template.category.key, categoryKey, seed.key);
        assert.equal(template.category.id, categoryIdOf.get(categoryKey), seed.key);
        assert.equal(template.name, seed.name, seed.key);
        assert.match(template.name, /^Ornamental · \S/, seed.key);
        assert.equal(template.description, seed.description, seed.key);
        assert.equal(template.status, "PUBLISHED", seed.key);

        const versionOne = template.versions.find((version) => version.version === 1);
        assert.ok(versionOne, seed.key);
        assert.equal(versionOne.componentKey, seed.componentKey, seed.key);
        assert.equal(versionOne.status, "PUBLISHED", seed.key);
        assert.deepEqual(versionOne.schema, seed.schema, seed.key);
        assert.deepEqual(versionOne.configuration, seed.configuration, seed.key);
        assert.deepEqual(
          template.versions.map((version) => version.version),
          [1],
          seed.key,
        );
      }
    }
  });

  it("seeds no version for the removed renderer and no unregistered key (S11)", async () => {
    await seedCatalog(prisma);

    const seeds = [
      ...BIRTHDAY_LAYOUT_TEMPLATE_SEEDS,
      ...BABY_SHOWER_TEMPLATE_SEEDS,
      ...BAPTISM_TEMPLATE_SEEDS,
      ...ELEGANT_ARCH_TEMPLATE_SEEDS,
      ...ELEGANT_ORNAMENTAL_TEMPLATE_SEEDS,
    ];
    const versions = await prisma.templateVersion.findMany({
      where: { template: { key: { in: seeds.map((seed) => seed.key) } } },
      select: { componentKey: true, template: { select: { key: true } } },
    });
    const registered = new Set(listRendererKeys());

    assert.equal(versions.length, seeds.length);
    for (const version of versions) {
      assert.ok(
        registered.has(version.componentKey),
        `${version.template.key} names ${version.componentKey}`,
      );
    }

    assert.equal(
      await prisma.templateVersion.count({ where: { componentKey: "birthday-adventure-01" } }),
      0,
    );
    assert.equal(
      await prisma.template.count({ where: { key: { startsWith: "birthday-adventure" } } }),
      0,
    );
  });

  it("links each seeded package to its features when it creates the package", async () => {
    await seedCatalog(prisma);

    const deluxe = await prisma.package.findUniqueOrThrow({
      where: { key: "deluxe" },
      include: { packageFeatures: { include: { feature: true } } },
    });

    assert.deepEqual(
      deluxe.packageFeatures.map((link) => link.feature.key).sort(),
      [...SEEDED_FEATURE_KEYS].sort(),
    );
    assert.ok(deluxe.packageFeatures.every((link) => link.included));
  });

  it("gives each seeded package its own lifetime in days (S1, S4)", async () => {
    await seedCatalog(prisma);

    const seeded = await prisma.package.findMany({
      where: { key: { in: SEEDED_PACKAGE_KEYS } },
      select: { key: true, durationDays: true },
    });

    assert.deepEqual(Object.fromEntries(seeded.map((row) => [row.key, row.durationDays])), {
      basic: 30,
      premium: 90,
      deluxe: 180,
    });
  });

  it("leaves every administrator edit untouched on a later run", async () => {
    await seedCatalog(prisma);
    const premium = await prisma.package.findUniqueOrThrow({
      where: { key: removedLinkPackageKey },
    });
    const gallery = await prisma.feature.findUniqueOrThrow({
      where: { key: removedLinkFeatureKey },
    });

    await prisma.category.update({
      where: { key: "wedding" },
      data: { name: `Boda ${runId}` },
    });
    await prisma.feature.update({ where: { key: seededFeatureKey }, data: { isActive: false } });
    await prisma.package.update({
      where: { key: seededPackageKey },
      data: { status: PackageStatus.ARCHIVED },
    });
    await prisma.packageFeature.delete({
      where: { packageId_featureId: { packageId: premium.id, featureId: gallery.id } },
    });
    await prisma.feature.create({
      data: { key: extraFeatureKey, name: `Extra ${runId}`, isActive: true },
    });

    const summary = await seedCatalog(prisma);

    assert.deepEqual(summary, ZERO_SUMMARY);
    assert.equal(
      (await prisma.category.findUniqueOrThrow({ where: { key: "wedding" } })).name,
      `Boda ${runId}`,
    );
    assert.equal(
      (await prisma.feature.findUniqueOrThrow({ where: { key: seededFeatureKey } })).isActive,
      false,
    );
    assert.equal(
      (await prisma.package.findUniqueOrThrow({ where: { key: seededPackageKey } })).status,
      PackageStatus.ARCHIVED,
    );
    const premiumLinks = await prisma.packageFeature.findMany({
      where: { packageId: premium.id },
      include: { feature: true },
    });
    assert.deepEqual(
      premiumLinks.map((link) => link.feature.key).sort(),
      PREMIUM_FEATURE_KEYS.filter((key) => key !== removedLinkFeatureKey).sort(),
    );
    const extra = await prisma.feature.findUnique({ where: { key: extraFeatureKey } });
    assert.ok(extra, "a feature the seed does not know is not deleted");
    assert.equal(extra.name, `Extra ${runId}`);
  });
});
