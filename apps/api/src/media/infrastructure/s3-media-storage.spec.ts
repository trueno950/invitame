import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import type { MediaS3Environment } from "../../config/environment";
import { MediaStorageError } from "../application/media-storage";
import { storageKeyFor } from "../domain/media-asset";
import { S3MediaStorage } from "./s3-media-storage";

// The S3-compatible adapter (M8 S4) with a fake client: no network and no bucket. The endpoint, bucket, and
// credentials stay in configuration and never appear in an error message.

const SECRET = "s3-secret-access-key-do-not-log";

function configuration(overrides: Partial<MediaS3Environment> = {}): MediaS3Environment {
  return {
    endpoint: "https://account.r2.example.test",
    region: "auto",
    bucket: "invitame-media",
    accessKeyId: "access-key-id",
    secretAccessKey: SECRET,
    forcePathStyle: false,
    ...overrides,
  };
}

class FakeS3Client {
  commands: unknown[] = [];
  responses: Array<() => unknown> = [];

  async send(command: unknown): Promise<unknown> {
    this.commands.push(command);
    return this.responses.shift()?.() ?? {};
  }
}

function notFound(): Error {
  return Object.assign(new Error("The specified key does not exist."), {
    name: "NoSuchKey",
    $metadata: { httpStatusCode: 404 },
  });
}

const key = storageKeyFor(randomUUID(), randomUUID());

describe("S3 media storage (S4)", () => {
  it("puts the object with its content type and the configured bucket", async () => {
    const client = new FakeS3Client();
    const storage = new S3MediaStorage(configuration(), client);

    await storage.put(key, Buffer.from("webp-bytes"), "image/webp");

    const command = client.commands[0];
    assert.ok(command instanceof PutObjectCommand);
    assert.equal(command.input.Bucket, "invitame-media");
    assert.equal(command.input.Key, key);
    assert.equal(command.input.ContentType, "image/webp");
    assert.equal(command.input.Body?.toString(), "webp-bytes");
  });

  it("gets a stream with its size and answers null for a missing object", async () => {
    const client = new FakeS3Client();
    const storage = new S3MediaStorage(configuration(), client);
    client.responses.push(() => ({
      Body: Readable.from([Buffer.from("webp-bytes")]),
      ContentLength: 10,
      ContentType: "image/webp",
    }));

    const stored = await storage.get(key);
    assert.ok(stored);
    assert.equal(stored.byteSize, 10);
    assert.equal(stored.contentType, "image/webp");
    assert.ok(client.commands[0] instanceof GetObjectCommand);

    client.responses.push(() => {
      throw notFound();
    });
    assert.equal(await storage.get(key), null);
  });

  it("deletes idempotently, treats a missing key as deleted, and lists with pagination", async () => {
    const client = new FakeS3Client();
    const storage = new S3MediaStorage(configuration(), client);
    client.responses.push(() => {
      throw notFound();
    });
    await storage.delete(key);
    assert.ok(client.commands[0] instanceof DeleteObjectCommand);

    const second = storageKeyFor(randomUUID(), randomUUID());
    const writtenAt = new Date("2026-11-20T12:00:00.000Z");
    client.responses.push(
      () => ({
        Contents: [{ Key: key, LastModified: writtenAt }],
        IsTruncated: true,
        NextContinuationToken: "next",
      }),
      // A provider that answers no `LastModified` leaves that object undated, never wrongly old.
      () => ({ Contents: [{ Key: second }], IsTruncated: false }),
    );

    assert.deepEqual(
      await storage.listObjects("invitations/"),
      [
        { key, lastModified: writtenAt },
        { key: second, lastModified: null },
      ].sort((left, right) => left.key.localeCompare(right.key)),
    );
    const firstList = client.commands[1];
    assert.ok(firstList instanceof ListObjectsV2Command);
    assert.equal(firstList.input.Prefix, "invitations/");
    const secondList = client.commands[2];
    assert.ok(secondList instanceof ListObjectsV2Command);
    assert.equal(secondList.input.ContinuationToken, "next");
  });

  it("refuses a key that is not one this API wrote, before contacting the provider", async () => {
    const client = new FakeS3Client();
    const storage = new S3MediaStorage(configuration(), client);

    await assert.rejects(
      storage.put("invitations/../../etc/passwd", Buffer.from("x"), "image/webp"),
      MediaStorageError,
    );
    await assert.rejects(storage.get("other/key"), MediaStorageError);
    assert.deepEqual(client.commands, []);
  });

  it("wraps a provider failure without echoing the endpoint, the bucket, or the credentials", async () => {
    const client = new FakeS3Client();
    const storage = new S3MediaStorage(configuration(), client);
    client.responses.push(() => {
      throw new Error(
        `Failed to reach https://account.r2.example.test/invitame-media with ${SECRET} (access-key-id)`,
      );
    });

    await assert.rejects(
      storage.put(key, Buffer.from("x"), "image/webp"),
      (error: unknown) =>
        error instanceof MediaStorageError &&
        error.operation === "put" &&
        !error.message.includes(SECRET) &&
        !error.message.includes("account.r2.example.test") &&
        !error.message.includes("access-key-id") &&
        !error.message.includes("invitame-media"),
    );
  });
});
