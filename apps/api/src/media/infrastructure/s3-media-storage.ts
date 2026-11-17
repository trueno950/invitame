import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { MediaS3Environment } from "../../config/environment";
import type { MediaObject, MediaStorage, MediaStorageObject } from "../application/media-storage";
import { MediaStorageError } from "../application/media-storage";
import { isStorageKey, MEDIA_STORAGE_PREFIX } from "../domain/media-asset";

// The S3-compatible storage adapter (M8 S4): one adapter for Cloudflare R2, AWS S3, and MinIO, selected by
// `MEDIA_STORAGE_DRIVER=s3` and configured from the validated environment. The credential lives only in the client;
// this adapter logs nothing and its every error is one fixed message, so an endpoint, a bucket, an access key, a
// signed URL, or a provider payload can never reach a response or a log. Nothing here is called until the owner
// configures a bucket, because production fails closed without one.

/** The part of the S3 client this adapter uses; a test substitutes a fake with no network. */
export interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

/** The response fields of `GetObject` this adapter reads. */
interface GetObjectOutput {
  Body?: unknown;
  ContentLength?: number;
  ContentType?: string;
}

/** The response fields of `ListObjectsV2` this adapter reads. */
interface ListObjectsOutput {
  Contents?: Array<{ Key?: string; LastModified?: unknown }>;
  IsTruncated?: boolean;
  NextContinuationToken?: string;
}

export class S3MediaStorage implements MediaStorage {
  private readonly client: S3ClientLike;
  private readonly bucket: string;

  constructor(configuration: MediaS3Environment, client?: S3ClientLike) {
    this.bucket = configuration.bucket;
    this.client =
      client ??
      new S3Client({
        endpoint: configuration.endpoint,
        region: configuration.region,
        forcePathStyle: configuration.forcePathStyle,
        credentials: {
          accessKeyId: configuration.accessKeyId,
          secretAccessKey: configuration.secretAccessKey,
        },
      });
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.assertKey(key, "put");
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    } catch {
      throw new MediaStorageError("put");
    }
  }

  async get(key: string): Promise<MediaObject | null> {
    this.assertKey(key, "get");
    let output: GetObjectOutput;
    try {
      output = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )) as GetObjectOutput;
    } catch (error) {
      // A missing key is the same invisible case as a missing row; every other failure is operational.
      if (isNotFound(error)) {
        return null;
      }
      throw new MediaStorageError("get");
    }

    const body = output.Body;
    if (
      body === undefined ||
      body === null ||
      typeof (body as { pipe?: unknown }).pipe !== "function"
    ) {
      throw new MediaStorageError("get");
    }

    return {
      stream: body as Readable,
      byteSize: output.ContentLength ?? 0,
      contentType: output.ContentType ?? "image/webp",
    };
  }

  async delete(key: string): Promise<void> {
    this.assertKey(key, "delete");
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      // Deleting a missing key is a success, so a retried cleanup is safe.
      if (!isNotFound(error)) {
        throw new MediaStorageError("delete");
      }
    }
  }

  async listObjects(prefix: string): Promise<MediaStorageObject[]> {
    if (prefix !== MEDIA_STORAGE_PREFIX) {
      throw new MediaStorageError("list");
    }

    const objects: MediaStorageObject[] = [];
    let token: string | undefined;
    try {
      do {
        const output = (await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ...(token === undefined ? {} : { ContinuationToken: token }),
          }),
        )) as ListObjectsOutput;

        for (const entry of output.Contents ?? []) {
          if (typeof entry.Key === "string") {
            // The provider's own write time, which is what the cleanup scan compares against its grace period; an
            // answer without one is reported as undated and the scan then leaves that object alone.
            objects.push({
              key: entry.Key,
              lastModified: entry.LastModified instanceof Date ? entry.LastModified : null,
            });
          }
        }
        token = output.IsTruncated === true ? output.NextContinuationToken : undefined;
      } while (token !== undefined);
    } catch {
      throw new MediaStorageError("list");
    }

    return objects.sort((left, right) => left.key.localeCompare(right.key));
  }

  private assertKey(key: string, operation: "put" | "get" | "delete"): void {
    if (!isStorageKey(key)) {
      throw new MediaStorageError(operation);
    }
  }
}

/** Whether a provider failure names a missing object, which is the only failure that is not operational. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const status = candidate.$metadata?.httpStatusCode;

  return candidate.name === "NoSuchKey" || candidate.name === "NotFound" || status === 404;
}
