import {
  detectImageFormat,
  type ImageFormat,
  MEDIA_FORMAT_ISSUE,
  mediaSizeIssue,
} from "./media-asset";

// The album of a guest's photos (F8; S2.8, L11.1, L11.3). Six pure rules live here, and none of them reads a table, a
// clock, a request, a session, or a provider:
//
// - the three states of one photo: PENDING until the owner publishes it, PUBLISHED while a guest may see it, and HIDDEN
//   when the owner took it down again; a photo never returns to PENDING;
// - the three caps: at most 300 photos per invitation that are PENDING or PUBLISHED (hiding one frees its place), at
//   most 100 of them PENDING at once, and at most 60 published ones per public read;
// - the uploader name: optional, plain text, trimmed, at most 60 characters, and free of the control and format
//   characters a text column cannot store or that would hide part of the name;
// - the bytes a guest may upload: the same JPEG, PNG, or WebP allow-list and the same configured size the owner's own
//   uploads use, both by the file's own signature and never by the filename or the client's MIME type;
// - the retention of a photo the owner never published or took down: it is retired 30 days after it entered its current
//   state, which is what `pnpm media:cleanup` reads (L11.6);
// - the false-instead-of-throw answer for a value the database would refuse, so a refusal is a 400 or a 409 and never a
//   server fault.
//
// The binaries never reach this module: a photo is a row that names its object, and the re-encoding, the dimension
// bounds, and the metadata stripping are the existing media pipeline's (`infrastructure/sharp-image-processor.ts`),
// reused unchanged so a guest's photo is processed exactly like the owner's own gallery.

/** The three states of one guest photo (L11.1, L11.6). */
export const GUEST_PHOTO_STATUSES = ["PENDING", "PUBLISHED", "HIDDEN"] as const;

export type GuestPhotoStatus = (typeof GUEST_PHOTO_STATUSES)[number];

/**
 * The states that count toward an invitation's album cap (L26): a photo waiting for review and one a guest may see. A
 * HIDDEN photo takes no place, so hiding one frees room for the next upload, and nothing is deleted to make space.
 */
export const GUEST_PHOTO_COUNTED_STATUSES = ["PENDING", "PUBLISHED"] as const;

/**
 * The most photos one invitation may hold that count toward the album's cap (L11.3, L26): the pending queue and the
 * published ones together. The cap is counted inside the transaction that writes the row, so two concurrent uploads
 * cannot both take the last slot; hiding a photo takes it out of the count, and only the media retention cleanup ever
 * removes a row.
 */
export const GUEST_PHOTO_MAX_STORED = 300;

/**
 * The most photos one invitation may have waiting for the owner's review at once (L26). The album takes anonymous
 * uploads, so the pending queue is bounded apart from the total cap: filling it refuses the next upload with its own
 * code instead of spending the invitation's whole album on photos nobody approved. Publishing one empties a place.
 */
export const GUEST_PHOTO_MAX_PENDING = 100;

/** The most published photos one public read answers (L11.4): the newest 60 of one invitation. */
export const GUEST_PHOTO_PUBLIC_MAX = 60;

/**
 * The most photos the owner's moderation screen reads: the newest 500 of one invitation. The screen states a count per
 * tab, so one bounded page keeps it answerable however many photos an invitation collected.
 */
export const GUEST_PHOTO_OWNER_MAX = 500;

/** The widest uploader name a guest may type: the width of `GuestPhoto.uploaderName` (L11.1). */
export const GUEST_PHOTO_UPLOADER_NAME_MAX_LENGTH = 60;

/**
 * How long a photo the owner never published, or took down again, is kept before the media retention cleanup removes
 * it, its object included (L11.6). The clock starts when the photo entered its current state: `createdAt` while it is
 * PENDING, `reviewedAt` once it is HIDDEN. Thirty days is long enough for an owner to come back from a trip and review
 * the album, and short enough that nothing a guest uploaded is kept forever without being shown.
 */
export const GUEST_PHOTO_RETENTION_DAYS = 30;

export const GUEST_PHOTO_RETENTION_MS = GUEST_PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** The two states an owner may set: publishing a photo, or hiding it (L11.6). */
export const GUEST_PHOTO_REVIEW_STATES = ["PUBLISHED", "HIDDEN"] as const;

export type GuestPhotoReviewState = (typeof GUEST_PHOTO_REVIEW_STATES)[number];

/** The message an uploader name that is not a string is refused with. */
export const GUEST_PHOTO_UPLOADER_NAME_TYPE_ISSUE = "uploaderName must be a string";

/** The message a blank or too wide uploader name is refused with. */
export const GUEST_PHOTO_UPLOADER_NAME_LENGTH_ISSUE =
  "uploaderName must be between 1 and 60 characters";

/** The message an uploader name carrying a control or format character is refused with. */
export const GUEST_PHOTO_UPLOADER_NAME_CONTROL_ISSUE =
  "uploaderName must not contain control characters";

/** The message a state the owner may not set is refused with. */
export const GUEST_PHOTO_REVIEW_STATE_ISSUE = "status must be PUBLISHED or HIDDEN";

/**
 * The characters (`Cc`, `Cf`) a guest's name must not carry: U+0000 is the one PostgreSQL refuses outright, and a bidi
 * override or a zero-width character would make the name read as something the guest never typed.
 */
const CONTROL_CHARACTER = /[\p{Cc}\p{Cf}]/u;

/** Whether a value is one stored state, compared whole and case-sensitively. */
export function isGuestPhotoStatus(value: unknown): value is GuestPhotoStatus {
  return typeof value === "string" && (GUEST_PHOTO_STATUSES as readonly string[]).includes(value);
}

/** Whether a value is a state the owner may set: publishing a photo, or hiding it again (L11.6). */
export function isGuestPhotoReviewState(value: unknown): value is GuestPhotoReviewState {
  return (
    typeof value === "string" && (GUEST_PHOTO_REVIEW_STATES as readonly string[]).includes(value)
  );
}

/** The oldest state instant a photo may have and still be retired: now minus the retention window (L11.6). */
export function guestPhotoRetentionCutoff(now: Date): Date {
  return new Date(now.getTime() - GUEST_PHOTO_RETENTION_MS);
}

/** One stored photo, as the database holds it. `storageKey` never leaves the API. */
export interface GuestPhotoRecord {
  readonly id: string;
  readonly invitationId: string;
  readonly storageKey: string;
  readonly status: GuestPhotoStatus;
  readonly uploaderName: string | null;
  readonly createdAt: Date;
  /** When the owner published or hid the photo; null while it is PENDING (L11.1). */
  readonly reviewedAt: Date | null;
}

/** One photo as the owner's moderation screen reads it: its row, its optional uploader name, its state, and its date. */
export interface GuestPhotoOwnerView {
  readonly id: string;
  readonly uploaderName: string | null;
  readonly status: GuestPhotoStatus;
  readonly createdAt: Date;
  readonly reviewedAt: Date | null;
}

/** What one accepted upload stores; the use case validates it before the write. */
export interface GuestPhotoUploadValues {
  readonly format: ImageFormat;
  readonly uploaderName: string | null;
}

export type GuestPhotoUploadValidation =
  | { readonly ok: true; readonly value: GuestPhotoUploadValues }
  | { readonly ok: false; readonly issues: string[] };

/**
 * The upload one guest asked for (F8; L11.3): the bytes by their own signature, the configured size, and the optional
 * uploader name. The size is read before the signature, so an oversized payload is refused without reading further, and
 * every issue is reported at once. Dimensions are checked separately, from metadata, by the existing
 * `validateImageDimensions`; a refused upload stores nothing and writes no object.
 */
export function validateGuestPhotoUpload(input: {
  readonly bytes: Uint8Array;
  readonly uploaderName: unknown;
  /** The widest upload the settings allow, in bytes, read by the caller at the moment it checks it. */
  readonly maxBytes: number;
}): GuestPhotoUploadValidation {
  const issues: string[] = [];
  const name = normalizeGuestPhotoUploaderName(input.uploaderName);

  if (!name.ok) {
    issues.push(...name.issues);
  }

  const sizeOk = input.bytes.length > 0 && input.bytes.length <= input.maxBytes;
  if (!sizeOk) {
    issues.push(mediaSizeIssue(input.maxBytes));
  }

  const format = detectImageFormat(input.bytes);
  if (format === null) {
    issues.push(MEDIA_FORMAT_ISSUE);
  }

  if (!name.ok || format === null || !sizeOk) {
    return { ok: false, issues };
  }

  return { ok: true, value: { format, uploaderName: name.uploaderName } };
}

export type GuestPhotoUploaderNameNormalization =
  | { readonly ok: true; readonly uploaderName: string | null }
  | { readonly ok: false; readonly issues: string[] };

/**
 * Normalizes the name a guest typed (F8; L11.5): null, undefined, and a blank string mean "no name", and a string is
 * trimmed and counted in characters, so an accented or emoji value cannot overflow the column. A name is plain text and
 * stays exactly as the guest typed it — accents, emoji, and inner spaces included — except for the control and format
 * characters, which a text column cannot store (U+0000), or which would hide part of the name (a bidi override, a
 * zero-width character).
 */
export function normalizeGuestPhotoUploaderName(
  value: unknown,
): GuestPhotoUploaderNameNormalization {
  if (value === null || value === undefined) {
    return { ok: true, uploaderName: null };
  }
  if (typeof value !== "string") {
    return { ok: false, issues: [GUEST_PHOTO_UPLOADER_NAME_TYPE_ISSUE] };
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, uploaderName: null };
  }
  if ([...trimmed].some((character) => CONTROL_CHARACTER.test(character))) {
    return { ok: false, issues: [GUEST_PHOTO_UPLOADER_NAME_CONTROL_ISSUE] };
  }
  if ([...trimmed].length > GUEST_PHOTO_UPLOADER_NAME_MAX_LENGTH) {
    return { ok: false, issues: [GUEST_PHOTO_UPLOADER_NAME_LENGTH_ISSUE] };
  }

  return { ok: true, uploaderName: trimmed };
}
