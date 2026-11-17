import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { MediaStorageError } from "../application/media-storage";
import { storageKeyFor } from "../domain/media-asset";
import { LocalMediaStorage } from "./local-media-storage";

// The local adapter (M8 S4): development and test only, rooted in one directory, and it refuses every key that is
// not one this API wrote. The suite keeps its files in a fresh system temp directory and removes it at the end.

describe("local media storage (S4)", () => {
  let root: string;
  let storage: LocalMediaStorage;
  const invitationId = randomUUID();
  const assetId = randomUUID();
  const key = storageKeyFor(invitationId, assetId);

  before(async () => {
    root = await mkdtemp(join(tmpdir(), "invitame-media-"));
    storage = new LocalMediaStorage(root);
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("puts an object and gets it back as a stream with its size and content type", async () => {
    await storage.put(key, Buffer.from("webp-bytes"), "image/webp");

    const stored = await storage.get(key);
    assert.ok(stored);
    assert.equal(stored.byteSize, 10);
    assert.equal(stored.contentType, "image/webp");
    const chunks: Buffer[] = [];
    for await (const chunk of stored.stream) {
      chunks.push(Buffer.from(chunk));
    }
    assert.equal(Buffer.concat(chunks).toString(), "webp-bytes");
    assert.deepEqual(await readFile(join(root, key)), Buffer.from("webp-bytes"));
  });

  it("answers null for a missing object and deletes idempotently", async () => {
    assert.equal(await storage.get(storageKeyFor(randomUUID(), randomUUID())), null);
    await storage.delete(key);
    assert.equal(await storage.get(key), null);
    await storage.delete(key);
    assert.equal(existsSync(join(root, key)), false);
  });

  it("refuses a key that is not one this API wrote, without touching the filesystem", async () => {
    const refused = [
      "invitations/../../escape.webp",
      `${key}/../../escape.webp`,
      key.replace(/\.webp$/, ".jpg"),
      `other/${invitationId}/${assetId}.webp`,
      "invitations/not-a-uuid/not-a-uuid.webp",
    ];

    for (const candidate of refused) {
      await assert.rejects(
        storage.put(candidate, Buffer.from("x"), "image/webp"),
        MediaStorageError,
        candidate,
      );
      await assert.rejects(storage.get(candidate), MediaStorageError, candidate);
      await assert.rejects(storage.delete(candidate), MediaStorageError, candidate);
    }
    assert.equal(existsSync(join(root, "..", "escape.webp")), false);
  });

  it("lists the keys under its invitations prefix with the time each object was written", async () => {
    const another = storageKeyFor(randomUUID(), randomUUID());
    const writtenAt = new Date("2026-11-20T12:00:00.000Z");
    await storage.put(another, Buffer.from("x"), "image/webp");
    await utimes(join(root, another), writtenAt, writtenAt);

    const objects = await storage.listObjects("invitations/");

    assert.ok(objects.some((object) => object.key === another));
    assert.equal(
      objects.every((object) => object.key.startsWith("invitations/")),
      true,
    );
    // The file's own modification time is what the cleanup scan dates an object by.
    const listed = objects.find((object) => object.key === another);
    assert.ok(listed?.lastModified instanceof Date);
    assert.equal(listed?.lastModified.getTime(), writtenAt.getTime());
  });
});
