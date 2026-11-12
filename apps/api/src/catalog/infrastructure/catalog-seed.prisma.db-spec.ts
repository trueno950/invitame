import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { PackageStatus, PrismaClient } from "@prisma/client";
import { BIRTHDAY_LAYOUT_TEMPLATE_SEEDS, seedCatalog } from "../../../prisma/catalog-seed";
import { requireLocalDatabaseUrl } from "../../../test/database";

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
  "graduation",
  "anniversary",
  "corporate-event",
];
const SEEDED_FEATURE_KEYS = [
  "COUNTDOWN",
  "MUSIC",
  "GALLERY",
  "MAP",
  "RSVP",
  "WHATSAPP",
  "GIFT_REGISTRY",
  "GUEST_LIST",
  "QR_PASS",
];
const SEEDED_PACKAGE_KEYS = ["basic", "premium", "deluxe"];
const PREMIUM_FEATURE_KEYS = ["COUNTDOWN", "MUSIC", "GALLERY", "MAP", "RSVP", "WHATSAPP"];

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

  it("seeds the birthday-adventure template with a published version 1", async () => {
    await seedCatalog(prisma);

    const template = await prisma.template.findUniqueOrThrow({
      where: { key: "birthday-adventure" },
      include: { category: true, versions: true },
    });

    assert.equal(template.category.key, "birthday");
    assert.equal(template.status, "PUBLISHED");
    const versionOne = template.versions.find((version) => version.version === 1);
    assert.ok(versionOne);
    assert.equal(versionOne.componentKey, "birthday-adventure-01");
    assert.equal(versionOne.status, "PUBLISHED");
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
