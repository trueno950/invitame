import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaCatalogPublicReader } from "../../catalog/infrastructure/prisma-catalog-public-reader";
import { GetPublicInvitationUseCase } from "../application/invitation.use-cases";
import { InvitationNotEditableError } from "../domain/invitation.errors";
import { CatalogInvitationReader } from "./catalog-invitation-reader";
import { PrismaInvitationRepository } from "./prisma-invitation.repository";

// Stored place coordinates on real PostgreSQL (S2, S3): the additive `InvitationPlace` migration, the unique pair
// that makes a repeated save one row, the CHECK constraints on both coordinates, the foreign key that never loses an
// invitation silently, the owner-scoped repository round trip, and the public read that shows a stored point only
// while the address text still carries the label it was stored with. Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL. The database is shared with parallel suites:
// every row here carries a key made from this run's id, and only those rows are removed.

const RENDERER = "birthday-map-01";
const SAN_JOSE = {
  label: "Parroquia de San José, Calle Hidalgo 12, Querétaro, Querétaro",
  lat: 20.5888,
  lng: -100.3899,
};
const ADDRESS_SCHEMA = {
  type: "object",
  required: ["address"],
  properties: {
    location: { type: "string", maxLength: 120 },
    address: { type: "string", maxLength: 240 },
    ceremonyAddress: { type: "string", maxLength: 240 },
    receptionPlace: { type: "string", maxLength: 120 },
  },
};

describe("invitation places (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const repository = new PrismaInvitationRepository(prisma);
  const catalog = new CatalogInvitationReader(new PrismaCatalogPublicReader(prisma));
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const packageIds: string[] = [];
  const featureIds: string[] = [];
  const invitationIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      // The place rows reference invitations with ON DELETE RESTRICT, so they go first.
      await prisma.invitationPlace.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitationFeatureSettings.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.packageFeature.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.feature.deleteMany({ where: { id: { in: featureIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newOwner(): Promise<string> {
    sequence += 1;
    const created = await prisma.user.create({
      data: { email: `t3-places-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);
    return created.id;
  }

  async function feature(key: string): Promise<string> {
    const stored = await prisma.feature.findUnique({ where: { key } });
    if (stored !== null) {
      return stored.id;
    }
    const created = await prisma.feature.create({ data: { key, name: key } });
    featureIds.push(created.id);
    return created.id;
  }

  /** A PUBLISHED version declaring the address fields, and an ACTIVE package with the given feature keys. */
  async function newCatalog(featureKeys: readonly string[]) {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `t3-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `t3-template-${sequence}-${runId}`,
        name: "Plantilla",
        status: "PUBLISHED",
      },
    });
    templateIds.push(template.id);
    const version = await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        status: "PUBLISHED",
        componentKey: RENDERER,
        schema: ADDRESS_SCHEMA,
        configuration: { componentKey: RENDERER },
      },
    });
    const createdPackage = await prisma.package.create({
      data: {
        key: `t3-package-${sequence}-${runId}`,
        name: "Paquete",
        status: "ACTIVE",
        packageFeatures: {
          create: await Promise.all(
            featureKeys.map(async (key) => ({ featureId: await feature(key) })),
          ),
        },
      },
    });
    packageIds.push(createdPackage.id);
    return { versionId: version.id, packageId: createdPackage.id };
  }

  function newSlug(): string {
    sequence += 1;
    return `t3-${runId.slice(0, 8)}-${sequence}`;
  }

  /** An invitation created through the repository, as the create use case does (defaults only). */
  async function newDraft(
    featureKeys: readonly string[] = ["MAP"],
    content: Prisma.InputJsonObject = {},
  ) {
    const ownerId = await newOwner();
    const catalogState = await newCatalog(featureKeys);
    const created = await repository.create({
      ownerId,
      templateVersionId: catalogState.versionId,
      packageId: catalogState.packageId,
      slug: newSlug(),
      content,
      // The settings row's default party limit, stated explicitly like the use case does (M9 T13).
      rsvpPartyLimit: 4,
    });
    invitationIds.push(created.id);
    return { invitation: created, ownerId, ...catalogState };
  }

  describe("the additive migration", () => {
    it("creates InvitationPlace with the documented widths and no nullable column", async () => {
      const columns = await prisma.$queryRaw<
        Array<{
          column_name: string;
          is_nullable: string;
          character_maximum_length: number | null;
          data_type: string;
        }>
      >`
        SELECT column_name, is_nullable, character_maximum_length, data_type
        FROM information_schema.columns
        WHERE table_name = 'InvitationPlace'
        ORDER BY column_name
      `;

      assert.deepEqual(
        columns.map((column) => [
          column.column_name,
          column.is_nullable,
          column.character_maximum_length,
        ]),
        [
          ["field", "NO", 64],
          ["invitationId", "NO", null],
          ["label", "NO", 300],
          ["lat", "NO", null],
          ["lng", "NO", null],
          ["updatedAt", "NO", null],
        ],
      );
      assert.equal(
        columns.find((column) => column.column_name === "lat")?.data_type,
        "double precision",
      );
      assert.equal(
        columns.find((column) => column.column_name === "lng")?.data_type,
        "double precision",
      );
    });

    it("keeps one row per invitation and field, and refuses a duplicate pair", async () => {
      const { invitation } = await newDraft();

      await prisma.invitationPlace.create({
        data: { invitationId: invitation.id, field: "address", ...SAN_JOSE },
      });

      await assert.rejects(
        prisma.invitationPlace.create({
          data: { invitationId: invitation.id, field: "address", ...SAN_JOSE },
        }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
      );
      // Two different address fields of one invitation are two rows.
      await prisma.invitationPlace.create({
        data: { invitationId: invitation.id, field: "ceremonyAddress", ...SAN_JOSE },
      });
      assert.equal(
        await prisma.invitationPlace.count({ where: { invitationId: invitation.id } }),
        2,
      );
    });

    it("refuses a latitude outside -90..90 and a longitude outside -180..180", async () => {
      const { invitation } = await newDraft();

      for (const [field, lat, lng] of [
        ["address", 90.0001, -100],
        ["address", -90.0001, -100],
        ["address", 20, 180.0001],
        ["address", 20, -180.0001],
      ] as const) {
        await assert.rejects(
          prisma.invitationPlace.create({
            data: { invitationId: invitation.id, field, label: SAN_JOSE.label, lat, lng },
          }),
          /InvitationPlace_lat_range|InvitationPlace_lng_range/,
          `${lat},${lng}`,
        );
      }
      const stored = await prisma.invitationPlace.create({
        data: {
          invitationId: invitation.id,
          field: "address",
          label: SAN_JOSE.label,
          lat: 90,
          lng: -180,
        },
      });
      assert.equal(stored.lat, 90);
      assert.equal(stored.lng, -180);
    });

    it("keeps its invitation: a place row cannot reference an unknown invitation", async () => {
      await assert.rejects(
        prisma.invitationPlace.create({
          data: { invitationId: randomUUID(), field: "address", ...SAN_JOSE },
        }),
        /InvitationPlace_invitationId_fkey/,
      );
    });
  });

  describe("the repository round trip", () => {
    it("stores, replaces, and clears the coordinates of one address field", async () => {
      const { invitation, ownerId } = await newDraft();
      const field = "ceremonyAddress";

      const written = await repository.updatePlace(ownerId, invitation.id, { field, ...SAN_JOSE });
      assert.deepEqual(written?.places, { [field]: SAN_JOSE });

      const moved = { ...SAN_JOSE, label: "Otra parroquia", lat: 19.4326, lng: -99.1332 };
      const replaced = await repository.updatePlace(ownerId, invitation.id, { field, ...moved });
      assert.deepEqual(replaced?.places, { [field]: moved });
      assert.equal(
        await prisma.invitationPlace.count({ where: { invitationId: invitation.id } }),
        1,
      );

      const cleared = await repository.clearPlace(ownerId, invitation.id, field);
      assert.deepEqual(cleared?.places, {});
      assert.equal(
        await prisma.invitationPlace.count({ where: { invitationId: invitation.id } }),
        0,
      );
    });

    it("carries the stored places on the owner read, and never writes another owner's invitation", async () => {
      const { invitation, ownerId } = await newDraft();
      await repository.updatePlace(ownerId, invitation.id, { field: "address", ...SAN_JOSE });

      const owner = await repository.findOwned(ownerId, invitation.id);
      assert.deepEqual(owner?.places, { address: SAN_JOSE });

      const stranger = await newOwner();
      assert.equal(
        await repository.updatePlace(stranger, invitation.id, { field: "address", ...SAN_JOSE }),
        null,
      );
      assert.equal(await repository.clearPlace(stranger, invitation.id, "address"), null);
      assert.equal(
        await prisma.invitationPlace.count({ where: { invitationId: invitation.id } }),
        1,
      );
    });

    it("refuses to write the places of an archived invitation", async () => {
      const { invitation, ownerId } = await newDraft();
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "ARCHIVED", archivedAt: new Date(), publishedAt: null },
      });

      await assert.rejects(
        repository.updatePlace(ownerId, invitation.id, { field: "address", ...SAN_JOSE }),
        InvitationNotEditableError,
      );
      await assert.rejects(
        repository.clearPlace(ownerId, invitation.id, "address"),
        InvitationNotEditableError,
      );
      assert.equal(
        await prisma.invitationPlace.count({ where: { invitationId: invitation.id } }),
        0,
      );
    });
  });

  describe("the public read (S2)", () => {
    const readPublic = (slug: string) =>
      new GetPublicInvitationUseCase(repository, catalog).execute(slug);

    /** A published invitation whose content is `address`, which the point's stored label may or may not match. */
    async function published(
      overrides: { featureKeys?: readonly string[]; address?: string } = {},
    ) {
      const address = overrides.address ?? SAN_JOSE.label;
      const draft = await newDraft(overrides.featureKeys ?? ["MAP"], {
        location: "Parroquia de San José",
        address,
        receptionPlace: "Casa de los abuelos",
      });
      // The point remembers the label it was stored with; `address` is the text the content carries now (S2).
      await repository.updatePlace(draft.ownerId, draft.invitation.id, {
        field: "address",
        ...SAN_JOSE,
      });
      await prisma.invitation.update({
        where: { id: draft.invitation.id },
        data: { status: "PUBLISHED", publishedAt: new Date(), firstPublishedAt: new Date() },
      });
      return draft.invitation.slug;
    }

    it("answers the stored point of a field whose text still carries its label, for a package with MAP", async () => {
      const slug = await published();

      const page = await readPublic(slug);

      assert.equal(page?.features.map, true);
      assert.deepEqual(page?.places, { address: { ...SAN_JOSE } });
    });

    it("answers no point when the owner rewrote the address text after storing it", async () => {
      const slug = await published({ address: "Otra dirección escrita a mano" });

      const page = await readPublic(slug);

      assert.deepEqual(page?.places, {});
    });

    it("answers no point for a package the API did not gate MAP for", async () => {
      const slug = await published({ featureKeys: ["COUNTDOWN"] });

      const page = await readPublic(slug);

      assert.equal(page?.features.map, false);
      assert.deepEqual(page?.places, {});
    });
  });
});
