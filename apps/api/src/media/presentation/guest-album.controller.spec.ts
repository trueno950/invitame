import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import { HttpException, NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import sharp from "sharp";

import type { RuntimeEnvironment } from "../../config/environment";
import { GUEST_ALBUM_FEATURE_KEY } from "../../invitations/domain/invitation-features";
import type {
  GuestAlbumInvitation,
  GuestAlbumRepository,
  InsertGuestPhotoResult,
  NewGuestPhoto,
  RetiredGuestPhoto,
  ServingGuestPhoto,
} from "../application/guest-album.repository";
import type { GuestAlbumRateLimiter } from "../application/guest-album-rate-limiter";
import type { MediaCatalog } from "../application/media-catalog";
import {
  MediaStorageError,
  type MediaStorage,
  type MediaStorageObject,
} from "../application/media-storage";
import type { ImageProcessor } from "../application/image-processing";
import {
  GetGuestAlbumUseCase,
  ReviewGuestPhotoUseCase,
  UploadGuestPhotoUseCase,
} from "../application/guest-album.use-cases";
import type { OperationalSettingsReader } from "../../settings/application/operational-settings";
import {
  GUEST_PHOTO_MAX_PENDING,
  GUEST_PHOTO_MAX_STORED,
  type GuestPhotoRecord,
  type GuestPhotoReviewState,
} from "../domain/guest-photo";

/** A stored row a test may change, as the in-memory table does. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
import { SharpImageProcessor } from "../infrastructure/sharp-image-processor";
import { InvitationsGuestAlbumController } from "./invitations-guest-album.controller";
import { PublicGuestAlbumController } from "./public-guest-album.controller";

// The album's REST boundary (F8; S2.8, L11.3, L11.4, L11.6). The controllers run against the real use cases with
// in-memory ports, so each case observes exactly what Nest would answer, what the storage received, and what the table
// kept: a refused upload writes neither an object nor a row. No database and no provider is involved.

const OWNER = "11111111-1111-4111-8111-111111111111";
const INVITATION = "22222222-2222-4222-8222-222222222222";
const SLUG = "cumple-de-ana";
const PHOTO = "44444444-4444-4444-8444-444444444444";
const CLIENT = "198.18.0.7";
const BOUNDARY = "----invitameAlbumBoundary";

/** A tiny valid JPEG; the processor fake never decodes it. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const GIF = Buffer.from("GIF89a");

function multipart(
  parts: Array<{ name: string; value?: string; filename?: string; bytes?: Buffer }>,
): { body: Buffer; contentType: string } {
  const chunks: Buffer[] = [];

  for (const part of parts) {
    const filename = part.filename === undefined ? "" : `; filename="${part.filename}"`;
    chunks.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"${filename}\r\n\r\n`,
      ),
    );
    chunks.push(part.bytes ?? Buffer.from(part.value ?? ""));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${BOUNDARY}`,
  };
}

function request(body: Buffer, contentType: string, client = CLIENT): IncomingMessage {
  const stream = Readable.from(body) as unknown as IncomingMessage;
  Object.assign(stream, {
    headers: { "content-type": contentType, "x-forwarded-for": client },
    socket: { remoteAddress: client },
  });
  return stream;
}

/** An upload form with the one file and, optionally, the name the guest typed. */
function uploadForm(
  bytes: Buffer = JPEG,
  uploaderName?: string,
  filename = "foto.jpg",
): { body: Buffer; contentType: string } {
  const parts: Array<{ name: string; value?: string; filename?: string; bytes?: Buffer }> = [
    { name: "file", bytes, filename },
  ];
  if (uploaderName !== undefined) {
    parts.push({ name: "uploaderName", value: uploaderName });
  }

  return multipart(parts);
}

/** The in-memory storage: every `put`, `delete`, and every object it holds, keyed by the API's own storage keys. */
class RecordingStorage implements MediaStorage {
  readonly objects = new Map<string, Uint8Array>();
  readonly puts: string[] = [];
  readonly deletes: string[] = [];
  failPut = false;

  async put(key: string, bytes: Uint8Array): Promise<void> {
    if (this.failPut) {
      throw new MediaStorageError("put");
    }
    this.puts.push(key);
    this.objects.set(key, bytes);
  }

  async get(
    key: string,
  ): Promise<{ stream: Readable; byteSize: number; contentType: string } | null> {
    const bytes = this.objects.get(key);

    return bytes === undefined
      ? null
      : {
          stream: Readable.from(Buffer.from(bytes)),
          byteSize: bytes.length,
          contentType: "image/webp",
        };
  }

  async delete(key: string): Promise<void> {
    this.deletes.push(key);
    this.objects.delete(key);
  }

  async listObjects(): Promise<MediaStorageObject[]> {
    return [];
  }
}

/** An in-memory album table: the invitation it knows, the photos it stored, and the call log of each operation. */
class FakeAlbumRepository implements GuestAlbumRepository {
  readonly photos: Array<Mutable<GuestPhotoRecord>> = [];
  readonly inserted: NewGuestPhoto[] = [];
  published: GuestAlbumInvitation | null = {
    id: INVITATION,
    status: "PUBLISHED",
    packageId: "package-deluxe",
    expiresAt: null,
  };
  owned: GuestAlbumInvitation | null = {
    id: INVITATION,
    status: "PUBLISHED",
    packageId: "package-deluxe",
    expiresAt: null,
  };
  insertResult: InsertGuestPhotoResult = "stored";

  async findPublishedBySlug(): Promise<GuestAlbumInvitation | null> {
    return this.published;
  }

  async findOwnedInvitation(): Promise<GuestAlbumInvitation | null> {
    return this.owned;
  }

  async insert(invitationId: string, photo: NewGuestPhoto): Promise<InsertGuestPhotoResult> {
    if (this.insertResult !== "stored") {
      return this.insertResult;
    }
    this.inserted.push(photo);
    this.photos.unshift({
      id: photo.id,
      invitationId,
      storageKey: photo.storageKey,
      status: "PENDING",
      uploaderName: photo.uploaderName,
      createdAt: new Date("2026-12-10T10:00:00.000Z"),
      reviewedAt: null,
    });

    return "stored";
  }

  async readPublished(): Promise<{ photos: GuestPhotoRecord[]; count: number }> {
    const published = this.photos.filter((photo) => photo.status === "PUBLISHED");

    return { photos: published.slice(0, 60), count: published.length };
  }

  async findOwnedPhotos(): Promise<GuestPhotoRecord[]> {
    return [...this.photos];
  }

  async review(
    _ownerId: string,
    invitationId: string,
    photoId: string,
    status: GuestPhotoReviewState,
    at: Date,
  ): Promise<GuestPhotoRecord | null> {
    const photo = this.photos.find(
      (row) => row.id === photoId && row.invitationId === invitationId,
    );
    if (photo === undefined) {
      return null;
    }
    photo.status = status;
    photo.reviewedAt = at;

    return photo;
  }

  async findForServing(): Promise<ServingGuestPhoto | null> {
    return null;
  }

  async listStorageKeys(): Promise<string[]> {
    return this.photos.map((photo) => photo.storageKey);
  }

  async listRetired(): Promise<RetiredGuestPhoto[]> {
    return [];
  }

  async retire(): Promise<RetiredGuestPhoto[]> {
    return [];
  }
}

const PROCESSED = Buffer.from("webp-bytes");

/** The processing fake: the existing pipeline's contract, without decoding anything. */
function fakeProcessor(): ImageProcessor & { calls: number } {
  const processor = {
    calls: 0,
    async metadata() {
      return { format: "jpeg" as const, width: 1600, height: 1200, orientation: null };
    },
    async toWebp() {
      processor.calls += 1;
      return { bytes: PROCESSED, width: 1600, height: 1200 };
    },
  };

  return processor;
}

function fakeCatalog(keys: readonly string[]): MediaCatalog {
  return {
    findPackageEntitlements: async () => ({ includedFeatureKeys: keys }),
  } as unknown as MediaCatalog;
}

function fakeSettings(maxUploadMegabytes = 10): OperationalSettingsReader {
  return {
    current: async () => ({
      maxUploadMegabytes,
      galleryPhotoLimit: 12,
      storedAssetLimit: 40,
      rsvpPartyLimitMax: 10,
    }),
  } as unknown as OperationalSettingsReader;
}

function publicController(
  options: {
    album?: FakeAlbumRepository;
    storage?: RecordingStorage;
    processor?: ImageProcessor;
    limiter?: GuestAlbumRateLimiter;
    catalog?: MediaCatalog;
    settings?: OperationalSettingsReader;
  } = {},
): {
  controller: PublicGuestAlbumController;
  album: FakeAlbumRepository;
  storage: RecordingStorage;
} {
  const album = options.album ?? new FakeAlbumRepository();
  const storage = options.storage ?? new RecordingStorage();
  const upload = new UploadGuestPhotoUseCase(
    album,
    options.catalog ?? fakeCatalog([GUEST_ALBUM_FEATURE_KEY]),
    storage,
    options.processor ?? fakeProcessor(),
    options.limiter ?? { consume: async () => true },
    {
      assetUrl: (id: string) => `https://api.example.test/media/${id}`,
      now: () => new Date("2026-12-10T10:00:00.000Z"),
      newPhotoId: () => PHOTO,
      settings: options.settings ?? fakeSettings(),
    },
  );
  const config = {
    get: () => ({ header: "x-forwarded-for" }),
  } as unknown as ConfigService<RuntimeEnvironment, true>;

  return { controller: new PublicGuestAlbumController(upload, config), album, storage };
}

function ownerController(album: FakeAlbumRepository): {
  controller: InvitationsGuestAlbumController;
} {
  const assetUrl = (id: string) => `https://api.example.test/media/${id}`;
  const now = () => new Date("2026-12-10T12:00:00.000Z");

  return {
    controller: new InvitationsGuestAlbumController(
      new GetGuestAlbumUseCase(album, { assetUrl }),
      new ReviewGuestPhotoUseCase(album, { assetUrl, now }),
    ),
  };
}

/** The HTTP shape of a thrown Nest exception, so a case can assert its status and its stable code. */
async function refusal(answer: Promise<unknown>): Promise<{ status: number; body: unknown }> {
  try {
    await answer;
  } catch (error) {
    if (error instanceof HttpException) {
      return { status: error.getStatus(), body: error.getResponse() };
    }
    throw error;
  }
  throw new Error("the call was expected to be refused");
}

async function accepted(answer: Promise<unknown>): Promise<unknown> {
  return answer;
}

describe("the public album upload (F8; L11.3)", () => {
  it("stores one photo PENDING and answers one minimal body", async () => {
    const { controller, album, storage } = publicController();
    const form = uploadForm(JPEG, "  Tía Rosa  ");

    const answer = await accepted(
      controller.uploadPhoto(SLUG, request(form.body, form.contentType)),
    );

    assert.deepEqual(answer, { status: "received" });
    // Every photo is PENDING, so no guest sees it until the owner publishes it (L11.3).
    assert.equal(album.inserted.length, 1);
    assert.equal(album.photos[0]?.status, "PENDING");
    assert.equal(album.photos[0]?.uploaderName, "Tía Rosa");
    // The bytes went through the existing pipeline: what the storage received is the re-encoded output, never the
    // guest's own file.
    assert.equal(storage.puts.length, 1);
    assert.deepEqual(Buffer.from(storage.objects.get(storage.puts[0] ?? "") ?? []), PROCESSED);
    assert.equal(album.photos[0]?.storageKey, storage.puts[0]);
  });

  it("keeps the guest anonymous when the name field is missing or blank", async () => {
    const { controller, album } = publicController();
    const form = uploadForm(JPEG, "   ");

    await accepted(controller.uploadPhoto(SLUG, request(form.body, form.contentType)));

    assert.equal(album.photos[0]?.uploaderName, null);
  });

  it("answers the one guest-facing 404 for an unknown, draft, archived, or expired slug", async () => {
    const { controller, album, storage } = publicController();
    album.published = null;
    const form = uploadForm();

    const denied = await refusal(
      controller.uploadPhoto(SLUG, request(form.body, form.contentType)),
    );

    assert.equal(denied.status, 404);
    assert.deepEqual(denied.body, { code: "PUBLIC_INVITATION_NOT_FOUND" });
    assert.equal(storage.puts.length, 0);
    assert.equal(album.inserted.length, 0);
  });

  it("refuses a package that does not grant GUEST_ALBUM and an expired invitation with 409, storing nothing", async () => {
    const denied = await refusal(
      publicController({ catalog: fakeCatalog(["GUESTBOOK"]) }).controller.uploadPhoto(
        SLUG,
        request(uploadForm().body, uploadForm().contentType),
      ),
    );
    assert.equal(denied.status, 409);
    assert.deepEqual(denied.body, { code: "GUEST_ALBUM_CLOSED" });

    const expired = new FakeAlbumRepository();
    expired.published = {
      id: INVITATION,
      status: "PUBLISHED",
      packageId: "package-deluxe",
      expiresAt: new Date("2026-12-09T10:00:00.000Z"),
    };
    const { controller, storage, album } = publicController({ album: expired });
    const form = uploadForm();
    const expiredDenial = await refusal(
      controller.uploadPhoto(SLUG, request(form.body, form.contentType)),
    );

    assert.equal(expiredDenial.status, 409);
    assert.deepEqual(expiredDenial.body, { code: "GUEST_ALBUM_CLOSED" });
    assert.equal(storage.puts.length, 0);
    assert.equal(album.inserted.length, 0);
  });

  it("refuses an address over its hourly cap with 429, before any byte is processed", async () => {
    const processor = fakeProcessor();
    const { controller, storage } = publicController({
      processor,
      limiter: { consume: async () => false },
    });
    const form = uploadForm();

    const denied = await refusal(
      controller.uploadPhoto(SLUG, request(form.body, form.contentType)),
    );

    assert.equal(denied.status, 429);
    assert.deepEqual(denied.body, { code: "GUEST_ALBUM_RATE_LIMITED" });
    assert.equal(processor.calls, 0);
    assert.equal(storage.puts.length, 0);
  });

  it("refuses the 301st photo of one invitation with a documented code, storing nothing", async () => {
    const album = new FakeAlbumRepository();
    album.insertResult = "full";
    const { controller, storage } = publicController({ album });
    const form = uploadForm();

    const denied = await refusal(
      controller.uploadPhoto(SLUG, request(form.body, form.contentType)),
    );

    assert.equal(GUEST_PHOTO_MAX_STORED, 300);
    assert.equal(denied.status, 409);
    assert.deepEqual(denied.body, { code: "GUEST_ALBUM_FULL" });
    // The object the upload had already written is removed again, so a refused upload leaves nothing in storage.
    assert.equal(storage.puts.length, 1);
    assert.equal(storage.deletes.length, 1);
    assert.equal(storage.objects.size, 0);
    assert.equal(album.inserted.length, 0);
  });

  it("refuses a pending queue over its own cap with a code of its own, storing nothing (L26)", async () => {
    const album = new FakeAlbumRepository();
    album.insertResult = "pending-full";
    const { controller, storage } = publicController({ album });
    const form = uploadForm();

    const denied = await refusal(
      controller.uploadPhoto(SLUG, request(form.body, form.contentType)),
    );

    assert.equal(GUEST_PHOTO_MAX_PENDING, 100);
    assert.equal(denied.status, 409);
    assert.deepEqual(denied.body, { code: "GUEST_ALBUM_PENDING_FULL" });
    // It is not the full album's code: the guest reads why the photo was refused.
    assert.notDeepEqual(denied.body, { code: "GUEST_ALBUM_FULL" });
    assert.equal(storage.puts.length, 1);
    assert.equal(storage.deletes.length, 1);
    assert.equal(storage.objects.size, 0);
    assert.equal(album.inserted.length, 0);
  });

  it("refuses a file that is not a JPEG, PNG, or WebP with 400 and its issues, storing nothing", async () => {
    const processor = fakeProcessor();
    const { controller, storage } = publicController({ processor });
    const form = uploadForm(GIF);

    const denied = await refusal(
      controller.uploadPhoto(SLUG, request(form.body, form.contentType)),
    );

    assert.equal(denied.status, 400);
    assert.deepEqual(denied.body, {
      code: "INVALID_GUEST_PHOTO",
      issues: ["file must be a JPEG, PNG, or WebP image"],
    });
    assert.equal(processor.calls, 0);
    assert.equal(storage.puts.length, 0);
  });

  it("refuses an uploader name over 60 characters or carrying a control character", async () => {
    const { controller } = publicController();
    const wide = uploadForm(JPEG, "á".repeat(61));

    const denied = await refusal(
      controller.uploadPhoto(SLUG, request(wide.body, wide.contentType)),
    );

    assert.equal(denied.status, 400);
    assert.deepEqual(denied.body, {
      code: "INVALID_GUEST_PHOTO",
      issues: ["uploaderName must be between 1 and 60 characters"],
    });
  });

  it("refuses a name carrying a format character, which would hide part of it (L26)", async () => {
    const { controller, storage } = publicController();

    for (const uploaderName of ["Rosa\u202ELópez", "Ro\u200Bsa"] as const) {
      const form = uploadForm(JPEG, uploaderName);
      const denied = await refusal(
        controller.uploadPhoto(SLUG, request(form.body, form.contentType)),
      );

      assert.equal(denied.status, 400, uploaderName);
      assert.deepEqual(denied.body, {
        code: "INVALID_GUEST_PHOTO",
        issues: ["uploaderName must not contain control characters"],
      });
    }
    assert.equal(storage.puts.length, 0);
  });

  it("refuses a field the album route does not accept, so no other route's field reaches it", async () => {
    const { controller } = publicController();
    const form = multipart([
      { name: "file", bytes: JPEG, filename: "foto.jpg" },
      { name: "kind", value: "gallery" },
    ]);

    const denied = await refusal(
      controller.uploadPhoto(SLUG, request(form.body, form.contentType)),
    );

    assert.equal(denied.status, 400);
  });

  it("answers 413 for a body over the route's bound and 415 for a body that is not multipart", async () => {
    const { controller } = publicController();
    const huge = multipart([
      {
        name: "file",
        bytes: Buffer.concat([JPEG, Buffer.alloc(17 * 1024 * 1024)]),
        filename: "f.jpg",
      },
    ]);
    const over = await refusal(controller.uploadPhoto(SLUG, request(huge.body, huge.contentType)));
    assert.equal(over.status, 413);

    const wrong = await refusal(controller.uploadPhoto(SLUG, request(JPEG, "image/jpeg")));
    assert.equal(wrong.status, 415);
  });

  it("answers 503 when the storage refuses the object, and stores no row", async () => {
    const storage = new RecordingStorage();
    storage.failPut = true;
    const { controller, album } = publicController({ storage });
    const form = uploadForm();

    const denied = await refusal(
      controller.uploadPhoto(SLUG, request(form.body, form.contentType)),
    );

    assert.equal(denied.status, 503);
    assert.deepEqual(denied.body, {
      code: "MEDIA_STORAGE_UNAVAILABLE",
      message: "Media storage is unavailable.",
    });
    assert.equal(album.inserted.length, 0);
  });

  it("re-encodes through the real pipeline, so the stored image carries no EXIF GPS (L11 security)", async () => {
    // A JPEG with the EXIF GPS block a phone writes, built here so no personal photo is ever committed.
    const source = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "#a33" },
    })
      .jpeg()
      .withMetadata({
        exif: {
          IFD0: { Copyright: "invitame-album-fixture" },
          GPS: {
            GPSLatitudeRef: "N",
            GPSLatitude: "19/1 25/1 9400/100",
            GPSLongitudeRef: "W",
            GPSLongitude: "99/1 7/1 1200/100",
          },
        } as never,
      })
      .toBuffer();
    assert.ok((await sharp(source).metadata()).exif, "the fixture carries EXIF");

    const storage = new RecordingStorage();
    const { controller } = publicController({
      storage,
      processor: new SharpImageProcessor(),
    });
    const form = uploadForm(source, "Jorge");

    await accepted(controller.uploadPhoto(SLUG, request(form.body, form.contentType)));

    const stored = Buffer.from(storage.objects.get(storage.puts[0] ?? "") ?? []);
    const metadata = await sharp(stored).metadata();

    assert.equal(metadata.format, "webp");
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.orientation, undefined);
    assert.equal(stored.includes(Buffer.from("Exif")), false);
    assert.equal(stored.includes(Buffer.from("GPS")), false);
    assert.equal(stored.includes(Buffer.from("invitame-album-fixture")), false);
  });
});

describe("the owner's album screen (F8; L11.6)", () => {
  function storedAlbum(): FakeAlbumRepository {
    const album = new FakeAlbumRepository();
    album.photos.push(
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        invitationId: INVITATION,
        storageKey: `invitations/${INVITATION}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.webp`,
        status: "PENDING",
        uploaderName: "Tía Rosa",
        createdAt: new Date("2026-12-10T10:00:00.000Z"),
        reviewedAt: null,
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        invitationId: INVITATION,
        storageKey: `invitations/${INVITATION}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.webp`,
        status: "PUBLISHED",
        uploaderName: null,
        createdAt: new Date("2026-12-09T10:00:00.000Z"),
        reviewedAt: new Date("2026-12-09T11:00:00.000Z"),
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
        invitationId: INVITATION,
        storageKey: `invitations/${INVITATION}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3.webp`,
        status: "HIDDEN",
        uploaderName: "Jorge",
        createdAt: new Date("2026-12-08T10:00:00.000Z"),
        reviewedAt: new Date("2026-12-08T11:00:00.000Z"),
      },
    );

    return album;
  }

  it("answers every photo with one count per state, pending and hidden together", async () => {
    const { controller } = ownerController(storedAlbum());

    const read = await accepted(controller.read(OWNER, INVITATION));

    assert.deepEqual(read, {
      photos: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          url: "https://api.example.test/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          uploaderName: "Tía Rosa",
          status: "PENDING",
          createdAt: "2026-12-10T10:00:00.000Z",
          reviewedAt: null,
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          url: "https://api.example.test/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          uploaderName: null,
          status: "PUBLISHED",
          createdAt: "2026-12-09T10:00:00.000Z",
          reviewedAt: "2026-12-09T11:00:00.000Z",
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
          url: "https://api.example.test/media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
          uploaderName: "Jorge",
          status: "HIDDEN",
          createdAt: "2026-12-08T10:00:00.000Z",
          reviewedAt: "2026-12-08T11:00:00.000Z",
        },
      ],
      pendingCount: 1,
      publishedCount: 1,
      hiddenCount: 1,
    });
  });

  it("answers 404 for another owner and for an id that is not even a uuid", async () => {
    const album = storedAlbum();
    album.owned = null;
    const { controller } = ownerController(album);

    for (const id of [INVITATION, randomUUID(), "no-es-un-uuid"]) {
      const denied = await refusal(controller.read(OWNER, id));
      assert.equal(denied.status, 404);
      assert.deepEqual(denied.body, { code: "INVITATION_NOT_FOUND" });
    }
  });

  it("publishes a pending photo and hides a published one, stamping the review instant", async () => {
    const album = storedAlbum();
    const { controller } = ownerController(album);

    const published = await accepted(
      controller.review(OWNER, INVITATION, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", {
        status: "PUBLISHED",
      }),
    );
    assert.equal((published as { status: string }).status, "PUBLISHED");
    assert.equal((published as { reviewedAt: string }).reviewedAt, "2026-12-10T12:00:00.000Z");

    const hidden = await accepted(
      controller.review(OWNER, INVITATION, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", {
        status: "HIDDEN",
      }),
    );
    assert.equal((hidden as { status: string }).status, "HIDDEN");

    // Showing it again is the same write: hiding is always reversible and nothing is deleted.
    const shown = await accepted(
      controller.review(OWNER, INVITATION, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", {
        status: "PUBLISHED",
      }),
    );
    assert.equal((shown as { status: string }).status, "PUBLISHED");
  });

  it("refuses a state the owner may not set, and never lets a request publish nothing", async () => {
    const { controller } = ownerController(storedAlbum());

    for (const status of ["PENDING", "published", ""]) {
      const denied = await refusal(
        controller.review(OWNER, INVITATION, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", { status }),
      );
      assert.equal(denied.status, 400);
      assert.deepEqual(denied.body, {
        code: "INVALID_GUEST_PHOTO_REVIEW",
        issues: ["status must be PUBLISHED or HIDDEN"],
      });
    }
  });

  it("answers 404 for a photo of another invitation, and for a foreign invitation before the photo", async () => {
    const { controller } = ownerController(storedAlbum());

    const missing = await refusal(
      controller.review(OWNER, INVITATION, randomUUID(), { status: "PUBLISHED" }),
    );
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.body, { code: "GUEST_PHOTO_NOT_FOUND" });

    const malformed = await refusal(
      controller.review(OWNER, INVITATION, "no-es-un-uuid", { status: "PUBLISHED" }),
    );
    assert.deepEqual(malformed, { status: 404, body: { code: "GUEST_PHOTO_NOT_FOUND" } });

    const album = storedAlbum();
    album.owned = null;
    const foreign = ownerController(album);
    const denied = await refusal(
      foreign.controller.review(OWNER, INVITATION, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", {
        status: "PUBLISHED",
      }),
    );
    assert.equal(denied.status, 404);
    assert.deepEqual(denied.body, { code: "INVITATION_NOT_FOUND" });
  });

  it("answers an empty album with zero counts instead of an empty body", async () => {
    const { controller } = ownerController(new FakeAlbumRepository());

    assert.deepEqual(await accepted(controller.read(OWNER, INVITATION)), {
      photos: [],
      pendingCount: 0,
      publishedCount: 0,
      hiddenCount: 0,
    });
  });
});

describe("the album's 404 body of a missing photo", () => {
  it("is the Nest not-found exception the screen maps", () => {
    assert.throws(
      () => {
        throw new NotFoundException({ code: "GUEST_PHOTO_NOT_FOUND" });
      },
      (error: unknown) => error instanceof NotFoundException,
    );
  });
});
