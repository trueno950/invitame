import {
  ApiClientError,
  type ApiClientOptions,
  sendApiRequest,
  sessionCookieHeader,
} from "./api-client.ts";

/**
 * The web server's client of the invitation media routes (M8 S2, S4). The API owns the bytes, the limits, the
 * ownership, and the package gate; this client only builds each request, reads each answer with a strict parser, and
 * maps every documented refusal to a typed outcome that never carries a response body.
 *
 * The upload is multipart, built here from bytes the browser sent to this server. The part is named `photo` and
 * declared `application/octet-stream` on purpose: the API decides the format from magic bytes alone, so the web never
 * forwards the browser's claim about the type and never forwards the file's original name, which can carry personal
 * data. The 10 MB bound is checked here as well, before a single byte is sent, because a browser can submit a file the
 * API would refuse.
 *
 * This module deliberately has no `server-only` marker, so `node --test` can load it and prove the mapping; the
 * cookie-reading wiring that imports it lives in `app/cuenta/invitaciones/_lib/media.ts` and is `server-only`.
 */

/** The two kinds of invitation media, as the API names them (S4). */
export const MEDIA_KINDS = ["main-photo", "gallery"] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

/** The largest upload the API accepts, in bytes: 10 MB (S4). The web refuses one byte more before sending. */
export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The longest alt text the API stores, in characters (S4). */
export const MEDIA_ALT_MAX_LENGTH = 120;

/** How many gallery photos one invitation may hold (S4). */
export const MAX_GALLERY_PHOTOS = 12;

/**
 * The deadline of one upload: the API's own request bound is much shorter, but a 10 MB body over a slow link needs
 * more than the shared 10 seconds, and a guest page never waits on it.
 */
export const MEDIA_UPLOAD_TIMEOUT_MS = 60_000;

/** One asset as the creator's editor reads it: the URL is the only way to the bytes. */
export interface MediaAsset {
  readonly id: string;
  readonly kind: MediaKind;
  /** The absolute API URL of the image; never a storage provider, a bucket, or a signed URL. */
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string | null;
  /** The zero-based gallery index, or null for a main photo. */
  readonly position: number | null;
  readonly createdAt: string;
}

/**
 * Every refusal this deployment implements, one per answer of the media routes (S4):
 *
 * - `signed-out`: 401, or no session cookie, so nothing was sent;
 * - `not-found`: 404 `MEDIA_NOT_FOUND`, or an id that is not a UUID, so nothing was sent — a foreign invitation or
 *   asset answers the same as an unknown one (A4);
 * - `not-editable`: 409 `INVITATION_NOT_EDITABLE`, the invitation is archived;
 * - `gallery-unavailable`: 409 `GALLERY_NOT_AVAILABLE`, the pinned package does not grant `GALLERY` (S3);
 * - `limit-reached`: 409 `MEDIA_LIMIT_REACHED`, the 12 gallery photos or the 40 stored assets are used up;
 * - `invalid-upload`: 400 `INVALID_MEDIA_UPLOAD`, the bytes, the kind, or the alt text were refused;
 * - `invalid-update`: 400 `INVALID_MEDIA_UPDATE`, the alt text or the position were refused;
 * - `payload-too-large`: 413 `PAYLOAD_TOO_LARGE`, the request body is over the route's bound;
 * - `unsupported-media-type`: 415 `UNSUPPORTED_MEDIA_TYPE`, the request was not a multipart upload;
 * - `storage-unavailable`: 503 `MEDIA_STORAGE_UNAVAILABLE`, the storage provider failed; the answer names no provider.
 */
export type MediaFailure =
  | "signed-out"
  | "not-found"
  | "not-editable"
  | "gallery-unavailable"
  | "limit-reached"
  | "invalid-upload"
  | "invalid-update"
  | "payload-too-large"
  | "unsupported-media-type"
  | "storage-unavailable";

/** One media call: a value, or one of the documented refusals. */
export type MediaResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly failure: MediaFailure;
    };

/** One upload, as this server holds it after reading the browser's file (S4). */
export interface MediaUploadInput {
  readonly bytes: Uint8Array;
  readonly kind: MediaKind;
  /** The alt text the creator typed, already trimmed, or null when they typed none. */
  readonly alt: string | null;
}

/** One edit of one asset: its alt text, its gallery position, or one of them (S4). */
export interface MediaUpdateInput {
  /** `null` clears the alt text; omitted leaves it as it is. */
  readonly alt?: string | null;
  /** The zero-based index the photo moves to; omitted leaves the order as it is. */
  readonly position?: number;
}

/** The media routes of one session, as the creator's pages and actions call them. */
export interface MediaClient {
  /** `GET /invitations/:id/media`: the stored assets of one owned invitation, the main photo first (S4). */
  list(invitationId: string): Promise<MediaResult<MediaAsset[]>>;
  /** `POST /invitations/:id/media`: one photo, as multipart (S4). */
  upload(invitationId: string, upload: MediaUploadInput): Promise<MediaResult<MediaAsset>>;
  /** `PATCH /invitations/:id/media/:assetId`: the alt text and/or the gallery position (S4). */
  update(
    invitationId: string,
    assetId: string,
    patch: MediaUpdateInput,
  ): Promise<MediaResult<MediaAsset>>;
  /** `DELETE /invitations/:id/media/:assetId`: the row is marked deleted, then the object is removed (S4). */
  remove(
    invitationId: string,
    assetId: string,
  ): Promise<MediaResult<{ readonly status: "deleted" }>>;
}

/** The client's own cookie names, mirrored from `api-client.ts` by its exported helper. */
const INVITATIONS = "/invitations";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value can name an invitation or an asset: the only shape either id has (S4). */
export function isMediaId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** An ISO-8601 instant as the API serializes it (`Date#toISOString`). */
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

/** A positive whole number of pixels: the width or height a layout reserves (S4). */
function isPixelSize(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Whether a value is an absolute `http`/`https` URL without credentials, which is the only shape the API's own
 * `/media/<assetId>` URL has. A relative path or any other scheme never becomes the `src` of a page.
 */
export function isAbsoluteMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return false;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    url.username === "" &&
    url.password === ""
  );
}

function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && (MEDIA_KINDS as readonly string[]).includes(value);
}

/** Whether an alt text is one the API's own column can hold, or null (S4). */
function isMediaAlt(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && [...value].length <= MEDIA_ALT_MAX_LENGTH);
}

/**
 * One asset of a success body, or undefined when it breaks the documented contract. Only the fields the editor
 * renders are read, and an extra key never reaches a page.
 */
export function parseMediaAsset(value: unknown): MediaAsset | undefined {
  const asset = record(value);

  if (asset === undefined) {
    return undefined;
  }

  const { id, kind, url, width, height, alt, position, createdAt } = asset;

  if (
    !isMediaId(id) ||
    !isMediaKind(kind) ||
    !isAbsoluteMediaUrl(url) ||
    !isPixelSize(width) ||
    !isPixelSize(height) ||
    !isMediaAlt(alt) ||
    !(
      position === null ||
      (typeof position === "number" && Number.isSafeInteger(position) && position >= 0)
    ) ||
    !isTimestamp(createdAt)
  ) {
    return undefined;
  }

  return { id, kind, url, width, height, alt, position, createdAt };
}

/** The assets of one read, refused whole when any entry is not the documented shape. */
export function parseMediaAssets(value: unknown): MediaAsset[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const assets: MediaAsset[] = [];
  for (const item of value) {
    const asset = parseMediaAsset(item);
    if (asset === undefined) {
      return undefined;
    }
    assets.push(asset);
  }
  return assets;
}

/** The answer of a removal (S4): nothing about the asset that was removed is echoed back. */
export function parseDeletedMedia(value: unknown): { readonly status: "deleted" } | undefined {
  return record(value)?.status === "deleted" ? { status: "deleted" } : undefined;
}

/** Whether a file size is inside the API's 10 MB bound, checked before the file is read or sent (S4). */
export function isMediaUploadWithinBound(byteSize: unknown): boolean {
  return (
    typeof byteSize === "number" &&
    Number.isInteger(byteSize) &&
    byteSize > 0 &&
    byteSize <= MAX_MEDIA_UPLOAD_BYTES
  );
}

/** The statuses whose body this client reads: a success, and every refusal it maps instead of throwing. */
const readsBody = (status: number): boolean =>
  (status >= 200 && status <= 299) ||
  status === 400 ||
  status === 404 ||
  status === 409 ||
  status === 413 ||
  status === 415 ||
  status === 503;

const CODE_FAILURES: Readonly<Record<string, MediaFailure>> = {
  MEDIA_NOT_FOUND: "not-found",
  INVITATION_NOT_EDITABLE: "not-editable",
  GALLERY_NOT_AVAILABLE: "gallery-unavailable",
  MEDIA_LIMIT_REACHED: "limit-reached",
  INVALID_MEDIA_UPLOAD: "invalid-upload",
  INVALID_MEDIA_UPDATE: "invalid-update",
  PAYLOAD_TOO_LARGE: "payload-too-large",
  UNSUPPORTED_MEDIA_TYPE: "unsupported-media-type",
  MEDIA_STORAGE_UNAVAILABLE: "storage-unavailable",
};

/** The refusal statuses whose body names a documented code; every other status is a client error. */
const REFUSAL_STATUSES = new Set([400, 404, 409, 413, 415, 503]);

const SIGNED_OUT: MediaResult<never> = { ok: false, failure: "signed-out" };
const NOT_FOUND: MediaResult<never> = { ok: false, failure: "not-found" };

/** The `code` of a refusal body: only a member of the fixed set is read, never the message. */
function refusalOf(
  text: string | undefined,
  status: number,
  uncoded: MediaFailure | undefined,
): MediaResult<never> | undefined {
  let body: unknown;

  try {
    body = JSON.parse(text ?? "");
  } catch {
    return undefined;
  }

  if (!REFUSAL_STATUSES.has(status)) {
    return undefined;
  }

  const code = record(body)?.code;

  if (typeof code === "string" && Object.hasOwn(CODE_FAILURES, code)) {
    return { ok: false, failure: CODE_FAILURES[code] as MediaFailure };
  }

  // A refusal without a code this deployment knows keeps the meaning of its status.
  if (status === 413) {
    return { ok: false, failure: "payload-too-large" };
  }
  if (status === 415) {
    return { ok: false, failure: "unsupported-media-type" };
  }
  if (status === 404) {
    return NOT_FOUND;
  }
  return uncoded === undefined ? undefined : { ok: false, failure: uncoded };
}

/**
 * Builds the multipart body of one upload (S4). The single file part is named `photo` and declared
 * `application/octet-stream`, and its bytes are the ones the browser sent: no browser filename, no browser MIME, and
 * no client-side conversion reaches the API, which decides the format from the magic bytes.
 */
export function mediaUploadForm(upload: MediaUploadInput): FormData {
  const form = new FormData();

  form.set("kind", upload.kind);
  if (upload.alt !== null && upload.alt !== "") {
    form.set("alt", upload.alt);
  }
  form.set(
    "file",
    new Blob([upload.bytes as BlobPart], { type: "application/octet-stream" }),
    "photo",
  );

  return form;
}

/**
 * A stateless client of the media routes. `readCookieHeader` supplies the current request's `Cookie` header at each
 * call; only Better Auth's cookies are forwarded (`sessionCookieHeader`), and nothing is kept between calls. An id
 * that is not a UUID names nothing, so no request is made.
 */
export function createMediaClient(
  options: ApiClientOptions,
  readCookieHeader: () => Promise<string | null | undefined>,
): MediaClient {
  async function call<T>(
    method: "DELETE" | "GET" | "PATCH" | "POST",
    path: string,
    request: { body?: unknown; multipart?: FormData; timeoutMs?: number; uncoded?: MediaFailure },
    parse: (value: unknown) => T | undefined,
  ): Promise<MediaResult<T>> {
    const { uncoded, ...sendable } = request;
    const cookie = sessionCookieHeader(await readCookieHeader());

    if (cookie === undefined) {
      return SIGNED_OUT;
    }

    const { status, text } = await sendApiRequest(
      options,
      { cookie, method, path, ...sendable },
      readsBody,
    );

    if (status >= 200 && status <= 299) {
      let payload: unknown;
      try {
        payload = JSON.parse(text ?? "");
      } catch {
        payload = undefined;
      }

      const value = parse(payload);
      if (value === undefined) {
        throw new ApiClientError("invalid-response", status);
      }
      return { ok: true, value };
    }

    if (status === 401) {
      return SIGNED_OUT;
    }

    const failure = refusalOf(text, status, uncoded);

    if (failure !== undefined) {
      return failure;
    }

    throw new ApiClientError(status >= 500 ? "unavailable" : "rejected", status);
  }

  /** The path of one media route; an id that is not a UUID names nothing, so no request is made. */
  function mediaPath(invitationId: string, assetId?: string): string | undefined {
    if (!isMediaId(invitationId)) {
      return undefined;
    }
    if (assetId === undefined) {
      return `${INVITATIONS}/${invitationId}/media`;
    }
    return isMediaId(assetId) ? `${INVITATIONS}/${invitationId}/media/${assetId}` : undefined;
  }

  return {
    async list(invitationId: string): Promise<MediaResult<MediaAsset[]>> {
      const path = mediaPath(invitationId);

      return path === undefined ? NOT_FOUND : call("GET", path, {}, parseMediaAssets);
    },

    async upload(invitationId: string, upload: MediaUploadInput): Promise<MediaResult<MediaAsset>> {
      const path = mediaPath(invitationId);

      if (path === undefined) {
        return NOT_FOUND;
      }
      // The same bound the API enforces, checked before a byte leaves this server (S4).
      if (!isMediaUploadWithinBound(upload.bytes.length)) {
        return { ok: false, failure: "payload-too-large" };
      }

      return call(
        "POST",
        path,
        { multipart: mediaUploadForm(upload), timeoutMs: MEDIA_UPLOAD_TIMEOUT_MS },
        parseMediaAsset,
      );
    },

    async update(
      invitationId: string,
      assetId: string,
      patch: MediaUpdateInput,
    ): Promise<MediaResult<MediaAsset>> {
      const path = mediaPath(invitationId, assetId);

      if (path === undefined) {
        return NOT_FOUND;
      }
      if (patch.alt === undefined && patch.position === undefined) {
        return { ok: false, failure: "invalid-update" };
      }

      const body = {
        ...(patch.alt === undefined ? {} : { alt: patch.alt }),
        ...(patch.position === undefined ? {} : { position: patch.position }),
      };

      return call("PATCH", path, { body, uncoded: "invalid-update" }, parseMediaAsset);
    },

    async remove(
      invitationId: string,
      assetId: string,
    ): Promise<MediaResult<{ readonly status: "deleted" }>> {
      const path = mediaPath(invitationId, assetId);

      return path === undefined ? NOT_FOUND : call("DELETE", path, {}, parseDeletedMedia);
    },
  };
}
