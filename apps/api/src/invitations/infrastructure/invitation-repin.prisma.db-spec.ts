import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { type Prisma, PrismaClient, type TemplateVersionStatus } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaCatalogPublicReader } from "../../catalog/infrastructure/prisma-catalog-public-reader";
import type { InvitationRepinCandidate } from "../application/invitation-repin.repository";
import { RepinDraftInvitationUseCase } from "../application/invitation-repin.use-cases";
import type { RepinTargetVersion } from "../domain/invitation-repin";
import { PrismaInvitationRepinRepository } from "./prisma-invitation-repin.repository";

// The draft re-pin on real PostgreSQL (S5, S8.6): the `Invitation_pinned_fields_immutable` trigger of
// 20261201120000_allow_draft_invitation_repin lets a DRAFT follow its template to a version that is PUBLISHED right
// now, and refuses every other change of `templateVersionId` — a PUBLISHED or ARCHIVED invitation, a version of
// another template, a DRAFT or RETIRED version, and a move combined with a publication in one statement — while
// `ownerId`, `packageId`, and `slug` stay immutable and content stays editable. It also proves the API operation the
// operator's command runs: the candidates read, the pure rule, the use case, and the one-statement move with the
// content untouched, including a second run that moves nothing. Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a disposable, already migrated
// local database; not part of `pnpm test`. The database is shared with parallel suites: every row here carries a key
// made from this run's id, and only those rows are removed.

const PINNED_IMMUTABLE = /Invitation pinned fields are immutable/;

/** The snapshot a draft was created with, before the omittable-section extension existed (S8.1). */
const OLD_SCHEMA = {
  type: "object",
  required: ["title", "date"],
  properties: {
    title: { type: "string", maxLength: 120 },
    date: { type: "string", format: "date" },
    message: { type: "string", maxLength: 600 },
  },
};

/** The version T2's script publishes: the same properties plus the extension and the optional list (S8.2). */
const NEW_SCHEMA = {
  ...OLD_SCHEMA,
  properties: {
    ...OLD_SCHEMA.properties,
    omittedSections: { type: "array", items: { enum: ["message"] }, uniqueItems: true },
  },
  "x-omittable": [{ key: "message", fields: ["message"] }],
  "x-require-one": [],
};

const COMPONENT_KEY = "birthday-poster-01";

describe("invitation draft re-pin on PostgreSQL", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const repinRepository = new PrismaInvitationRepinRepository(prisma);
  const repinDraft = new RepinDraftInvitationUseCase(repinRepository);
  const catalog = new PrismaCatalogPublicReader(prisma);
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
      data: { email: `t5-repin-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);
    return created.id;
  }

  async function newPackage(): Promise<string> {
    sequence += 1;
    const created = await prisma.package.create({
      data: { key: `t5-repin-package-${sequence}-${runId}`, name: "Paquete" },
    });
    packageIds.push(created.id);
    return created.id;
  }

  async function newTemplate(): Promise<string> {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `t5-repin-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `t5-repin-template-${sequence}-${runId}`,
        name: "Plantilla",
        status: "PUBLISHED",
      },
    });
    templateIds.push(template.id);
    return template.id;
  }

  async function newVersion(
    templateId: string,
    version: number,
    status: TemplateVersionStatus,
    schema: Prisma.InputJsonObject,
  ) {
    return prisma.templateVersion.create({
      data: {
        templateId,
        version,
        status,
        componentKey: COMPONENT_KEY,
        schema,
        configuration: { componentKey: COMPONENT_KEY },
      },
    });
  }

  interface CatalogState {
    templateId: string;
    /** The version a draft pinned before the template published the new one; retired by the new publication. */
    retiredVersionId: string;
    /** The version the template publishes now, with the omittable-section extension. */
    publishedVersionId: string;
    /** A version of the same template that was never published. */
    draftVersionId: string;
    packageId: string;
  }

  /** A template whose previous version is RETIRED and whose current version is PUBLISHED with the extension. */
  async function newCatalogState(): Promise<CatalogState> {
    const templateId = await newTemplate();
    // The partial unique index allows one PUBLISHED version per template, so the previous one is retired first.
    const previous = await newVersion(templateId, 1, "PUBLISHED", OLD_SCHEMA);
    const current = await newVersion(templateId, 2, "DRAFT", NEW_SCHEMA);
    await prisma.templateVersion.update({
      where: { id: previous.id },
      data: { status: "RETIRED" },
    });
    await prisma.templateVersion.update({
      where: { id: current.id },
      data: { status: "PUBLISHED" },
    });
    const draft = await newVersion(templateId, 3, "DRAFT", NEW_SCHEMA);

    return {
      templateId,
      retiredVersionId: previous.id,
      publishedVersionId: current.id,
      draftVersionId: draft.id,
      packageId: await newPackage(),
    };
  }

  /** A lower-case slug unique to this run, shaped like the generator's output. */
  function newSlug(): string {
    sequence += 1;
    return `t5-repin-${runId.slice(0, 8)}-${sequence}`;
  }

  const VALID_CONTENT = { title: "Mis XV", date: "2027-04-10", message: "Los esperamos" };

  async function newInvitation(
    state: CatalogState,
    overrides: Partial<Prisma.InvitationUncheckedCreateInput> = {},
  ) {
    const created = await prisma.invitation.create({
      data: {
        ownerId: overrides.ownerId ?? (await newOwner()),
        templateVersionId: state.retiredVersionId,
        packageId: state.packageId,
        slug: newSlug(),
        content: VALID_CONTENT,
        ...overrides,
      },
    });
    invitationIds.push(created.id);
    return created;
  }

  const stored = (id: string) => prisma.invitation.findUniqueOrThrow({ where: { id } });

  /** The target the operator's command resolves for one template: the version the catalog offers today. */
  async function targetOf(templateId: string): Promise<RepinTargetVersion> {
    const offered = await catalog.listPublishedTemplates();
    const template = offered.find((candidate) => candidate.id === templateId);

    assert.ok(template, "the fixture template must be offered by the catalog");
    return {
      id: template.publishedVersion.id,
      templateId,
      status: "PUBLISHED",
      schema: template.publishedVersion.schema,
    };
  }

  /** Reads one invitation as the command does, through the catalog's own stored-schema read. */
  async function candidateOf(invitationId: string) {
    const candidates = await repinRepository.listCandidates();
    const candidate = candidates.find((row) => row.invitationId === invitationId);

    assert.ok(candidate, "the re-pin read must answer the stored invitation");
    const pinned = await catalog.findVersionSchema(candidate.templateVersionId);

    return { candidate, pinnedTemplateId: pinned?.templateId ?? null };
  }

  describe("the pinned-field trigger", () => {
    it("moves a DRAFT to the PUBLISHED version of its template and keeps content and the other fields", async () => {
      const state = await newCatalogState();
      const invitation = await newInvitation(state, { status: "DRAFT" });

      const moved = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { templateVersionId: state.publishedVersionId },
      });

      assert.equal(moved.templateVersionId, state.publishedVersionId);
      assert.equal(moved.status, "DRAFT");
      assert.deepEqual(moved.content, VALID_CONTENT);
      assert.equal(moved.ownerId, invitation.ownerId);
      assert.equal(moved.packageId, state.packageId);
      assert.equal(moved.slug, invitation.slug);
      assert.deepEqual(await stored(invitation.id), moved);
    });

    it("refuses moving a PUBLISHED invitation and leaves it unchanged", async () => {
      const state = await newCatalogState();
      const invitation = await newInvitation(state, {
        status: "PUBLISHED",
        publishedAt: new Date(),
        // The publication writes the history the refund rule reads; the check requires it (T2).
        firstPublishedAt: new Date(),
      });
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { templateVersionId: state.publishedVersionId },
        }),
        PINNED_IMMUTABLE,
      );

      assert.deepEqual(await stored(invitation.id), before);
    });

    it("refuses moving an ARCHIVED invitation and leaves it unchanged", async () => {
      const state = await newCatalogState();
      const invitation = await newInvitation(state, {
        status: "ARCHIVED",
        archivedAt: new Date(),
      });
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { templateVersionId: state.publishedVersionId },
        }),
        PINNED_IMMUTABLE,
      );

      assert.deepEqual(await stored(invitation.id), before);
    });

    it("refuses moving a DRAFT to the published version of another template", async () => {
      const state = await newCatalogState();
      const other = await newCatalogState();
      const invitation = await newInvitation(state, { status: "DRAFT" });
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { templateVersionId: other.publishedVersionId },
        }),
        PINNED_IMMUTABLE,
      );

      assert.deepEqual(await stored(invitation.id), before);
    });

    it("refuses moving a DRAFT to a DRAFT version of its own template", async () => {
      const state = await newCatalogState();
      const invitation = await newInvitation(state, { status: "DRAFT" });
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { templateVersionId: state.draftVersionId },
        }),
        PINNED_IMMUTABLE,
      );

      assert.deepEqual(await stored(invitation.id), before);
    });

    it("refuses moving a DRAFT to a RETIRED version of its own template", async () => {
      const state = await newCatalogState();
      const invitation = await newInvitation(state, {
        status: "DRAFT",
        templateVersionId: state.publishedVersionId,
      });
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { templateVersionId: state.retiredVersionId },
        }),
        PINNED_IMMUTABLE,
      );

      assert.deepEqual(await stored(invitation.id), before);
    });

    it("refuses moving a DRAFT and publishing it in one statement", async () => {
      const state = await newCatalogState();
      const invitation = await newInvitation(state, { status: "DRAFT" });
      const before = await stored(invitation.id);

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: {
            templateVersionId: state.publishedVersionId,
            status: "PUBLISHED",
            publishedAt: new Date(),
          },
        }),
        PINNED_IMMUTABLE,
      );

      assert.deepEqual(await stored(invitation.id), before);
    });

    it("still refuses the owner, the package, and the slug of a DRAFT", async () => {
      const state = await newCatalogState();
      const invitation = await newInvitation(state, { status: "DRAFT" });
      const before = await stored(invitation.id);

      for (const data of [
        { ownerId: await newOwner() },
        { packageId: await newPackage() },
        { slug: newSlug() },
      ]) {
        await assert.rejects(
          prisma.invitation.update({ where: { id: invitation.id }, data }),
          PINNED_IMMUTABLE,
        );
        assert.deepEqual(await stored(invitation.id), before);
      }
    });

    it("still allows a DRAFT to edit its content and keep its version", async () => {
      const state = await newCatalogState();
      const invitation = await newInvitation(state, { status: "DRAFT" });

      const updated = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { content: { ...VALID_CONTENT, message: "Con gusto los esperamos" } },
      });

      assert.equal(updated.templateVersionId, state.retiredVersionId);
      assert.deepEqual(updated.content, {
        ...VALID_CONTENT,
        message: "Con gusto los esperamos",
      });
    });
  });

  describe("the re-pin operation", () => {
    it("moves an existing draft and skips the invitations S5 does not touch", async () => {
      const state = await newCatalogState();
      const target = await targetOf(state.templateId);
      const draft = await newInvitation(state, { status: "DRAFT" });
      const published = await newInvitation(state, {
        status: "PUBLISHED",
        publishedAt: new Date(),
        // The publication writes the history the refund rule reads; the check requires it (T2).
        firstPublishedAt: new Date(),
      });
      const archived = await newInvitation(state, {
        status: "ARCHIVED",
        archivedAt: new Date(),
      });
      const publishedBefore = await stored(published.id);
      const archivedBefore = await stored(archived.id);
      const draftRead = await candidateOf(draft.id);

      const outcome = await repinDraft.execute({
        invitationId: draft.id,
        status: draftRead.candidate.status,
        pinnedVersionId: draftRead.candidate.templateVersionId,
        pinnedTemplateId: draftRead.pinnedTemplateId,
        content: draftRead.candidate.content,
        target,
      });

      assert.deepEqual(outcome, {
        outcome: "moved",
        invitationId: draft.id,
        toVersionId: state.publishedVersionId,
      });
      const movedRow = await stored(draft.id);
      assert.equal(movedRow.templateVersionId, state.publishedVersionId);
      // S8.2: what the customer typed stays stored; only the pinned version changed.
      assert.deepEqual(movedRow.content, VALID_CONTENT);
      assert.equal(movedRow.status, "DRAFT");

      // A PUBLISHED and an ARCHIVED invitation are never touched, and each says so with its own reason.
      for (const [invitation, before] of [
        [published, publishedBefore],
        [archived, archivedBefore],
      ] as const) {
        const read = await candidateOf(invitation.id);
        const skipped = await repinDraft.execute({
          invitationId: invitation.id,
          status: read.candidate.status,
          pinnedVersionId: read.candidate.templateVersionId,
          pinnedTemplateId: read.pinnedTemplateId,
          content: read.candidate.content,
          target,
        });

        assert.deepEqual(skipped, {
          outcome: "skipped",
          invitationId: invitation.id,
          reason: "NOT_DRAFT",
          issues: [],
        });
        assert.deepEqual(await stored(invitation.id), before);
      }
    });

    it("moves nothing on a second run, because the draft already pins the current version", async () => {
      const state = await newCatalogState();
      const target = await targetOf(state.templateId);
      const draft = await newInvitation(state, { status: "DRAFT" });
      const first = await candidateOf(draft.id);

      await repinDraft.execute({
        invitationId: draft.id,
        status: first.candidate.status,
        pinnedVersionId: first.candidate.templateVersionId,
        pinnedTemplateId: first.pinnedTemplateId,
        content: first.candidate.content,
        target,
      });
      const second = await candidateOf(draft.id);
      const before = await stored(draft.id);

      const outcome = await repinDraft.execute({
        invitationId: draft.id,
        status: second.candidate.status,
        pinnedVersionId: second.candidate.templateVersionId,
        pinnedTemplateId: second.pinnedTemplateId,
        content: second.candidate.content,
        target,
      });

      assert.deepEqual(outcome, {
        outcome: "skipped",
        invitationId: draft.id,
        reason: "ALREADY_CURRENT",
        issues: [],
      });
      assert.deepEqual(await stored(draft.id), before);
    });

    it("skips a draft whose stored content the new version refuses, leaving the row unchanged", async () => {
      const state = await newCatalogState();
      const target = await targetOf(state.templateId);
      const draft = await newInvitation(state, {
        status: "DRAFT",
        content: { ...VALID_CONTENT, date: "10/04/2027" },
      });
      const read = await candidateOf(draft.id);
      const before = await stored(draft.id);

      const outcome = await repinDraft.execute({
        invitationId: draft.id,
        status: read.candidate.status,
        pinnedVersionId: read.candidate.templateVersionId,
        pinnedTemplateId: read.pinnedTemplateId,
        content: read.candidate.content,
        target,
      });

      assert.deepEqual(outcome, {
        outcome: "skipped",
        invitationId: draft.id,
        reason: "CONTENT_INVALID",
        issues: ["content.date must be a calendar date as YYYY-MM-DD"],
      });
      assert.deepEqual(await stored(draft.id), before);
    });

    it("reports nothing to move for a template without a published version", async () => {
      const state = await newCatalogState();
      const draft = await newInvitation(state, { status: "DRAFT" });
      const read: { candidate: InvitationRepinCandidate } = await candidateOf(draft.id);

      const outcome = await repinDraft.execute({
        invitationId: draft.id,
        status: read.candidate.status,
        pinnedVersionId: read.candidate.templateVersionId,
        pinnedTemplateId: "00000000-0000-4000-8000-000000000000",
        content: read.candidate.content,
        target: null,
      });

      assert.deepEqual(outcome, {
        outcome: "skipped",
        invitationId: draft.id,
        reason: "NO_PUBLISHED_VERSION",
        issues: [],
      });
      assert.equal((await stored(draft.id)).templateVersionId, state.retiredVersionId);
    });

    it("answers false from the write when the invitation no longer pins the version it read", async () => {
      const state = await newCatalogState();
      const draft = await newInvitation(state, { status: "DRAFT" });

      const moved = await repinRepository.repinDraft(
        draft.id,
        state.retiredVersionId,
        state.publishedVersionId,
      );
      // The same move again finds no row that still pins the old version, so nothing is written twice.
      const repeated = await repinRepository.repinDraft(
        draft.id,
        state.retiredVersionId,
        state.publishedVersionId,
      );

      assert.equal(moved, true);
      assert.equal(repeated, false);
      assert.equal((await stored(draft.id)).templateVersionId, state.publishedVersionId);
    });
  });
});
