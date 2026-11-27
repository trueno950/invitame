import { randomUUID } from "node:crypto";

import type { InvitationGuestAlbumReader } from "../../invitations/application/invitation-guest-album";
import { isInvitationExpired } from "../../invitations/domain/invitation-expiration";
import {
  GUEST_ALBUM_FEATURE_KEY,
  type PublicGuestAlbum,
} from "../../invitations/domain/invitation-features";
import { isValidInvitationSlug } from "../../invitations/domain/invitation-slug";
import {
  INITIAL_OPERATIONAL_SETTINGS_READER,
  type OperationalSettingsReader,
} from "../../settings/application/operational-settings";
import { megabytesInBytes } from "../../settings/domain/operational-settings";
import {
  type GuestPhotoOwnerView,
  type GuestPhotoRecord,
  type GuestPhotoReviewState,
  validateGuestPhotoUpload,
} from "../domain/guest-photo";
import {
  MEDIA_FORMAT_ISSUE,
  MEDIA_MIME,
  outputDimensions,
  storageKeyFor,
  validateImageDimensions,
} from "../domain/media-asset";
import type { ImageProcessor } from "./image-processing";
import { MediaProcessingError } from "./image-processing";
import type { MediaCatalog } from "./media-catalog";
import type { MediaStorage } from "./media-storage";
import type { AssetUrl } from "./media-url";
import {
  GuestAlbumClosedError,
  GuestAlbumFullError,
  GuestAlbumPendingFullError,
  GuestAlbumRateLimitedError,
  InvalidGuestPhotoError,
} from "./guest-album.errors";
import type { GuestAlbumRateLimiter } from "./guest-album-rate-limiter";
import type { GuestAlbumRepository } from "./guest-album.repository";

// The album use cases (F8; S2.8, L11.3, L11.4, L11.6). One is the guest's: uploading one photo to a published
// invitation's album without a session. Three are the owner's: reading every photo with its state, publishing or hiding
// one, and the source of the public read. Nothing here logs a name, a key, or image data: the one structured event a
// failed upload emits names the outcome only.
//
// The guest's order mirrors the open RSVP and the guestbook, deliberately:
// 1. the slug format, so a malformed value never reaches a query;
// 2. `findPublishedBySlug`, which answers only a live PUBLISHED row, so a draft, an archived, and an unknown slug are
//    one invisible case (the 404 the public page answers);
// 3. the package gate and the expiry, so an invitation whose album is closed is refused before any byte is processed;
// 4. the hourly per-address limit on the shared `RateLimit` store, which bounds every remaining step;
// 5. the domain validation — the same JPEG, PNG, and WebP allow-list and the same configured size the owner's own
//    uploads use — and the dimension bounds, both before the image is decoded;
// 6. the re-encoding through the existing image pipeline, which is also what strips the metadata (EXIF, GPS, XMP, and
//    the ICC profile) before anything is stored;
// 7. the object write, and only then the row, whose statement repeats the publication, the expiry, and the cap against
//    the database's own clock. A refused upload deletes the object it wrote and stores nothing.
//
// Every photo is stored PENDING: a guest never sees another guest's upload until the owner publishes it (L11.3).

/** One upload: the public slug, the untrusted name the guest typed, the bytes, and the address the limit counts. */
export interface UploadGuestPhotoInput {
  readonly slug: string;
  readonly uploaderName: unknown;
  readonly bytes: Uint8Array;
  readonly clientAddress: string;
}

/** What the module injects into the album use cases: the URL builder, the clock, the id source, and the log sink. */
export interface GuestAlbumOptions {
  assetUrl: AssetUrl;
  now?: () => Date;
  newPhotoId?: () => string;
  log?: (event: { event: string } & Record<string, unknown>) => void;
  /** The operational settings: the upload size, read on every upload so a save takes effect on the next one. */
  settings?: OperationalSettingsReader;
}

/** One structured operational event of the album; it carries event names and outcomes only. */
type GuestAlbumLog = (event: { event: string } & Record<string, unknown>) => void;

/** One photo of the owner's screen: its row, its object's URL, its state, and its dates. */
export interface GuestPhotoView extends GuestPhotoOwnerView {
  readonly url: string;
}

/** The owner's read of one invitation's album: every photo, and one count per state. */
export interface GuestAlbumRead {
  readonly photos: readonly GuestPhotoView[];
  readonly pendingCount: number;
  readonly publishedCount: number;
  readonly hiddenCount: number;
}

/** The values of one moderation write; the owner comes from the session, never from the request payload (S9). */
export interface ReviewGuestPhotoInput {
  readonly ownerId: string;
  readonly invitationId: string;
  readonly photoId: string;
  readonly status: GuestPhotoReviewState;
}

/**
 * The outcome of one moderation write: the stored photo, an invitation that is missing or another customer's (A4), or a
 * photo id that names nothing of this invitation.
 */
export type ReviewGuestPhotoResult =
  | { readonly status: "ok"; readonly photo: GuestPhotoView }
  | { readonly status: "invitation-not-found" }
  | { readonly status: "photo-not-found" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value can name a stored row; a bad id would make PostgreSQL refuse the cast, so it answers first. */
function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function toView(record: GuestPhotoRecord, assetUrl: AssetUrl): GuestPhotoView {
  return {
    id: record.id,
    url: assetUrl(record.id),
    uploaderName: record.uploaderName,
    status: record.status,
    createdAt: record.createdAt,
    reviewedAt: record.reviewedAt,
  };
}

/**
 * One guest's photo (F8; L11.3). The slug is the only input that names the invitation, so the route needs no session.
 * The upload is counted against `GUEST_ALBUM_RATE_LIMIT` per invitation and client address. Answers false only for the
 * invisible cases the public page answers with its 404; true means the photo was stored PENDING.
 *
 * Throws `GuestAlbumClosedError` when the invitation is visible but its album takes no photo, `GuestAlbumRateLimitedError`
 * when this address is over the cap, `GuestAlbumFullError` when the invitation's album already holds its cap of pending
 * and published photos, `GuestAlbumPendingFullError` when the pending queue is over its own cap (L26), and
 * `InvalidGuestPhotoError` with the domain's issues when the file is refused. A refused upload stores nothing.
 */
export class UploadGuestPhotoUseCase {
  private readonly now: () => Date;
  private readonly newPhotoId: () => string;
  private readonly log: GuestAlbumLog;
  private readonly settings: OperationalSettingsReader;

  constructor(
    private readonly invitations: GuestAlbumRepository,
    private readonly catalog: MediaCatalog,
    private readonly storage: MediaStorage,
    private readonly processor: ImageProcessor,
    private readonly rateLimiter: GuestAlbumRateLimiter,
    options: GuestAlbumOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.newPhotoId = options.newPhotoId ?? (() => randomUUID());
    this.log = options.log ?? (() => {});
    this.settings = options.settings ?? INITIAL_OPERATIONAL_SETTINGS_READER;
  }

  async execute(input: UploadGuestPhotoInput): Promise<boolean> {
    if (!isValidInvitationSlug(input.slug)) {
      return false;
    }
    const published = await this.invitations.findPublishedBySlug(input.slug);
    if (published === null) {
      return false;
    }

    // Fail closed: a package the catalog cannot answer for grants nothing, so its album takes no photo (S4).
    const entitlements = await this.catalog.findPackageEntitlements(published.packageId);
    if (!(entitlements?.includedFeatureKeys ?? []).includes(GUEST_ALBUM_FEATURE_KEY)) {
      throw new GuestAlbumClosedError();
    }

    // An expired invitation stays visible read-only, so its album is closed rather than missing (S2). The check comes
    // before the rate limit, so a refused upload never spends the guest's budget.
    if (isInvitationExpired(published.expiresAt, this.now())) {
      throw new GuestAlbumClosedError();
    }

    if (!(await this.rateLimiter.consume(published.id, input.clientAddress))) {
      throw new GuestAlbumRateLimitedError();
    }

    // The size comes from the settings row, read at the moment it is checked, so a save applies to the next upload.
    const settings = await this.settings.current();
    const upload = validateGuestPhotoUpload({
      bytes: input.bytes,
      uploaderName: input.uploaderName,
      maxBytes: megabytesInBytes(settings.maxUploadMegabytes),
    });
    if (!upload.ok) {
      throw new InvalidGuestPhotoError(upload.issues);
    }

    const metadata = await this.readMetadata(input.bytes);
    const dimensions = validateImageDimensions(metadata);
    if (dimensions.length > 0) {
      throw new InvalidGuestPhotoError(dimensions);
    }

    const target = outputDimensions(metadata.width, metadata.height);
    const processed = await this.process(input.bytes, target);

    const photoId = this.newPhotoId();
    const storageKey = storageKeyFor(published.id, photoId);
    await this.storage.put(storageKey, processed.bytes, MEDIA_MIME);

    const inserted = await this.invitations.insert(
      published.id,
      { id: photoId, storageKey, uploaderName: upload.value.uploaderName },
      this.now(),
    );

    if (inserted === "stored") {
      return true;
    }

    // The row was not written, so the object is an orphan: delete it, best effort, and answer from the insert's outcome.
    await this.deleteObject(storageKey, "guest_photo_upload_recovery");
    if (inserted === "full") {
      throw new GuestAlbumFullError();
    }
    if (inserted === "pending-full") {
      throw new GuestAlbumPendingFullError();
    }
    if (inserted === "closed") {
      throw new GuestAlbumClosedError();
    }
    return false;
  }

  /** A header the processor cannot read is the same refused upload an unsupported file gets. */
  private async readMetadata(bytes: Uint8Array) {
    try {
      return await this.processor.metadata(bytes);
    } catch (error) {
      if (error instanceof MediaProcessingError) {
        throw new InvalidGuestPhotoError([MEDIA_FORMAT_ISSUE]);
      }
      throw error;
    }
  }

  private async process(bytes: Uint8Array, target: { width: number; height: number }) {
    try {
      return await this.processor.toWebp(bytes, target);
    } catch (error) {
      if (error instanceof MediaProcessingError) {
        throw new InvalidGuestPhotoError([MEDIA_FORMAT_ISSUE]);
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

/**
 * Every photo of one owned invitation, pending and hidden together, with the three counts the moderation screen's tabs
 * show (L11.6). Only the owner reads it: another customer's id, an unknown id, and a malformed id answer null, so a
 * foreign invitation is indistinguishable from a missing one (A4). An archived invitation stays readable.
 */
export class GetGuestAlbumUseCase {
  constructor(
    private readonly invitations: GuestAlbumRepository,
    private readonly options: Pick<GuestAlbumOptions, "assetUrl">,
  ) {}

  async execute(ownerId: string, invitationId: string): Promise<GuestAlbumRead | null> {
    if (!isUuid(invitationId)) {
      return null;
    }
    const invitation = await this.invitations.findOwnedInvitation(ownerId, invitationId);
    if (invitation === null) {
      return null;
    }
    const records = await this.invitations.findOwnedPhotos(ownerId, invitationId);
    if (records === null) {
      return null;
    }
    const photos = records.map((record) => toView(record, this.options.assetUrl));

    return {
      photos,
      pendingCount: photos.filter((photo) => photo.status === "PENDING").length,
      publishedCount: photos.filter((photo) => photo.status === "PUBLISHED").length,
      hiddenCount: photos.filter((photo) => photo.status === "HIDDEN").length,
    };
  }
}

/**
 * Publishes one photo, or hides it again (F8; L11.6): the owner's only moderation. Nothing is deleted in the request —
 * the guest never deletes, and the owner does not either, so the same write can always be reversed, and a photo the
 * owner never published is removed by the media retention cleanup instead. Owner-only: another customer's invitation
 * answers `invitation-not-found`, and a photo that belongs to another invitation answers `photo-not-found`, which is
 * the same 404 a missing one answers (A4).
 *
 * Throws `GuestAlbumFullError` when showing a hidden photo again would pass the album's cap (L26), writing nothing;
 * publishing a PENDING photo leaves the counted total where it was, so it stays allowed at the cap.
 */
export class ReviewGuestPhotoUseCase {
  private readonly now: () => Date;
  private readonly options: Pick<GuestAlbumOptions, "assetUrl">;

  constructor(
    private readonly invitations: GuestAlbumRepository,
    options: Pick<GuestAlbumOptions, "assetUrl" | "now">,
  ) {
    this.now = options.now ?? (() => new Date());
    this.options = options;
  }

  async execute(input: ReviewGuestPhotoInput): Promise<ReviewGuestPhotoResult> {
    if (!isUuid(input.invitationId)) {
      return { status: "invitation-not-found" };
    }
    const invitation = await this.invitations.findOwnedInvitation(
      input.ownerId,
      input.invitationId,
    );
    if (invitation === null) {
      return { status: "invitation-not-found" };
    }
    if (!isUuid(input.photoId)) {
      return { status: "photo-not-found" };
    }

    const reviewed = await this.invitations.review(
      input.ownerId,
      input.invitationId,
      input.photoId,
      input.status,
      this.now(),
    );

    if (reviewed.status === "full") {
      // The guest's own refusal: the owner's route maps it to 409 `GUEST_ALBUM_FULL` (L26).
      throw new GuestAlbumFullError();
    }

    return reviewed.status === "not-found"
      ? { status: "photo-not-found" }
      : { status: "ok", photo: toView(reviewed.photo, this.options.assetUrl) };
  }
}

/**
 * The album of a published invitation as a guest reads it (L11.4): the newest published photos, at most 60, and how many
 * the invitation holds in total. The package gate itself is the public read's, which answers an empty album when the
 * package does not grant `GUEST_ALBUM`; this adapter never answers a pending or hidden photo.
 */
export class ReadPublicGuestAlbumUseCase implements InvitationGuestAlbumReader {
  constructor(
    private readonly invitations: GuestAlbumRepository,
    private readonly options: Pick<GuestAlbumOptions, "assetUrl">,
  ) {}

  async readPublishedPhotos(invitationId: string): Promise<PublicGuestAlbum> {
    const read = await this.invitations.readPublished(invitationId);

    return {
      photos: read.photos.map((photo) => ({
        url: this.options.assetUrl(photo.id),
        uploaderName: photo.uploaderName,
      })),
      count: read.count,
    };
  }
}
