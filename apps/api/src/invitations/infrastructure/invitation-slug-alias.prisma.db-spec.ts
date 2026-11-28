import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { type Prisma, PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import {
  InvitationSlugRenameLimitError,
  InvitationSlugTakenError,
} from "../application/invitation.application.errors";
import { InvitationNotEditableError } from "../domain/invitation.errors";
import { PrismaInvitationRepository } from "./prisma-invitation.repository";

// The custom address on real PostgreSQL (F11; S2.11, L15.1-L15.3, approval). The pinned-field trigger keeps refusing
// everything it refused before — an owner, a package, and a slug changed by anything but the rename — and the rename
// itself is proven here: it stores the previous address as an alias in one transaction, the deferred check refuses a
// rename that stores no alias, a current or previous address another invitation holds is refused, one invitation keeps
// at most five aliases, and an address no invitation currently holds is still refused for a new invitation when it was
// once somebody else's. Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that
// points at a disposable, already migrated local database; not part of `pnpm test`. The database is shared with
// parallel suites: every row here carries a key made from this run's id, and only those rows are removed.

const PINNED_IMMUTABLE = /Invitation pinned fields are immutable/;
const ALIAS_IS_LIVE = /Invitation slug alias is a live invitation slug/;
const ALIAS_LIMIT = /Invitation slug alias limit reached/;
const SLUG_IS_ALIAS = /Invitation slug is already a previous address/;
const RENAME_WITHOUT_ALIAS = /Invitation slug rename must record the previous slug as an alias/;

const COMPONENT_KEY = "birthday-poster-01";

describe("invitation custom address on PostgreSQL", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const repository = new PrismaInvitationRepository(prisma);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const packageIds: string[] = [];
  const invitationIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      // The alias table references its invitation with ON DELETE RESTRICT, so the aliases go first.
      await prisma.invitationSlugAlias.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
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

  /** A lower-case address unique to this run, shaped like the domain's rule. */
  function newSlug(): string {
    sequence += 1;
    return `t11-${runId.slice(0, 8)}-${sequence}`;
  }

  async function newOwner(): Promise<string> {
    sequence += 1;
    const created = await prisma.user.create({
      data: { email: `t11-slug-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);
    return created.id;
  }

  async function newPackage(): Promise<string> {
    sequence += 1;
    const created = await prisma.package.create({
      data: { key: `t11-package-${sequence}-${runId}`, name: "Paquete" },
    });
    packageIds.push(created.id);
    return created.id;
  }

  /** One PUBLISHED template version and one package, enough for an invitation to exist. */
  async function newCatalog(): Promise<{ versionId: string; packageId: string }> {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `t11-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `t11-template-${sequence}-${runId}`,
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
        componentKey: COMPONENT_KEY,
        schema: {
          type: "object",
          required: ["title"],
          properties: { title: { type: "string", maxLength: 120 } },
        },
        configuration: { componentKey: COMPONENT_KEY },
      },
    });

    return { versionId: version.id, packageId: await newPackage() };
  }

  async function newInvitation(
    overrides: Partial<Prisma.InvitationUncheckedCreateInput> = {},
  ): Promise<{ id: string; ownerId: string; slug: string; packageId: string }> {
    const catalog = await newCatalog();
    const created = await prisma.invitation.create({
      data: {
        ownerId: await newOwner(),
        templateVersionId: catalog.versionId,
        packageId: catalog.packageId,
        slug: newSlug(),
        content: { title: "Mis XV" },
        ...overrides,
      },
    });
    invitationIds.push(created.id);

    return {
      id: created.id,
      ownerId: created.ownerId,
      slug: created.slug,
      packageId: created.packageId,
    };
  }

  it("keeps refusing an owner, a package, and a slug changed outside the rename (L15.2, PRESERVE)", async () => {
    const invitation = await newInvitation();
    const otherPackage = await newPackage();
    const otherOwner = await newOwner();
    const asked = newSlug();

    for (const statement of [
      prisma.$executeRaw`UPDATE "Invitation" SET "ownerId" = ${otherOwner}::uuid WHERE "id" = ${invitation.id}::uuid`,
      prisma.$executeRaw`UPDATE "Invitation" SET "packageId" = ${otherPackage}::uuid WHERE "id" = ${invitation.id}::uuid`,
      prisma.$executeRaw`UPDATE "Invitation" SET "slug" = ${asked} WHERE "id" = ${invitation.id}::uuid`,
    ]) {
      await assert.rejects(statement, PINNED_IMMUTABLE);
    }

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    assert.equal(stored.slug, invitation.slug);
    assert.equal(stored.ownerId, invitation.ownerId);
    assert.equal(stored.packageId, invitation.packageId);
    assert.equal(
      await prisma.invitationSlugAlias.count({ where: { invitationId: invitation.id } }),
      0,
    );
  });

  it("refuses a slug change that sets the rename scope but stores no alias, at COMMIT (L15.2)", async () => {
    const invitation = await newInvitation();
    const asked = newSlug();

    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('invitame.slug_rename', ${invitation.id}, true)`;
        await tx.$executeRaw`UPDATE "Invitation" SET "slug" = ${asked} WHERE "id" = ${invitation.id}::uuid`;
      }),
      RENAME_WITHOUT_ALIAS,
    );

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    assert.equal(stored.slug, invitation.slug);
  });

  it("renames through the repository and stores the previous address as an alias (L15.2)", async () => {
    const publishedAt = new Date();
    const invitation = await newInvitation({
      status: "PUBLISHED",
      publishedAt,
      firstPublishedAt: publishedAt,
    });
    const asked = newSlug();

    const renamed = await repository.renameSlug(invitation.ownerId, invitation.id, asked);

    assert.equal(renamed?.slug, asked);
    const alias = await prisma.invitationSlugAlias.findUnique({
      where: { slug: invitation.slug },
      select: { invitationId: true },
    });
    assert.equal(alias?.invitationId, invitation.id);
    // The previous address resolves to the same published row, which is what the permanent redirect answers (L15.3).
    assert.equal((await repository.findPublishedByAlias(invitation.slug))?.id, invitation.id);
    assert.equal((await repository.findPublishedBySlug(asked))?.id, invitation.id);
  });

  it("answers no previous address for an invitation that is not published (L15.3, A3)", async () => {
    const invitation = await newInvitation();
    await repository.renameSlug(invitation.ownerId, invitation.id, newSlug());

    assert.equal(await repository.findPublishedByAlias(invitation.slug), null);
  });

  it("refuses an address another invitation holds and an address that is already a previous one (L15.1)", async () => {
    const first = await newInvitation();
    const second = await newInvitation();
    const previous = newSlug();
    await repository.renameSlug(first.ownerId, first.id, previous);

    await assert.rejects(
      repository.renameSlug(second.ownerId, second.id, previous),
      InvitationSlugTakenError,
    );
    // The address the first invitation left behind is final, for every invitation including its own.
    await assert.rejects(
      repository.renameSlug(first.ownerId, first.id, first.slug),
      InvitationSlugTakenError,
    );

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: second.id } });
    assert.equal(stored.slug, second.slug);
    assert.equal(await prisma.invitationSlugAlias.count({ where: { invitationId: second.id } }), 0);
  });

  it("refuses the sixth rename and keeps the five previous addresses (L15.2, approval)", async () => {
    const invitation = await newInvitation();
    const asked = [newSlug(), newSlug(), newSlug(), newSlug(), newSlug()];

    for (const slug of asked) {
      assert.equal(
        (await repository.renameSlug(invitation.ownerId, invitation.id, slug))?.slug,
        slug,
      );
    }
    await assert.rejects(
      repository.renameSlug(invitation.ownerId, invitation.id, newSlug()),
      InvitationSlugRenameLimitError,
    );

    assert.equal(
      await prisma.invitationSlugAlias.count({ where: { invitationId: invitation.id } }),
      5,
    );
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    assert.equal(stored.slug, asked.at(-1));
  });

  it("refuses an archived invitation and changes nothing (L15.2, A2)", async () => {
    const invitation = await newInvitation({
      status: "ARCHIVED",
      archivedAt: new Date(),
    });

    await assert.rejects(
      repository.renameSlug(invitation.ownerId, invitation.id, newSlug()),
      InvitationNotEditableError,
    );

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    assert.equal(stored.slug, invitation.slug);
    assert.equal(
      await prisma.invitationSlugAlias.count({ where: { invitationId: invitation.id } }),
      0,
    );
  });

  it("refuses an alias equal to a live slug, a sixth alias, and a new invitation taking an alias", async () => {
    const live = await newInvitation();
    const renamed = await newInvitation();
    const previous = renamed.slug;
    await repository.renameSlug(renamed.ownerId, renamed.id, newSlug());

    // An alias that repeats somebody's current address would shadow a live page.
    await assert.rejects(
      prisma.invitationSlugAlias.create({ data: { invitationId: renamed.id, slug: live.slug } }),
      ALIAS_IS_LIVE,
    );

    // The limit is the database's too, not only the repository's.
    for (let kept = 0; kept < 4; kept += 1) {
      await prisma.invitationSlugAlias.create({
        data: { invitationId: renamed.id, slug: newSlug() },
      });
    }
    await assert.rejects(
      prisma.invitationSlugAlias.create({ data: { invitationId: renamed.id, slug: newSlug() } }),
      ALIAS_LIMIT,
    );

    // A new invitation may never take an address that once belonged to another one.
    const source = await prisma.invitation.findUniqueOrThrow({
      where: { id: renamed.id },
      select: { templateVersionId: true, packageId: true },
    });
    await assert.rejects(
      prisma.invitation.create({
        data: {
          ownerId: await newOwner(),
          templateVersionId: source.templateVersionId,
          packageId: source.packageId,
          slug: previous,
          content: { title: "Otra" },
        },
      }),
      SLUG_IS_ALIAS,
    );
  });
});
