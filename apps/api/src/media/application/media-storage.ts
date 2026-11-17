import type { Readable } from "node:stream";

// The media storage port (M8 S4). One capability in the application layer, implemented by infrastructure adapters,
// so the use cases never know whether the bytes live in a directory or in an S3-compatible bucket. `put` writes an
// object, `get` answers a stream with its size (null when the object is gone), `delete` is idempotent, and
// `listKeys` lets the cleanup command find objects whose rows are missing. Keys are the API's own
// `invitations/<invitationId>/<assetId>.webp` values; an adapter refuses anything else, so no caller can name an
// arbitrary path or object.

/** The MIME every stored object is served with: the re-encoded WebP (S4). */
export const MEDIA_CONTENT_TYPE = "image/webp";

/** One stored object: the bytes as a stream and the metadata a response needs. */
export interface MediaObject {
  stream: Readable;
  byteSize: number;
  contentType: string;
}

/** The storage port of invitation media (S4). */
export interface MediaStorage {
  /** Writes the object at `key`, replacing any previous one. Refuses a key this API did not write. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;

  /** The object, or null when nothing is stored at `key`. Refuses a key this API did not write. */
  get(key: string): Promise<MediaObject | null>;

  /** Deletes the object; deleting a missing object succeeds, so a retry is safe. Refuses a foreign key. */
  delete(key: string): Promise<void>;

  /** Every key under `prefix`, for the cleanup command's orphan scan. */
  listKeys(prefix: string): Promise<string[]>;
}

export const MEDIA_STORAGE = Symbol("MediaStorage");

/** The closed set of operations an adapter performs, named in an error without any provider detail. */
export type MediaStorageOperation = "put" | "get" | "delete" | "list";

/**
 * The only error an adapter throws. It names neither the provider, the endpoint, the bucket, the key, nor the
 * credential: an operational failure must never echo configuration or a signed URL into a response or a log.
 */
export class MediaStorageError extends Error {
  constructor(readonly operation: MediaStorageOperation) {
    super(`Media storage ${operation} failed.`);
    this.name = "MediaStorageError";
  }
}
