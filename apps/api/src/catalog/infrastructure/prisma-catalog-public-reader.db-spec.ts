import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import {
  type PackageStatus,
  type Prisma,
  PrismaClient,
  type TemplateStatus,
  type TemplateVersionStatus,
} from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaCatalogPublicReader } from "./prisma-catalog-public-reader";

// The creator reads of the catalog's public reader on PostgreSQL (M4 T4 and M5 T3; S2, S8, A1, A3, A5): only
// PUBLISHED templates whose PUBLISHED version exists are listed, a published version whose renderer the in-code
// registry no longer knows is left out (fail closed, exactly like `findPublishedVersion`), only ACTIVE packages
// are listed, each with the feature keys it actually includes and the price in force, and the render data of a
// pinned version is answered in any status so a published invitation keeps rendering a retired version. Runs
// only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a disposable,
// already migrated local database; not part of `pnpm test`. The database is shared with parallel suites, so
// every row here carries a key made from this run's id and only those rows are read back or removed.

describe("PrismaCatalogPublicReader creator reads on PostgreSQL", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const reader = new PrismaCatalogPublicReader(prisma);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const prefix = `m4-t4-${runId}`;
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const packageIds: string[] = [];
  const featureIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      await prisma.packageFeature.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.packagePrice.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.feature.deleteMany({ where: { id: { in: featureIds } } });
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  interface VersionInput {
    status: TemplateVersionStatus;
    componentKey?: string;
    version?: number;
    schema?: Prisma.InputJsonObject;
    configuration?: Prisma.InputJsonObject;
  }

  interface TemplateInput {
    key: string;
    status?: TemplateStatus;
    description?: string | null;
    versions: VersionInput[];
  }

  async function newTemplate(input: TemplateInput) {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `${prefix}-category-${sequence}`, name: "Cumpleaños" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `${prefix}-${input.key}`,
        name: `Plantilla ${input.key}`,
        description: input.description ?? null,
        status: input.status ?? "PUBLISHED",
      },
    });
    templateIds.push(template.id);
    const versions = [];
    for (const [index, version] of input.versions.entries()) {
      versions.push(
        await prisma.templateVersion.create({
          data: {
            templateId: template.id,
            version: version.version ?? index + 1,
            status: version.status,
            componentKey: version.componentKey ?? "birthday-adventure-01",
            schema: version.schema ?? { type: "object", required: [], properties: {} },
            configuration: version.configuration ?? {
              componentKey: version.componentKey ?? "birthday-adventure-01",
            },
          },
        }),
      );
    }
    return { category, template, versions };
  }

  interface PackageInput {
    key: string;
    name?: string;
    description?: string | null;
    status?: PackageStatus;
    features?: Array<{ key: string; included: boolean }>;
    prices?: Array<{ amountMinor: number; currency?: string; retiredAt?: Date | null }>;
  }

  async function newPackage(input: PackageInput) {
    sequence += 1;
    const stored = await prisma.package.create({
      data: {
        key: `${prefix}-${input.key}`,
        name: input.name ?? `Paquete ${input.key}`,
        description: input.description ?? null,
        status: input.status ?? "ACTIVE",
      },
    });
    packageIds.push(stored.id);
    for (const feature of input.features ?? []) {
      const created = await prisma.feature.create({
        data: { key: `${prefix}-${feature.key}`, name: `Función ${feature.key}` },
      });
      featureIds.push(created.id);
      await prisma.packageFeature.create({
        data: {
          packageId: stored.id,
          featureId: created.id,
          included: feature.included,
        },
      });
    }
    for (const price of input.prices ?? []) {
      await prisma.packagePrice.create({
        data: {
          packageId: stored.id,
          currency: price.currency ?? "MXN",
          amountMinor: price.amountMinor,
          ...(price.retiredAt === undefined ? {} : { retiredAt: price.retiredAt }),
        },
      });
    }
    return stored;
  }

  /** The reader answers every eligible row in the database; these suites only read back their own rows. */
  const ourTemplates = async () =>
    (await reader.listPublishedTemplates()).filter((template) => template.key.startsWith(prefix));
  const ourPackages = async () =>
    (await reader.listActivePackages()).filter((stored) => stored.key.startsWith(prefix));

  describe("findVersionRenderData", () => {
    it("answers the render data of a version in any status and null for an unknown id (A1, A3)", async () => {
      const schema = {
        type: "object",
        required: ["celebrantName"],
        properties: { celebrantName: { type: "string", maxLength: 80 } },
      };
      const configuration = { componentKey: "birthday-adventure-01", theme: "festive" };
      const retired = await newTemplate({
        key: "aa-retired-render",
        status: "ARCHIVED",
        versions: [{ status: "RETIRED", schema, configuration }],
      });
      const versionId = retired.versions[0]?.id ?? "";

      assert.deepEqual(await reader.findVersionRenderData(versionId), {
        componentKey: "birthday-adventure-01",
        configuration,
        schema,
      });
      assert.equal(await reader.findVersionRenderData(randomUUID()), null);
      // The registry is the API's in-code allow-list, never a database value (A3).
      assert.equal(reader.isRendererRegistered("birthday-adventure-01"), true);
      assert.equal(reader.isRendererRegistered("retired-renderer-99"), false);
    });
  });

  describe("listPublishedTemplates", () => {
    it("answers only PUBLISHED templates whose PUBLISHED version exists, ordered by key", async () => {
      const published = await newTemplate({
        key: "aa-published",
        description: "Una aventura",
        versions: [
          { status: "RETIRED", version: 1 },
          {
            status: "PUBLISHED",
            version: 2,
            schema: {
              type: "object",
              required: ["title"],
              properties: { title: { type: "string" } },
            },
          },
        ],
      });
      const second = await newTemplate({
        key: "zz-published",
        versions: [{ status: "PUBLISHED" }],
      });
      await newTemplate({
        key: "bb-draft-template",
        status: "DRAFT",
        versions: [{ status: "PUBLISHED" }],
      });
      await newTemplate({
        key: "cc-draft-version",
        versions: [{ status: "DRAFT" }, { status: "RETIRED" }],
      });
      await newTemplate({
        key: "dd-archived",
        status: "ARCHIVED",
        versions: [{ status: "PUBLISHED" }],
      });

      const listed = await ourTemplates();

      assert.deepEqual(
        listed.map((template) => template.key),
        [`${prefix}-aa-published`, `${prefix}-zz-published`],
      );
      assert.deepEqual(listed[0], {
        id: published.template.id,
        key: `${prefix}-aa-published`,
        name: "Plantilla aa-published",
        description: "Una aventura",
        category: { key: published.category.key, name: "Cumpleaños" },
        publishedVersion: {
          id: published.versions[1]?.id,
          version: 2,
          componentKey: "birthday-adventure-01",
          schema: {
            type: "object",
            required: ["title"],
            properties: { title: { type: "string" } },
          },
        },
      });
      assert.equal(listed[1]?.id, second.template.id);
    });

    it("leaves out a PUBLISHED version whose renderer the registry does not know (fail closed)", async () => {
      const unknown = await newTemplate({
        key: "ee-unknown-renderer",
        versions: [{ status: "PUBLISHED", componentKey: "retired-renderer-99" }],
      });

      const listed = await ourTemplates();

      assert.equal(
        listed.some((template) => template.id === unknown.template.id),
        false,
      );
    });
  });

  describe("listActivePackages", () => {
    it("answers only ACTIVE packages, ordered by key, with the included feature keys and the price in force", async () => {
      const retiredPrice = new Date("2026-01-01T00:00:00.000Z");
      const basic = await newPackage({
        key: "aa-basic",
        name: "Básico",
        description: "Lo esencial",
        features: [
          { key: "GALLERY", included: false },
          { key: "RSVP", included: true },
        ],
        prices: [{ amountMinor: 9_900, retiredAt: retiredPrice }, { amountMinor: 19_900 }],
      });
      const free = await newPackage({ key: "zz-free" });
      await newPackage({ key: "bb-draft", status: "DRAFT", prices: [{ amountMinor: 100 }] });
      await newPackage({ key: "cc-archived", status: "ARCHIVED" });

      const listed = await ourPackages();

      assert.deepEqual(
        listed.map((stored) => stored.key),
        [`${prefix}-aa-basic`, `${prefix}-zz-free`],
      );
      assert.deepEqual(listed[0], {
        id: basic.id,
        key: `${prefix}-aa-basic`,
        name: "Básico",
        description: "Lo esencial",
        // The excluded feature is not an entitlement and never becomes a key (A1).
        includedFeatureKeys: [`${prefix}-RSVP`],
        currentPrice: { amountMinor: 19_900, currency: "MXN" },
      });
      assert.equal(listed[1]?.currentPrice, null);
      assert.deepEqual(listed[1]?.includedFeatureKeys, []);
      assert.equal(free.status, "ACTIVE");
    });
  });
});
