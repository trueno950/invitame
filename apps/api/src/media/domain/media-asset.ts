// Invitation media, domain rules (M8 S1, S4; M9 T13). The API accepts a photo only when its own bytes say it is a JPEG,
// PNG, or WebP — never the filename or the client's MIME — at most the configured upload size (10 MB initially) and at
// most 8000 px per side, and then stores it re-encoded as WebP with its longest side at most 2000 px. Nothing here
// touches the filesystem, the database, or the image library: the format, size, and dimension rules are pure, and the
// processing adapter that reads the dimensions and writes the WebP output lives in infrastructure.
//
// The three numbers an administrator may change — the upload size, the gallery cap, and the stored-asset cap — are
// passed in by the caller, which reads them from the settings row at the moment it checks them (S5, S8). The constants
// below are the values the migration seeds, so a test or a composition without a settings module behaves exactly as the
// product did before the panel existed.
//
// Binaries never reach PostgreSQL (AGENTS.md): the storage key is `invitations/<invitationId>/<assetId>.webp`,
// built from validated ids only, so no user-supplied name can escape the prefix or name a path.

/** The two kinds of invitation media (S4). */
export const MEDIA_KINDS = ["main-photo", "gallery"] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

/** The one MIME the API stores and serves for every asset: the re-encoded WebP (S4). */
export const MEDIA_MIME = "image/webp";

/**
 * The largest upload the API accepts while no administrator has changed the panel, in bytes: 10 MB (S4). The live
 * value is the settings row's `maxUploadMegabytes`, read by the upload use case on every request (M9 T13; S5, S8).
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The largest accepted input side, in pixels (S4). Checked from metadata, before the image is decoded. */
export const MAX_INPUT_DIMENSION = 8000;

/**
 * The pixel cap handed to the image library, so a decompression bomb is refused by the library too: 8000 x 8000,
 * the largest image the side limit can admit (S4).
 */
export const MAX_INPUT_PIXELS = MAX_INPUT_DIMENSION * MAX_INPUT_DIMENSION;

/** The longest side of a stored image, in pixels (S4). */
export const MAX_OUTPUT_DIMENSION = 2000;

/** How many gallery photos one invitation may hold while the panel is unchanged (S4; M9 T13). */
export const MAX_GALLERY_PHOTOS = 12;

/** How many stored assets one invitation may hold, both kinds together, while the panel is unchanged (S4; M9 T13). */
export const MAX_STORED_ASSETS = 40;

/**
 * The two caps an upload is checked against, read from the settings row when the row is written (M9 T13; S5, S8). A
 * lowered cap only refuses the next addition: the photos an invitation already stores stay exactly as they are.
 */
export interface MediaLimits {
  readonly galleryPhotoLimit: number;
  readonly storedAssetLimit: number;
}

/** The limits the migration seeds, so a composition without a settings module behaves as the product did before it. */
export const INITIAL_MEDIA_LIMITS: MediaLimits = {
  galleryPhotoLimit: MAX_GALLERY_PHOTOS,
  storedAssetLimit: MAX_STORED_ASSETS,
};

/** The longest alt text, in characters, matching the `MediaAsset.alt` column (S4). */
export const MAX_ALT_LENGTH = 120;

/**
 * The largest request body the multipart upload route accepts: 16 MB, the widest configured upload (15 MB, the
 * `maxUploadMegabytes` bound) plus room for the boundary, the `kind` and `alt` fields, and the part headers. This is the
 * static cap of that one route — it bounds the bytes the process reads before any check runs — while the per-upload
 * size the settings state is enforced by `validateMediaUpload`. Every other route keeps its own, smaller JSON limit.
 */
export const MAX_UPLOAD_REQUEST_BYTES = 16 * 1024 * 1024;

/** The prefix every media object lives under, so a cleanup can list exactly the objects it owns. */
export const MEDIA_STORAGE_PREFIX = "invitations/";

/**
 * How long an object under `invitations/` is left alone before the cleanup scan may call it an orphan (S4, A3). An
 * upload writes its object before it inserts the row, so an object with no row may simply be an upload in flight;
 * only one that is still unmatched after this long is abandoned. One hour is far longer than the put-to-insert
 * window of one request and far shorter than a human noticing a lost upload, and it is documented in
 * `docs/development/media-storage.md` and `docs/database/model.md`.
 */
export const MEDIA_ORPHAN_GRACE_MS = 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A storage key this API could have written: the prefix, two lower-case UUIDs, and the `.webp` suffix. Everything
 * else is refused before it reaches an adapter, so no key can traverse out of the root or name a foreign object.
 */
const STORAGE_KEY = new RegExp(
  `^${MEDIA_STORAGE_PREFIX}${UUID.source.slice(1, -1)}/` + `${UUID.source.slice(1, -1)}\\.webp$`,
);

/** The message a file that is not a JPEG, PNG, or WebP is refused with. */
export const MEDIA_FORMAT_ISSUE = "file must be a JPEG, PNG, or WebP image";

/**
 * The message a file over the configured upload size is refused with. It names the bound that refused it, so a
 * creator who is told «at most 15 MB» reads the limit the API actually applies (M9 T13; S5, S8).
 */
export function mediaSizeIssue(maxBytes: number): string {
  const megabytes = Math.round(maxBytes / (1024 * 1024));

  return `file must be at most ${megabytes} MB`;
}

/** The message a file over the initial 10 MB is refused with, which is the panel's seeded value. */
export const MEDIA_SIZE_ISSUE = mediaSizeIssue(MAX_UPLOAD_BYTES);

/** The message an unknown kind is refused with. */
export const MEDIA_KIND_ISSUE = "kind must be main-photo or gallery";

/** The message alt text over 120 characters is refused with. */
export const MEDIA_ALT_ISSUE = "alt must be at most 120 characters";

/** The message dimensions over 8000 px a side are refused with. */
export const MEDIA_DIMENSIONS_ISSUE = "image dimensions must not exceed 8000 px per side";

/** The message non-positive dimensions are refused with. */
export const MEDIA_DIMENSIONS_POSITIVE_ISSUE = "image dimensions must be positive";

/** The image formats the API accepts from a creator, as detected from the bytes. */
export const IMAGE_FORMATS = ["jpeg", "png", "webp"] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** Whether a value is one exact member of the kind allow-list; nothing is case-folded. */
export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && (MEDIA_KINDS as readonly string[]).includes(value);
}

/** Whether a value is a storage key this API wrote, as the adapters require before touching an object. */
export function isStorageKey(value: unknown): value is string {
  return typeof value === "string" && STORAGE_KEY.test(value);
}

/**
 * The storage key of one asset (S4): the prefix, the invitation id, and the asset id, all validated UUIDs. A
 * non-UUID id is a programming error and throws, because a creator never supplies either id in a key.
 */
export function storageKeyFor(invitationId: string, assetId: string): string {
  if (!UUID.test(invitationId) || !UUID.test(assetId)) {
    throw new RangeError("A media storage key is built from UUIDs only.");
  }

  return `${MEDIA_STORAGE_PREFIX}${invitationId}/${assetId}.webp`;
}

/**
 * The image format the bytes themselves declare (S4), or null for anything else. Only the signature is read: a
 * JPEG starts with `FF D8 FF`, a PNG with its eight-byte signature, and a WebP with `RIFF`, four size bytes, and
 * `WEBP`. A client's filename or `Content-Type` never reaches this function.
 */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "webp";
  }

  return null;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }

  return signature.every((byte, index) => bytes[index] === byte);
}

/** A validated upload: the detected format, the kind, and the normalized alt text. */
export interface MediaUploadValue {
  readonly format: ImageFormat;
  readonly kind: MediaKind;
  readonly alt: string | null;
}

/** The upload a request asked for, validated, or every issue that refuses it. */
export type MediaUploadValidation =
  | { readonly ok: true; readonly value: MediaUploadValue }
  | { readonly ok: false; readonly issues: string[] };

/**
 * Validates one upload (S4; M9 T13): the kind must be allow-listed, the alt text must be bounded and normalizes to null
 * when blank, and the bytes must be non-empty, at most `maxBytes` (the settings row's upload size, or the initial
 * 10 MB), and a JPEG, PNG, or WebP by signature. The size is read before the signature, so an oversized payload is
 * refused without reading further. A refused upload stores nothing and writes no object. Dimensions are checked
 * separately, from metadata, by `validateImageDimensions`.
 */
export function validateMediaUpload(input: {
  readonly bytes: Uint8Array;
  readonly kind: unknown;
  readonly alt: unknown;
  /** The widest upload the settings allow, in bytes; the seeded 10 MB when the caller passes nothing. */
  readonly maxBytes?: number;
}): MediaUploadValidation {
  const issues: string[] = [];
  const maxBytes = input.maxBytes ?? MAX_UPLOAD_BYTES;

  if (!isMediaKind(input.kind)) {
    issues.push(MEDIA_KIND_ISSUE);
  }

  const alt = normalizeMediaAlt(input.alt);
  if (!alt.ok) {
    issues.push(alt.issue);
  }

  const sizeOk = input.bytes.length > 0 && input.bytes.length <= maxBytes;
  if (!sizeOk) {
    issues.push(mediaSizeIssue(maxBytes));
  }

  const format = detectImageFormat(input.bytes);
  if (format === null) {
    issues.push(MEDIA_FORMAT_ISSUE);
  }

  if (!alt.ok || !isMediaKind(input.kind) || format === null || !sizeOk) {
    return { ok: false, issues };
  }

  return { ok: true, value: { format, kind: input.kind, alt: alt.alt } };
}

export type AltNormalization =
  | { readonly ok: true; readonly alt: string | null }
  | { readonly ok: false; readonly issue: string };

/**
 * Normalizes alt text (S4): null, undefined, and a blank string mean "no alt text" and store null; a string is
 * trimmed and counted in characters, so an accented or emoji value cannot overflow the column. A non-string is
 * refused with the same message as an overlong one, because both are values the column cannot hold.
 */
export function normalizeMediaAlt(value: unknown): AltNormalization {
  if (value === null || value === undefined) {
    return { ok: true, alt: null };
  }
  if (typeof value !== "string") {
    return { ok: false, issue: MEDIA_ALT_ISSUE };
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, alt: null };
  }
  if ([...trimmed].length > MAX_ALT_LENGTH) {
    return { ok: false, issue: MEDIA_ALT_ISSUE };
  }

  return { ok: true, alt: trimmed };
}

/**
 * Validates the dimensions read from the image metadata, before the image is decoded (S4): every side is positive
 * and at most 8000 px. A refused image is never processed, so a decompression bomb costs one header read.
 */
export function validateImageDimensions(metadata: {
  readonly width: number;
  readonly height: number;
}): string[] {
  if (
    !Number.isInteger(metadata.width) ||
    !Number.isInteger(metadata.height) ||
    metadata.width < 1 ||
    metadata.height < 1
  ) {
    return [MEDIA_DIMENSIONS_POSITIVE_ISSUE];
  }
  if (metadata.width > MAX_INPUT_DIMENSION || metadata.height > MAX_INPUT_DIMENSION) {
    return [MEDIA_DIMENSIONS_ISSUE];
  }

  return [];
}

/**
 * The stored dimensions of one processed image (S4): the source scaled so its longest side is at most 2000 px,
 * the aspect ratio kept, and every side at least 1 px. The scale is computed here, in the domain, so the
 * processing adapter writes exactly the output the contract states instead of choosing one of its own.
 */
export function outputDimensions(
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  const longest = Math.max(width, height);

  if (longest <= MAX_OUTPUT_DIMENSION) {
    return { width, height };
  }

  const scale = MAX_OUTPUT_DIMENSION / longest;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
