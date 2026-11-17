import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type { PublicGalleryPhoto } from "../../invitations/domain/invitation-features";
import { GALLERY_FEATURE_KEY } from "../../invitations/domain/invitation-features";
import { assertEditable } from "../../invitations/domain/invitation-lifecycle";
import {
  MEDIA_FORMAT_ISSUE,
  MEDIA_MIME,
  normalizeMediaAlt,
  outputDimensions,
  storageKeyFor,
  validateImageDimensions,
  validateMediaUpload,
} from "../domain/media-asset";
import type { ImageProcessor } from "./image-processing";
import { MediaProcessingError } from "./image-processing";
import {
  GalleryNotAvailableError,
  InvalidMediaUpdateError,
  InvalidMediaUploadError,
  MediaNotFoundError,
} from "./media.errors";
import type {
  InsertedMedia,
  MediaAssetRecord,
  MediaRepository,
  NewMediaAsset,
} from "./media.repository";
import type { MediaCatalog } from "./media-catalog";
import type { MediaStorage } from "./media-storage";
import type { AssetUrl } from "./media-url";

// The media use cases (M8 S1, S4). Every creator command follows one order, so a guard cannot be reordered by
// accident: the id format, then `findOwnedInvitation`, so another customer's id answers exactly like an id that
// names nothing (A4); the archived refusal before the request values are read (A2); the package gate for a gallery
// photo (S3); the domain validation; and last the guarded write, which repeats ownership and the editable status
// in its own `WHERE`.
//
// Upload order is process -> put object -> insert row (S4). If the insert fails, the object is deleted best effort
// and the failure is logged by event name only: no owner, id, key, or image data. Deletion marks the row first and
// only then deletes the object, so a failed object delete leaves a `deleted` row that `pnpm media:cleanup` finds.
// Serving decides from the invitation's state: a published invitation is public, the owner sees a draft, and
// everything else is one invisible answer.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value can name a stored row; a bad id would make PostgreSQL refuse the cast, so it answers first. */
function isId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** One structured operational event of the media capability; it carries counts and event names only. */
export type MediaLogEvent = { event: string } & Record<string, unknown>;

/** The sink media events go to. The module binds it to the Nest logger; a test records the events. */
export type MediaLog = (event: MediaLogEvent) => void;

/** What the module injects: the public URL builder, the clock, the id source, and the log sink. */
export interface MediaOptions {
  assetUrl: AssetUrl;
  now?: () => Date;
  newAssetId?: () => string;
  log?: MediaLog;
}

/** One asset as the creator's editor and the gallery read see it: never its storage key or its row ids beyond it. */
export interface MediaAssetView {
  id: string;
  kind: "main-photo" | "gallery";
  url: string;
  width: number;
  height: number;
  alt: string | null;
  position: number | null;
  createdAt: Date;
}

function toView(record: MediaAssetRecord, assetUrl: AssetUrl): MediaAssetView {
  return {
    id: record.id,
    kind: record.kind,
    url: assetUrl(record.id),
    width: record.width,
    height: record.height,
    alt: record.alt,
    position: record.position,
    createdAt: record.createdAt,
  };
}

/** One upload: the owner and invitation from the route, and the untrusted file, kind, and alt from the request. */
export interface UploadMediaInput {
  ownerId: string;
  invitationId: string;
  kind: unknown;
  alt: unknown;
  bytes: Uint8Array;
}

/**
 * Uploads one photo (S4): validates the bytes by magic bytes, size, and dimensions, re-encodes it to WebP with the
 * domain's target dimensions, stores the object, and only then inserts the row. A gallery photo needs the pinned
 * package to grant `GALLERY`; a main photo replaces the previous one, which is marked deleted and whose object is
 * removed. Another owner's invitation answers `MediaNotFoundError`; an archived one `InvitationNotEditableError`.
 */
export class UploadMediaUseCase {
  private readonly now: () => Date;
  private readonly newAssetId: () => string;
  private readonly log: MediaLog;

  constructor(
    private readonly invitations: MediaRepository,
    private readonly catalog: MediaCatalog,
    private readonly storage: MediaStorage,
    private readonly processor: ImageProcessor,
    private readonly options: MediaOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.newAssetId = options.newAssetId ?? (() => randomUUID());
    this.log = options.log ?? (() => {});
  }

  async execute(input: UploadMediaInput): Promise<MediaAssetView> {
    const invitation = isId(input.invitationId)
      ? await this.invitations.findOwnedInvitation(input.ownerId, input.invitationId)
      : null;

    if (invitation === null) {
      throw new MediaNotFoundError();
    }
    // The archived refusal comes before the request values: an archived invitation accepts nothing at all (A2).
    assertEditable(invitation.status);

    const upload = validateMediaUpload({ bytes: input.bytes, kind: input.kind, alt: input.alt });
    if (!upload.ok) {
      throw new InvalidMediaUploadError(upload.issues);
    }

    if (upload.value.kind === "gallery") {
      await this.requireGallery(invitation.packageId);
    }

    const metadata = await this.readMetadata(input.bytes);
    const dimensions = validateImageDimensions(metadata);
    if (dimensions.length > 0) {
      throw new InvalidMediaUploadError(dimensions);
    }

    const target = outputDimensions(metadata.width, metadata.height);
    const processed = await this.process(input.bytes, target);

    const assetId = this.newAssetId();
    const asset: NewMediaAsset = {
      id: assetId,
      kind: upload.value.kind,
      storageKey: storageKeyFor(invitation.id, assetId),
      mime: MEDIA_MIME,
      byteSize: processed.bytes.length,
      width: processed.width,
      height: processed.height,
      // The adapter assigns the gallery position in the same transaction that checks the limits (S4).
      position: null,
      alt: upload.value.alt,
    };

    await this.storage.put(asset.storageKey, processed.bytes, MEDIA_MIME);

    let inserted: InsertedMedia | null;
    try {
      inserted = await this.invitations.insert(input.ownerId, invitation.id, asset, this.now());
    } catch (error) {
      // The row was not written, so the object is an orphan: delete it, best effort, and log the outcome only.
      await this.deleteObject(asset.storageKey, "media_upload_recovery");
      throw error;
    }

    if (inserted === null) {
      await this.deleteObject(asset.storageKey, "media_upload_recovery");
      throw new MediaNotFoundError();
    }

    if (inserted.replaced !== null) {
      // The previous main photo's row is already `deleted`; its object is removed best effort.
      await this.deleteObject(inserted.replaced.storageKey, "media_replace_recovery");
    }

    return toView(inserted.asset, this.options.assetUrl);
  }

  private async requireGallery(packageId: string): Promise<void> {
    const entitlements = await this.catalog.findPackageEntitlements(packageId);
    if (!entitlements?.includedFeatureKeys.includes(GALLERY_FEATURE_KEY)) {
      throw new GalleryNotAvailableError();
    }
  }

  /** A header the processor cannot read is the same refused upload an unsupported file gets. */
  private async readMetadata(bytes: Uint8Array) {
    try {
      return await this.processor.metadata(bytes);
    } catch (error) {
      if (error instanceof MediaProcessingError) {
        throw new InvalidMediaUploadError([MEDIA_FORMAT_ISSUE]);
      }
      throw error;
    }
  }

  private async process(bytes: Uint8Array, target: { width: number; height: number }) {
    try {
      return await this.processor.toWebp(bytes, target);
    } catch (error) {
      if (error instanceof MediaProcessingError) {
        throw new InvalidMediaUploadError([MEDIA_FORMAT_ISSUE]);
      }
      throw error;
    }
  }

  private async deleteObject(storageKey: string, event: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
      this.log({ event, result: "deleted" });
    } catch {
      // A leftover object is the cleanup command's job; the original failure is the one the caller sees.
      this.log({ event, result: "failed" });
    }
  }
}

/** The stored assets of one owned invitation (S4); another owner's id answers `MediaNotFoundError` (A4). */
export class ListOwnMediaUseCase {
  constructor(
    private readonly invitations: MediaRepository,
    private readonly options: Pick<MediaOptions, "assetUrl">,
  ) {}

  async execute(ownerId: string, invitationId: string): Promise<MediaAssetView[]> {
    const records = isId(invitationId)
      ? await this.invitations.listStored(ownerId, invitationId)
      : null;

    if (records === null) {
      throw new MediaNotFoundError();
    }

    return records.map((record) => toView(record, this.options.assetUrl));
  }
}

/** One edit of one asset: its alt text, its gallery position, or both. */
export interface UpdateMediaInput {
  ownerId: string;
  invitationId: string;
  assetId: string;
  alt?: unknown;
  position?: unknown;
}

/**
 * Replaces the alt text and/or moves a gallery photo (S4). The alt text follows the same bound as an upload; a
 * position is a zero-based index among the stored gallery photos and rewrites their order. A missing, foreign, or
 * deleted asset answers `MediaNotFoundError`, and an archived invitation is refused by the adapter.
 */
export class UpdateMediaUseCase {
  constructor(
    private readonly invitations: MediaRepository,
    private readonly options: Pick<MediaOptions, "assetUrl"> & { now?: () => Date },
  ) {}

  async execute(input: UpdateMediaInput): Promise<MediaAssetView> {
    const issues: string[] = [];
    const alt = input.alt === undefined ? undefined : normalizeMediaAlt(input.alt);

    if (alt !== undefined && !alt.ok) {
      issues.push(alt.issue);
    }
    if (
      input.position !== undefined &&
      (!Number.isInteger(input.position) || (input.position as number) < 0)
    ) {
      issues.push("position must be a non-negative integer");
    }
    if (input.alt === undefined && input.position === undefined) {
      issues.push("alt or position must be provided");
    }
    if (issues.length > 0 || (alt !== undefined && !alt.ok)) {
      throw new InvalidMediaUpdateError(issues);
    }
    if (!isId(input.invitationId) || !isId(input.assetId)) {
      throw new MediaNotFoundError();
    }

    const at = this.options.now?.() ?? new Date();
    let record: MediaAssetRecord | null = null;

    if (alt?.ok) {
      record = await this.invitations.updateAlt(
        input.ownerId,
        input.invitationId,
        input.assetId,
        alt.alt,
        at,
      );
      if (record === null) {
        throw new MediaNotFoundError();
      }
    }

    if (input.position !== undefined) {
      const gallery = await this.invitations.moveGallery(
        input.ownerId,
        input.invitationId,
        input.assetId,
        input.position as number,
        at,
      );
      if (gallery === null) {
        throw new MediaNotFoundError();
      }
      record = gallery.find((asset) => asset.id === input.assetId) ?? null;
      if (record === null) {
        throw new MediaNotFoundError();
      }
    }

    return toView(record as MediaAssetRecord, this.options.assetUrl);
  }
}

/**
 * Removes one asset (S4): the row is marked deleted first, and only then is the object deleted. A failed object
 * delete leaves the `deleted` row for `pnpm media:cleanup`, so the caller's answer stays successful and the
 * companion command can finish the job; the failure is logged by event name only.
 */
export class DeleteMediaUseCase {
  private readonly log: MediaLog;
  private readonly now: () => Date;

  constructor(
    private readonly invitations: MediaRepository,
    private readonly storage: MediaStorage,
    options: { now?: () => Date; log?: MediaLog } = {},
  ) {
    this.log = options.log ?? (() => {});
    this.now = options.now ?? (() => new Date());
  }

  async execute(ownerId: string, invitationId: string, assetId: string): Promise<void> {
    if (!isId(invitationId) || !isId(assetId)) {
      throw new MediaNotFoundError();
    }

    const record = await this.invitations.markDeleted(ownerId, invitationId, assetId, this.now());
    if (record === null) {
      throw new MediaNotFoundError();
    }

    try {
      await this.storage.delete(record.storageKey);
    } catch {
      this.log({ event: "media_delete_recovery", result: "failed" });
    }
  }
}

/** What a requester may prove: the session's user id, read lazily and only when serving needs it. */
export interface MediaRequester {
  ownerId(): Promise<string | null>;
}

/** One served image: the stream, its size, and whether it may be cached publicly. */
export interface ServedMedia {
  stream: Readable;
  byteSize: number;
  cache: "public" | "private";
}

/**
 * Serves one image (S4): a published invitation's asset is public and cached for a year as immutable; the owner
 * sees a draft, uncached. Everything else — missing, deleted, unpublished, foreign, or an object that is gone —
 * answers null, which the route turns into one indistinguishable 404. The session is read only when the invitation
 * is not published, so a public image never depends on the auth store.
 */
export class ServeMediaUseCase {
  constructor(
    private readonly invitations: MediaRepository,
    private readonly storage: MediaStorage,
  ) {}

  async execute(assetId: string, requester: MediaRequester): Promise<ServedMedia | null> {
    if (!isId(assetId)) {
      return null;
    }

    const serving = await this.invitations.findForServing(assetId);
    if (serving === null || serving.asset.status !== "stored") {
      return null;
    }

    let cache: "public" | "private";
    if (serving.invitation.status === "PUBLISHED") {
      cache = "public";
    } else {
      const ownerId = await requester.ownerId();
      if (ownerId === null || ownerId !== serving.invitation.ownerId) {
        return null;
      }
      cache = "private";
    }

    const object = await this.storage.get(serving.asset.storageKey);
    if (object === null) {
      return null;
    }

    return { stream: object.stream, byteSize: object.byteSize, cache };
  }
}

/**
 * The gallery of a published invitation (S4), for the public read. Only stored gallery photos are answered, in
 * position order, as absolute URLs built from the API's public origin; the package gate itself is the public read's,
 * which answers an empty list when the package does not grant `GALLERY`.
 */
export class ReadPublicGalleryUseCase {
  constructor(
    private readonly invitations: MediaRepository,
    private readonly options: Pick<MediaOptions, "assetUrl">,
  ) {}

  async readGallery(invitationId: string): Promise<PublicGalleryPhoto[]> {
    const records = await this.invitations.listPublicGallery(invitationId);

    return records.map((record) => ({
      url: this.options.assetUrl(record.id),
      width: record.width,
      height: record.height,
      alt: record.alt,
    }));
  }
}

/** What one cleanup run did, or would do. Counts only: no key, id, or owner is ever reported. */
export interface MediaCleanupResult {
  deletedObjects: number;
  orphanObjects: number;
  deletedRows: number;
  failedObjects: number;
}

/**
 * The cleanup command (S4): deletes the objects of rows marked deleted and the orphan objects under `invitations/`
 * that no row names, then removes the rows whose object is gone. It is idempotent, supports a dry run that reports
 * the same counts without deleting anything, and logs one line of counts only.
 */
export class CleanupMediaUseCase {
  constructor(
    private readonly invitations: MediaRepository,
    private readonly storage: MediaStorage,
    private readonly log: MediaLog = () => {},
  ) {}

  async execute(options: { dryRun: boolean }): Promise<MediaCleanupResult> {
    const deletedRows = await this.invitations.listDeleted();
    const result: MediaCleanupResult = {
      deletedObjects: deletedRows.length,
      orphanObjects: 0,
      deletedRows: deletedRows.length,
      failedObjects: 0,
    };

    if (options.dryRun) {
      const known = new Set(await this.invitations.listStorageKeys());
      const keys = await this.storage.listKeys("invitations/");
      result.orphanObjects = keys.filter((key) => !known.has(key)).length;

      return result;
    }

    const removed: string[] = [];
    for (const row of deletedRows) {
      try {
        await this.storage.delete(row.storageKey);
        removed.push(row.id);
      } catch {
        result.failedObjects += 1;
      }
    }
    await this.invitations.remove(removed);

    const known = new Set(await this.invitations.listStorageKeys());
    const keys = await this.storage.listKeys("invitations/");
    const orphans = keys.filter((key) => !known.has(key));
    result.orphanObjects = orphans.length;

    for (const key of orphans) {
      try {
        await this.storage.delete(key);
      } catch {
        result.failedObjects += 1;
      }
    }

    this.log({ event: "media_cleanup", mode: "apply", ...result });

    return result;
  }
}
