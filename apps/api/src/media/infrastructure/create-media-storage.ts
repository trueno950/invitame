import type { MediaEnvironment } from "../../config/environment";
import type { MediaStorage } from "../application/media-storage";
import { LocalMediaStorage } from "./local-media-storage";
import { S3MediaStorage } from "./s3-media-storage";

/**
 * Binds the storage port to the adapter `MEDIA_STORAGE_DRIVER` selects (M8 S4). The environment was already
 * validated at startup, so a production deployment can only reach the S3-compatible adapter, and the local adapter
 * exists only outside production.
 */
export function createMediaStorage(media: MediaEnvironment): MediaStorage {
  return media.driver === "local"
    ? new LocalMediaStorage(media.directory)
    : new S3MediaStorage(media.s3);
}
