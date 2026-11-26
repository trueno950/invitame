import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import {
  type Prisma,
  PrismaClient,
  type TemplateStatus,
  type TemplateVersionStatus,
} from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaCatalogPublicReader } from "../../catalog/infrastructure/prisma-catalog-public-reader";
import { InvitationSlugTakenError } from "../application/invitation.application.errors";
import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import { CatalogInvitationReader } from "./catalog-invitation-reader";
import { PrismaInvitationRepository } from "./prisma-invitation.repository";

// The Prisma adapters on PostgreSQL (M4 T3 and M5 T3; S1, S2, S3, S5, S6, S7, S8, S9, A1, A2, A3, A4): every
// invitation read and write is scoped by the owner in its own query, a unique-slug violation is reported as a
// collision signal, an archived invitation refuses content changes with the row unchanged, archiving sets the
// status and the marker together, publishing and unpublishing keep `publishedAt` exactly while PUBLISHED, the
// public slug read answers only a live published row in one query, and the catalog public reader answers a
// version only while it and its template are PUBLISHED. Runs only through `pnpm --filter @invitame/api test:db`
// with an explicit DATABASE_URL that points at a disposable, already migrated local database; not part of
// `pnpm test`. The database is shared with parallel suites: every row here carries a key made from this run's
// id, and only those rows are removed.

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

describe("Prisma invitation repository on PostgreSQL", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const repository = new PrismaInvitationRepository(prisma);
  // The invitations-side adapter over the catalog's own public reader: the boundary a use case sees.
  const catalogReader = new CatalogInvitationReader(new PrismaCatalogPublicReader(prisma));
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
      // A place row references its invitation with ON DELETE RESTRICT, so the stored points go first.
      await prisma.invitationPlace.deleteMany({
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
      data: { email: `m4-t3-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);
    return created.id;
  }

  interface CatalogOptions {
    templateStatus?: TemplateStatus;
    versionStatus?: TemplateVersionStatus;
    componentKey?: string;
    schema?: Prisma.InputJsonObject;
    configuration?: Prisma.InputJsonObject;
  }

  /** A template with one version in the given status, and a package: the catalog state an invitation pins. */
  async function newCatalog(options: CatalogOptions = {}) {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `m4-t3-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m4-t3-template-${sequence}-${runId}`,
        name: "Plantilla",
        ...(options.templateStatus === undefined ? {} : { status: options.templateStatus }),
      },
    });
    templateIds.push(template.id);
    const version = await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        status: options.versionStatus ?? "PUBLISHED",
        componentKey: options.componentKey ?? "birthday-poster-01",
        schema: options.schema ?? { type: "object", required: [], properties: {} },
        configuration: options.configuration ?? {
          componentKey: options.componentKey ?? "birthday-poster-01",
        },
      },
    });
    const createdPackage = await prisma.package.create({
      data: { key: `m4-t3-package-${sequence}-${runId}`, name: "Paquete" },
    });
    packageIds.push(createdPackage.id);
    return {
      templateId: template.id,
      templateVersionId: version.id,
      packageId: createdPackage.id,
    };
  }

  function newSlug(): string {
    sequence += 1;
    return `invitacion-${runId.slice(0, 6)}${sequence}`;
  }

  async function newDraft(
    ownerId: string,
    slug = newSlug(),
    content: Record<string, unknown> = {},
  ) {
    const catalog = await newCatalog();
    const created = await repository.create({
      ownerId,
      templateVersionId: catalog.templateVersionId,
      packageId: catalog.packageId,
      slug,
      content,
      // The settings row's default party limit, stated explicitly like the use case does (M9 T13).
      rsvpPartyLimit: 4,
    });
    invitationIds.push(created.id);
    return created;
  }

  const stored = (id: string) =>
    prisma.invitation.findUniqueOrThrow({ where: { id }, omit: { refundRequestedAt: true } });

  /** The stored row as the repository reports it: the port flattens the one-to-one feature settings row (F1, F6). */
  async function storedRecord(id: string) {
    const row = await stored(id);
    const settings = await prisma.invitationFeatureSettings.findUnique({
      where: { invitationId: id },
    });
    return {
      ...row,
      whatsappPhone: settings?.whatsappPhone ?? null,
      playlistUrl: settings?.playlistUrl ?? null,
      playlistTitle: settings?.playlistTitle ?? null,
      playlistCoverUrl: settings?.playlistCoverUrl ?? null,
      // No settings row yet means no plan of the day, which is the null the port answers (F1; L3.1).
      itinerary: settings?.itinerary ?? null,
      giftRegistry: null,
      // No place row yet means no stored point, which is the empty object the port answers (S2).
      places: {},
    };
  }

  /** The instant every publication fixture writes, so `publishedAt` is compared exactly (S7). */
  const PUBLISHED_AT = new Date("2026-11-12T09:30:00.000Z");

  /** The expiry a publication states: the publication plus the duration the application computed (S1, T2). */
  const EXPIRES_AT = new Date("2026-12-12T09:30:00.000Z");

  async function newPublishedDraft(
    ownerId: string,
    slug = newSlug(),
    content: Record<string, unknown> = {},
  ) {
    const created = await newDraft(ownerId, slug, content);
    const published = await repository.publish(ownerId, created.id, PUBLISHED_AT, EXPIRES_AT);
    assert.ok(published, "the fixture draft must publish");
    return published;
  }

  describe("create", () => {
    it("stores a DRAFT pinned to the owner, the version, the package, and the slug", async () => {
      const ownerId = await newOwner();
      const catalog = await newCatalog();
      const slug = newSlug();

      const created = await repository.create({
        ownerId,
        templateVersionId: catalog.templateVersionId,
        packageId: catalog.packageId,
        slug,
        content: { celebrantName: "Ana" },
        // The settings row's default party limit, stated explicitly like the use case does (M9 T13).
        rsvpPartyLimit: 4,
      });
      invitationIds.push(created.id);

      assert.equal(created.ownerId, ownerId);
      assert.equal(created.templateVersionId, catalog.templateVersionId);
      assert.equal(created.packageId, catalog.packageId);
      assert.equal(created.slug, slug);
      assert.equal(created.status, "DRAFT");
      assert.equal(created.archivedAt, null);
      // The publication markers M5 adds: a draft is unpublished and never expires (S7, S8).
      assert.equal(created.publishedAt, null);
      assert.equal(created.expiresAt, null);
      assert.deepEqual(created.content, { celebrantName: "Ana" });
      assert.ok(created.createdAt instanceof Date);
      assert.deepEqual(await storedRecord(created.id), { ...created });
    });

    it("reports a duplicate slug as InvitationSlugTakenError and keeps the stored invitation", async () => {
      const first = await newDraft(await newOwner());
      const otherOwnerId = await newOwner();
      const catalog = await newCatalog();

      await assert.rejects(
        repository.create({
          ownerId: otherOwnerId,
          templateVersionId: catalog.templateVersionId,
          packageId: catalog.packageId,
          slug: first.slug,
          content: {},
          // The settings row's default party limit, stated explicitly like the use case does (M9 T13).
          rsvpPartyLimit: 4,
        }),
        (error: unknown) => error instanceof InvitationSlugTakenError && error.slug === first.slug,
      );

      assert.equal(await prisma.invitation.count({ where: { slug: first.slug } }), 1);
      assert.equal(await prisma.invitation.count({ where: { id: first.id } }), 1);
      assert.equal(await prisma.invitation.count({ where: { ownerId: otherOwnerId } }), 0);
    });
  });

  describe("findOwned and listOwned", () => {
    it("answers the owner's invitation and null for another owner's id (A4)", async () => {
      const ownerId = await newOwner();
      const created = await newDraft(ownerId);

      assert.deepEqual(await repository.findOwned(ownerId, created.id), created);
      assert.equal(await repository.findOwned(await newOwner(), created.id), null);
      assert.equal(await repository.findOwned(ownerId, UNKNOWN_ID), null);
    });

    it("answers only the stored points the domain still accepts (S2, S3)", async () => {
      const ownerId = await newOwner();
      const created = await newDraft(ownerId, newSlug(), { address: "Calle Hidalgo 12" });
      const label = "Calle Hidalgo 12, Querétaro";

      // Two of the rows were written around the API: a field that is not an address field, and a blank label.
      await prisma.invitationPlace.createMany({
        data: [
          { invitationId: created.id, field: "address", label, lat: 20.5888, lng: -100.3899 },
          {
            invitationId: created.id,
            field: "notes",
            label: "Centro",
            lat: 20.5888,
            lng: -100.3899,
          },
          {
            invitationId: created.id,
            field: "ceremonyAddress",
            label: "   ",
            lat: 20.5888,
            lng: -100.3899,
          },
        ],
      });

      const found = await repository.findOwned(ownerId, created.id);

      // The read degrades to the points nobody can dispute instead of answering values no rule validated.
      assert.deepEqual(found?.places, { address: { label, lat: 20.5888, lng: -100.3899 } });
      assert.deepEqual(found?.content, { address: "Calle Hidalgo 12" });
    });

    it("lists only the owner's invitations, newest first", async () => {
      const ownerId = await newOwner();
      const otherOwnerId = await newOwner();
      const first = await newDraft(ownerId);
      const second = await newDraft(ownerId);
      const foreign = await newDraft(otherOwnerId);

      const listed = await repository.listOwned(ownerId);

      assert.deepEqual(
        listed.map((item) => item.id),
        [second.id, first.id],
      );
      assert.ok(listed[0] && listed[1] && listed[0].createdAt >= listed[1].createdAt);
      assert.equal(
        listed.some((item) => item.id === foreign.id),
        false,
      );
      assert.equal(
        listed.every((item) => item.ownerId === ownerId),
        true,
      );
      assert.deepEqual(await repository.listOwned(randomUUID()), []);
    });
  });

  describe("updateContent", () => {
    it("replaces the content of a DRAFT and moves updatedAt", async () => {
      const ownerId = await newOwner();
      const created = await newDraft(ownerId);

      const updated = await repository.updateContent(ownerId, created.id, { celebrantName: "Ana" });

      assert.deepEqual(updated?.content, { celebrantName: "Ana" });
      assert.equal(updated?.status, "DRAFT");
      assert.equal(updated?.archivedAt, null);
      assert.ok(updated && updated.updatedAt >= created.updatedAt);
      assert.deepEqual((await stored(created.id)).content, { celebrantName: "Ana" });
    });

    it("refuses an ARCHIVED invitation and leaves the row unchanged (S7, A3)", async () => {
      const ownerId = await newOwner();
      const created = await newDraft(ownerId);
      await repository.archive(ownerId, created.id);
      const before = await stored(created.id);

      await assert.rejects(
        repository.updateContent(ownerId, created.id, { celebrantName: "Ana" }),
        InvitationNotEditableError,
      );

      assert.deepEqual(await stored(created.id), before);
      assert.deepEqual((await stored(created.id)).content, {});
    });

    it("replaces the content of a PUBLISHED invitation and keeps it published (S7)", async () => {
      const ownerId = await newOwner();
      const published = await newPublishedDraft(ownerId, newSlug(), { celebrantName: "Ana" });

      const updated = await repository.updateContent(ownerId, published.id, {
        celebrantName: "Beatriz",
      });

      assert.deepEqual(updated?.content, { celebrantName: "Beatriz" });
      assert.equal(updated?.status, "PUBLISHED");
      assert.deepEqual(updated?.publishedAt, PUBLISHED_AT);
      const row = await stored(published.id);
      assert.deepEqual(row.content, { celebrantName: "Beatriz" });
      assert.equal(row.status, "PUBLISHED");
      assert.deepEqual(row.publishedAt, PUBLISHED_AT);
    });

    it("answers null for another owner's id and changes nothing (A4)", async () => {
      const ownerId = await newOwner();
      const created = await newDraft(ownerId);
      const before = await stored(created.id);

      assert.equal(
        await repository.updateContent(await newOwner(), created.id, { celebrantName: "Ana" }),
        null,
      );
      assert.deepEqual(await stored(created.id), before);
      assert.deepEqual((await stored(created.id)).content, {});
    });

    it("answers null for an id that names nothing", async () => {
      assert.equal(await repository.updateContent(await newOwner(), UNKNOWN_ID, {}), null);
    });
  });

  describe("archive", () => {
    it("sets ARCHIVED and archivedAt together and keeps the content", async () => {
      const ownerId = await newOwner();
      const created = await newDraft(ownerId, newSlug(), { celebrantName: "Ana" });

      const archived = await repository.archive(ownerId, created.id);

      assert.equal(archived?.status, "ARCHIVED");
      assert.ok(archived?.archivedAt instanceof Date);
      const row = await stored(created.id);
      assert.equal(row.status, "ARCHIVED");
      assert.ok(row.archivedAt instanceof Date);
      assert.deepEqual(row.content, { celebrantName: "Ana" });
      assert.equal(row.archivedAt.getTime(), archived?.archivedAt.getTime());
      // Archiving is not deleting.
      assert.equal(await prisma.invitation.count({ where: { id: created.id } }), 1);
    });

    it("refuses an invitation that is already archived and leaves it unchanged", async () => {
      const ownerId = await newOwner();
      const created = await newDraft(ownerId);
      await repository.archive(ownerId, created.id);
      const before = await stored(created.id);

      await assert.rejects(repository.archive(ownerId, created.id), InvitationAlreadyArchivedError);

      assert.deepEqual(await stored(created.id), before);
    });

    it("archives a PUBLISHED invitation and clears publishedAt and expiresAt (S1, A2)", async () => {
      const ownerId = await newOwner();
      const published = await newPublishedDraft(ownerId, newSlug(), { celebrantName: "Ana" });
      assert.deepEqual(published.expiresAt, EXPIRES_AT);

      const archived = await repository.archive(ownerId, published.id);

      assert.equal(archived?.status, "ARCHIVED");
      assert.ok(archived?.archivedAt instanceof Date);
      assert.equal(archived?.publishedAt, null);
      assert.equal(archived?.expiresAt, null);
      const row = await stored(published.id);
      assert.equal(row.status, "ARCHIVED");
      assert.ok(row.archivedAt instanceof Date);
      // The CHECK constraint requires the marker to be cleared with the status (S7, A2).
      assert.equal(row.publishedAt, null);
      // An archived invitation is not public, so it no longer expires either (S1).
      assert.equal(row.expiresAt, null);
      assert.deepEqual(row.content, { celebrantName: "Ana" });
    });

    it("answers null for another owner's id and leaves the draft unchanged (A4)", async () => {
      const ownerId = await newOwner();
      const created = await newDraft(ownerId);
      const before = await stored(created.id);

      assert.equal(await repository.archive(await newOwner(), created.id), null);

      assert.deepEqual(await stored(created.id), before);
      assert.equal((await stored(created.id)).status, "DRAFT");
    });

    it("answers null for an id that names nothing", async () => {
      assert.equal(await repository.archive(await newOwner(), UNKNOWN_ID), null);
    });
  });

  describe("pinned version (S3)", () => {
    it("keeps the pinned version after the template publishes a newer one", async () => {
      const ownerId = await newOwner();
      const catalog = await newCatalog();
      const created = await repository.create({
        ownerId,
        templateVersionId: catalog.templateVersionId,
        packageId: catalog.packageId,
        slug: newSlug(),
        content: {},
        // The settings row's default party limit, stated explicitly like the use case does (M9 T13).
        rsvpPartyLimit: 4,
      });
      invitationIds.push(created.id);
      const newer = await prisma.templateVersion.create({
        data: {
          templateId: (
            await prisma.templateVersion.findUniqueOrThrow({
              where: { id: catalog.templateVersionId },
              select: { templateId: true },
            })
          ).templateId,
          version: 2,
          status: "DRAFT",
          componentKey: "birthday-poster-01",
          schema: { type: "object", required: [], properties: {} },
          configuration: { componentKey: "birthday-poster-01" },
        },
      });
      await prisma.$transaction([
        prisma.templateVersion.update({
          where: { id: catalog.templateVersionId },
          data: { status: "RETIRED" },
        }),
        prisma.templateVersion.update({ where: { id: newer.id }, data: { status: "PUBLISHED" } }),
      ]);

      const updated = await repository.updateContent(ownerId, created.id, { celebrantName: "Ana" });

      assert.equal(updated?.templateVersionId, catalog.templateVersionId);
      assert.equal((await stored(created.id)).templateVersionId, catalog.templateVersionId);
    });
  });

  describe("publish and unpublish (S7, A2)", () => {
    it("publishes a DRAFT with the given instant and keeps its content", async () => {
      const ownerId = await newOwner();
      const created = await newDraft(ownerId, newSlug(), { celebrantName: "Ana" });

      const published = await repository.publish(ownerId, created.id, PUBLISHED_AT, EXPIRES_AT);

      assert.equal(published?.status, "PUBLISHED");
      assert.deepEqual(published?.publishedAt, PUBLISHED_AT);
      assert.deepEqual(published?.expiresAt, EXPIRES_AT);
      assert.equal(published?.archivedAt, null);
      assert.deepEqual(published?.content, { celebrantName: "Ana" });
      // The record and the stored row agree, including the publication and expiry columns.
      assert.deepEqual(await storedRecord(created.id), { ...published });
      assert.deepEqual((await stored(created.id)).expiresAt, EXPIRES_AT);
    });

    it("writes no expiry for a publication that states none, which reads as never expiring (S1)", async () => {
      const ownerId = await newOwner();
      const created = await newDraft(ownerId);

      const published = await repository.publish(ownerId, created.id, PUBLISHED_AT);

      assert.deepEqual(published?.publishedAt, PUBLISHED_AT);
      assert.equal(published?.expiresAt, null);
      assert.equal((await stored(created.id)).expiresAt, null);
    });

    it("returns a PUBLISHED invitation to DRAFT and clears publishedAt and expiresAt (S1, S7)", async () => {
      const ownerId = await newOwner();
      const published = await newPublishedDraft(ownerId);
      assert.deepEqual(published.expiresAt, EXPIRES_AT);

      const draft = await repository.unpublish(ownerId, published.id);

      assert.equal(draft?.status, "DRAFT");
      assert.equal(draft?.publishedAt, null);
      assert.equal(draft?.expiresAt, null);
      assert.deepEqual(await storedRecord(published.id), { ...draft });
    });

    it("refuses to publish twice and leaves the row unchanged", async () => {
      const ownerId = await newOwner();
      const published = await newPublishedDraft(ownerId);
      const before = await stored(published.id);

      await assert.rejects(
        repository.publish(ownerId, published.id, new Date()),
        InvitationAlreadyPublishedError,
      );

      assert.deepEqual(await stored(published.id), before);
    });

    it("refuses to publish an ARCHIVED invitation and leaves the row unchanged (A2)", async () => {
      const ownerId = await newOwner();
      const created = await newDraft(ownerId);
      await repository.archive(ownerId, created.id);
      const before = await stored(created.id);

      await assert.rejects(
        repository.publish(ownerId, created.id, PUBLISHED_AT),
        InvitationAlreadyArchivedError,
      );

      assert.deepEqual(await stored(created.id), before);
    });

    it("refuses to unpublish a DRAFT and an ARCHIVED invitation (S7, A2)", async () => {
      const ownerId = await newOwner();
      const draft = await newDraft(ownerId);
      const draftBefore = await stored(draft.id);

      await assert.rejects(repository.unpublish(ownerId, draft.id), InvitationNotPublishedError);
      assert.deepEqual(await stored(draft.id), draftBefore);

      const archived = await newDraft(ownerId);
      await repository.archive(ownerId, archived.id);
      const archivedBefore = await stored(archived.id);

      await assert.rejects(
        repository.unpublish(ownerId, archived.id),
        InvitationAlreadyArchivedError,
      );
      assert.deepEqual(await stored(archived.id), archivedBefore);
    });

    it("answers null for another owner's id and changes nothing (A4)", async () => {
      const ownerId = await newOwner();
      const published = await newPublishedDraft(ownerId);
      const draft = await newDraft(ownerId);
      const foreigner = await newOwner();

      assert.equal(await repository.publish(foreigner, draft.id, PUBLISHED_AT), null);
      assert.equal(await repository.unpublish(foreigner, published.id), null);

      assert.equal((await stored(draft.id)).status, "DRAFT");
      assert.equal((await stored(draft.id)).publishedAt, null);
      assert.equal((await stored(published.id)).status, "PUBLISHED");
      assert.deepEqual((await stored(published.id)).publishedAt, PUBLISHED_AT);
    });

    it("answers null for an id that names nothing", async () => {
      const ownerId = await newOwner();

      assert.equal(await repository.publish(ownerId, UNKNOWN_ID, PUBLISHED_AT), null);
      assert.equal(await repository.unpublish(ownerId, UNKNOWN_ID), null);
    });
  });

  describe("findPublishedBySlug (S2, S8, A3)", () => {
    it("answers the published row by slug in one query", async () => {
      const ownerId = await newOwner();
      const slug = newSlug();
      const published = await newPublishedDraft(ownerId, slug, { celebrantName: "Ana" });

      const found = await repository.findPublishedBySlug(slug);

      assert.deepEqual(found, published);
    });

    it("answers null for a DRAFT, an ARCHIVED, and an unknown slug", async () => {
      const ownerId = await newOwner();
      const draft = await newDraft(ownerId);
      const archived = await newPublishedDraft(ownerId);
      await repository.archive(ownerId, archived.id);

      assert.equal(await repository.findPublishedBySlug(draft.slug), null);
      assert.equal(await repository.findPublishedBySlug(archived.slug), null);
      assert.equal(await repository.findPublishedBySlug(newSlug()), null);
    });

    it("answers a row whose expiry passed, because it stays visible read-only (S2, T3)", async () => {
      const ownerId = await newOwner();
      const expired = await newPublishedDraft(ownerId, newSlug());
      const future = await newPublishedDraft(ownerId, newSlug());
      await prisma.invitation.update({
        where: { id: expired.id },
        data: { expiresAt: new Date("2020-01-01T00:00:00.000Z") },
      });
      const later = new Date();
      later.setUTCFullYear(later.getUTCFullYear() + 1);
      await prisma.invitation.update({
        where: { id: future.id },
        data: { expiresAt: later },
      });
      const expiredBefore = await storedRecord(expired.id);
      const futureBefore = await storedRecord(future.id);

      // The row is still answered with its elapsed expiry: the projection is what flags it read-only (S2).
      assert.deepEqual(await repository.findPublishedBySlug(expired.slug), expiredBefore);
      assert.deepEqual(await repository.findPublishedBySlug(future.slug), futureBefore);
    });
  });

  // The cross-module boundary (S3, S6, A1): what the invitations module may read from the catalog, proven on
  // real rows. The reader is exercised through `CatalogInvitationReader`, the adapter a use case depends on, so
  // the catalog contract and the invitations side of it are checked together.
  describe("catalog public reader (S3, S6, A1)", () => {
    /** A feature a package may include or exclude. */
    async function newFeature(suffix: string) {
      sequence += 1;
      const created = await prisma.feature.create({
        data: {
          key: `M4_T3_${runId.toUpperCase()}_${suffix}_${sequence}`,
          name: `Función ${suffix}`,
        },
      });
      featureIds.push(created.id);
      return created;
    }

    async function linkFeature(packageId: string, featureId: string, included: boolean) {
      await prisma.packageFeature.create({ data: { packageId, featureId, included } });
    }

    it("answers a PUBLISHED version of a PUBLISHED template with the renderer's required feature keys", async () => {
      const schema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["celebrantName"],
        properties: { celebrantName: { type: "string", maxLength: 80 } },
      };
      const catalog = await newCatalog({ templateStatus: "PUBLISHED", schema });

      const version = await catalogReader.findPublishedVersion(catalog.templateVersionId);

      assert.deepEqual(version, {
        id: catalog.templateVersionId,
        templateId: catalog.templateId,
        componentKey: "birthday-poster-01",
        schema,
        // Read from the in-code renderer registry, not from the database (A1).
        requiredFeatureKeys: [],
      });
    });

    it("answers null for a DRAFT or RETIRED version and for an id that names nothing", async () => {
      const draftTemplate = await newCatalog({
        templateStatus: "PUBLISHED",
        versionStatus: "DRAFT",
      });
      const retiredTemplate = await newCatalog({
        templateStatus: "PUBLISHED",
        versionStatus: "RETIRED",
      });

      assert.equal(await catalogReader.findPublishedVersion(draftTemplate.templateVersionId), null);
      assert.equal(
        await catalogReader.findPublishedVersion(retiredTemplate.templateVersionId),
        null,
      );
      assert.equal(await catalogReader.findPublishedVersion(UNKNOWN_ID), null);
    });

    it("answers null while the template itself is DRAFT or ARCHIVED", async () => {
      const draftTemplate = await newCatalog({ templateStatus: "DRAFT" });
      const archivedTemplate = await newCatalog({ templateStatus: "ARCHIVED" });

      assert.equal(await catalogReader.findPublishedVersion(draftTemplate.templateVersionId), null);
      assert.equal(
        await catalogReader.findPublishedVersion(archivedTemplate.templateVersionId),
        null,
      );
    });

    it("answers null for a version whose renderer is not in the allow-list", async () => {
      const unregistered = await newCatalog({
        templateStatus: "PUBLISHED",
        componentKey: "not-a-registered-renderer",
      });

      assert.equal(await catalogReader.findPublishedVersion(unregistered.templateVersionId), null);
    });

    it("answers the stored schema of a RETIRED version, so a pinned draft keeps validating (S3)", async () => {
      const schema = {
        type: "object",
        required: ["celebrantName"],
        properties: { celebrantName: { type: "string", maxLength: 80 } },
      };
      const retired = await newCatalog({ versionStatus: "RETIRED", schema });

      assert.deepEqual(await catalogReader.findVersionSchema(retired.templateVersionId), {
        id: retired.templateVersionId,
        schema,
      });
      assert.equal(await catalogReader.findPublishedVersion(retired.templateVersionId), null);
      assert.equal(await catalogReader.findVersionSchema(UNKNOWN_ID), null);
    });

    it("answers the render data of a RETIRED version, so a published invitation keeps rendering it (A1)", async () => {
      const schema = {
        type: "object",
        required: ["celebrantName"],
        properties: { celebrantName: { type: "string", maxLength: 80 } },
      };
      const configuration = { componentKey: "birthday-poster-01", theme: "dinosaurs" };
      const retired = await newCatalog({
        templateStatus: "ARCHIVED",
        versionStatus: "RETIRED",
        schema,
        configuration,
      });

      assert.deepEqual(await catalogReader.findVersionRenderData(retired.templateVersionId), {
        componentKey: "birthday-poster-01",
        configuration,
        schema,
      });
      assert.equal(await catalogReader.findVersionRenderData(UNKNOWN_ID), null);
      assert.equal(catalogReader.isRendererRegistered("birthday-poster-01"), true);
      assert.equal(catalogReader.isRendererRegistered("retired-renderer-99"), false);
    });

    it("answers package entitlements with only the included feature keys (S6, A1)", async () => {
      const catalog = await newCatalog();
      const included = await newFeature("INCLUDED");
      const excluded = await newFeature("EXCLUDED");
      await linkFeature(catalog.packageId, included.id, true);
      await linkFeature(catalog.packageId, excluded.id, false);
      await prisma.package.update({
        where: { id: catalog.packageId },
        data: { status: "ACTIVE" },
      });

      const entitlements = await catalogReader.findPackageEntitlements(catalog.packageId);

      // The duration travels with the entitlements, because the publication writes the expiry from it (S1, T2).
      assert.deepEqual(entitlements, {
        status: "ACTIVE",
        includedFeatureKeys: [included.key],
        durationDays: 30,
      });
      assert.equal(await catalogReader.findPackageEntitlements(UNKNOWN_ID), null);
    });

    it("answers the status of a package that is not ACTIVE as stored", async () => {
      const catalog = await newCatalog();
      await prisma.package.update({
        where: { id: catalog.packageId },
        data: { status: "ARCHIVED" },
      });

      assert.deepEqual(await catalogReader.findPackageEntitlements(catalog.packageId), {
        status: "ARCHIVED",
        includedFeatureKeys: [],
        durationDays: 30,
      });
    });
  });
});
