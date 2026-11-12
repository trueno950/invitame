import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { type Prisma, PrismaClient, type TemplateVersionStatus } from "@prisma/client";
import { requireLocalDatabaseUrl } from "../../../test/database";

// The publication persistence foundation (M5 T1; S2, S7, S8, A2) on real PostgreSQL: `PUBLISHED` joins the
// invitation lifecycle, `publishedAt` is set exactly while the status is `PUBLISHED` (unpublishing and
// archiving clear it), the archive marker still matches the status for all three statuses, `expiresAt` is a
// nullable column that M5 never sets, and the pinned fields of a published invitation stay immutable while
// its content remains editable. Runs only through `pnpm --filter @invitame/api test:db` with an explicit
// DATABASE_URL that points at a disposable, already migrated local database; not part of `pnpm test`. The
// database is shared with parallel suites: every row here carries a key made from this run's id, and only
// those rows are removed.

const PUBLISHED_AT_MATCHES_STATUS = /Invitation_publishedAt_matches_status/;
const ARCHIVED_AT_MATCHES_STATUS = /Invitation_archivedAt_matches_status/;
const PINNED_IMMUTABLE = /Invitation pinned fields are immutable/;

describe("invitation publication schema (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const packageIds: string[] = [];
  const invitationIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newOwner(): Promise<string> {
    sequence += 1;
    const created = await prisma.user.create({
      data: { email: `m5-t1-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);
    return created.id;
  }

  async function newPackage(): Promise<string> {
    sequence += 1;
    const created = await prisma.package.create({
      data: { key: `m5-t1-package-${sequence}-${runId}`, name: "Paquete" },
    });
    packageIds.push(created.id);
    return created.id;
  }

  function newVersion(templateId: string, version: number, status: TemplateVersionStatus) {
    return prisma.templateVersion.create({
      data: {
        templateId,
        version,
        status,
        componentKey: "birthday-adventure-01",
        schema: { fields: ["title"] },
        configuration: { theme: "light" },
      },
    });
  }

  /** A template with one PUBLISHED version: the catalog state an invitation is created against. */
  async function newTemplateWithVersion(): Promise<{ templateId: string; versionId: string }> {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `m5-t1-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m5-t1-template-${sequence}-${runId}`,
        name: "Plantilla",
      },
    });
    templateIds.push(template.id);
    const version = await newVersion(template.id, 1, "PUBLISHED");
    return { templateId: template.id, versionId: version.id };
  }

  interface Fixture {
    ownerId: string;
    templateId: string;
    versionId: string;
    packageId: string;
  }

  async function newFixture(): Promise<Fixture> {
    const ownerId = await newOwner();
    const { templateId, versionId } = await newTemplateWithVersion();
    const packageId = await newPackage();
    return { ownerId, templateId, versionId, packageId };
  }

  /** A lower-case slug unique to this run, shaped like the generator's output. */
  function newSlug(): string {
    sequence += 1;
    return `cumple-m5-${runId.slice(0, 8)}-${sequence}`;
  }

  async function newInvitation(
    fixture: Fixture,
    overrides: Partial<Prisma.InvitationUncheckedCreateInput> = {},
  ) {
    const created = await prisma.invitation.create({
      data: {
        ownerId: fixture.ownerId,
        templateVersionId: fixture.versionId,
        packageId: fixture.packageId,
        slug: newSlug(),
        content: { title: "Cumpleaños" },
        ...overrides,
      },
    });
    invitationIds.push(created.id);
    return created;
  }

  const stored = (id: string) => prisma.invitation.findUniqueOrThrow({ where: { id } });

  /** A DRAFT invitation this suite can publish, unpublish, or archive. */
  const newDraft = async () => newInvitation(await newFixture());

  /** A PUBLISHED invitation, the state an unpublish or archive starts from. */
  const newPublished = async () =>
    newInvitation(await newFixture(), {
      status: "PUBLISHED",
      publishedAt: new Date("2026-11-12T08:00:00.000Z"),
    });

  describe("insert", () => {
    it("refuses PUBLISHED without publishedAt and stores nothing", async () => {
      const fixture = await newFixture();

      await assert.rejects(
        newInvitation(fixture, { status: "PUBLISHED", publishedAt: null }),
        PUBLISHED_AT_MATCHES_STATUS,
      );

      assert.equal(await prisma.invitation.count({ where: { ownerId: fixture.ownerId } }), 0);
    });

    it("refuses DRAFT with publishedAt and stores nothing", async () => {
      const fixture = await newFixture();

      await assert.rejects(
        newInvitation(fixture, { status: "DRAFT", publishedAt: new Date() }),
        PUBLISHED_AT_MATCHES_STATUS,
      );

      assert.equal(await prisma.invitation.count({ where: { ownerId: fixture.ownerId } }), 0);
    });

    it("refuses ARCHIVED with publishedAt and stores nothing", async () => {
      const fixture = await newFixture();

      await assert.rejects(
        newInvitation(fixture, {
          status: "ARCHIVED",
          archivedAt: new Date("2026-11-12T09:00:00.000Z"),
          publishedAt: new Date("2026-11-12T08:00:00.000Z"),
        }),
        PUBLISHED_AT_MATCHES_STATUS,
      );

      assert.equal(await prisma.invitation.count({ where: { ownerId: fixture.ownerId } }), 0);
    });

    it("stores a PUBLISHED invitation that carries publishedAt", async () => {
      const publishedAt = new Date("2026-11-12T08:00:00.000Z");

      const row = await newPublished();

      assert.equal(row.status, "PUBLISHED");
      assert.deepEqual(row.publishedAt, publishedAt);
      assert.equal(row.archivedAt, null);
      assert.deepEqual(await stored(row.id), row);
    });

    it("defaults expiresAt to null and accepts a timestamp", async () => {
      const withoutExpiry = await newDraft();
      assert.equal(withoutExpiry.expiresAt, null);

      const expiresAt = new Date("2027-01-31T23:59:59.000Z");
      const published = await newInvitation(await newFixture(), {
        status: "PUBLISHED",
        publishedAt: new Date("2026-11-12T08:00:00.000Z"),
        expiresAt,
      });

      assert.deepEqual(published.expiresAt, expiresAt);
      assert.deepEqual((await stored(published.id)).expiresAt, expiresAt);
    });
  });

  describe("publishedAt matches the status (S7, A2)", () => {
    it("accepts DRAFT to PUBLISHED with publishedAt and keeps content and pinned fields", async () => {
      const invitation = await newDraft();
      const before = await stored(invitation.id);
      const publishedAt = new Date("2026-11-12T10:15:00.000Z");

      const updated = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "PUBLISHED", publishedAt },
      });

      assert.equal(updated.status, "PUBLISHED");
      assert.deepEqual(updated.publishedAt, publishedAt);
      assert.equal(updated.archivedAt, null);
      assert.deepEqual(updated.content, before.content);
      assert.equal(updated.ownerId, before.ownerId);
      assert.equal(updated.templateVersionId, before.templateVersionId);
      assert.equal(updated.packageId, before.packageId);
      assert.equal(updated.slug, before.slug);
      assert.deepEqual(await stored(invitation.id), updated);
    });

    it("refuses publishing without publishedAt and leaves the invitation DRAFT", async () => {
      const invitation = await newDraft();
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: "PUBLISHED" },
        }),
        PUBLISHED_AT_MATCHES_STATUS,
      );

      assert.equal((await stored(invitation.id)).status, "DRAFT");
      assert.deepEqual(await stored(invitation.id), before);
    });

    it("accepts PUBLISHED to DRAFT when publishedAt is cleared", async () => {
      const invitation = await newPublished();
      const before = await stored(invitation.id);

      const updated = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "DRAFT", publishedAt: null },
      });

      assert.equal(updated.status, "DRAFT");
      assert.equal(updated.publishedAt, null);
      assert.equal(updated.archivedAt, null);
      assert.deepEqual(updated.content, before.content);
      assert.equal(updated.slug, before.slug);
      assert.equal(updated.templateVersionId, before.templateVersionId);
      assert.deepEqual(await stored(invitation.id), updated);
    });

    it("refuses returning to DRAFT while publishedAt remains and keeps the row PUBLISHED", async () => {
      const invitation = await newPublished();
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({ where: { id: invitation.id }, data: { status: "DRAFT" } }),
        PUBLISHED_AT_MATCHES_STATUS,
      );

      assert.equal((await stored(invitation.id)).status, "PUBLISHED");
      assert.deepEqual(await stored(invitation.id), before);
    });

    it("refuses clearing publishedAt while the invitation stays PUBLISHED", async () => {
      const invitation = await newPublished();
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({ where: { id: invitation.id }, data: { publishedAt: null } }),
        PUBLISHED_AT_MATCHES_STATUS,
      );

      assert.deepEqual(await stored(invitation.id), before);
    });

    it("accepts PUBLISHED to ARCHIVED with archivedAt set and publishedAt cleared", async () => {
      const invitation = await newPublished();
      const before = await stored(invitation.id);
      const archivedAt = new Date("2026-11-12T11:45:00.000Z");

      const updated = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "ARCHIVED", archivedAt, publishedAt: null },
      });

      assert.equal(updated.status, "ARCHIVED");
      assert.deepEqual(updated.archivedAt, archivedAt);
      assert.equal(updated.publishedAt, null);
      assert.deepEqual(updated.content, before.content);
      assert.equal(updated.slug, before.slug);
      assert.deepEqual(await stored(invitation.id), updated);
    });

    it("refuses archiving a PUBLISHED invitation without archivedAt and clears nothing", async () => {
      const invitation = await newPublished();
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: "ARCHIVED", publishedAt: null },
        }),
        ARCHIVED_AT_MATCHES_STATUS,
      );

      assert.equal((await stored(invitation.id)).status, "PUBLISHED");
      assert.deepEqual(await stored(invitation.id), before);
    });

    it("keeps expiresAt nullable and settable without changing the status rule (S8)", async () => {
      const invitation = await newDraft();
      const before = await stored(invitation.id);
      const expiresAt = new Date("2027-02-28T23:59:59.000Z");

      const withExpiry = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { expiresAt },
      });

      assert.deepEqual(withExpiry.expiresAt, expiresAt);
      assert.equal(withExpiry.status, "DRAFT");
      assert.equal(withExpiry.publishedAt, before.publishedAt);

      const withoutExpiry = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { expiresAt: null },
      });

      assert.equal(withoutExpiry.expiresAt, null);
      assert.deepEqual(await stored(invitation.id), withoutExpiry);
    });
  });

  describe("pinned fields of a published invitation", () => {
    it("refuses changing the owner of a PUBLISHED invitation and leaves it unchanged", async () => {
      const invitation = await newPublished();
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { ownerId: await newOwner() },
        }),
        PINNED_IMMUTABLE,
      );

      assert.deepEqual(await stored(invitation.id), before);
    });

    it("refuses changing the template version of a PUBLISHED invitation and leaves it unchanged", async () => {
      const invitation = await newPublished();
      const before = await stored(invitation.id);
      const { versionId: otherVersionId } = await newTemplateWithVersion();

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { templateVersionId: otherVersionId },
        }),
        PINNED_IMMUTABLE,
      );

      assert.deepEqual(await stored(invitation.id), before);
    });

    it("refuses changing the package of a PUBLISHED invitation and leaves it unchanged", async () => {
      const invitation = await newPublished();
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { packageId: await newPackage() },
        }),
        PINNED_IMMUTABLE,
      );

      assert.deepEqual(await stored(invitation.id), before);
    });

    it("refuses changing the slug of a PUBLISHED invitation and leaves it unchanged", async () => {
      const invitation = await newPublished();
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({ where: { id: invitation.id }, data: { slug: newSlug() } }),
        PINNED_IMMUTABLE,
      );

      assert.deepEqual(await stored(invitation.id), before);
    });

    it("allows changing content in place while the invitation stays PUBLISHED", async () => {
      const invitation = await newPublished();
      const before = await stored(invitation.id);

      const updated = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { content: { title: "Cumpleaños", message: "Los esperamos" } },
      });

      assert.deepEqual(updated.content, { title: "Cumpleaños", message: "Los esperamos" });
      assert.equal(updated.status, "PUBLISHED");
      assert.deepEqual(updated.publishedAt, before.publishedAt);
      assert.equal(updated.ownerId, before.ownerId);
      assert.equal(updated.templateVersionId, before.templateVersionId);
      assert.equal(updated.packageId, before.packageId);
      assert.equal(updated.slug, before.slug);
      assert.equal(updated.createdAt.getTime(), before.createdAt.getTime());
      assert.deepEqual(await stored(invitation.id), updated);
    });
  });
});
