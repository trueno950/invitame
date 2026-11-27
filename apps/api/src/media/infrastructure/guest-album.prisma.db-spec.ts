import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaCatalogPublicReader } from "../../catalog/infrastructure/prisma-catalog-public-reader";
import { GetPublicInvitationUseCase } from "../../invitations/application/invitation.use-cases";
import { CatalogInvitationReader } from "../../invitations/infrastructure/catalog-invitation-reader";
import { PrismaInvitationRepository } from "../../invitations/infrastructure/prisma-invitation.repository";
import {
  GetGuestAlbumUseCase,
  ReadPublicGuestAlbumUseCase,
  ReviewGuestPhotoUseCase,
  UploadGuestPhotoUseCase,
} from "../application/guest-album.use-cases";
import { CleanupMediaUseCase, ServeMediaUseCase } from "../application/media.use-cases";
import type { MediaStorage, MediaStorageObject } from "../application/media-storage";
import type { MediaRepository } from "../application/media.repository";
import { PrismaGuestAlbumRateLimiter } from "./prisma-guest-album-rate-limiter";
import { PrismaGuestAlbumRepository } from "./prisma-guest-album.repository";
import { GUEST_ALBUM_RATE_LIMIT } from "../application/guest-album-rate-limiter";
import {
  GUEST_PHOTO_MAX_STORED,
  GUEST_PHOTO_PUBLIC_MAX,
  GUEST_PHOTO_RETENTION_MS,
} from "../domain/guest-photo";

// The album on real PostgreSQL (F8; S2.8, L11.1, L11.3, L11.4, L11.6): the additive enum and table with their CHECK
// constraints; the RESTRICT reference the convention states (L24); the PENDING default; the insert that refuses an
// unpublished, archived, or expired invitation and the invitation that already stores its cap, in the statement itself;
// the public read that answers published photos only, with its bound and its count; the owner's scope; the serving rule
// of a pending or hidden photo; the media retention cleanup; and the hourly per-address limit on the shared `RateLimit`
// table. Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL. The database is shared
// with parallel suites: every row here carries a key made from this run's id, and only those rows are removed.

const RENDERER = "birthday-poster-01";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

/** An in-memory storage adapter, so the cleanup and the upload write nothing outside the test. */
class MemoryStorage implements MediaStorage {
  readonly objects = new Map<string, { bytes: Uint8Array; lastModified: Date }>();

  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.objects.set(key, { bytes, lastModified: new Date() });
  }

  async get(
    key: string,
  ): Promise<{ stream: Readable; byteSize: number; contentType: string } | null> {
    const stored = this.objects.get(key);

    return stored === undefined
      ? null
      : {
          stream: Readable.from(Buffer.from(stored.bytes)),
          byteSize: stored.bytes.length,
          contentType: "image/webp",
        };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async listObjects(prefix: string): Promise<MediaStorageObject[]> {
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, stored]) => ({ key, lastModified: stored.lastModified }));
  }

  /** Seeds an object as an earlier upload left it, so a retention cutoff can be observed exactly. */
  seed(key: string, lastModified: Date): void {
    this.objects.set(key, { bytes: Buffer.from("webp"), lastModified });
  }
}

/** The media port with no rows at all: this suite only needs the cleanup's other half. */
const NO_MEDIA_ROWS: MediaRepository = {
  findOwnedInvitation: async () => null,
  listStored: async () => null,
  insert: async () => null,
  updateAlt: async () => null,
  moveGallery: async () => null,
  markDeleted: async () => null,
  findForServing: async () => null,
  listPublicGallery: async () => [],
  listDeleted: async () => [],
  listStorageKeys: async () => [],
  remove: async () => {},
};

describe("the guests' album on real PostgreSQL (F8; S2.8)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const invitations = new PrismaInvitationRepository(prisma);
  const album = new PrismaGuestAlbumRepository(prisma);
  const catalog = new CatalogInvitationReader(new PrismaCatalogPublicReader(prisma));
  const assetUrl = (id: string) => `https://api.example.test/media/${id}`;
  const publicRead = new ReadPublicGuestAlbumUseCase(album, { assetUrl });
  const ownerRead = new GetGuestAlbumUseCase(album, { assetUrl });
  const review = new ReviewGuestPhotoUseCase(album, {
    assetUrl,
    now: () => new Date("2026-12-10T12:00:00.000Z"),
  });
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
      // Photos reference invitations with ON DELETE RESTRICT, so they go first.
      await prisma.guestPhoto.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.invitationFeatureSettings.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.packageFeature.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.feature.deleteMany({ where: { id: { in: featureIds } } });
      // Every upload count this suite wrote is keyed by one of its own invitations.
      await prisma.rateLimit.deleteMany({
        where: {
          OR: invitationIds.map((id) => ({ key: { startsWith: `guest-album|${id}|` } })),
        },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newOwner(): Promise<string> {
    sequence += 1;
    const created = await prisma.user.create({
      data: { email: `f8-album-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);
    return created.id;
  }

  /** A seeded feature key, reused when the catalog already has it and removed only when this suite created it. */
  async function feature(key: string): Promise<string> {
    const stored = await prisma.feature.findUnique({ where: { key } });
    if (stored !== null) {
      return stored.id;
    }
    const created = await prisma.feature.create({ data: { key, name: key } });
    featureIds.push(created.id);
    return created.id;
  }

  /** A PUBLISHED version of a PUBLISHED template and an ACTIVE package with the given feature keys. */
  async function newCatalog(featureKeys: readonly string[]) {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `f8-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `f8-template-${sequence}-${runId}`,
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
        schema: { type: "object", required: [], properties: {} },
        configuration: { componentKey: RENDERER },
      },
    });
    const createdPackage = await prisma.package.create({
      data: {
        key: `f8-package-${sequence}-${runId}`,
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
    return `f8-${runId.slice(0, 8)}-${sequence}`;
  }

  /** A published invitation created through the repository, as the owner routes leave it. */
  async function newPublished(
    featureKeys: readonly string[] = ["GUEST_ALBUM"],
    options: { ownerId?: string; publish?: boolean; expiresAt?: Date | null } = {},
  ) {
    const ownerId = options.ownerId ?? (await newOwner());
    const catalogState = await newCatalog(featureKeys);
    const created = await invitations.create({
      ownerId,
      templateVersionId: catalogState.versionId,
      packageId: catalogState.packageId,
      slug: newSlug(),
      content: {},
      rsvpPartyLimit: 4,
    });
    invitationIds.push(created.id);
    if (options.publish !== false) {
      assert.ok(
        await invitations.publish(ownerId, created.id, new Date("2026-12-01T10:00:00.000Z")),
      );
    }
    if (options.expiresAt !== undefined) {
      await prisma.invitation.update({
        where: { id: created.id },
        data: { expiresAt: options.expiresAt },
      });
    }

    return { ownerId, id: created.id, slug: created.slug };
  }

  /** One stored photo, written directly as the upload's insert writes it. */
  async function seedPhoto(
    invitationId: string,
    overrides: {
      status?: "PENDING" | "PUBLISHED" | "HIDDEN";
      uploaderName?: string | null;
      createdAt?: Date;
      reviewedAt?: Date | null;
    } = {},
  ): Promise<{ id: string; storageKey: string }> {
    const id = randomUUID();
    const status = overrides.status ?? "PENDING";
    const createdAt = overrides.createdAt ?? new Date("2026-12-01T10:00:00.000Z");
    await prisma.guestPhoto.create({
      data: {
        id,
        invitationId,
        storageKey: `invitations/${invitationId}/${id}.webp`,
        status,
        uploaderName: overrides.uploaderName ?? null,
        createdAt,
        reviewedAt:
          status === "PENDING"
            ? null
            : (overrides.reviewedAt ?? new Date("2026-12-02T10:00:00.000Z")),
      },
    });

    return { id, storageKey: `invitations/${invitationId}/${id}.webp` };
  }

  it("stores every photo PENDING with no review instant, and refuses a state that contradicts it (L11.1)", async () => {
    const { id } = await newPublished();
    const photo = await seedPhoto(id, { uploaderName: "Tía Rosa" });

    const stored = await prisma.guestPhoto.findUniqueOrThrow({ where: { id: photo.id } });
    assert.equal(stored.status, "PENDING");
    assert.equal(stored.reviewedAt, null);
    assert.equal(stored.uploaderName, "Tía Rosa");

    // A pending photo with a review instant, and a published one without it, are both refused by the database.
    await assert.rejects(
      prisma.guestPhoto.update({
        where: { id: photo.id },
        data: { reviewedAt: new Date("2026-12-02T10:00:00.000Z") },
      }),
    );
    await assert.rejects(
      prisma.guestPhoto.update({ where: { id: photo.id }, data: { status: "PUBLISHED" } }),
    );
    // The storage key is this API's own object name, so no row can name a path outside `invitations/`.
    await assert.rejects(
      prisma.guestPhoto.create({
        data: {
          invitationId: id,
          storageKey: "../escape.webp",
        },
      }),
    );
    // The name a guest types is bounded at 60 characters, and a blank one is no name at all.
    await assert.rejects(
      prisma.guestPhoto.create({
        data: {
          invitationId: id,
          storageKey: `invitations/${id}/${randomUUID()}.webp`,
          uploaderName: "x".repeat(61),
        },
      }),
    );
  });

  it("answers only published photos, newest first and bounded, with the published count (L11.4)", async () => {
    const { id } = await newPublished();
    const older = await seedPhoto(id, {
      status: "PUBLISHED",
      createdAt: new Date("2026-12-01T10:00:00.000Z"),
      reviewedAt: new Date("2026-12-01T11:00:00.000Z"),
    });
    const newer = await seedPhoto(id, {
      status: "PUBLISHED",
      uploaderName: "Sofía",
      createdAt: new Date("2026-12-01T12:00:00.000Z"),
      reviewedAt: new Date("2026-12-01T13:00:00.000Z"),
    });
    await seedPhoto(id, { status: "PENDING", createdAt: new Date("2026-12-01T13:00:00.000Z") });
    await seedPhoto(id, { status: "HIDDEN", createdAt: new Date("2026-12-01T14:00:00.000Z") });

    const read = await publicRead.readPublishedPhotos(id);

    assert.deepEqual(read, {
      photos: [
        { url: assetUrl(newer.id), uploaderName: "Sofía" },
        { url: assetUrl(older.id), uploaderName: null },
      ],
      count: 2,
    });
  });

  it("answers at most the newest 60 published photos while the count states every published one", async () => {
    const { id } = await newPublished();
    await prisma.guestPhoto.createMany({
      data: Array.from({ length: GUEST_PHOTO_PUBLIC_MAX + 5 }, (_unused, index) => {
        const photoId = randomUUID();

        return {
          id: photoId,
          invitationId: id,
          storageKey: `invitations/${id}/${photoId}.webp`,
          status: "PUBLISHED" as const,
          createdAt: new Date(Date.UTC(2026, 11, 1, 10, 0, index)),
          reviewedAt: new Date(Date.UTC(2026, 11, 1, 11, 0, index)),
        };
      }),
    });

    const read = await publicRead.readPublishedPhotos(id);

    assert.equal(read.photos.length, GUEST_PHOTO_PUBLIC_MAX);
    assert.equal(read.count, GUEST_PHOTO_PUBLIC_MAX + 5);
  });

  it("reads every photo of one owned invitation with one count per state, and nothing for another owner (A4)", async () => {
    const { id, ownerId } = await newPublished();
    await seedPhoto(id, { status: "PENDING" });
    await seedPhoto(id, { status: "PUBLISHED" });
    await seedPhoto(id, { status: "HIDDEN" });

    const read = await ownerRead.execute(ownerId, id);
    assert.deepEqual(
      { pending: read?.pendingCount, published: read?.publishedCount, hidden: read?.hiddenCount },
      { pending: 1, published: 1, hidden: 1 },
    );
    assert.equal(read?.photos.length, 3);
    assert.ok(
      read?.photos.every((photo) => photo.url.startsWith("https://api.example.test/media/")),
    );

    assert.equal(await ownerRead.execute(await newOwner(), id), null);
  });

  it("publishes and hides one owned photo, and never reaches another owner's photo (L11.6)", async () => {
    const { id, ownerId } = await newPublished();
    const photo = await seedPhoto(id, { status: "PENDING" });
    const stranger = await newOwner();

    const published = await review.execute({
      ownerId,
      invitationId: id,
      photoId: photo.id,
      status: "PUBLISHED",
    });
    assert.equal(published.status, "ok");
    assert.equal(published.status === "ok" ? published.photo.status : null, "PUBLISHED");
    assert.equal(
      published.status === "ok" ? published.photo.reviewedAt?.toISOString() : null,
      "2026-12-10T12:00:00.000Z",
    );

    const hidden = await review.execute({
      ownerId,
      invitationId: id,
      photoId: photo.id,
      status: "HIDDEN",
    });
    assert.equal(hidden.status === "ok" ? hidden.photo.status : null, "HIDDEN");

    // Showing it again is the same write: hiding is reversible and nothing is deleted.
    const shown = await review.execute({
      ownerId,
      invitationId: id,
      photoId: photo.id,
      status: "PUBLISHED",
    });
    assert.equal(shown.status === "ok" ? shown.photo.status : null, "PUBLISHED");

    assert.deepEqual(
      await review.execute({
        ownerId: stranger,
        invitationId: id,
        photoId: photo.id,
        status: "HIDDEN",
      }),
      { status: "invitation-not-found" },
    );

    const other = await newPublished(undefined, { ownerId });
    assert.deepEqual(
      await review.execute({
        ownerId,
        invitationId: other.id,
        photoId: photo.id,
        status: "HIDDEN",
      }),
      { status: "photo-not-found" },
    );
  });

  it("refuses an unpublished, archived, or expired invitation in the insert itself (L11.3)", async () => {
    const draft = await newPublished(undefined, { publish: false });
    // The expiry is judged by the database's own clock, so the fixture is relative to the run, not to a fixed date.
    const expired = await newPublished(undefined, {
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    const archived = await newPublished();
    await invitations.archive(archived.ownerId, archived.id);

    for (const invitation of [draft, expired, archived]) {
      const photoId = randomUUID();
      assert.equal(
        await album.insert(
          invitation.id,
          {
            id: photoId,
            storageKey: `invitations/${invitation.id}/${photoId}.webp`,
            uploaderName: null,
          },
          new Date(),
        ),
        "closed",
      );
    }

    const unknown = randomUUID();
    assert.equal(
      await album.insert(
        unknown,
        {
          id: randomUUID(),
          storageKey: `invitations/${unknown}/${randomUUID()}.webp`,
          uploaderName: null,
        },
        new Date(),
      ),
      "invitation-not-found",
    );
  });

  it("refuses the photo over the per-invitation cap, pending ones included (L11.3)", async () => {
    const { id } = await newPublished();
    await prisma.guestPhoto.createMany({
      data: Array.from({ length: GUEST_PHOTO_MAX_STORED }, () => {
        const photoId = randomUUID();

        return {
          id: photoId,
          invitationId: id,
          storageKey: `invitations/${id}/${photoId}.webp`,
          status: "PENDING" as const,
        };
      }),
    });

    const photoId = randomUUID();
    assert.equal(GUEST_PHOTO_MAX_STORED, 300);
    assert.equal(
      await album.insert(
        id,
        { id: photoId, storageKey: `invitations/${id}/${photoId}.webp`, uploaderName: null },
        new Date(),
      ),
      "full",
    );
    assert.equal(await prisma.guestPhoto.count({ where: { invitationId: id } }), 300);
  });

  it("serves a photo only while it and its invitation are published, and shows it to its owner in any state (L11.3)", async () => {
    const storage = new MemoryStorage();
    const serve = new ServeMediaUseCase(NO_MEDIA_ROWS, storage, album);
    const { id, ownerId } = await newPublished();
    const published = await seedPhoto(id, { status: "PUBLISHED" });
    const pending = await seedPhoto(id, { status: "PENDING" });
    const hidden = await seedPhoto(id, { status: "HIDDEN" });
    for (const photo of [published, pending, hidden]) {
      await storage.put(photo.storageKey, Buffer.from("webp"));
    }

    const anonymous = { ownerId: async () => null };
    const owner = { ownerId: async () => ownerId };
    const stranger = { ownerId: async () => await newOwner() };

    assert.equal((await serve.execute(published.id, anonymous))?.cache, "public");
    // A pending or hidden photo is never served to a non-owner, whatever the invitation's state.
    assert.equal(await serve.execute(pending.id, anonymous), null);
    assert.equal(await serve.execute(hidden.id, anonymous), null);
    assert.equal(await serve.execute(pending.id, stranger), null);
    // The owner sees the photos waiting for review, uncached.
    assert.equal((await serve.execute(pending.id, owner))?.cache, "private");
    assert.equal((await serve.execute(hidden.id, owner))?.cache, "private");

    // A published photo of an invitation that is no longer published is invisible to a guest, visible to its owner.
    const draft = await newPublished(undefined, { publish: false });
    const draftPhoto = await seedPhoto(draft.id, { status: "PUBLISHED" });
    await storage.put(draftPhoto.storageKey, Buffer.from("webp"));
    assert.equal(await serve.execute(draftPhoto.id, anonymous), null);
    assert.equal(
      (await serve.execute(draftPhoto.id, { ownerId: async () => draft.ownerId }))?.cache,
      "private",
    );
  });

  it("carries the album in the public read only while the package grants GUEST_ALBUM (L11.4)", async () => {
    const granted = await newPublished();
    const without = await newPublished(["GUESTBOOK"]);
    const photo = await seedPhoto(granted.id, { status: "PUBLISHED", uploaderName: "Tía Rosa" });
    const pending = await seedPhoto(granted.id, { status: "PENDING" });
    const getPublic = new GetPublicInvitationUseCase(
      invitations,
      catalog,
      { readGallery: async () => [] },
      undefined,
      { readVisibleEntries: async () => [] },
      publicRead,
    );

    const read = await getPublic.execute(granted.slug);
    assert.deepEqual(read?.features.guestAlbum, {
      photos: [{ url: assetUrl(photo.id), uploaderName: "Tía Rosa" }],
      count: 1,
    });
    assert.equal(JSON.stringify(read?.features.guestAlbum).includes(pending.id), false);

    const denied = await getPublic.execute(without.slug);
    assert.equal(denied?.features.guestAlbum, null);
  });

  it("retires the photos the owner never published or hid, and keeps every object the live rows name (L11.6)", async () => {
    const storage = new MemoryStorage();
    const { id } = await newPublished();
    const now = new Date("2026-12-10T12:00:00.000Z");
    const longAgo = new Date(now.getTime() - GUEST_PHOTO_RETENTION_MS - 60_000);
    const fresh = new Date(now.getTime() - GUEST_PHOTO_RETENTION_MS + 60_000);

    const retiredPending = await seedPhoto(id, { status: "PENDING", createdAt: longAgo });
    const retiredHidden = await seedPhoto(id, {
      status: "HIDDEN",
      createdAt: longAgo,
      reviewedAt: longAgo,
    });
    const keptPending = await seedPhoto(id, { status: "PENDING", createdAt: fresh });
    const keptPublished = await seedPhoto(id, {
      status: "PUBLISHED",
      createdAt: longAgo,
      reviewedAt: longAgo,
    });
    for (const photo of [retiredPending, retiredHidden, keptPending, keptPublished]) {
      storage.seed(photo.storageKey, longAgo);
    }

    const cleanup = new CleanupMediaUseCase(NO_MEDIA_ROWS, storage, () => {}, {
      now: () => now,
      guestAlbum: album,
    });

    const dryRun = await cleanup.execute({ dryRun: true });
    assert.equal(dryRun.retiredGuestPhotos, 2);
    // A dry run deletes nothing: every object and every row is still there.
    assert.equal(storage.objects.size, 4);
    assert.equal(await prisma.guestPhoto.count({ where: { invitationId: id } }), 4);

    const result = await cleanup.execute({ dryRun: false });
    assert.equal(result.retiredGuestPhotos, 2);
    // The two retired photos lost their object and their row; the live ones kept both, and none of their objects was
    // mistaken for an orphan.
    assert.equal(storage.objects.has(retiredPending.storageKey), false);
    assert.equal(storage.objects.has(retiredHidden.storageKey), false);
    assert.equal(storage.objects.has(keptPending.storageKey), true);
    assert.equal(storage.objects.has(keptPublished.storageKey), true);
    assert.equal(result.orphanObjects, 0);
    const remaining = await prisma.guestPhoto.findMany({
      where: { invitationId: id },
      select: { id: true },
    });
    assert.deepEqual(
      remaining.map((row) => row.id).sort(),
      [keptPending.id, keptPublished.id].sort(),
    );

    // The command is idempotent: a second run retires nothing more and deletes nothing.
    const again = await cleanup.execute({ dryRun: false });
    assert.equal(again.retiredGuestPhotos, 0);
    assert.equal(again.orphanObjects, 0);
  });

  it("counts one client address's uploads per hour on the shared RateLimit table (L11.3)", async () => {
    const limiter = new PrismaGuestAlbumRateLimiter(prisma);
    const { id } = await newPublished();
    const address = `198.18.9.${randomUUID().slice(0, 2)}`;
    const allowed: boolean[] = [];

    for (let attempt = 0; attempt < GUEST_ALBUM_RATE_LIMIT.max + 1; attempt += 1) {
      allowed.push(await limiter.consume(id, address));
    }

    assert.equal(GUEST_ALBUM_RATE_LIMIT.window, 3600);
    assert.equal(allowed.filter(Boolean).length, GUEST_ALBUM_RATE_LIMIT.max);
    assert.equal(allowed.at(-1), false);
    // Another invitation keeps its own budget.
    const other = await newPublished();
    assert.equal(await limiter.consume(other.id, address), true);
    // The stored key hashes the address, so the plain value is never written.
    const rows = await prisma.rateLimit.findMany({
      where: { key: { startsWith: `guest-album|${id}|` } },
      select: { key: true },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.key.toLowerCase().includes(address), false);
  });

  it("uploads a guest's photo through the use case, PENDING and invisible until the owner publishes it", async () => {
    const storage = new MemoryStorage();
    const settings = {
      current: async () => ({
        maxUploadMegabytes: 10,
        galleryPhotoLimit: 12,
        storedAssetLimit: 40,
        rsvpPartyLimitMax: 10,
      }),
    };
    const processor = {
      metadata: async () => ({
        format: "jpeg" as const,
        width: 1600,
        height: 1200,
        orientation: null,
      }),
      toWebp: async () => ({ bytes: Buffer.from("webp"), width: 1600, height: 1200 }),
    };
    const upload = new UploadGuestPhotoUseCase(
      album,
      catalog,
      storage,
      processor,
      { consume: async () => true },
      { assetUrl, settings: settings as never, now: () => new Date("2026-12-10T10:00:00.000Z") },
    );
    const { id, slug, ownerId } = await newPublished();

    assert.equal(
      await upload.execute({
        slug,
        uploaderName: "Jorge",
        bytes: JPEG,
        clientAddress: "198.18.9.9",
      }),
      true,
    );
    const stored = await prisma.guestPhoto.findMany({ where: { invitationId: id } });
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.status, "PENDING");
    assert.equal(stored[0]?.uploaderName, "Jorge");
    assert.equal(storage.objects.size, 1);
    // Nothing of it is visible to a guest yet.
    assert.deepEqual(await publicRead.readPublishedPhotos(id), { photos: [], count: 0 });
    // The owner reads it in the pending tab.
    assert.equal((await ownerRead.execute(ownerId, id))?.pendingCount, 1);

    // A slug that names no published invitation is the invisible case, and nothing is written.
    assert.equal(
      await upload.execute({
        slug: "no-existe",
        uploaderName: null,
        bytes: JPEG,
        clientAddress: "198.18.9.9",
      }),
      false,
    );
    assert.equal(storage.objects.size, 1);
  });

  it("names the album feature key in the database the seed and the migration maintain (L16)", async () => {
    const stored = await prisma.feature.findUnique({ where: { key: "GUEST_ALBUM" } });

    assert.notEqual(stored, null);
    const deluxe = await prisma.package.findUnique({
      where: { key: "deluxe" },
      select: { packageFeatures: { select: { feature: { select: { key: true } } } } },
    });
    if (deluxe !== null) {
      assert.ok(
        deluxe.packageFeatures.some((link) => link.feature.key === "GUEST_ALBUM"),
        "Deluxe grants GUEST_ALBUM",
      );
    }
  });
});
