import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import type { MediaObject, MediaStorage } from "../application/media-storage";
import { MediaStorageError } from "../application/media-storage";
import { isStorageKey } from "../domain/media-asset";

// The local storage adapter (M8 S4): a directory from `MEDIA_LOCAL_DIRECTORY`, for development and tests only.
// `environment.ts` refuses it in production, because an ephemeral filesystem would lose the photos. The adapter
// accepts only keys this API wrote (`invitations/<uuid>/<uuid>.webp`), resolves each one under the root, and
// refuses a resolved path outside it, so no key can traverse out of the root even if the format check were ever
// loosened.

export class LocalMediaStorage implements MediaStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<void> {
    const path = this.pathOf(key, "put");
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
    } catch {
      throw new MediaStorageError("put");
    }
  }

  async get(key: string): Promise<MediaObject | null> {
    const path = this.pathOf(key, "get");
    try {
      const metadata = await stat(path);
      if (!metadata.isFile()) {
        return null;
      }

      return {
        stream: createReadStream(path),
        byteSize: metadata.size,
        contentType: "image/webp",
      };
    } catch {
      // A missing file is not an operational failure: the row may outlive its object, and serving answers 404.
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.pathOf(key, "delete");
    try {
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new MediaStorageError("delete");
      }
    }
  }

  async listKeys(prefix: string): Promise<string[]> {
    if (!prefix.startsWith("invitations/")) {
      throw new MediaStorageError("list");
    }

    try {
      await mkdir(this.root, { recursive: true });
      const files = await this.walk(this.root);

      return files
        .map((file) => relative(this.root, file).split(sep).join(posix.sep))
        .filter((key) => key.startsWith(prefix))
        .sort();
    } catch {
      throw new MediaStorageError("list");
    }
  }

  private async walk(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await this.walk(entryPath)));
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }

    return files;
  }

  /** The absolute path of a valid key, refused when it is not a key this API wrote or when it escapes the root. */
  private pathOf(key: string, operation: "put" | "get" | "delete"): string {
    if (!isStorageKey(key)) {
      throw new MediaStorageError(operation);
    }

    const path = resolve(this.root, key);
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new MediaStorageError(operation);
    }

    return path;
  }
}
