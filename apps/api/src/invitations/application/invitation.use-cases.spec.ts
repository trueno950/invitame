import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishableError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import {
  PLAYLIST_COVER_URL_MAX_LENGTH,
  PLAYLIST_TITLE_MAX_LENGTH,
  PLAYLIST_URL_HOST_ISSUE,
  PLAYLIST_URL_LENGTH_ISSUE,
  PLAYLIST_URL_MAX_LENGTH,
  type PlaylistMetadata,
} from "../domain/invitation-features";
import {
  InvalidInvitationContentError,
  InvalidInvitationFeaturesError,
  InvitationPackageDoesNotFitError,
  InvitationPackageNotFoundError,
  InvitationPaymentRequiredError,
  InvitationSlugTakenError,
  InvitationSlugUnavailableError,
  InvitationTemplateVersionNotPublishedError,
  PublicInvitationNotRenderableError,
} from "./invitation.application.errors";
import type {
  InvitationFeatureSettingsWrite,
  InvitationRecord,
  InvitationRecordWithMusic,
  InvitationRepository,
  NewInvitation,
} from "./invitation.repository";
import {
  ArchiveInvitationUseCase,
  CreateInvitationDraftUseCase,
  GetOwnInvitationUseCase,
  GetPublicInvitationUseCase,
  ListOwnInvitationsUseCase,
  MAX_SLUG_ATTEMPTS,
  PublishInvitationUseCase,
  UnpublishInvitationUseCase,
  UpdateInvitationContentUseCase,
  UpdateInvitationFeaturesUseCase,
} from "./invitation.use-cases";
import type {
  CatalogPackageEntitlements,
  CatalogTemplateVersionSnapshot,
  CatalogVersionRenderData,
  CatalogVersionSchema,
  InvitationCatalog,
} from "./invitation-catalog";
import type { InvitationPaymentDecision, InvitationPaymentGate } from "./invitation-payment-gate";
import type { MusicMetadataProvider } from "./music-metadata";

// The invitation application use cases (M4 T3 and M5 T3; S1, S2, S3, S6, S7, S9, A1, A3, A4, A7) on in-memory
// ports: a draft starts empty and pinned to a published version, the package is only validated, every mutation
// is scoped by the session owner, the slug is generated and retried only on a real collision, and content is
// validated against the pinned schema even after that version stops being published. Publication re-validates
// completeness against the pinned schema, asks the payment gate once, and the public read answers only the
// allow-listed projection.

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
  readonly rows: InvitationRecordWithMusic[] = [];
  /** Every slug PostgreSQL would already hold, as the unique index sees it. */
  readonly slugs = new Set<string>();
  createCalls = 0;
  /** How many public reads this fake answered, so a test can prove the public read is one query (S3). */
  findPublishedBySlugCalls = 0;
  private clock = 0;

  /** A slug another customer already stored, so the next create with it collides. */
  reserveSlug(slug: string): void {
    this.slugs.add(slug);
  }

  async create(input: NewInvitation): Promise<InvitationRecordWithMusic> {
    this.createCalls += 1;
    if (this.slugs.has(input.slug)) {
      throw new InvitationSlugTakenError(input.slug);
    }
    this.slugs.add(input.slug);
    this.clock += 1;
    const now = new Date(Date.UTC(2026, 10, 11, 10, 0, 0) + this.clock * 1000);
    const created: InvitationRecordWithMusic = {
      id: randomUUID(),
      status: "DRAFT",
      archivedAt: null,
      publishedAt: null,
      firstPublishedAt: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
      // The database defaults every new row reads (S4, M6 G1).
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: null,
      playlistTitle: null,
      playlistCoverUrl: null,
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
      places: {},
      ...input,
      content: { ...input.content },
    };
    this.rows.push(created);
    return { ...created, content: { ...created.content } };
  }

  /** The place writes are not part of this suite; the place use cases prove them (see invitation-place.use-cases.spec.ts). */
  async updatePlace(): Promise<InvitationRecordWithMusic | null> {
    throw new Error("not used");
  }

  async clearPlace(): Promise<InvitationRecordWithMusic | null> {
    throw new Error("not used");
  }

  async findOwned(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    const stored = this.rows.find((row) => row.id === id && row.ownerId === ownerId);
    return stored ? { ...stored, content: { ...stored.content } } : null;
  }

  async listOwned(ownerId: string): Promise<InvitationRecordWithMusic[]> {
    return this.rows
      .filter((row) => row.ownerId === ownerId)
      .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
      .map((row) => ({ ...row, content: { ...row.content } }));
  }

  async updateContent(
    ownerId: string,
    id: string,
    content: Record<string, unknown>,
  ): Promise<InvitationRecordWithMusic | null> {
    const stored = this.rows.find((row) => row.id === id && row.ownerId === ownerId);
    if (!stored) {
      return null;
    }
    // A DRAFT or a PUBLISHED invitation changes; a published one changes live (S7).
    if (stored.status === "ARCHIVED") {
      throw new InvitationNotEditableError(stored.status);
    }
    stored.content = { ...content };
    stored.updatedAt = new Date(stored.updatedAt.getTime() + 1000);
    return { ...stored, content: { ...stored.content } };
  }

  async updateFeatures(
    ownerId: string,
    id: string,
    features: InvitationFeatureSettingsWrite,
  ): Promise<InvitationRecordWithMusic | null> {
    const stored = this.rows.find((row) => row.id === id && row.ownerId === ownerId);
    if (!stored) {
      return null;
    }
    // A DRAFT or a PUBLISHED invitation changes; a published one changes live (S7).
    if (stored.status === "ARCHIVED") {
      throw new InvitationNotEditableError(stored.status);
    }
    stored.timeZone = features.timeZone;
    stored.whatsappPhone = features.whatsappPhone;
    stored.playlistUrl = features.playlistUrl;
    stored.playlistTitle = features.playlistTitle;
    stored.playlistCoverUrl = features.playlistCoverUrl;
    stored.updatedAt = new Date(stored.updatedAt.getTime() + 1000);
    return { ...stored, content: { ...stored.content } };
  }

  async archive(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    const stored = this.rows.find((row) => row.id === id && row.ownerId === ownerId);
    if (!stored) {
      return null;
    }
    // Archiving is allowed from DRAFT or from PUBLISHED (A2).
    if (stored.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    stored.status = "ARCHIVED";
    stored.archivedAt = new Date(stored.updatedAt.getTime() + 1000);
    stored.publishedAt = null;
    stored.updatedAt = stored.archivedAt;
    return { ...stored, content: { ...stored.content } };
  }

  async publish(ownerId: string, id: string, at: Date): Promise<InvitationRecordWithMusic | null> {
    const stored = this.rows.find((row) => row.id === id && row.ownerId === ownerId);
    if (!stored) {
      return null;
    }
    if (stored.status === "PUBLISHED") {
      throw new InvitationAlreadyPublishedError();
    }
    if (stored.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    stored.status = "PUBLISHED";
    stored.publishedAt = at;
    stored.firstPublishedAt ??= at;
    stored.updatedAt = at;
    return { ...stored, content: { ...stored.content } };
  }

  async unpublish(ownerId: string, id: string): Promise<InvitationRecordWithMusic | null> {
    const stored = this.rows.find((row) => row.id === id && row.ownerId === ownerId);
    if (!stored) {
      return null;
    }
    if (stored.status === "DRAFT") {
      throw new InvitationNotPublishedError();
    }
    if (stored.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    stored.status = "DRAFT";
    stored.publishedAt = null;
    stored.updatedAt = new Date(stored.updatedAt.getTime() + 1000);
    return { ...stored, content: { ...stored.content } };
  }

  async findPublishedBySlug(slug: string): Promise<InvitationRecordWithMusic | null> {
    this.findPublishedBySlugCalls += 1;
    const now = Date.now();
    const stored = this.rows.find(
      (row) =>
        row.slug === slug &&
        row.status === "PUBLISHED" &&
        (row.expiresAt === null || row.expiresAt.getTime() > now),
    );
    return stored ? { ...stored, content: { ...stored.content } } : null;
  }
}

/** An in-memory `InvitationCatalog`: published versions, any-status schemas, and package entitlements. */
class MemoryInvitationCatalog implements InvitationCatalog {
  readonly published = new Map<string, CatalogTemplateVersionSnapshot>();
  readonly schemas = new Map<string, CatalogVersionSchema>();
  readonly packages = new Map<string, CatalogPackageEntitlements>();
  /** The render data of every stored version, whatever its current status (S3, A1). */
  readonly renderData = new Map<string, CatalogVersionRenderData>();
  /** The `componentKey` values the API's in-code allow-list still knows (A3). */
  readonly registeredRenderers = new Set(["birthday-poster-01"]);

  addPublishedVersion(
    input: Partial<CatalogTemplateVersionSnapshot> & { id: string; schema?: unknown },
  ): CatalogTemplateVersionSnapshot {
    const snapshot: CatalogTemplateVersionSnapshot = {
      templateId: randomUUID(),
      componentKey: "birthday-poster-01",
      schema: SCHEMA,
      requiredFeatureKeys: [],
      ...input,
    };
    this.published.set(snapshot.id, snapshot);
    this.schemas.set(snapshot.id, { id: snapshot.id, schema: snapshot.schema });
    this.renderData.set(snapshot.id, {
      componentKey: snapshot.componentKey,
      configuration: { componentKey: snapshot.componentKey },
      schema: snapshot.schema,
    });
    return snapshot;
  }

  /** A version that only exists as a stored snapshot: retired, so it cannot start a draft (S3). */
  addStoredVersion(options: { schema?: unknown; componentKey?: string } = {}): string {
    const id = randomUUID();
    const schema = options.schema ?? SCHEMA;
    const componentKey = options.componentKey ?? "birthday-poster-01";
    this.schemas.set(id, { id, schema });
    this.renderData.set(id, { componentKey, configuration: { componentKey }, schema });
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

  async findVersionRenderData(versionId: string): Promise<CatalogVersionRenderData | null> {
    return this.renderData.get(versionId) ?? null;
  }

  isRendererRegistered(componentKey: string): boolean {
    return this.registeredRenderers.has(componentKey);
  }
}

/**
 * The music metadata port in memory (S2): every lookup is counted and answered from `answers`, keyed by the playlist
 * URL it was asked about, so a test proves when a save looks something up and when it does not.
 */
class MemoryMusicMetadataProvider implements MusicMetadataProvider {
  readonly answers = new Map<string, PlaylistMetadata | null>();
  readonly asked: Array<{ playlistUrl: string; provider: string }> = [];
  /** When set, the next lookup rejects with it, which is what a broken provider looks like. */
  failure: Error | null = null;

  async lookup(playlistUrl: string, provider: string): Promise<PlaylistMetadata | null> {
    this.asked.push({ playlistUrl, provider });
    if (this.failure !== null) {
      throw this.failure;
    }
    return this.answers.get(playlistUrl) ?? null;
  }
}

/** An in-memory `InvitationPaymentGate`: records every invitation it was asked about (S6). */
class MemoryPaymentGate implements InvitationPaymentGate {
  readonly asked: InvitationRecord[] = [];
  decision: InvitationPaymentDecision = { required: false };

  async publicationPaymentRequired(
    invitation: InvitationRecord,
  ): Promise<InvitationPaymentDecision> {
    this.asked.push(invitation);
    return this.decision;
  }
}

function seeded(
  options: {
    requireFeatureKeys?: readonly string[];
    /** The feature keys the package includes, when a test needs them to differ from what a renderer requires. */
    includedFeatureKeys?: readonly string[];
  } = {},
) {
  // The M5 fixtures reuse the M4 seeds: one PUBLISHED version of a PUBLISHED template and an ACTIVE package.
  const repository = new MemoryInvitationRepository();
  const catalog = new MemoryInvitationCatalog();
  const ownerId = randomUUID();
  const version = catalog.addPublishedVersion({
    id: randomUUID(),
    requiredFeatureKeys: options.requireFeatureKeys ?? [],
  });
  const packageId = catalog.addPackage({
    includedFeatureKeys: options.includedFeatureKeys ?? options.requireFeatureKeys ?? [],
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

/** A draft with every required field, so the readiness rule has nothing to report (A1). */
async function publishableDraft(fixture: ReturnType<typeof seeded>, nextSlug?: () => string) {
  const created = await createDraft(fixture, nextSlug);
  await new UpdateInvitationContentUseCase(fixture.repository, fixture.catalog).execute({
    ownerId: fixture.ownerId,
    id: created.id,
    content: { celebrantName: "Ana", date: "2027-03-14" },
  });
  return created;
}

/** The instant every publication fixture writes, so `publishedAt` is observed exactly (S7). */
const PUBLISHED_AT = new Date(Date.UTC(2026, 10, 12, 9, 30, 0));

/** The publish use case wired to an in-memory payment gate and a fixed clock. */
function publisher(
  fixture: ReturnType<typeof seeded>,
  payments = new MemoryPaymentGate(),
  now = () => PUBLISHED_AT,
) {
  return {
    useCase: new PublishInvitationUseCase(fixture.repository, fixture.catalog, payments, now),
    payments,
  };
}

/** The public reader wired to the same in-memory ports (no owner: the guest read, S2, A7). */
function publicReader(fixture: ReturnType<typeof seeded>) {
  return new GetPublicInvitationUseCase(fixture.repository, fixture.catalog);
}

/** The feature update wired to the same in-memory ports (F1; S4, S2). */
function features(
  fixture: ReturnType<typeof seeded>,
  music: MusicMetadataProvider = new MemoryMusicMetadataProvider(),
) {
  return new UpdateInvitationFeaturesUseCase(fixture.repository, fixture.catalog, music);
}

/** The feature keys of every seeded package (prisma/catalog-seed.ts), by package key (S4). */
const SEEDED_PACKAGE_FEATURES = {
  basic: ["COUNTDOWN", "MAP", "WHATSAPP"],
  premium: ["COUNTDOWN", "MUSIC", "GALLERY", "MAP", "RSVP", "WHATSAPP"],
  deluxe: [
    "COUNTDOWN",
    "MUSIC",
    "GALLERY",
    "MAP",
    "RSVP",
    "WHATSAPP",
    "GIFT_REGISTRY",
    "GUEST_LIST",
    "QR_PASS",
  ],
} as const;

const PHONE = "+525512345678";
const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";

/** Publishes a complete draft through the use case, so a fixture starts from a real PUBLISHED row (S7). */
async function publishedInvitation(fixture: ReturnType<typeof seeded>, nextSlug?: () => string) {
  const created = await publishableDraft(fixture, nextSlug);
  const { useCase } = publisher(fixture);
  const published = await useCase.execute(fixture.ownerId, created.id);
  assert.equal(published?.status, "PUBLISHED");
  return created;
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

  it("exposes publishedAt and never the expiry Milestone 5 does not set (S7, S8)", async () => {
    const fixture = seeded();
    await createDraft(fixture, slugs("invitacion-aaaaaa"));
    await publishedInvitation(fixture, slugs("invitacion-bbbbbb"));

    const listed = await new ListOwnInvitationsUseCase(fixture.repository).execute(fixture.ownerId);
    const [published, draftItem] = listed;

    assert.deepEqual(published?.publishedAt, PUBLISHED_AT);
    assert.equal(draftItem?.publishedAt, null);
    // The expiry column exists and is never written by Milestone 5, so no response pretends it exists.
    assert.equal(Object.hasOwn(published ?? {}, "expiresAt"), false);
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

  it("answers the drafted invitation with its time zone and the gated features of its package (F1; S4)", async () => {
    const fixture = seeded({ includedFeatureKeys: SEEDED_PACKAGE_FEATURES.basic });
    const created = await createDraft(fixture);

    const stored = await new GetOwnInvitationUseCase(fixture.repository, fixture.catalog).execute(
      fixture.ownerId,
      created.id,
    );

    assert.equal(stored?.timeZone, "America/Mexico_City");
    assert.deepEqual(stored?.featureSettings, {
      whatsappPhone: null,
      playlistUrl: null,
      playlistTitle: null,
      playlistCoverUrl: null,
    });
    // WhatsApp needs a stored phone, and no catalog feature outside the implemented list appears (S4).
    assert.deepEqual(stored?.availableFeatures, ["COUNTDOWN", "MAP", "CALENDAR"]);
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

  it("edits a published invitation live and keeps it published (S7)", async () => {
    const fixture = seeded();
    const created = await publishedInvitation(fixture);

    const updated = await new UpdateInvitationContentUseCase(
      fixture.repository,
      fixture.catalog,
    ).execute({
      ownerId: fixture.ownerId,
      id: created.id,
      content: { celebrantName: "Beatriz", date: "2027-03-14" },
    });

    assert.equal(updated?.status, "PUBLISHED");
    assert.deepEqual(updated?.publishedAt, PUBLISHED_AT);
    assert.deepEqual(updated?.content, { celebrantName: "Beatriz", date: "2027-03-14" });
    assert.equal(fixture.repository.rows[0]?.status, "PUBLISHED");
    assert.deepEqual(fixture.repository.rows[0]?.publishedAt, PUBLISHED_AT);
  });
});

describe("UpdateInvitationFeaturesUseCase", () => {
  it("stores the zone, the normalized phone, and the playlist link, and answers the gated features (F1, F6; S4, S7)", async () => {
    const fixture = seeded({ includedFeatureKeys: SEEDED_PACKAGE_FEATURES.premium });
    const created = await createDraft(fixture);

    const updated = await features(fixture).execute({
      ownerId: fixture.ownerId,
      id: created.id,
      timeZone: "America/Tijuana",
      whatsappPhone: "(55) 1234-5678",
      playlistUrl: PLAYLIST,
    });

    assert.equal(updated?.timeZone, "America/Tijuana");
    assert.deepEqual(updated?.featureSettings, {
      whatsappPhone: PHONE,
      playlistUrl: PLAYLIST,
      playlistTitle: null,
      playlistCoverUrl: null,
    });
    assert.deepEqual(updated?.availableFeatures, [
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "MUSIC",
      "GALLERY",
      "CALENDAR",
    ]);
    // The owner id never enters a response, and the stored row carries the E.164 value and the link.
    assert.equal(Object.hasOwn(updated ?? {}, "ownerId"), false);
    assert.equal(fixture.repository.rows[0]?.timeZone, "America/Tijuana");
    assert.equal(fixture.repository.rows[0]?.whatsappPhone, PHONE);
    assert.equal(fixture.repository.rows[0]?.playlistUrl, PLAYLIST);
  });

  it("clears the stored phone with null or an empty value and drops WhatsApp from the gated features", async () => {
    const fixture = seeded({ includedFeatureKeys: SEEDED_PACKAGE_FEATURES.basic });
    const created = await createDraft(fixture);
    const useCase = features(fixture);
    await useCase.execute({
      ownerId: fixture.ownerId,
      id: created.id,
      timeZone: "America/Cancun",
      whatsappPhone: PHONE,
      playlistUrl: null,
    });

    for (const cleared of [null, "", "   "]) {
      const updated = await useCase.execute({
        ownerId: fixture.ownerId,
        id: created.id,
        timeZone: "America/Cancun",
        whatsappPhone: cleared,
        playlistUrl: null,
      });

      assert.deepEqual(
        updated?.featureSettings,
        {
          whatsappPhone: null,
          playlistUrl: null,
          playlistTitle: null,
          playlistCoverUrl: null,
        },
        String(cleared),
      );
      assert.deepEqual(updated?.availableFeatures, ["COUNTDOWN", "MAP", "CALENDAR"]);
      assert.equal(fixture.repository.rows[0]?.whatsappPhone, null);
    }
  });

  it("clears the stored playlist link with null or an empty value and drops music (S7)", async () => {
    const fixture = seeded({ includedFeatureKeys: SEEDED_PACKAGE_FEATURES.premium });
    const created = await createDraft(fixture);
    const useCase = features(fixture);
    await useCase.execute({
      ownerId: fixture.ownerId,
      id: created.id,
      timeZone: "America/Cancun",
      whatsappPhone: null,
      playlistUrl: PLAYLIST,
    });

    for (const cleared of [null, "", "   "]) {
      const updated = await useCase.execute({
        ownerId: fixture.ownerId,
        id: created.id,
        timeZone: "America/Cancun",
        whatsappPhone: null,
        playlistUrl: cleared,
      });

      assert.equal(updated?.featureSettings.playlistUrl, null, String(cleared));
      assert.deepEqual(updated?.availableFeatures, [
        "COUNTDOWN",
        "MAP",
        "RSVP",
        "GALLERY",
        "CALENDAR",
      ]);
      assert.equal(fixture.repository.rows[0]?.playlistUrl, null);
    }
  });

  it("refuses a zone outside the allow-list, a phone it cannot normalize, and a link it cannot store (S4, S7)", async () => {
    const fixture = seeded({ includedFeatureKeys: SEEDED_PACKAGE_FEATURES.basic });
    const created = await createDraft(fixture);
    const before = { ...fixture.repository.rows[0] };

    await assert.rejects(
      features(fixture).execute({
        ownerId: fixture.ownerId,
        id: created.id,
        timeZone: "Europe/Madrid",
        whatsappPhone: "12345",
        playlistUrl: null,
      }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidInvitationFeaturesError);
        assert.deepEqual(error.issues, [
          "timeZone must be one of the supported time zones",
          "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
        ]);
        return true;
      },
    );

    for (const [playlistUrl, issue] of [
      ["http://open.spotify.com/playlist/abc", "playlistUrl must be an https link"],
      ["https://example.com/playlist/abc", PLAYLIST_URL_HOST_ISSUE],
      [
        `https://open.spotify.com/${"a".repeat(PLAYLIST_URL_MAX_LENGTH)}`,
        PLAYLIST_URL_LENGTH_ISSUE,
      ],
      [42, "playlistUrl must be a string or null"],
    ] as const) {
      await assert.rejects(
        features(fixture).execute({
          ownerId: fixture.ownerId,
          id: created.id,
          timeZone: "America/Mexico_City",
          whatsappPhone: null,
          playlistUrl,
        }),
        (error: unknown) => {
          assert.ok(error instanceof InvalidInvitationFeaturesError);
          assert.deepEqual(error.issues, [issue], String(playlistUrl));
          return true;
        },
      );
    }

    assert.deepEqual(fixture.repository.rows[0], before);
  });

  it("refuses an archived invitation before looking at the request, and leaves it unchanged (S7, A2)", async () => {
    const fixture = seeded({ includedFeatureKeys: SEEDED_PACKAGE_FEATURES.basic });
    const created = await createDraft(fixture);
    await new ArchiveInvitationUseCase(fixture.repository).execute(fixture.ownerId, created.id);
    const before = { ...fixture.repository.rows[0] };

    await assert.rejects(
      features(fixture).execute({
        ownerId: fixture.ownerId,
        id: created.id,
        // Even a valid request is refused: the status is checked first.
        timeZone: "America/Tijuana",
        whatsappPhone: PHONE,
        playlistUrl: null,
      }),
      InvitationNotEditableError,
    );

    assert.deepEqual(fixture.repository.rows[0], before);
  });

  it("answers null for another owner's invitation, for an unknown id, and for a malformed id (A4)", async () => {
    const fixture = seeded({ includedFeatureKeys: SEEDED_PACKAGE_FEATURES.basic });
    const created = await createDraft(fixture);
    const before = { ...fixture.repository.rows[0] };
    const otherOwnerId = randomUUID();

    assert.equal(
      await features(fixture).execute({
        ownerId: otherOwnerId,
        id: created.id,
        timeZone: "America/Tijuana",
        whatsappPhone: PHONE,
        playlistUrl: null,
      }),
      null,
    );
    for (const id of [UNKNOWN_ID, MALFORMED_ID, ""]) {
      assert.equal(
        await features(fixture).execute({
          ownerId: fixture.ownerId,
          id,
          timeZone: "America/Tijuana",
          whatsappPhone: PHONE,
          playlistUrl: null,
        }),
        null,
      );
    }

    assert.deepEqual(fixture.repository.rows[0], before);
  });

  it("edits a published invitation live and keeps it published (S7)", async () => {
    const fixture = seeded({ includedFeatureKeys: SEEDED_PACKAGE_FEATURES.basic });
    const created = await publishedInvitation(fixture);

    const updated = await features(fixture).execute({
      ownerId: fixture.ownerId,
      id: created.id,
      timeZone: "America/Merida",
      whatsappPhone: PHONE,
      playlistUrl: null,
    });

    assert.equal(updated?.status, "PUBLISHED");
    assert.equal(updated?.timeZone, "America/Merida");
    assert.deepEqual(fixture.repository.rows[0]?.publishedAt, PUBLISHED_AT);
  });

  // The playlist metadata (S2): one lookup when the link appears or changes, none when it does not, and the stored
  // metadata always describes the stored link.
  const METADATA: PlaylistMetadata = {
    title: "Today’s Top Hits",
    coverUrl: "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07",
  };

  async function savePlaylist(
    music: MemoryMusicMetadataProvider,
    playlistUrl: string | null,
    fixture = seeded({ includedFeatureKeys: SEEDED_PACKAGE_FEATURES.premium }),
  ) {
    const created = await createDraft(fixture);
    const useCase = features(fixture, music);
    const updated = await useCase.execute({
      ownerId: fixture.ownerId,
      id: created.id,
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl,
    });

    return { fixture, created, updated, useCase };
  }

  it("looks the provider up once when the playlist link is saved and stores its title and cover (S2)", async () => {
    const music = new MemoryMusicMetadataProvider();
    music.answers.set(PLAYLIST, METADATA);

    const { fixture, created, updated } = await savePlaylist(music, PLAYLIST);

    assert.deepEqual(music.asked, [{ playlistUrl: PLAYLIST, provider: "spotify" }]);
    assert.deepEqual(updated?.featureSettings, {
      whatsappPhone: null,
      playlistUrl: PLAYLIST,
      playlistTitle: METADATA.title,
      playlistCoverUrl: METADATA.coverUrl,
    });
    // The metadata is stored with the link, so a later or public read answers it without a provider.
    assert.equal(fixture.repository.rows[0]?.playlistTitle, METADATA.title);
    assert.equal(fixture.repository.rows[0]?.playlistCoverUrl, METADATA.coverUrl);
    assert.equal(fixture.repository.rows[0]?.id, created.id);
  });

  it("looks nothing up when the link did not change, and keeps what was stored for it (S2)", async () => {
    const music = new MemoryMusicMetadataProvider();
    music.answers.set(PLAYLIST, METADATA);
    const { fixture, created, useCase } = await savePlaylist(music, PLAYLIST);
    // A later answer that disagrees proves the save reused the stored metadata instead of asking again.
    music.answers.set(PLAYLIST, { title: "Otra lista", coverUrl: null });

    const again = await useCase.execute({
      ownerId: fixture.ownerId,
      id: created.id,
      timeZone: "America/Cancun",
      whatsappPhone: PHONE,
      playlistUrl: PLAYLIST,
    });

    assert.equal(music.asked.length, 1);
    assert.equal(again?.timeZone, "America/Cancun");
    assert.equal(again?.featureSettings.playlistTitle, METADATA.title);
    assert.equal(again?.featureSettings.playlistCoverUrl, METADATA.coverUrl);
  });

  it("clears the stored metadata with the link, and asks nobody for it (S2)", async () => {
    const music = new MemoryMusicMetadataProvider();
    music.answers.set(PLAYLIST, METADATA);
    const { fixture, created, useCase } = await savePlaylist(music, PLAYLIST);

    for (const cleared of [null, ""]) {
      const updated = await useCase.execute({
        ownerId: fixture.ownerId,
        id: created.id,
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: cleared,
      });

      assert.equal(music.asked.length, 1, String(cleared));
      assert.equal(updated?.featureSettings.playlistUrl, null);
      assert.equal(updated?.featureSettings.playlistTitle, null);
      assert.equal(updated?.featureSettings.playlistCoverUrl, null);
    }
    assert.equal(fixture.repository.rows[0]?.playlistTitle, null);
    assert.equal(fixture.repository.rows[0]?.playlistCoverUrl, null);
  });

  it("stores nulls and still saves when the provider fails (S2)", async () => {
    const music = new MemoryMusicMetadataProvider();
    music.failure = new Error("provider is down");

    const { fixture, created, updated } = await savePlaylist(music, PLAYLIST);

    assert.equal(music.asked.length, 1);
    // Fail open for the save: the link is stored and the request succeeds.
    assert.equal(updated?.id, created.id);
    assert.deepEqual(updated?.featureSettings, {
      whatsappPhone: null,
      playlistUrl: PLAYLIST,
      playlistTitle: null,
      playlistCoverUrl: null,
    });
    assert.equal(fixture.repository.rows[0]?.playlistUrl, PLAYLIST);
  });

  it("stores no metadata when the provider answers nothing, and asks no provider a link it cannot place (S2)", async () => {
    const silent = new MemoryMusicMetadataProvider();
    const unplaceable = new MemoryMusicMetadataProvider();

    const quiet = await savePlaylist(silent, PLAYLIST);
    assert.deepEqual(silent.asked, [{ playlistUrl: PLAYLIST, provider: "spotify" }]);
    assert.equal(quiet.updated?.featureSettings.playlistTitle, null);
    assert.equal(quiet.updated?.featureSettings.playlistCoverUrl, null);

    // Apple Music is allow-listed for the link, and the adapter this deployment binds answers "no metadata" for it:
    // the port decides who can be asked, so the use case only sees an empty answer (S2).
    const apple = "https://music.apple.com/mx/playlist/pl.u-6mo4l3LT7g7k";
    const answered = await savePlaylist(unplaceable, apple);
    assert.deepEqual(unplaceable.asked, [{ playlistUrl: apple, provider: "apple_music" }]);
    assert.equal(answered.updated?.featureSettings.playlistUrl, apple);
    assert.equal(answered.updated?.featureSettings.playlistTitle, null);
    assert.equal(answered.updated?.featureSettings.playlistCoverUrl, null);
  });

  it("bounds what a provider answer can store (S2): the title is cut and an off-list cover dropped", async () => {
    const music = new MemoryMusicMetadataProvider();
    music.answers.set(PLAYLIST, {
      title: `  ${"a".repeat(PLAYLIST_TITLE_MAX_LENGTH + 50)}  `,
      coverUrl: "https://evil.test/cover.jpg",
    } as PlaylistMetadata);

    const { updated } = await savePlaylist(music, PLAYLIST);

    assert.equal(updated?.featureSettings.playlistTitle, "a".repeat(PLAYLIST_TITLE_MAX_LENGTH));
    assert.equal(updated?.featureSettings.playlistCoverUrl, null);

    const longCover = new MemoryMusicMetadataProvider();
    longCover.answers.set(PLAYLIST, {
      title: null,
      coverUrl: `https://i.scdn.co/${"a".repeat(PLAYLIST_COVER_URL_MAX_LENGTH)}`,
    });
    const stored = await savePlaylist(longCover, PLAYLIST);
    assert.equal(stored.updated?.featureSettings.playlistCoverUrl, null);
  });

  it("answers the stored title and cover to the public read, and nothing more (S2, A7)", async () => {
    const music = new MemoryMusicMetadataProvider();
    music.answers.set(PLAYLIST, METADATA);
    const fixture = seeded({ includedFeatureKeys: SEEDED_PACKAGE_FEATURES.premium });
    const created = await publishableDraft(fixture);
    await features(fixture, music).execute({
      ownerId: fixture.ownerId,
      id: created.id,
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: PLAYLIST,
    });
    await publisher(fixture).useCase.execute(fixture.ownerId, created.id);

    const page = await publicReader(fixture).execute(created.slug);

    assert.deepEqual(page?.features.music, {
      url: PLAYLIST,
      provider: "spotify",
      title: METADATA.title,
      coverUrl: METADATA.coverUrl,
    });
    // The provider's own answer (player HTML, author) never reaches a guest.
    assert.equal(JSON.stringify(page).includes("<iframe"), false);
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

  it("archives a published invitation and clears publishedAt (A2)", async () => {
    const fixture = seeded();
    const created = await publishedInvitation(fixture);

    const archived = await new ArchiveInvitationUseCase(fixture.repository).execute(
      fixture.ownerId,
      created.id,
    );

    assert.equal(archived?.status, "ARCHIVED");
    assert.ok(archived?.archivedAt instanceof Date);
    assert.equal(archived?.publishedAt, null);
    assert.equal(fixture.repository.rows[0]?.status, "ARCHIVED");
    assert.equal(fixture.repository.rows[0]?.publishedAt, null);
    // Archiving stays terminal and never deletes (A2).
    assert.equal(fixture.repository.rows.length, 1);
  });
});

describe("PublishInvitationUseCase", () => {
  it("publishes a complete draft and marks publishedAt (S7)", async () => {
    const fixture = seeded();
    const created = await publishableDraft(fixture);
    const { useCase, payments } = publisher(fixture);

    const published = await useCase.execute(fixture.ownerId, created.id);

    assert.equal(published?.status, "PUBLISHED");
    assert.deepEqual(published?.publishedAt, PUBLISHED_AT);
    assert.deepEqual(published?.missingRequiredFields, []);
    assert.equal(fixture.repository.rows[0]?.status, "PUBLISHED");
    assert.deepEqual(fixture.repository.rows[0]?.publishedAt, PUBLISHED_AT);
    // The gate is asked once, with the stored row, and never from the request payload (S6).
    assert.equal(payments.asked.length, 1);
    assert.equal(payments.asked[0]?.id, created.id);
  });

  it("refuses an incomplete draft with every issue and stores nothing (A1)", async () => {
    const fixture = seeded();
    const created = await createDraft(fixture);
    const before = { ...fixture.repository.rows[0] };
    const { useCase, payments } = publisher(fixture);

    await assert.rejects(useCase.execute(fixture.ownerId, created.id), (error: unknown) => {
      assert.ok(error instanceof InvitationNotPublishableError);
      assert.deepEqual(error.issues, [
        "content.celebrantName is required to publish",
        "content.date is required to publish",
      ]);
      return true;
    });

    assert.deepEqual(fixture.repository.rows[0], before);
    assert.equal(fixture.repository.rows[0]?.status, "DRAFT");
    assert.equal(fixture.repository.rows[0]?.publishedAt, null);
    assert.equal(payments.asked.length, 0);
  });

  it("reports the content issues before the package issue, in that order (A1)", async () => {
    const fixture = seeded({ requireFeatureKeys: ["COUNTDOWN"] });
    const created = await createDraft(fixture);
    // A stored value the pinned schema refuses, as a pre-M5 row could hold after a catalog change.
    assert.ok(fixture.repository.rows[0]);
    fixture.repository.rows[0].content = { celebrantName: 42 };
    // The catalog changed under the draft: the package no longer includes what the renderer requires.
    fixture.catalog.packages.set(fixture.packageId, {
      status: "ACTIVE",
      includedFeatureKeys: [],
    });
    const { useCase, payments } = publisher(fixture);

    await assert.rejects(useCase.execute(fixture.ownerId, created.id), (error: unknown) => {
      assert.ok(error instanceof InvitationNotPublishableError);
      assert.deepEqual(error.issues, [
        "content.date is required to publish",
        "content.celebrantName must be a string of at most 80 characters",
        "package does not include the template's required features",
      ]);
      return true;
    });

    assert.equal(fixture.repository.rows[0]?.status, "DRAFT");
    assert.equal(payments.asked.length, 0);
  });

  it("refuses a pinned version the catalog has retired, and stores nothing (A1)", async () => {
    const fixture = seeded();
    const created = await publishableDraft(fixture);
    // The catalog publishes a newer version and retires the pinned one before this publication.
    fixture.catalog.published.delete(fixture.version.id);
    const { useCase, payments } = publisher(fixture);

    await assert.rejects(useCase.execute(fixture.ownerId, created.id), (error: unknown) => {
      assert.ok(error instanceof InvitationNotPublishableError);
      assert.deepEqual(error.issues, ["template version is no longer published"]);
      return true;
    });

    assert.equal(fixture.repository.rows[0]?.status, "DRAFT");
    assert.equal(fixture.repository.rows[0]?.publishedAt, null);
    assert.equal(payments.asked.length, 0);
  });

  it("refuses when the payment gate requires payment and stores nothing (S6)", async () => {
    const fixture = seeded();
    const created = await publishableDraft(fixture);
    const payments = new MemoryPaymentGate();
    payments.decision = { required: true, reason: "PAYMENT_REQUIRED" };
    const { useCase } = publisher(fixture, payments);

    await assert.rejects(useCase.execute(fixture.ownerId, created.id), (error: unknown) => {
      assert.ok(error instanceof InvitationPaymentRequiredError);
      assert.equal(error.reason, "PAYMENT_REQUIRED");
      return true;
    });

    assert.equal(fixture.repository.rows[0]?.status, "DRAFT");
    assert.equal(fixture.repository.rows[0]?.publishedAt, null);
    assert.equal(payments.asked.length, 1);
  });

  it("answers null for another owner's invitation and changes nothing (A4)", async () => {
    const fixture = seeded();
    const created = await publishableDraft(fixture);
    const { useCase, payments } = publisher(fixture);

    assert.equal(await useCase.execute(randomUUID(), created.id), null);

    assert.equal(fixture.repository.rows[0]?.status, "DRAFT");
    assert.equal(fixture.repository.rows[0]?.publishedAt, null);
    assert.equal(payments.asked.length, 0);
  });

  it("answers null for an unknown or malformed id", async () => {
    const fixture = seeded();
    const { useCase } = publisher(fixture);

    for (const id of [UNKNOWN_ID, MALFORMED_ID]) {
      assert.equal(await useCase.execute(fixture.ownerId, id), null);
    }
  });

  it("refuses to publish an already published or an archived invitation (S7, A2)", async () => {
    const fixture = seeded();
    const published = await publishedInvitation(fixture);
    const { useCase } = publisher(fixture);

    await assert.rejects(
      useCase.execute(fixture.ownerId, published.id),
      InvitationAlreadyPublishedError,
    );
    await new ArchiveInvitationUseCase(fixture.repository).execute(fixture.ownerId, published.id);
    await assert.rejects(
      useCase.execute(fixture.ownerId, published.id),
      InvitationAlreadyArchivedError,
    );

    assert.equal(fixture.repository.rows[0]?.status, "ARCHIVED");
    assert.equal(fixture.repository.rows[0]?.publishedAt, null);
  });
});

describe("UnpublishInvitationUseCase", () => {
  it("returns a published invitation to DRAFT and clears publishedAt (S7)", async () => {
    const fixture = seeded();
    const created = await publishedInvitation(fixture);

    const unpublished = await new UnpublishInvitationUseCase(fixture.repository).execute(
      fixture.ownerId,
      created.id,
    );

    assert.equal(unpublished?.status, "DRAFT");
    assert.equal(unpublished?.publishedAt, null);
    assert.equal(fixture.repository.rows[0]?.status, "DRAFT");
    assert.equal(fixture.repository.rows[0]?.publishedAt, null);
    // The content survives, so the owner can publish again (S7).
    assert.deepEqual(fixture.repository.rows[0]?.content, {
      celebrantName: "Ana",
      date: "2027-03-14",
    });
  });

  it("publishes again after an unpublish (S7)", async () => {
    const fixture = seeded();
    const created = await publishedInvitation(fixture);
    await new UnpublishInvitationUseCase(fixture.repository).execute(fixture.ownerId, created.id);

    const republished = await publisher(fixture).useCase.execute(fixture.ownerId, created.id);

    assert.equal(republished?.status, "PUBLISHED");
    assert.deepEqual(fixture.repository.rows[0]?.publishedAt, PUBLISHED_AT);
  });

  it("refuses a draft that was never published and an archived invitation (S7, A2)", async () => {
    const fixture = seeded();
    const draftItem = await createDraft(fixture);
    const useCase = new UnpublishInvitationUseCase(fixture.repository);

    await assert.rejects(
      useCase.execute(fixture.ownerId, draftItem.id),
      InvitationNotPublishedError,
    );

    await new ArchiveInvitationUseCase(fixture.repository).execute(fixture.ownerId, draftItem.id);
    await assert.rejects(
      useCase.execute(fixture.ownerId, draftItem.id),
      InvitationAlreadyArchivedError,
    );
    assert.equal(fixture.repository.rows[0]?.status, "ARCHIVED");
  });

  it("answers null for another owner's invitation and for an id that names nothing (A4)", async () => {
    const fixture = seeded();
    const created = await publishedInvitation(fixture);
    const useCase = new UnpublishInvitationUseCase(fixture.repository);

    assert.equal(await useCase.execute(randomUUID(), created.id), null);
    assert.equal(fixture.repository.rows[0]?.status, "PUBLISHED");

    for (const id of [UNKNOWN_ID, MALFORMED_ID]) {
      assert.equal(await useCase.execute(fixture.ownerId, id), null);
    }
  });
});

describe("GetPublicInvitationUseCase", () => {
  it("answers only the allow-listed projection of a published invitation (A7)", async () => {
    const fixture = seeded();
    const created = await publishedInvitation(fixture);
    const useCase = publicReader(fixture);

    const page = await useCase.execute(created.slug);

    assert.deepEqual(page, {
      slug: created.slug,
      componentKey: "birthday-poster-01",
      configuration: { componentKey: "birthday-poster-01" },
      content: { celebrantName: "Ana", date: "2027-03-14" },
      publishedAt: PUBLISHED_AT,
      timeZone: "America/Mexico_City",
      // The fixture's package includes no catalog feature, so only the always-available calendar is left (S4).
      features: {
        countdown: false,
        map: false,
        calendar: true,
        whatsapp: null,
        music: null,
        giftRegistry: false,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      },
      // The fixture stored no point, and its package grants no MAP (S2).
      places: {},
    });
    // Nothing outside the allow-list leaks: no owner, package, price, id, or status (A7).
    assert.deepEqual(Object.keys(page ?? {}).sort(), [
      "componentKey",
      "configuration",
      "content",
      "features",
      "places",
      "publishedAt",
      "slug",
      "timeZone",
    ]);
    // One query resolves the invitation (S3).
    assert.equal(fixture.repository.findPublishedBySlugCalls, 1);
  });

  it("keeps only the keys the pinned schema declares (A7)", async () => {
    const fixture = seeded();
    const created = await publishedInvitation(fixture);
    assert.ok(fixture.repository.rows[0]);
    // A row written before this rule existed may hold keys the schema never declared.
    fixture.repository.rows[0].content = {
      celebrantName: "Ana",
      date: "2027-03-14",
      guestSecret: "do not render",
    };

    const page = await publicReader(fixture).execute(created.slug);

    assert.deepEqual(page?.content, { celebrantName: "Ana", date: "2027-03-14" });
    assert.equal(Object.hasOwn(page?.content ?? {}, "guestSecret"), false);
  });

  it("keeps rendering the pinned version after the catalog retires it (A1)", async () => {
    const fixture = seeded();
    const created = await publishedInvitation(fixture);
    fixture.catalog.published.delete(fixture.version.id);

    const page = await publicReader(fixture).execute(created.slug);

    assert.equal(page?.slug, created.slug);
    assert.deepEqual(page?.content, { celebrantName: "Ana", date: "2027-03-14" });
  });

  it("answers null for a draft, an archived, an expired, and an unknown slug (A3)", async () => {
    const fixture = seeded();
    const draftItem = await createDraft(fixture, slugs("invitacion-draft01"));
    const archived = await publishedInvitation(fixture, slugs("invitacion-archiv"));
    const expired = await publishedInvitation(fixture, slugs("invitacion-expird"));
    await new ArchiveInvitationUseCase(fixture.repository).execute(fixture.ownerId, archived.id);
    const expiredRow = fixture.repository.rows.find((row) => row.id === expired.id);
    assert.ok(expiredRow);
    // The expiry rule arrives in a later milestone; the read must already refuse an elapsed one (S8).
    expiredRow.expiresAt = new Date(Date.now() - 1000);
    const useCase = publicReader(fixture);

    assert.equal(await useCase.execute(draftItem.slug), null);
    assert.equal(await useCase.execute(archived.slug), null);
    assert.equal(await useCase.execute(expired.slug), null);
    assert.equal(await useCase.execute("invitacion-unknown"), null);
  });

  it("validates the slug format before reading anything (S2)", async () => {
    const fixture = seeded();
    await publishedInvitation(fixture);
    const useCase = publicReader(fixture);

    for (const slug of ["", "no", "Invitacion-Mayus", "invitacion--doble", "a".repeat(61), "x y"]) {
      assert.equal(await useCase.execute(slug), null, slug);
    }
    assert.equal(fixture.repository.findPublishedBySlugCalls, 0);
  });

  it("refuses a renderer the API does not know with a distinct operational error (A3)", async () => {
    const fixture = seeded();
    const created = await publishedInvitation(fixture);
    fixture.catalog.renderData.set(fixture.version.id, {
      componentKey: "retired-renderer-99",
      configuration: {},
      schema: SCHEMA,
    });

    await assert.rejects(publicReader(fixture).execute(created.slug), (error: unknown) => {
      assert.ok(error instanceof PublicInvitationNotRenderableError);
      assert.equal(error.componentKey, "retired-renderer-99");
      return true;
    });
  });

  it("answers the gated features of each seeded package, with WhatsApp only while a phone is stored (S4, S7)", async () => {
    for (const [packageKey, includedFeatureKeys] of Object.entries(SEEDED_PACKAGE_FEATURES)) {
      const fixture = seeded({ includedFeatureKeys });
      const created = await publishedInvitation(fixture);

      const withoutPhone = await publicReader(fixture).execute(created.slug);
      assert.deepEqual(
        withoutPhone?.features,
        {
          countdown: true,
          map: true,
          calendar: true,
          whatsapp: null,
          music: null,
          giftRegistry: packageKey === "deluxe",
          gallery: [],
          // Premium grants RSVP and no guest list; Deluxe grants the guest list, which replaces the form (M6 S4).
          rsvp: {
            mode: packageKey === "deluxe" ? "guest-list" : packageKey === "premium" ? "open" : null,
            deadline: null,
            partyLimit: 4,
            // Deluxe also grants the guest list's access pass (M6 G2).
            qrPass: packageKey === "deluxe",
          },
        },
        packageKey,
      );

      await features(fixture).execute({
        ownerId: fixture.ownerId,
        id: created.id,
        timeZone: "America/Tijuana",
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
      });

      const page = await publicReader(fixture).execute(created.slug);
      assert.equal(page?.timeZone, "America/Tijuana", packageKey);
      assert.deepEqual(
        page?.features,
        {
          countdown: true,
          map: true,
          calendar: true,
          whatsapp: { phone: PHONE },
          // Basic grants no MUSIC; Premium and Deluxe do, and both get the service the link names.
          music:
            packageKey === "basic"
              ? null
              : { url: PLAYLIST, provider: "spotify", title: null, coverUrl: null },
          giftRegistry: packageKey === "deluxe",
          gallery: [],
          rsvp: {
            mode: packageKey === "deluxe" ? "guest-list" : packageKey === "premium" ? "open" : null,
            deadline: null,
            partyLimit: 4,
            // Deluxe also grants the guest list's access pass (M6 G2).
            qrPass: packageKey === "deluxe",
          },
        },
        packageKey,
      );
      // Nothing about the package travels: no key list, no name, no id (S4, A7).
      assert.deepEqual(Object.keys(page?.features ?? {}).sort(), [
        "calendar",
        "countdown",
        "gallery",
        "giftRegistry",
        "map",
        "music",
        "rsvp",
        "whatsapp",
      ]);
      assert.equal(JSON.stringify(page).includes("COUNTDOWN"), false);
    }
  });

  it("keeps a stored phone private when the package does not include WHATSAPP (S4)", async () => {
    const fixture = seeded({ includedFeatureKeys: ["COUNTDOWN", "MUSIC"] });
    const created = await publishedInvitation(fixture);
    await features(fixture).execute({
      ownerId: fixture.ownerId,
      id: created.id,
      timeZone: "America/Cancun",
      whatsappPhone: PHONE,
      playlistUrl: PLAYLIST,
    });

    const page = await publicReader(fixture).execute(created.slug);

    assert.equal(page?.timeZone, "America/Cancun");
    assert.deepEqual(page?.features, {
      countdown: true,
      map: false,
      calendar: true,
      whatsapp: null,
      music: { url: PLAYLIST, provider: "spotify", title: null, coverUrl: null },
      giftRegistry: false,
      gallery: [],
      rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
    });
    assert.equal(JSON.stringify(page).includes(PHONE), false);
  });
});
