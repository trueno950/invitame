import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { InvitationNotEditableError } from "../../invitations/domain/invitation.errors";
import { MEDIA_MIME, MEDIA_ORPHAN_GRACE_MS, storageKeyFor } from "../domain/media-asset";
import {
  type ImageMetadata,
  type ImageProcessor,
  MediaProcessingError,
  type ProcessedImage,
} from "./image-processing";
import {
  GalleryNotAvailableError,
  InvalidMediaUpdateError,
  InvalidMediaUploadError,
  MediaLimitExceededError,
  MediaNotFoundError,
} from "./media.errors";
import type {
  InsertedMedia,
  MediaAssetRecord,
  MediaRepository,
  NewMediaAsset,
  OwnedMediaInvitation,
  ServingMedia,
} from "./media.repository";
import {
  CleanupMediaUseCase,
  DeleteMediaUseCase,
  ListOwnMediaUseCase,
  type MediaLog,
  ReadPublicGalleryUseCase,
  ServeMediaUseCase,
  UpdateMediaUseCase,
  UploadMediaUseCase,
} from "./media.use-cases";
import type { MediaCatalog } from "./media-catalog";
import type { MediaObject, MediaStorage, MediaStorageObject } from "./media-storage";
import { MediaStorageError } from "./media-storage";

// The media use cases (M8 S4): owner-scoped uploads, the main-photo replacement, the limits, the delete order,
// the upload recovery order, and the serving rules. Every adapter is a fake, so the order of the side effects is
// observable: process -> put -> insert, and mark deleted -> delete object.

const OWNER = "11111111-1111-4111-8111-111111111111";
const INVITATION = "22222222-2222-4222-8222-222222222222";
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

class FakeRepository implements MediaRepository {
  invitation: OwnedMediaInvitation | null = {
    id: INVITATION,
    status: "DRAFT",
    packageId: "33333333-3333-4333-8333-333333333333",
  };
  inserted: NewMediaAsset[] = [];
  deleted: string[] = [];
  replaced: MediaAssetRecord | null = null;
  rows: MediaAssetRecord[] = [];
  failInsert: Error | null = null;
  insertLimit: Error | null = null;
  serving: ServingMedia | null = null;
  private readonly calls: string[];

  constructor(calls: string[]) {
    this.calls = calls;
  }

  async findOwnedInvitation(): Promise<OwnedMediaInvitation | null> {
    this.calls.push("findOwnedInvitation");
    return this.invitation;
  }

  async listStored(): Promise<MediaAssetRecord[] | null> {
    this.calls.push("listStored");
    return this.invitation === null ? null : this.rows;
  }

  async insert(_owner: string, _invitation: string, asset: NewMediaAsset): Promise<InsertedMedia> {
    this.calls.push("insert");
    if (this.failInsert) {
      throw this.failInsert;
    }
    if (this.insertLimit) {
      throw this.insertLimit;
    }
    this.inserted.push(asset);
    // Like the real adapter, the fake assigns the gallery position inside the transaction that checks the limits.
    const position =
      asset.kind === "gallery"
        ? this.rows.filter((row) => row.kind === "gallery" && row.status === "stored").length
        : null;
    const stored: MediaAssetRecord = {
      ...asset,
      position,
      invitationId: INVITATION,
      status: "stored",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    this.rows.push(stored);
    return { asset: stored, replaced: this.replaced };
  }

  async updateAlt(): Promise<MediaAssetRecord | null> {
    this.calls.push("updateAlt");
    return this.rows[0] ?? null;
  }

  async moveGallery(): Promise<MediaAssetRecord[] | null> {
    this.calls.push("moveGallery");
    return this.rows;
  }

  async markDeleted(): Promise<MediaAssetRecord | null> {
    this.calls.push("markDeleted");
    const row = this.rows[0];
    if (!row) {
      return null;
    }
    this.deleted.push(row.storageKey);
    return row;
  }

  async findForServing(): Promise<ServingMedia | null> {
    this.calls.push("findForServing");
    return this.serving;
  }

  async listPublicGallery(): Promise<MediaAssetRecord[]> {
    return this.rows;
  }

  async listDeleted(): Promise<MediaAssetRecord[]> {
    return [];
  }

  async listStorageKeys(): Promise<string[]> {
    return [];
  }

  async remove(_ids: readonly string[]): Promise<void> {}
}

class FakeStorage implements MediaStorage {
  objects = new Map<string, Buffer>();
  /** When each object was last written, which is what the cleanup scan dates it by. */
  modified = new Map<string, Date>();
  /** The clock `put` stamps an object with. */
  writtenAt = new Date("2026-01-01T00:00:00.000Z");
  failDelete: MediaStorageError | null = null;

  constructor(private readonly calls: string[]) {}

  /** Seeds one object with an explicit write time; a null time is the undated object a provider might answer. */
  seed(key: string, lastModified: Date | null): void {
    this.objects.set(key, Buffer.from("x"));
    if (lastModified === null) {
      this.modified.delete(key);
    } else {
      this.modified.set(key, lastModified);
    }
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.calls.push(`put:${key}`);
    this.objects.set(key, Buffer.from(bytes));
    this.modified.set(key, this.writtenAt);
  }

  async get(key: string): Promise<MediaObject | null> {
    this.calls.push(`get:${key}`);
    const bytes = this.objects.get(key);
    return bytes
      ? { stream: Readable.from(bytes), byteSize: bytes.length, contentType: MEDIA_MIME }
      : null;
  }

  async delete(key: string): Promise<void> {
    this.calls.push(`delete:${key}`);
    this.objects.delete(key);
    if (this.failDelete) {
      throw this.failDelete;
    }
  }

  async listObjects(prefix: string): Promise<MediaStorageObject[]> {
    return [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .map((key) => ({ key, lastModified: this.modified.get(key) ?? null }));
  }
}

class FakeProcessor implements ImageProcessor {
  metadata_: ImageMetadata = { format: "jpeg", width: 4000, height: 3000, orientation: null };
  failure: Error | null = null;

  constructor(private readonly calls: string[]) {}

  async metadata(): Promise<ImageMetadata> {
    this.calls.push("metadata");
    if (this.failure) {
      throw this.failure;
    }
    return this.metadata_;
  }

  async toWebp(
    _bytes: Uint8Array,
    target: { width: number; height: number },
  ): Promise<ProcessedImage> {
    this.calls.push("toWebp");
    if (this.failure) {
      throw this.failure;
    }
    return { bytes: Buffer.from("re-encoded"), width: target.width, height: target.height };
  }
}

class FakeCatalog implements MediaCatalog {
  includedFeatureKeys: string[] = ["GALLERY"];

  async findPackageEntitlements(): Promise<{ includedFeatureKeys: string[] }> {
    return { includedFeatureKeys: this.includedFeatureKeys };
  }
}

function setup(options: { withGalleryFeature?: boolean } = {}) {
  const calls: string[] = [];
  const repository = new FakeRepository(calls);
  const storage = new FakeStorage(calls);
  const processor = new FakeProcessor(calls);
  const catalog = new FakeCatalog();
  catalog.includedFeatureKeys = options.withGalleryFeature === false ? [] : ["GALLERY"];
  const events: string[] = [];
  const log: MediaLog = (event) => events.push(event.event);
  const assetUrl = (assetId: string): string => `https://api.example.test/media/${assetId}`;
  const assetIds = ["44444444-4444-4444-8444-444444444444"];
  const upload = new UploadMediaUseCase(repository, catalog, storage, processor, {
    assetUrl,
    log,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    newAssetId: () => assetIds[0] as string,
  });

  return {
    calls,
    events,
    repository,
    storage,
    processor,
    catalog,
    upload,
    assetUrl,
    list: new ListOwnMediaUseCase(repository, { assetUrl }),
    update: new UpdateMediaUseCase(repository, { assetUrl }),
    deleteMedia: new DeleteMediaUseCase(repository, storage, { log }),
  };
}

describe("upload media", () => {
  it("processes, stores the object, and only then inserts the row", async () => {
    const { calls, upload, repository } = setup();

    const view = await upload.execute({
      ownerId: OWNER,
      invitationId: INVITATION,
      kind: "gallery",
      alt: "  Entrada  ",
      bytes: JPEG,
    });

    assert.deepEqual(calls, [
      "findOwnedInvitation",
      "metadata",
      "toWebp",
      `put:${storageKeyFor(INVITATION, "44444444-4444-4444-8444-444444444444")}`,
      "insert",
    ]);
    assert.equal(view.kind, "gallery");
    assert.equal(view.alt, "Entrada");
    assert.equal(view.width, 2000);
    assert.equal(view.height, 1500);
    assert.equal(view.url, `https://api.example.test/media/${view.id}`);
    const inserted = repository.inserted[0];
    assert.ok(inserted);
    assert.equal(inserted.mime, MEDIA_MIME);
    assert.equal(inserted.storageKey, storageKeyFor(INVITATION, view.id));
    assert.equal(inserted.position, null, "the adapter assigns the gallery position");
  });

  it("answers 404 for another owner's invitation and writes nothing", async () => {
    const { calls, storage } = setup();
    // The adapter scopes by owner; another owner's id is answered exactly like an id that names nothing.
    const foreign = new FakeRepository(calls);
    foreign.invitation = null;
    const useCase = new UploadMediaUseCase(
      foreign,
      new FakeCatalog(),
      storage,
      new FakeProcessor(calls),
      {
        assetUrl: () => "https://api.example.test/media/x",
        newAssetId: () => randomUUID(),
      },
    );

    await assert.rejects(
      useCase.execute({
        ownerId: OWNER,
        invitationId: INVITATION,
        kind: "gallery",
        alt: null,
        bytes: JPEG,
      }),
      MediaNotFoundError,
    );
    assert.equal(storage.objects.size, 0);
  });

  it("refuses an archived invitation with its own signal, before any processing", async () => {
    const { calls, upload, repository, storage } = setup();
    repository.invitation = {
      id: INVITATION,
      status: "ARCHIVED",
      packageId: "33333333-3333-4333-8333-333333333333",
    };

    await assert.rejects(
      upload.execute({
        ownerId: OWNER,
        invitationId: INVITATION,
        kind: "gallery",
        alt: null,
        bytes: JPEG,
      }),
      InvitationNotEditableError,
    );
    assert.deepEqual(calls, ["findOwnedInvitation"]);
    assert.equal(storage.objects.size, 0);
  });

  it("refuses spoofed bytes before processing anything", async () => {
    const { calls, upload } = setup();

    await assert.rejects(
      upload.execute({
        ownerId: OWNER,
        invitationId: INVITATION,
        kind: "gallery",
        alt: null,
        bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
      }),
      (error: unknown) =>
        error instanceof InvalidMediaUploadError &&
        error.issues[0] === "file must be a JPEG, PNG, or WebP image",
    );
    assert.deepEqual(calls, ["findOwnedInvitation"]);
  });

  it("refuses an image over 8000 px per side from its metadata, before it is decoded", async () => {
    const { calls, upload, processor, storage } = setup();
    processor.metadata_ = { format: "png", width: 8001, height: 100, orientation: null };

    await assert.rejects(
      upload.execute({
        ownerId: OWNER,
        invitationId: INVITATION,
        kind: "gallery",
        alt: null,
        bytes: JPEG,
      }),
      (error: unknown) =>
        error instanceof InvalidMediaUploadError &&
        error.issues[0] === "image dimensions must not exceed 8000 px per side",
    );
    assert.equal(calls.includes("toWebp"), false);
    assert.equal(storage.objects.size, 0);
  });

  it("refuses a gallery upload when the pinned package does not grant GALLERY", async () => {
    const { upload, storage } = setup({ withGalleryFeature: false });

    await assert.rejects(
      upload.execute({
        ownerId: OWNER,
        invitationId: INVITATION,
        kind: "gallery",
        alt: null,
        bytes: JPEG,
      }),
      GalleryNotAvailableError,
    );
    assert.equal(storage.objects.size, 0);
  });

  it("lets a main photo through without the GALLERY feature and replaces the previous one", async () => {
    const { upload, repository, calls } = setup({ withGalleryFeature: false });
    const previousKey = storageKeyFor(INVITATION, "55555555-5555-4555-8555-555555555555");
    repository.replaced = {
      id: "55555555-5555-4555-8555-555555555555",
      invitationId: INVITATION,
      kind: "main-photo",
      storageKey: previousKey,
      mime: MEDIA_MIME,
      byteSize: 10,
      width: 10,
      height: 10,
      position: null,
      alt: null,
      status: "deleted",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };

    const view = await upload.execute({
      ownerId: OWNER,
      invitationId: INVITATION,
      kind: "main-photo",
      alt: null,
      bytes: JPEG,
    });

    assert.equal(view.position, null);
    assert.ok(calls.includes(`delete:${previousKey}`), "the replaced object is deleted");
    assert.equal(repository.inserted[0]?.kind, "main-photo");
  });

  it("passes the gallery limit and the per-invitation asset limit through", async () => {
    for (const limit of ["gallery", "assets"] as const) {
      const { upload, repository, storage } = setup();
      repository.insertLimit = new MediaLimitExceededError(limit);

      await assert.rejects(
        upload.execute({
          ownerId: OWNER,
          invitationId: INVITATION,
          kind: "gallery",
          alt: null,
          bytes: JPEG,
        }),
        (error: unknown) => error instanceof MediaLimitExceededError && error.limit === limit,
      );
      assert.equal(storage.objects.size, 0, "the uploaded object is removed after a failed insert");
    }
  });

  it("deletes the object, best effort and logged, when the insert fails", async () => {
    const { upload, repository, storage, events, calls } = setup();
    repository.failInsert = new Error("database unavailable");

    await assert.rejects(
      upload.execute({
        ownerId: OWNER,
        invitationId: INVITATION,
        kind: "gallery",
        alt: null,
        bytes: JPEG,
      }),
      /database unavailable/,
    );
    assert.ok(calls.at(-1)?.startsWith("delete:invitations/"), "the orphan object was deleted");
    assert.equal(storage.objects.size, 0);
    assert.deepEqual(events, ["media_upload_recovery"]);
  });

  it("recovers an upload in one documented order: put, insert, object delete, one event", async () => {
    const { upload, repository, calls, events } = setup();
    repository.failInsert = new Error("database unavailable");
    const key = storageKeyFor(INVITATION, "44444444-4444-4444-8444-444444444444");

    await assert.rejects(
      upload.execute({
        ownerId: OWNER,
        invitationId: INVITATION,
        kind: "gallery",
        alt: null,
        bytes: JPEG,
      }),
    );

    assert.deepEqual(calls, [
      "findOwnedInvitation",
      "metadata",
      "toWebp",
      `put:${key}`,
      "insert",
      `delete:${key}`,
    ]);
    assert.deepEqual(events, ["media_upload_recovery"]);
  });

  it("logs one replacement recovery event, after the insert, when the old object cannot be deleted", async () => {
    const { upload, repository, storage, calls, events } = setup({ withGalleryFeature: false });
    const previousKey = storageKeyFor(INVITATION, "55555555-5555-4555-8555-555555555555");
    repository.replaced = {
      id: "55555555-5555-4555-8555-555555555555",
      invitationId: INVITATION,
      kind: "main-photo",
      storageKey: previousKey,
      mime: MEDIA_MIME,
      byteSize: 10,
      width: 10,
      height: 10,
      position: null,
      alt: null,
      status: "deleted",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    storage.failDelete = new MediaStorageError("delete");

    const view = await upload.execute({
      ownerId: OWNER,
      invitationId: INVITATION,
      kind: "main-photo",
      alt: null,
      bytes: JPEG,
    });

    assert.equal(view.kind, "main-photo");
    assert.deepEqual(calls.slice(-2), ["insert", `delete:${previousKey}`]);
    assert.deepEqual(events, ["media_replace_recovery"]);
  });

  it("refuses a 9000x9000 header with the dimensions issue, before anything is encoded", async () => {
    const { upload, processor, storage, calls } = setup();
    processor.metadata_ = { format: "png", width: 9000, height: 9000, orientation: null };

    await assert.rejects(
      upload.execute({
        ownerId: OWNER,
        invitationId: INVITATION,
        kind: "gallery",
        alt: null,
        bytes: JPEG,
      }),
      (error: unknown) =>
        error instanceof InvalidMediaUploadError &&
        error.issues.length === 1 &&
        error.issues[0] === "image dimensions must not exceed 8000 px per side",
    );
    assert.equal(calls.includes("toWebp"), false, "nothing is decoded");
    assert.equal(storage.objects.size, 0);
  });

  it("still answers when the recovery delete fails, and logs the failure", async () => {
    const { upload, repository, storage, events } = setup();
    repository.failInsert = new Error("database unavailable");
    storage.failDelete = new MediaStorageError("delete");

    await assert.rejects(
      upload.execute({
        ownerId: OWNER,
        invitationId: INVITATION,
        kind: "gallery",
        alt: null,
        bytes: JPEG,
      }),
      /database unavailable/,
    );
    assert.deepEqual(events, ["media_upload_recovery"]);
  });

  it("turns a corrupt image into the same 400 an unsupported file gets", async () => {
    const { upload, processor } = setup();
    processor.failure = new MediaProcessingError("metadata");

    await assert.rejects(
      upload.execute({
        ownerId: OWNER,
        invitationId: INVITATION,
        kind: "gallery",
        alt: null,
        bytes: JPEG,
      }),
      InvalidMediaUploadError,
    );
  });
});

describe("list, update, and delete media", () => {
  it("lists the stored assets of an owned invitation and answers 404 for a foreign one", async () => {
    const { list, repository } = setup();
    repository.rows = [];
    assert.deepEqual(await list.execute(OWNER, INVITATION), []);

    repository.invitation = null;
    await assert.rejects(list.execute(OWNER, INVITATION), MediaNotFoundError);
  });

  it("validates an update before touching a row", async () => {
    const { update, calls } = setup();

    await assert.rejects(
      update.execute({
        ownerId: OWNER,
        invitationId: INVITATION,
        assetId: "44444444-4444-4444-8444-444444444444",
        alt: "x".repeat(121),
        position: undefined,
      }),
      InvalidMediaUpdateError,
    );
    assert.equal(calls.includes("updateAlt"), false);
  });

  it("marks the row deleted before deleting the object", async () => {
    const { deleteMedia, repository, storage, calls } = setup();
    const key = storageKeyFor(INVITATION, "44444444-4444-4444-8444-444444444444");
    repository.rows = [
      {
        id: "44444444-4444-4444-8444-444444444444",
        invitationId: INVITATION,
        kind: "gallery",
        storageKey: key,
        mime: MEDIA_MIME,
        byteSize: 10,
        width: 10,
        height: 10,
        position: 0,
        alt: null,
        status: "stored",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ];
    storage.objects.set(key, Buffer.from("x"));

    await deleteMedia.execute(OWNER, INVITATION, "44444444-4444-4444-8444-444444444444");

    assert.deepEqual(
      calls.filter((call) => call.startsWith("markDeleted") || call.startsWith("delete:")),
      ["markDeleted", `delete:${key}`],
    );
    assert.equal(storage.objects.size, 0);
  });

  it("answers success when the object delete fails, leaving the row for cleanup", async () => {
    const { deleteMedia, repository, storage, events } = setup();
    const key = storageKeyFor(INVITATION, "44444444-4444-4444-8444-444444444444");
    repository.rows = [
      {
        id: "44444444-4444-4444-8444-444444444444",
        invitationId: INVITATION,
        kind: "gallery",
        storageKey: key,
        mime: MEDIA_MIME,
        byteSize: 10,
        width: 10,
        height: 10,
        position: 0,
        alt: null,
        status: "stored",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ];
    storage.failDelete = new MediaStorageError("delete");

    await deleteMedia.execute(OWNER, INVITATION, "44444444-4444-4444-8444-444444444444");
    assert.deepEqual(events, ["media_delete_recovery"]);
  });

  it("answers 404 when the row is missing, foreign, or already deleted", async () => {
    const { deleteMedia, repository } = setup();
    repository.rows = [];

    await assert.rejects(
      deleteMedia.execute(OWNER, INVITATION, "44444444-4444-4444-8444-444444444444"),
      MediaNotFoundError,
    );
  });
});

describe("serving media", () => {
  const key = storageKeyFor(INVITATION, "44444444-4444-4444-8444-444444444444");
  const asset: MediaAssetRecord = {
    id: "44444444-4444-4444-8444-444444444444",
    invitationId: INVITATION,
    kind: "gallery",
    storageKey: key,
    mime: MEDIA_MIME,
    byteSize: 5,
    width: 10,
    height: 10,
    position: 0,
    alt: null,
    status: "stored",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  function serving(overrides: Partial<ServingMedia> = {}): ServingMedia {
    return {
      asset,
      invitation: { ownerId: OWNER, status: "DRAFT" },
      ...overrides,
    } as ServingMedia;
  }

  it("serves a published invitation's image with a long public cache", async () => {
    const { repository, storage, calls } = setup();
    repository.serving = serving({ invitation: { ownerId: OWNER, status: "PUBLISHED" } } as never);
    storage.objects.set(key, Buffer.from("image"));
    const serve = new ServeMediaUseCase(repository, storage);
    let requested = false;

    const served = await serve.execute(asset.id, {
      ownerId: async () => {
        requested = true;
        return null;
      },
    });

    assert.equal(served?.cache, "public");
    assert.equal(served?.byteSize, 5);
    assert.equal(requested, false, "a published asset needs no session read");
    assert.ok(calls.includes(`get:${key}`));
  });

  it("serves the owner's draft image privately and refuses everyone else", async () => {
    const { repository, storage } = setup();
    repository.serving = serving();
    storage.objects.set(key, Buffer.from("image"));
    const serve = new ServeMediaUseCase(repository, storage);

    const own = await serve.execute(asset.id, { ownerId: async () => OWNER });
    assert.equal(own?.cache, "private");

    const foreign = await serve.execute(asset.id, {
      ownerId: async () => "99999999-9999-4999-8999-999999999999",
    });
    assert.equal(foreign, null);
    const anonymous = await serve.execute(asset.id, { ownerId: async () => null });
    assert.equal(anonymous, null);
  });

  it("answers null for a missing, deleted, or unpublished foreign asset, and for a missing object", async () => {
    const { repository, storage } = setup();
    const serve = new ServeMediaUseCase(repository, storage);

    repository.serving = null;
    assert.equal(await serve.execute(asset.id, { ownerId: async () => OWNER }), null);
    assert.equal(await serve.execute("not-a-uuid", { ownerId: async () => OWNER }), null);

    repository.serving = serving({ asset: { ...asset, status: "deleted" } } as never);
    assert.equal(await serve.execute(asset.id, { ownerId: async () => OWNER }), null);

    // The row exists but the object is gone: the same invisible answer, never an error that confirms the row.
    repository.serving = serving();
    assert.equal(await serve.execute(asset.id, { ownerId: async () => OWNER }), null);
  });
});

describe("cleanup command", () => {
  class CleanupRepository extends FakeRepository {
    declare rows: MediaAssetRecord[];
    allKeys: string[] = [];
    removed: string[] = [];

    override async listDeleted(): Promise<MediaAssetRecord[]> {
      return this.rows;
    }

    override async listStorageKeys(): Promise<string[]> {
      return this.allKeys;
    }

    override async remove(ids: readonly string[]): Promise<void> {
      this.removed.push(...ids);
    }
  }

  const deletedRow: MediaAssetRecord = {
    id: "44444444-4444-4444-8444-444444444444",
    invitationId: INVITATION,
    kind: "gallery",
    storageKey: storageKeyFor(INVITATION, "44444444-4444-4444-8444-444444444444"),
    mime: MEDIA_MIME,
    byteSize: 5,
    width: 10,
    height: 10,
    position: 0,
    alt: null,
    status: "deleted",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  /** The cleanup's own clock, so the grace period is decided by the test and not by the machine. */
  const NOW = new Date("2026-01-01T12:00:00.000Z");
  const ANCIENT = new Date(NOW.getTime() - 2 * MEDIA_ORPHAN_GRACE_MS);
  const JUST_WRITTEN = new Date(NOW.getTime() - 1000);

  function cleanupOf(storage: MediaStorage, repository: MediaRepository) {
    return new CleanupMediaUseCase(repository, storage, () => {}, { now: () => NOW });
  }

  it("deletes the objects of deleted rows and the orphan objects, and reports counts only", async () => {
    const calls: string[] = [];
    const storage = new FakeStorage(calls);
    const repository = new CleanupRepository(calls);
    repository.rows = [deletedRow];
    const known = storageKeyFor(INVITATION, "66666666-6666-4666-8666-666666666666");
    const orphan = storageKeyFor(INVITATION, "77777777-7777-4777-8777-777777777777");
    repository.allKeys = [known];
    storage.seed(deletedRow.storageKey, ANCIENT);
    storage.seed(orphan, ANCIENT);
    const events: Array<Record<string, unknown>> = [];
    const cleanup = new CleanupMediaUseCase(repository, storage, (event) => events.push(event), {
      now: () => NOW,
    });

    const result = await cleanup.execute({ dryRun: false });

    assert.deepEqual(result, {
      deletedObjects: 1,
      orphanObjects: 1,
      skippedRecentObjects: 0,
      deletedRows: 1,
      failedObjects: 0,
    });
    assert.deepEqual(
      calls.filter((call) => call.startsWith("delete:")),
      [`delete:${deletedRow.storageKey}`, `delete:${orphan}`],
    );
    assert.deepEqual(repository.removed, [deletedRow.id]);
    assert.deepEqual(events, [
      {
        event: "media_cleanup",
        mode: "apply",
        deletedObjects: 1,
        orphanObjects: 1,
        skippedRecentObjects: 0,
        deletedRows: 1,
        failedObjects: 0,
      },
    ]);
  });

  it("deletes nothing in a dry run and is idempotent", async () => {
    const calls: string[] = [];
    const storage = new FakeStorage(calls);
    const repository = new CleanupRepository(calls);
    repository.rows = [deletedRow];
    const orphan = storageKeyFor(INVITATION, "77777777-7777-4777-8777-777777777777");
    storage.seed(orphan, ANCIENT);
    const cleanup = cleanupOf(storage, repository);

    assert.deepEqual(await cleanup.execute({ dryRun: true }), {
      deletedObjects: 1,
      orphanObjects: 1,
      skippedRecentObjects: 0,
      deletedRows: 1,
      failedObjects: 0,
    });
    assert.deepEqual(
      calls.filter((call) => call.startsWith("delete:")),
      [],
    );
    assert.deepEqual(repository.removed, []);

    await cleanup.execute({ dryRun: false });
    repository.rows = [];
    repository.allKeys = [orphan];
    assert.deepEqual(await cleanup.execute({ dryRun: false }), {
      deletedObjects: 0,
      orphanObjects: 0,
      skippedRecentObjects: 0,
      deletedRows: 0,
      failedObjects: 0,
    });
  });

  it("leaves an in-flight upload's object alone while it is inside the grace period", async () => {
    // The upload writes the object before it inserts the row, so a scan that runs inside that window must not
    // treat the young object as an orphan: doing so would leave a `stored` row whose object is gone (A3).
    const calls: string[] = [];
    const storage = new FakeStorage(calls);
    const repository = new CleanupRepository(calls);
    const inFlight = storageKeyFor(INVITATION, "88888888-8888-4888-8888-888888888888");
    storage.seed(inFlight, JUST_WRITTEN);
    const cleanup = cleanupOf(storage, repository);

    const dryRun = await cleanup.execute({ dryRun: true });
    assert.deepEqual(dryRun, {
      deletedObjects: 0,
      orphanObjects: 0,
      skippedRecentObjects: 1,
      deletedRows: 0,
      failedObjects: 0,
    });

    const applied = await cleanup.execute({ dryRun: false });
    assert.deepEqual(applied, {
      deletedObjects: 0,
      orphanObjects: 0,
      skippedRecentObjects: 1,
      deletedRows: 0,
      failedObjects: 0,
    });
    assert.equal(storage.objects.has(inFlight), true, "the in-flight object survives the scan");
    assert.deepEqual(
      calls.filter((call) => call.startsWith("delete:")),
      [],
    );
  });

  it("deletes an orphan once it is older than the grace period", async () => {
    const calls: string[] = [];
    const storage = new FakeStorage(calls);
    const repository = new CleanupRepository(calls);
    const old = storageKeyFor(INVITATION, "99999999-9999-4999-8999-999999999999");
    const young = storageKeyFor(INVITATION, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    storage.seed(old, ANCIENT);
    storage.seed(young, JUST_WRITTEN);
    const cleanup = cleanupOf(storage, repository);

    const result = await cleanup.execute({ dryRun: false });

    assert.equal(result.orphanObjects, 1);
    assert.equal(result.skippedRecentObjects, 1);
    assert.equal(storage.objects.has(old), false, "an old orphan is deleted");
    assert.equal(storage.objects.has(young), true, "a young orphan is kept");
  });

  it("treats an orphan a scan cannot date as recent, so nothing undated is deleted", async () => {
    const calls: string[] = [];
    const storage = new FakeStorage(calls);
    const repository = new CleanupRepository(calls);
    const undated = storageKeyFor(INVITATION, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    storage.seed(undated, null);

    const result = await cleanupOf(storage, repository).execute({ dryRun: false });

    assert.equal(result.orphanObjects, 0);
    assert.equal(result.skippedRecentObjects, 1);
    assert.equal(storage.objects.has(undated), true);
  });

  it("never deletes the object a stored row names, however old it is", async () => {
    const calls: string[] = [];
    const storage = new FakeStorage(calls);
    const repository = new CleanupRepository(calls);
    const stored: MediaAssetRecord = {
      ...deletedRow,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      storageKey: storageKeyFor(INVITATION, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
      status: "stored",
    };
    repository.allKeys = [stored.storageKey];
    storage.seed(stored.storageKey, ANCIENT);

    const result = await cleanupOf(storage, repository).execute({ dryRun: false });

    assert.deepEqual(result, {
      deletedObjects: 0,
      orphanObjects: 0,
      skippedRecentObjects: 0,
      deletedRows: 0,
      failedObjects: 0,
    });
    assert.equal(
      storage.objects.has(stored.storageKey),
      true,
      "a stored row's object is never deleted",
    );
  });
});

describe("public gallery", () => {
  it("answers the ordered stored gallery photos as absolute URLs", async () => {
    const { repository } = setup();
    repository.rows = [
      {
        id: "44444444-4444-4444-8444-444444444444",
        invitationId: INVITATION,
        kind: "gallery",
        storageKey: storageKeyFor(INVITATION, "44444444-4444-4444-8444-444444444444"),
        mime: MEDIA_MIME,
        byteSize: 5,
        width: 100,
        height: 200,
        position: 1,
        alt: "Segunda",
        status: "stored",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ];
    const reader = new ReadPublicGalleryUseCase(repository, {
      assetUrl: (id) => `https://api.example.test/media/${id}`,
    });

    assert.deepEqual(await reader.readGallery(INVITATION), [
      {
        url: "https://api.example.test/media/44444444-4444-4444-8444-444444444444",
        width: 100,
        height: 200,
        alt: "Segunda",
      },
    ]);
  });
});
