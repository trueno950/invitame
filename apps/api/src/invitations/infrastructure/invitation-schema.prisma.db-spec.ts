import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { Prisma, PrismaClient, type TemplateVersionStatus } from "@prisma/client";
import { requireLocalDatabaseUrl } from "../../../test/database";

// The `Invitation` persistence foundation (M4 T1; S2, S3, S5, S10, A3) on real PostgreSQL: a draft is
// pinned to the template version, package, and slug chosen at creation; the slug is lower-case and
// unique in the database; `content` is a JSON object; the archive marker matches the status; and a
// referenced `TemplateVersion`, `User`, or `Package` cannot be deleted. Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL.

const PINNED_IMMUTABLE = /Invitation pinned fields are immutable/;
const SLUG_FORMAT = /Invitation_slug_format/;
const SLUG_LENGTH = /Invitation_slug_length/;
const CONTENT_OBJECT = /Invitation_content_object/;
const ARCHIVED_AT_MATCHES_STATUS = /Invitation_archivedAt_matches_status/;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

describe("invitation schema (real PostgreSQL)", () => {
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
      data: { email: `m4-t1-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);
    return created.id;
  }

  async function newPackage(): Promise<string> {
    sequence += 1;
    const created = await prisma.package.create({
      data: { key: `m4-t1-package-${sequence}-${runId}`, name: "Paquete" },
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
      data: { key: `m4-t1-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m4-t1-template-${sequence}-${runId}`,
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
    return `cumple-${runId.slice(0, 8)}-${sequence}`;
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

  describe("insert", () => {
    it("stores a DRAFT invitation pinned to its owner, version, package, and slug", async () => {
      const fixture = await newFixture();

      const row = await newInvitation(fixture);

      assert.match(row.id, /^[0-9a-f-]{36}$/);
      assert.equal(row.ownerId, fixture.ownerId);
      assert.equal(row.templateVersionId, fixture.versionId);
      assert.equal(row.packageId, fixture.packageId);
      assert.match(row.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
      assert.equal(row.status, "DRAFT");
      assert.equal(row.archivedAt, null);
      assert.deepEqual(row.content, { title: "Cumpleaños" });
      assert.ok(row.createdAt instanceof Date);
      assert.ok(row.updatedAt instanceof Date);
      assert.deepEqual(await stored(row.id), row);
    });

    it("defaults status to DRAFT, content to an empty object, and archivedAt to null", async () => {
      const fixture = await newFixture();

      const row = await prisma.invitation.create({
        data: {
          ownerId: fixture.ownerId,
          templateVersionId: fixture.versionId,
          packageId: fixture.packageId,
          slug: newSlug(),
        },
      });
      invitationIds.push(row.id);

      assert.equal(row.status, "DRAFT");
      assert.equal(row.archivedAt, null);
      assert.deepEqual(row.content, {});
    });

    it("refuses a duplicate slug in PostgreSQL and leaves the stored invitation unchanged", async () => {
      const first = await newInvitation(await newFixture());
      const other = await newFixture();

      await assert.rejects(newInvitation(other, { slug: first.slug }), isUniqueViolation);

      assert.equal(await prisma.invitation.count({ where: { slug: first.slug } }), 1);
      assert.deepEqual(await stored(first.id), first);
    });

    const INVALID_SLUGS = [
      "Cumple-k7m2qx",
      "cumple-K7M2QX",
      "cumple k7m2qx",
      "cumple_k7m2qx",
      "cumple--k7m2qx",
      "-cumple-k7m2qx",
      "cumple-k7m2qx-",
      "cumple.k7m2qx",
      "cumple/k7m2qx",
      "cumple+k7m2qx",
    ];

    for (const slug of INVALID_SLUGS) {
      it(`refuses the slug ${JSON.stringify(slug)} and stores nothing`, async () => {
        const fixture = await newFixture();

        await assert.rejects(newInvitation(fixture, { slug }), SLUG_FORMAT);

        assert.equal(await prisma.invitation.count({ where: { ownerId: fixture.ownerId } }), 0);
      });
    }

    it("refuses a slug shorter than three characters and stores nothing", async () => {
      const fixture = await newFixture();

      await assert.rejects(newInvitation(fixture, { slug: "ab" }), SLUG_LENGTH);

      assert.equal(await prisma.invitation.count({ where: { ownerId: fixture.ownerId } }), 0);
    });

    it("accepts a sixty-character slug and refuses sixty-one, storing nothing", async () => {
      const sixty = `cumple-${"a".repeat(53)}`;
      assert.equal(sixty.length, 60);

      const accepted = await newInvitation(await newFixture(), { slug: sixty });
      assert.equal((await stored(accepted.id)).slug, sixty);

      const fixture = await newFixture();
      // VARCHAR(60) refuses the 61st character before `Invitation_slug_length` is evaluated.
      await assert.rejects(newInvitation(fixture, { slug: `${sixty}b` }), /too long|22001/);

      assert.equal(await prisma.invitation.count({ where: { ownerId: fixture.ownerId } }), 0);
    });

    it("refuses updating content to a non-object and leaves the row unchanged", async () => {
      const invitation = await newInvitation(await newFixture());
      const before = await stored(invitation.id);

      for (const bad of [[], "cumple", 42, true]) {
        await assert.rejects(
          prisma.invitation.update({
            where: { id: invitation.id },
            data: { content: bad as Prisma.InputJsonValue },
          }),
          CONTENT_OBJECT,
        );
        assert.deepEqual(await stored(invitation.id), before);
      }
    });

    const NON_OBJECT_CONTENT = [
      ["an array", []],
      ["a string", "cumple"],
      ["a number", 42],
      ["a boolean", true],
    ] as const;

    for (const [label, content] of NON_OBJECT_CONTENT) {
      it(`refuses ${label} as content and stores nothing`, async () => {
        const fixture = await newFixture();

        await assert.rejects(
          newInvitation(fixture, { content: content as Prisma.InputJsonValue }),
          CONTENT_OBJECT,
        );

        assert.equal(await prisma.invitation.count({ where: { ownerId: fixture.ownerId } }), 0);
      });
    }

    it("stores an ARCHIVED invitation that carries archivedAt", async () => {
      const fixture = await newFixture();
      const archivedAt = new Date("2026-11-11T10:00:00.000Z");

      const row = await newInvitation(fixture, { status: "ARCHIVED", archivedAt });

      assert.equal(row.status, "ARCHIVED");
      assert.deepEqual(row.archivedAt, archivedAt);
    });

    it("refuses ARCHIVED without archivedAt and stores nothing", async () => {
      const fixture = await newFixture();

      await assert.rejects(
        newInvitation(fixture, { status: "ARCHIVED", archivedAt: null }),
        ARCHIVED_AT_MATCHES_STATUS,
      );

      assert.equal(await prisma.invitation.count({ where: { ownerId: fixture.ownerId } }), 0);
    });

    it("refuses DRAFT with archivedAt and stores nothing", async () => {
      const fixture = await newFixture();

      await assert.rejects(
        newInvitation(fixture, { status: "DRAFT", archivedAt: new Date() }),
        ARCHIVED_AT_MATCHES_STATUS,
      );

      assert.equal(await prisma.invitation.count({ where: { ownerId: fixture.ownerId } }), 0);
    });
  });

  describe("Restrict foreign keys", () => {
    it("refuses deleting the pinned TemplateVersion and keeps both rows", async () => {
      const fixture = await newFixture();
      const invitation = await newInvitation(fixture);

      await assert.rejects(
        prisma.templateVersion.delete({ where: { id: fixture.versionId } }),
        isForeignKeyViolation,
      );

      assert.deepEqual(await stored(invitation.id), invitation);
      assert.equal(await prisma.templateVersion.count({ where: { id: fixture.versionId } }), 1);
    });

    it("refuses deleting the owner User and keeps both rows", async () => {
      const fixture = await newFixture();
      const invitation = await newInvitation(fixture);

      await assert.rejects(
        prisma.user.delete({ where: { id: fixture.ownerId } }),
        isForeignKeyViolation,
      );

      assert.deepEqual(await stored(invitation.id), invitation);
      assert.equal(await prisma.user.count({ where: { id: fixture.ownerId } }), 1);
    });

    it("refuses deleting the chosen Package and keeps both rows", async () => {
      const fixture = await newFixture();
      const invitation = await newInvitation(fixture);

      await assert.rejects(
        prisma.package.delete({ where: { id: fixture.packageId } }),
        isForeignKeyViolation,
      );

      assert.deepEqual(await stored(invitation.id), invitation);
      assert.equal(await prisma.package.count({ where: { id: fixture.packageId } }), 1);
    });
  });

  describe("pinned fields", () => {
    async function assertPinRefused(
      id: string,
      data: Prisma.InvitationUncheckedUpdateInput,
    ): Promise<void> {
      const before = await stored(id);

      await assert.rejects(prisma.invitation.update({ where: { id }, data }), PINNED_IMMUTABLE);

      assert.deepEqual(await stored(id), before);
    }

    it("refuses changing templateVersionId", async () => {
      const fixture = await newFixture();
      const invitation = await newInvitation(fixture);
      const newer = await newVersion(fixture.templateId, 2, "DRAFT");

      await assertPinRefused(invitation.id, { templateVersionId: newer.id });
    });

    it("refuses changing ownerId", async () => {
      const invitation = await newInvitation(await newFixture());

      await assertPinRefused(invitation.id, { ownerId: await newOwner() });
    });

    it("refuses changing packageId", async () => {
      const invitation = await newInvitation(await newFixture());

      await assertPinRefused(invitation.id, { packageId: await newPackage() });
    });

    it("refuses changing slug", async () => {
      const invitation = await newInvitation(await newFixture());

      await assertPinRefused(invitation.id, { slug: newSlug() });
    });

    /** Every field an update may never change, compared with the row read before it. */
    function assertPinnedFieldsKept(
      updated: Awaited<ReturnType<typeof stored>>,
      before: Awaited<ReturnType<typeof stored>>,
    ): void {
      assert.equal(updated.id, before.id);
      assert.equal(updated.ownerId, before.ownerId);
      assert.equal(updated.templateVersionId, before.templateVersionId);
      assert.equal(updated.packageId, before.packageId);
      assert.equal(updated.slug, before.slug);
      assert.equal(updated.createdAt.getTime(), before.createdAt.getTime());
      assert.ok(updated.updatedAt.getTime() >= before.updatedAt.getTime());
    }

    it("allows changing content", async () => {
      const invitation = await newInvitation(await newFixture());
      const before = await stored(invitation.id);

      const updated = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { content: { title: "Cumpleaños", date: "2027-03-14" } },
      });

      assert.deepEqual(updated.content, { title: "Cumpleaños", date: "2027-03-14" });
      assert.equal(updated.status, before.status);
      assert.equal(updated.archivedAt, before.archivedAt);
      assertPinnedFieldsKept(updated, before);
    });

    it("allows archiving by setting status and archivedAt together", async () => {
      const invitation = await newInvitation(await newFixture());
      const before = await stored(invitation.id);
      const archivedAt = new Date("2026-11-12T09:30:00.000Z");

      const updated = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "ARCHIVED", archivedAt },
      });

      assert.equal(updated.status, "ARCHIVED");
      assert.deepEqual(updated.archivedAt, archivedAt);
      assert.deepEqual(updated.content, before.content);
      assertPinnedFieldsKept(updated, before);
      assert.deepEqual(await stored(invitation.id), updated);
    });
  });

  describe("pinned version (S3)", () => {
    it("keeps its templateVersionId after the template publishes a newer version", async () => {
      const fixture = await newFixture();
      const invitation = await newInvitation(fixture);
      const pinned = await prisma.templateVersion.findUniqueOrThrow({
        where: { id: fixture.versionId },
      });
      const newer = await newVersion(fixture.templateId, 2, "DRAFT");

      await prisma.$transaction([
        prisma.templateVersion.update({
          where: { id: pinned.id },
          data: { status: "RETIRED" },
        }),
        prisma.templateVersion.update({
          where: { id: newer.id },
          data: { status: "PUBLISHED" },
        }),
      ]);

      const after = await stored(invitation.id);
      assert.equal(after.templateVersionId, pinned.id);
      const stillPinned = await prisma.templateVersion.findUniqueOrThrow({
        where: { id: after.templateVersionId },
      });
      assert.equal(stillPinned.version, 1);
      assert.equal(stillPinned.status, "RETIRED");
      assert.deepEqual(stillPinned.schema, pinned.schema);
      const nowPublished = await prisma.templateVersion.findFirstOrThrow({
        where: { templateId: fixture.templateId, status: "PUBLISHED" },
      });
      assert.equal(nowPublished.id, newer.id);
    });
  });
});
