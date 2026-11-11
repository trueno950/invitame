import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import {
  InvitationAlreadyArchivedError,
  InvitationNotEditableError,
} from "../domain/invitation.errors";
import {
  InvalidInvitationContentError,
  InvitationPackageDoesNotFitError,
  InvitationPackageNotFoundError,
  InvitationSlugTakenError,
  InvitationSlugUnavailableError,
  InvitationTemplateVersionNotPublishedError,
} from "./invitation.application.errors";
import type {
  InvitationRecord,
  InvitationRepository,
  NewInvitation,
} from "./invitation.repository";
import {
  ArchiveInvitationUseCase,
  CreateInvitationDraftUseCase,
  GetOwnInvitationUseCase,
  ListOwnInvitationsUseCase,
  MAX_SLUG_ATTEMPTS,
  UpdateInvitationContentUseCase,
} from "./invitation.use-cases";
import type {
  CatalogPackageEntitlements,
  CatalogTemplateVersionSnapshot,
  CatalogVersionSchema,
  InvitationCatalog,
} from "./invitation-catalog";

// The invitation application use cases (M4 T3; S1, S3, S6, S7, S9, A1, A3, A4) on in-memory ports: a draft
// starts empty and pinned to a published version, the package is only validated, every mutation is scoped by
// the session owner, the slug is generated and retried only on a real collision, and content is validated
// against the pinned schema even after that version stops being published.

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const MALFORMED_ID = "not-a-uuid";

/** The schema of a pinned version: two required fields, one optional, all of them bounded. */
const SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["celebrantName", "date"],
  properties: {
    celebrantName: { type: "string", maxLength: 80 },
    date: { type: "string" },
    message: { type: "string", maxLength: 500 },
  },
};

/** An in-memory `InvitationRepository`: `rows` and `slugs` are public so a test can compare before and after. */
class MemoryInvitationRepository implements InvitationRepository {
  readonly rows: InvitationRecord[] = [];
  /** Every slug PostgreSQL would already hold, as the unique index sees it. */
  readonly slugs = new Set<string>();
  createCalls = 0;
  private clock = 0;

  /** A slug another customer already stored, so the next create with it collides. */
  reserveSlug(slug: string): void {
    this.slugs.add(slug);
  }

  async create(input: NewInvitation): Promise<InvitationRecord> {
    this.createCalls += 1;
    if (this.slugs.has(input.slug)) {
      throw new InvitationSlugTakenError(input.slug);
    }
    this.slugs.add(input.slug);
    this.clock += 1;
    const now = new Date(Date.UTC(2026, 10, 11, 10, 0, 0) + this.clock * 1000);
    const created: InvitationRecord = {
      id: randomUUID(),
      status: "DRAFT",
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      ...input,
      content: { ...input.content },
    };
    this.rows.push(created);
    return { ...created, content: { ...created.content } };
  }

  async findOwned(ownerId: string, id: string): Promise<InvitationRecord | null> {
    const stored = this.rows.find((row) => row.id === id && row.ownerId === ownerId);
    return stored ? { ...stored, content: { ...stored.content } } : null;
  }

  async listOwned(ownerId: string): Promise<InvitationRecord[]> {
    return this.rows
      .filter((row) => row.ownerId === ownerId)
      .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
      .map((row) => ({ ...row, content: { ...row.content } }));
  }

  async updateContent(
    ownerId: string,
    id: string,
    content: Record<string, unknown>,
  ): Promise<InvitationRecord | null> {
    const stored = this.rows.find((row) => row.id === id && row.ownerId === ownerId);
    if (!stored) {
      return null;
    }
    if (stored.status !== "DRAFT") {
      throw new InvitationNotEditableError(stored.status);
    }
    stored.content = { ...content };
    stored.updatedAt = new Date(stored.updatedAt.getTime() + 1000);
    return { ...stored, content: { ...stored.content } };
  }

  async archive(ownerId: string, id: string): Promise<InvitationRecord | null> {
    const stored = this.rows.find((row) => row.id === id && row.ownerId === ownerId);
    if (!stored) {
      return null;
    }
    if (stored.status !== "DRAFT") {
      throw new InvitationAlreadyArchivedError();
    }
    stored.status = "ARCHIVED";
    stored.archivedAt = new Date(stored.updatedAt.getTime() + 1000);
    stored.updatedAt = stored.archivedAt;
    return { ...stored, content: { ...stored.content } };
  }
}

/** An in-memory `InvitationCatalog`: published versions, any-status schemas, and package entitlements. */
class MemoryInvitationCatalog implements InvitationCatalog {
  readonly published = new Map<string, CatalogTemplateVersionSnapshot>();
  readonly schemas = new Map<string, CatalogVersionSchema>();
  readonly packages = new Map<string, CatalogPackageEntitlements>();

  addPublishedVersion(
    input: Partial<CatalogTemplateVersionSnapshot> & { id: string; schema?: unknown },
  ): CatalogTemplateVersionSnapshot {
    const snapshot: CatalogTemplateVersionSnapshot = {
      templateId: randomUUID(),
      componentKey: "birthday-adventure-01",
      schema: SCHEMA,
      requiredFeatureKeys: [],
      ...input,
    };
    this.published.set(snapshot.id, snapshot);
    this.schemas.set(snapshot.id, { id: snapshot.id, schema: snapshot.schema });
    return snapshot;
  }

  /** A version that only exists as a stored snapshot: retired, so it cannot start a draft (S3). */
  addStoredVersion(schema: unknown = SCHEMA): string {
    const id = randomUUID();
    this.schemas.set(id, { id, schema });
    return id;
  }

  addPackage(input: Partial<CatalogPackageEntitlements> = {}): string {
    const id = randomUUID();
    this.packages.set(id, { status: "ACTIVE", includedFeatureKeys: [], ...input });
    return id;
  }

  async findPublishedVersion(versionId: string): Promise<CatalogTemplateVersionSnapshot | null> {
    return this.published.get(versionId) ?? null;
  }

  async findVersionSchema(versionId: string): Promise<CatalogVersionSchema | null> {
    return this.schemas.get(versionId) ?? null;
  }

  async findPackageEntitlements(packageId: string): Promise<CatalogPackageEntitlements | null> {
    return this.packages.get(packageId) ?? null;
  }
}

function seeded(options: { requireFeatureKeys?: readonly string[] } = {}) {
  const repository = new MemoryInvitationRepository();
  const catalog = new MemoryInvitationCatalog();
  const ownerId = randomUUID();
  const version = catalog.addPublishedVersion({
    id: randomUUID(),
    requiredFeatureKeys: options.requireFeatureKeys ?? [],
  });
  const packageId = catalog.addPackage({
    includedFeatureKeys: options.requireFeatureKeys ?? [],
  });
  return { repository, catalog, ownerId, version, packageId };
}

/** A slug source that answers one slug per create attempt, in order. */
function slugs(...values: string[]): () => string {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    return value ?? "invitacion-000000";
  };
}

const draft = (fixture: ReturnType<typeof seeded>, nextSlug = slugs("invitacion-k7m2qx")) =>
  new CreateInvitationDraftUseCase(fixture.repository, fixture.catalog, nextSlug);

function createDraft(fixture: ReturnType<typeof seeded>, nextSlug?: () => string) {
  return draft(fixture, nextSlug).execute({
    ownerId: fixture.ownerId,
    templateVersionId: fixture.version.id,
    packageId: fixture.packageId,
  });
}

describe("CreateInvitationDraftUseCase", () => {
  it("stores a DRAFT pinned to the owner, the version, and the package, with empty content", async () => {
    const fixture = seeded();

    const created = await createDraft(fixture);

    assert.equal(fixture.repository.rows.length, 1);
    const stored = fixture.repository.rows[0];
    assert.equal(stored?.ownerId, fixture.ownerId);
    assert.equal(stored?.templateVersionId, fixture.version.id);
    assert.equal(stored?.packageId, fixture.packageId);
    assert.equal(stored?.status, "DRAFT");
    assert.deepEqual(stored?.content, {});
    assert.equal(stored?.archivedAt, null);

    // The owner sees the view of what it created, with every required field still missing (S7).
    assert.deepEqual(created.missingRequiredFields, ["celebrantName", "date"]);
    assert.equal(Object.hasOwn(created, "ownerId"), false);
    assert.equal(created.slug, "invitacion-k7m2qx");
  });

  it("takes the owner from the caller and never from the invitation content (S9)", async () => {
    const fixture = seeded();
    const otherOwnerId = randomUUID();

    const created = await createDraft({ ...fixture, ownerId: otherOwnerId });

    assert.equal(fixture.repository.rows[0]?.ownerId, otherOwnerId);
    assert.equal(created.id, fixture.repository.rows[0]?.id);
  });

  it("refuses a version that is not published and stores nothing", async () => {
    const fixture = seeded();
    const retiredVersionId = fixture.catalog.addStoredVersion();

    await assert.rejects(
      draft(fixture).execute({
        ownerId: fixture.ownerId,
        templateVersionId: retiredVersionId,
        packageId: fixture.packageId,
      }),
      InvitationTemplateVersionNotPublishedError,
    );

    assert.equal(fixture.repository.createCalls, 0);
    assert.equal(fixture.repository.rows.length, 0);
  });

  it("refuses an unknown or malformed version id and stores nothing", async () => {
    const fixture = seeded();

    for (const templateVersionId of [UNKNOWN_ID, MALFORMED_ID, ""]) {
      await assert.rejects(
        draft(fixture).execute({
          ownerId: fixture.ownerId,
          templateVersionId,
          packageId: fixture.packageId,
        }),
        InvitationTemplateVersionNotPublishedError,
      );
    }

    assert.equal(fixture.repository.rows.length, 0);
  });

  it("refuses a package that does not exist and stores nothing", async () => {
    const fixture = seeded();

    for (const packageId of [UNKNOWN_ID, MALFORMED_ID]) {
      await assert.rejects(
        draft(fixture).execute({
          ownerId: fixture.ownerId,
          templateVersionId: fixture.version.id,
          packageId,
        }),
        InvitationPackageNotFoundError,
      );
    }

    assert.equal(fixture.repository.rows.length, 0);
  });

  it("refuses a package that does not fit the version and stores nothing (S6, A1)", async () => {
    const fixture = seeded({ requireFeatureKeys: ["COUNTDOWN"] });
    const archivedPackageId = fixture.catalog.addPackage({
      status: "ARCHIVED",
      includedFeatureKeys: ["COUNTDOWN"],
    });
    const missingFeaturePackageId = fixture.catalog.addPackage({ includedFeatureKeys: [] });

    for (const packageId of [archivedPackageId, missingFeaturePackageId]) {
      await assert.rejects(
        draft(fixture).execute({
          ownerId: fixture.ownerId,
          templateVersionId: fixture.version.id,
          packageId,
        }),
        InvitationPackageDoesNotFitError,
      );
    }

    assert.equal(fixture.repository.rows.length, 0);
  });

  it("accepts an ACTIVE package that includes every required feature key (S6, A1)", async () => {
    const fixture = seeded({ requireFeatureKeys: ["COUNTDOWN"] });

    const created = await createDraft(fixture);

    assert.equal(created.status, "DRAFT");
    assert.equal(fixture.repository.rows.length, 1);
  });

  it("retries a colliding slug and stores the next generated one (S5)", async () => {
    const fixture = seeded();
    fixture.repository.reserveSlug("invitacion-k7m2qx");

    const created = await createDraft(fixture, slugs("invitacion-k7m2qx", "invitacion-p3xw8t"));

    assert.equal(created.slug, "invitacion-p3xw8t");
    assert.equal(fixture.repository.createCalls, 2);
    assert.equal(fixture.repository.rows.length, 1);
  });

  it("gives up after the attempt bound and stores nothing (S5)", async () => {
    const fixture = seeded();
    const colliding = "invitacion-k7m2qx";
    fixture.repository.reserveSlug(colliding);

    await assert.rejects(createDraft(fixture, slugs(colliding)), InvitationSlugUnavailableError);

    assert.equal(fixture.repository.createCalls, MAX_SLUG_ATTEMPTS);
    assert.equal(fixture.repository.rows.length, 0);
  });

  it("skips a reserved slug without ever attempting to store it (S5)", async () => {
    const fixture = seeded();

    const created = await createDraft(fixture, slugs("admin", "invitacion-k7m2qx"));

    assert.equal(created.slug, "invitacion-k7m2qx");
    assert.equal(fixture.repository.createCalls, 1);
  });

  it("reports a failure that is not a slug collision without retrying", async () => {
    const fixture = seeded();
    const failure = new Error("connection lost");
    fixture.repository.create = async () => {
      fixture.repository.createCalls += 1;
      throw failure;
    };

    await assert.rejects(createDraft(fixture), failure);
    assert.equal(fixture.repository.createCalls, 1);
    assert.equal(fixture.repository.rows.length, 0);
  });
});

describe("ListOwnInvitationsUseCase", () => {
  it("lists only the caller's invitations, newest first", async () => {
    const fixture = seeded();
    const first = await createDraft(fixture, slugs("invitacion-aaaaaa"));
    const second = await createDraft(fixture, slugs("invitacion-bbbbbb"));
    const otherOwnerId = randomUUID();
    await draft(fixture, slugs("invitacion-cccccc")).execute({
      ownerId: otherOwnerId,
      templateVersionId: fixture.version.id,
      packageId: fixture.packageId,
    });

    const listed = await new ListOwnInvitationsUseCase(fixture.repository).execute(fixture.ownerId);

    assert.deepEqual(
      listed.map((item) => item.slug),
      ["invitacion-bbbbbb", "invitacion-aaaaaa"],
    );
    assert.deepEqual(
      listed.map((item) => item.id),
      [second.id, first.id],
    );
    assert.deepEqual(listed[0]?.status, "DRAFT");
  });

  it("answers an empty list for an owner with no invitations", async () => {
    const fixture = seeded();

    assert.deepEqual(
      await new ListOwnInvitationsUseCase(fixture.repository).execute(randomUUID()),
      [],
    );
  });
});

describe("GetOwnInvitationUseCase", () => {
  it("answers the invitation with the required fields still missing (S7)", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);

    const found = await new GetOwnInvitationUseCase(fixture.repository, fixture.catalog).execute(
      fixture.ownerId,
      created.id,
    );

    assert.equal(found?.id, created.id);
    assert.equal(found?.slug, "invitacion-k7m2qx");
    assert.deepEqual(found?.content, {});
    assert.deepEqual(found?.missingRequiredFields, ["celebrantName", "date"]);
  });

  it("validates against the pinned schema after that version is no longer published (S3)", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);
    // The catalog publishes a newer version and retires the pinned one.
    fixture.catalog.published.delete(fixture.version.id);

    const found = await new GetOwnInvitationUseCase(fixture.repository, fixture.catalog).execute(
      fixture.ownerId,
      created.id,
    );

    assert.equal(found?.id, created.id);
    assert.deepEqual(found?.missingRequiredFields, ["celebrantName", "date"]);
  });

  it("answers null for another owner's invitation and for an id that names nothing (A4)", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);
    const otherOwnerId = randomUUID();
    const useCase = new GetOwnInvitationUseCase(fixture.repository, fixture.catalog);

    assert.equal(await useCase.execute(otherOwnerId, created.id), null);
    assert.equal(await useCase.execute(fixture.ownerId, UNKNOWN_ID), null);
    assert.equal(await useCase.execute(fixture.ownerId, MALFORMED_ID), null);
  });
});

describe("UpdateInvitationContentUseCase", () => {
  it("stores a partial draft and reports only the fields still missing (S7)", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);

    const updated = await new UpdateInvitationContentUseCase(
      fixture.repository,
      fixture.catalog,
    ).execute({
      ownerId: fixture.ownerId,
      id: created.id,
      content: { celebrantName: "Ana" },
    });

    assert.deepEqual(updated?.content, { celebrantName: "Ana" });
    assert.deepEqual(updated?.missingRequiredFields, ["date"]);
    assert.deepEqual(fixture.repository.rows[0]?.content, { celebrantName: "Ana" });
    assert.equal(fixture.repository.rows[0]?.status, "DRAFT");
  });

  it("refuses content the pinned schema does not accept and leaves the row unchanged (S3, S7)", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);
    const before = { ...fixture.repository.rows[0] };
    const invalid = [
      { undeclared: "Ana" },
      { celebrantName: 42 },
      { celebrantName: "a".repeat(81) },
      { date: "2027-03-14", extra: true },
      [],
      "Ana",
      null,
    ];

    for (const content of invalid) {
      await assert.rejects(
        new UpdateInvitationContentUseCase(fixture.repository, fixture.catalog).execute({
          ownerId: fixture.ownerId,
          id: created.id,
          content,
        }),
        InvalidInvitationContentError,
      );
    }

    assert.deepEqual(fixture.repository.rows[0], before);
  });

  it("validates against the pinned schema after the version is retired (S3)", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);
    fixture.catalog.published.delete(fixture.version.id);

    const updated = await new UpdateInvitationContentUseCase(
      fixture.repository,
      fixture.catalog,
    ).execute({ ownerId: fixture.ownerId, id: created.id, content: { date: "2027-03-14" } });

    assert.deepEqual(updated?.content, { date: "2027-03-14" });
    await assert.rejects(
      new UpdateInvitationContentUseCase(fixture.repository, fixture.catalog).execute({
        ownerId: fixture.ownerId,
        id: created.id,
        content: { unknownKey: "x" },
      }),
      InvalidInvitationContentError,
    );
  });

  it("refuses an archived invitation and leaves the content unchanged (S7, A3)", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);
    await new ArchiveInvitationUseCase(fixture.repository).execute(fixture.ownerId, created.id);
    const before = { ...fixture.repository.rows[0] };

    await assert.rejects(
      new UpdateInvitationContentUseCase(fixture.repository, fixture.catalog).execute({
        ownerId: fixture.ownerId,
        id: created.id,
        content: { celebrantName: "Ana" },
      }),
      InvitationNotEditableError,
    );

    assert.deepEqual(fixture.repository.rows[0], before);
    assert.deepEqual(fixture.repository.rows[0]?.content, {});
  });

  it("answers null for another owner's invitation, changing nothing (A4)", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);
    const otherOwnerId = randomUUID();

    const updated = await new UpdateInvitationContentUseCase(
      fixture.repository,
      fixture.catalog,
    ).execute({ ownerId: otherOwnerId, id: created.id, content: { celebrantName: "Ana" } });

    assert.equal(updated, null);
    assert.deepEqual(fixture.repository.rows[0]?.content, {});
  });

  it("answers null for an unknown or malformed id", async () => {
    const fixture = seeded();
    const useCase = new UpdateInvitationContentUseCase(fixture.repository, fixture.catalog);

    for (const id of [UNKNOWN_ID, MALFORMED_ID]) {
      assert.equal(
        await useCase.execute({ ownerId: fixture.ownerId, id, content: { date: "2027-03-14" } }),
        null,
      );
    }
  });
});

describe("ArchiveInvitationUseCase", () => {
  it("archives a draft and answers the archived row", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);

    const archived = await new ArchiveInvitationUseCase(fixture.repository).execute(
      fixture.ownerId,
      created.id,
    );

    assert.equal(archived?.status, "ARCHIVED");
    assert.ok(archived?.archivedAt instanceof Date);
    assert.equal(fixture.repository.rows[0]?.status, "ARCHIVED");
    assert.ok(fixture.repository.rows[0]?.archivedAt instanceof Date);
    // Archiving is not deleting: the row is still there.
    assert.equal(fixture.repository.rows.length, 1);
  });

  it("refuses an invitation that is already archived", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);
    const useCase = new ArchiveInvitationUseCase(fixture.repository);
    await useCase.execute(fixture.ownerId, created.id);

    await assert.rejects(
      useCase.execute(fixture.ownerId, created.id),
      InvitationAlreadyArchivedError,
    );
    assert.equal(fixture.repository.rows.length, 1);
  });

  it("answers null for another owner's invitation, changing nothing (A4)", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);

    const archived = await new ArchiveInvitationUseCase(fixture.repository).execute(
      randomUUID(),
      created.id,
    );

    assert.equal(archived, null);
    assert.equal(fixture.repository.rows[0]?.status, "DRAFT");
    assert.equal(fixture.repository.rows[0]?.archivedAt, null);
  });

  it("answers null for an unknown or malformed id", async () => {
    const fixture = seeded();
    const useCase = new ArchiveInvitationUseCase(fixture.repository);

    for (const id of [UNKNOWN_ID, MALFORMED_ID]) {
      assert.equal(await useCase.execute(fixture.ownerId, id), null);
    }
  });
});
