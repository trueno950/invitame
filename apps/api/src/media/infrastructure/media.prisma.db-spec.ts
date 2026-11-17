import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { InvitationNotEditableError } from "../../invitations/domain/invitation.errors";
import { PrismaInvitationRepository } from "../../invitations/infrastructure/prisma-invitation.repository";
import { MediaLimitExceededError } from "../application/media.errors";
import { CleanupMediaUseCase, ServeMediaUseCase } from "../application/media.use-cases";
import type { MediaObject, MediaStorage, MediaStorageObject } from "../application/media-storage";
import {
  MAX_GALLERY_PHOTOS,
  MAX_STORED_ASSETS,
  MEDIA_MIME,
  MEDIA_ORPHAN_GRACE_MS,
  storageKeyFor,
} from "../domain/media-asset";
import { PrismaMediaRepository } from "./prisma-media.repository";

// Invitation media on real PostgreSQL (M8 S4): the additive migration's table, checks, indexes, and RESTRICT
// reference; the two limits and the one-main-photo rule under concurrent uploads; owner isolation; the archived
// refusal; the gallery position assignment and reorder; the serving rules; and the cleanup that removes a deleted
// row's object. Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL, and removes
// exactly the rows it created.

const RENDERER = "birthday-poster-01";
const AT = new Date("2026-11-20T10:00:00.000Z");

/** An in-memory storage adapter: the database suite proves the SQL, not the filesystem or a bucket. */
class MapStorage implements MediaStorage {
  objects = new Map<string, Buffer>();
  /** When each object was written; `put` stamps the current time, and a test can age one. */
  modified = new Map<string, Date>();
  failDelete = false;

  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.objects.set(key, Buffer.from(bytes));
    this.modified.set(key, new Date());
  }

  /** Ages one object past the cleanup's grace period, so the scan sees an abandoned object. */
  age(key: string, milliseconds: number): void {
    this.modified.set(key, new Date(Date.now() - milliseconds));
  }

  async get(key: string): Promise<MediaObject | null> {
    const bytes = this.objects.get(key);
    return bytes
      ? { stream: Readable.from(bytes), byteSize: bytes.length, contentType: MEDIA_MIME }
      : null;
  }

  async delete(key: string): Promise<void> {
    if (this.failDelete) {
      throw new Error("storage unavailable");
    }
    this.objects.delete(key);
  }

  async listObjects(prefix: string): Promise<MediaStorageObject[]> {
    return [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .map((key) => ({ key, lastModified: this.modified.get(key) ?? null }));
  }
}

describe("media assets on real PostgreSQL (M8 S4)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const invitations = new PrismaInvitationRepository(prisma);
  const media = new PrismaMediaRepository(prisma);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const packageIds: string[] = [];
  const invitationIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      await prisma.mediaAsset.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.invitationFeatureSettings.deleteMany({
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

  async function newOwner(): Promise<string> {
    sequence += 1;
    const created = await prisma.user.create({
      data: { email: `m8-media-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);
    return created.id;
  }

  async function newInvitation(
    options: { ownerId?: string; publish?: boolean; archive?: boolean } = {},
  ) {
    const ownerId = options.ownerId ?? (await newOwner());
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `m8-media-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m8-media-template-${sequence}-${runId}`,
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
        schema: { type: "object", required: [], properties: { title: { type: "string" } } },
        configuration: { componentKey: RENDERER },
      },
    });
    const createdPackage = await prisma.package.create({
      data: {
        key: `m8-media-package-${sequence}-${runId}`,
        name: "Paquete",
        status: "ACTIVE",
      },
    });
    packageIds.push(createdPackage.id);
    const invitation = await invitations.create({
      ownerId,
      templateVersionId: version.id,
      packageId: createdPackage.id,
      slug: `m8media-${runId.slice(0, 8)}-${sequence}`,
      content: {},
    });
    invitationIds.push(invitation.id);
    if (options.publish !== false) {
      assert.ok(await invitations.publish(ownerId, invitation.id, AT));
    }
    if (options.archive === true) {
      assert.ok(await invitations.archive(ownerId, invitation.id));
    }

    return { invitation, ownerId };
  }

  async function upload(
    invitation: { id: string; ownerId: string },
    kind: "main-photo" | "gallery" = "gallery",
  ) {
    const id = randomUUID();
    const created = await media.insert(
      invitation.ownerId,
      invitation.id,
      {
        id,
        kind,
        storageKey: storageKeyFor(invitation.id, id),
        mime: MEDIA_MIME,
        byteSize: 1024,
        width: 2000,
        height: 1500,
        position: null,
        alt: null,
      },
      AT,
    );
    assert.ok(created !== null, "the asset is stored");

    return created;
  }

  describe("the additive migration", () => {
    it("creates MediaAsset with bounded columns, checks, indexes, and a RESTRICT reference", async () => {
      const columns = await prisma.$queryRaw<
        Array<{ column_name: string; is_nullable: string; data_type: string }>
      >`
        SELECT column_name, is_nullable, data_type
        FROM information_schema.columns
        WHERE table_name = 'MediaAsset'
      `;
      const byName = new Map(columns.map((column) => [column.column_name, column]));

      for (const name of [
        "id",
        "invitationId",
        "kind",
        "storageKey",
        "mime",
        "byteSize",
        "width",
        "height",
        "position",
        "alt",
        "status",
        "createdAt",
        "updatedAt",
      ]) {
        assert.ok(byName.has(name), name);
      }
      assert.equal(byName.get("invitationId")?.is_nullable, "NO");
      assert.equal(byName.get("position")?.is_nullable, "YES");
      assert.equal(byName.get("alt")?.is_nullable, "YES");

      const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
        SELECT conname FROM pg_constraint
        WHERE conrelid = '"MediaAsset"'::regclass
      `;
      const names = constraints.map((constraint) => constraint.conname);
      for (const name of [
        "MediaAsset_byteSize_range",
        "MediaAsset_dimensions_range",
        "MediaAsset_mime_webp",
        "MediaAsset_position_matches_kind",
        "MediaAsset_alt_length",
        "MediaAsset_storageKey_format",
        "MediaAsset_invitationId_fkey",
      ]) {
        assert.ok(names.includes(name), name);
      }

      const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes WHERE tablename = 'MediaAsset'
      `;
      const indexNames = indexes.map((index) => index.indexname);
      assert.ok(
        indexNames.includes("MediaAsset_invitationId_kind_status_position_idx"),
        "the gallery index",
      );
      assert.ok(indexNames.includes("MediaAsset_one_stored_main_photo"), "one current main photo");
      assert.ok(indexNames.includes("MediaAsset_storageKey_key"), "the unique storage key");

      const reference = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
        SELECT delete_rule FROM information_schema.referential_constraints
        WHERE constraint_name = 'MediaAsset_invitationId_fkey'
      `;
      assert.equal(reference[0]?.delete_rule, "RESTRICT");
    });

    it("refuses the values the checks bound, so a bad row never becomes database truth", async () => {
      const { invitation, ownerId } = await newInvitation();
      const valid = {
        id: randomUUID(),
        invitationId: invitation.id,
        kind: "GALLERY" as const,
        storageKey: storageKeyFor(invitation.id, randomUUID()),
        mime: MEDIA_MIME,
        byteSize: 1024,
        width: 2000,
        height: 1500,
        position: 0,
        alt: null,
        status: "STORED" as const,
      };
      const attempts = [
        { width: 2001 },
        { height: 0 },
        { byteSize: 0 },
        { mime: "image/jpeg" },
        { kind: "MAIN_PHOTO" as const, position: 0 },
        { kind: "GALLERY" as const, position: null },
        { alt: "x".repeat(121) },
        { storageKey: "invitations/../../etc/passwd" },
        { storageKey: `invitations/${randomUUID()}/${randomUUID()}.jpg` },
      ];

      for (const attempt of attempts) {
        await assert.rejects(
          prisma.mediaAsset.create({ data: { ...valid, ...attempt } }),
          JSON.stringify(attempt),
        );
      }
      assert.equal(await prisma.mediaAsset.count({ where: { invitationId: invitation.id } }), 0);
      assert.ok(ownerId);
    });
  });

  describe("limits under concurrent uploads", () => {
    it("keeps at most 12 gallery photos and 40 stored assets", async () => {
      const { invitation } = await newInvitation();
      const gallery = await Promise.allSettled(
        Array.from({ length: MAX_GALLERY_PHOTOS + 3 }, () => upload(invitation, "gallery")),
      );
      const stored = await prisma.mediaAsset.count({
        where: { invitationId: invitation.id, status: "STORED" },
      });

      assert.equal(stored, MAX_GALLERY_PHOTOS);
      assert.equal(
        gallery.filter((result) => result.status === "fulfilled").length,
        MAX_GALLERY_PHOTOS,
      );
      for (const rejected of gallery.filter((result) => result.status === "rejected")) {
        assert.ok(
          (rejected as PromiseRejectedResult).reason instanceof MediaLimitExceededError,
          "the extra uploads are refused by the gallery limit",
        );
      }
    });

    it("keeps one current main photo when two replacements race", async () => {
      const { invitation } = await newInvitation();
      const results = await Promise.allSettled([
        upload(invitation, "main-photo"),
        upload(invitation, "main-photo"),
        upload(invitation, "main-photo"),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const stored = await prisma.mediaAsset.findMany({
        where: { invitationId: invitation.id, kind: "MAIN_PHOTO", status: "STORED" },
      });

      assert.equal(fulfilled.length, 3, "every replacement is accepted");
      assert.equal(stored.length, 1, "exactly one current main photo remains");
      assert.equal(
        await prisma.mediaAsset.count({
          where: { invitationId: invitation.id, kind: "MAIN_PHOTO", status: "DELETED" },
        }),
        2,
      );
      const replaced = fulfilled.flatMap((result) =>
        result.status === "fulfilled" && result.value.replaced !== null
          ? [result.value.replaced.id]
          : [],
      );
      assert.equal(replaced.length, 2, "each replacement reports the row it replaced");
    });

    it("caps one invitation at 40 stored assets, main photo included", async () => {
      const { invitation } = await newInvitation();
      // Rows a legal upload path could not create in this shape: the 12-gallery rule lives in the use case, so the
      // outer 40-asset bound is proven at the repository, where both bounds are one statement's decision.
      for (let position = 0; position < MAX_STORED_ASSETS - 1; position += 1) {
        const id = randomUUID();
        await prisma.mediaAsset.create({
          data: {
            id,
            invitationId: invitation.id,
            kind: "GALLERY",
            storageKey: storageKeyFor(invitation.id, id),
            mime: MEDIA_MIME,
            byteSize: 1024,
            width: 10,
            height: 10,
            position,
            alt: null,
            status: "STORED",
          },
        });
      }
      const mainPhotoId = randomUUID();
      await prisma.mediaAsset.create({
        data: {
          id: mainPhotoId,
          invitationId: invitation.id,
          kind: "MAIN_PHOTO",
          storageKey: storageKeyFor(invitation.id, mainPhotoId),
          mime: MEDIA_MIME,
          byteSize: 1024,
          width: 10,
          height: 10,
          position: null,
          alt: null,
          status: "STORED",
        },
      });

      await assert.rejects(
        upload(invitation, "gallery"),
        (error: unknown) => error instanceof MediaLimitExceededError && error.limit === "assets",
      );
    });
  });

  describe("owner isolation and the archived refusal", () => {
    it("answers nothing and changes nothing for another owner's invitation", async () => {
      const { invitation } = await newInvitation();
      const created = await upload(invitation);
      const stranger = await newOwner();

      assert.equal(await media.listStored(stranger, invitation.id), null);
      assert.equal(
        await media.insert(
          stranger,
          invitation.id,
          {
            id: randomUUID(),
            kind: "gallery",
            storageKey: storageKeyFor(invitation.id, randomUUID()),
            mime: MEDIA_MIME,
            byteSize: 10,
            width: 10,
            height: 10,
            position: null,
            alt: null,
          },
          AT,
        ),
        null,
      );
      assert.equal(
        await media.updateAlt(stranger, invitation.id, created.asset.id, "ajeno", AT),
        null,
      );
      assert.equal(await media.markDeleted(stranger, invitation.id, created.asset.id, AT), null);
      assert.equal(await media.moveGallery(stranger, invitation.id, created.asset.id, 0, AT), null);

      const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: created.asset.id } });
      assert.equal(row.status, "STORED");
      assert.equal(row.alt, null);
    });

    it("refuses every write to an archived invitation, keeping its media readable", async () => {
      const { invitation } = await newInvitation({ archive: true });
      const { invitation: live } = await newInvitation();
      const created = await upload(live);
      await prisma.mediaAsset.update({
        where: { id: created.asset.id },
        data: { invitationId: invitation.id },
      });

      await assert.rejects(
        media.insert(
          invitation.ownerId,
          invitation.id,
          {
            id: randomUUID(),
            kind: "gallery",
            storageKey: storageKeyFor(invitation.id, randomUUID()),
            mime: MEDIA_MIME,
            byteSize: 10,
            width: 10,
            height: 10,
            position: null,
            alt: null,
          },
          AT,
        ),
        InvitationNotEditableError,
      );
      await assert.rejects(
        media.updateAlt(invitation.ownerId, invitation.id, created.asset.id, "archivada", AT),
        InvitationNotEditableError,
      );
      await assert.rejects(
        media.markDeleted(invitation.ownerId, invitation.id, created.asset.id, AT),
        InvitationNotEditableError,
      );
      await assert.rejects(
        media.moveGallery(invitation.ownerId, invitation.id, created.asset.id, 0, AT),
        InvitationNotEditableError,
      );
      const stored = await media.listStored(invitation.ownerId, invitation.id);
      assert.equal(stored?.length, 1, "an archived invitation's media stays readable");
    });
  });

  describe("gallery order and the owner list", () => {
    it("assigns positions on upload and rewrites them on a move", async () => {
      const { invitation } = await newInvitation();
      await upload(invitation, "main-photo");
      const first = await upload(invitation, "gallery");
      const second = await upload(invitation, "gallery");
      const third = await upload(invitation, "gallery");
      assert.deepEqual(
        [first, second, third].map((asset) => asset.asset.position),
        [0, 1, 2],
      );

      const listed = await media.listStored(invitation.ownerId, invitation.id);
      assert.deepEqual(
        listed?.map((row) => row.kind),
        ["main-photo", "gallery", "gallery", "gallery"],
      );

      const moved = await media.moveGallery(
        invitation.ownerId,
        invitation.id,
        third.asset.id,
        0,
        AT,
      );
      assert.deepEqual(
        moved?.map((row) => row.id),
        [third.asset.id, first.asset.id, second.asset.id],
      );
      assert.deepEqual(
        moved?.map((row) => row.position),
        [0, 1, 2],
      );

      const publicGallery = await media.listPublicGallery(invitation.id);
      assert.deepEqual(
        publicGallery.map((row) => row.id),
        [third.asset.id, first.asset.id, second.asset.id],
        "the public read is ordered by position and carries no main photo",
      );
    });
  });

  describe("serving and cleanup", () => {
    it("serves a published asset publicly and a draft only to its owner", async () => {
      const { invitation, ownerId } = await newInvitation();
      const created = await upload(invitation);
      const storage = new MapStorage();
      await storage.put(created.asset.storageKey, Buffer.from("image"));
      const serve = new ServeMediaUseCase(media, storage);

      const published = await serve.execute(created.asset.id, { ownerId: async () => null });
      assert.equal(published?.cache, "public");

      assert.ok(await invitations.unpublish(ownerId, invitation.id));
      const owner = await serve.execute(created.asset.id, { ownerId: async () => ownerId });
      assert.equal(owner?.cache, "private");
      assert.equal(await serve.execute(created.asset.id, { ownerId: async () => null }), null);
      assert.equal(
        await serve.execute(created.asset.id, { ownerId: async () => newOwner() }),
        null,
      );
    });

    it("answers nothing for a deleted row and a missing object", async () => {
      const { invitation, ownerId } = await newInvitation();
      const created = await upload(invitation);
      const storage = new MapStorage();
      const serve = new ServeMediaUseCase(media, storage);

      assert.equal(await serve.execute(created.asset.id, { ownerId: async () => ownerId }), null);
      await storage.put(created.asset.storageKey, Buffer.from("image"));
      assert.ok(await media.markDeleted(ownerId, invitation.id, created.asset.id, AT));
      assert.equal(await serve.execute(created.asset.id, { ownerId: async () => ownerId }), null);
    });

    it("removes the objects of deleted rows and the orphan objects, then the rows", async () => {
      const { invitation } = await newInvitation();
      const created = await upload(invitation);
      // A second photo that stays stored: its object is old, but a row names it, so the orphan scan must not touch it.
      const kept = await upload(invitation);
      await media.markDeleted(invitation.ownerId, invitation.id, created.asset.id, AT);
      const orphan = storageKeyFor(invitation.id, randomUUID());
      const inFlight = storageKeyFor(invitation.id, randomUUID());
      const storage = new MapStorage();
      await storage.put(created.asset.storageKey, Buffer.from("image"));
      await storage.put(kept.asset.storageKey, Buffer.from("image"));
      storage.age(kept.asset.storageKey, 2 * MEDIA_ORPHAN_GRACE_MS);
      await storage.put(orphan, Buffer.from("image"));
      // An object with no row is only an orphan once it is past the grace period: younger ones may be in flight.
      storage.age(orphan, 2 * MEDIA_ORPHAN_GRACE_MS);
      await storage.put(inFlight, Buffer.from("image"));
      const cleanup = new CleanupMediaUseCase(media, storage, () => {});

      // The command is global by design, so this suite's earlier deleted rows are part of its answer too.
      const dryRun = await cleanup.execute({ dryRun: true });
      assert.ok(dryRun.deletedObjects >= 1);
      assert.equal(dryRun.orphanObjects, 1);
      assert.equal(dryRun.skippedRecentObjects, 1, "a young object is left for a later run");
      assert.equal(dryRun.failedObjects, 0);
      assert.equal(storage.objects.size, 4, "a dry run deletes nothing");

      const result = await cleanup.execute({ dryRun: false });
      assert.ok(result.deletedObjects >= 1);
      assert.equal(result.orphanObjects, 1);
      assert.equal(result.skippedRecentObjects, 1);
      assert.ok(result.deletedRows >= 1);
      assert.equal(result.failedObjects, 0);
      assert.equal(storage.objects.size, 2, "only the stored and the in-flight object are left");
      assert.equal(
        storage.objects.has(kept.asset.storageKey),
        true,
        "a stored row's object is never deleted",
      );
      assert.equal(storage.objects.has(inFlight), true);
      assert.equal(storage.objects.has(created.asset.storageKey), false);
      assert.equal(await prisma.mediaAsset.count({ where: { id: created.asset.id } }), 0);
      assert.equal(await prisma.mediaAsset.count({ where: { id: kept.asset.id } }), 1);
    });

    it("keeps a deleted row when its object cannot be deleted, so a later run finishes the job", async () => {
      const { invitation } = await newInvitation();
      const created = await upload(invitation);
      await media.markDeleted(invitation.ownerId, invitation.id, created.asset.id, AT);
      const storage = new MapStorage();
      await storage.put(created.asset.storageKey, Buffer.from("image"));
      storage.failDelete = true;
      const cleanup = new CleanupMediaUseCase(media, storage, () => {});

      const failed = await cleanup.execute({ dryRun: false });
      assert.ok(failed.failedObjects >= 1, "the deleted row's object could not be deleted");
      assert.equal(await prisma.mediaAsset.count({ where: { id: created.asset.id } }), 1);

      storage.failDelete = false;
      const retried = await cleanup.execute({ dryRun: false });
      assert.ok(retried.deletedRows >= 1);
      assert.equal(await prisma.mediaAsset.count({ where: { id: created.asset.id } }), 0);
    });
  });
});
