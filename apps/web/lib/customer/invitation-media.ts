import {
  type InvitationResult,
  isInvitationId,
  type OwnedInvitation,
} from "../server/invitations-api.ts";
import {
  isAbsoluteMediaUrl,
  isMediaId,
  MAX_GALLERY_PHOTOS,
  MAX_MEDIA_UPLOAD_BYTES,
  MEDIA_ALT_MAX_LENGTH,
  type MediaAsset,
  type MediaClient,
  type MediaFailure,
} from "../server/media-api.ts";
import {
  CUSTOMER_SIGN_IN_PATH,
  INVITATION_PATHS,
  invitationErrorTarget,
  invitationFailureTarget,
  invitationNoticeTarget,
} from "./invitations.ts";

/**
 * The creator's media actions (M8 S2, S3, S4): the «Subir foto» of the editor, the «Galería» section of a draft, and
 * the redirect each submitted form answers. The API owns the bytes, the format, the limits, the ownership, and the
 * package gate; this module reads the submitted form, refuses a file over the API's own 10 MB bound before it is read,
 * saves the main photo's URL through the content path the editor already uses, and maps every refusal to one Spanish
 * message of the page's own query. Nothing here logs: the wiring in `app/cuenta/invitaciones/_lib/media.ts` logs one
 * line per unexpected failure, with no alt text, file name, or id.
 */

/** The catalog key that grants the gallery; the owner read says whether this invitation's package has it (S3). */
export const GALLERY_FEATURE_KEY = "GALLERY";

/** The content property the main photo's URL is stored in, so every layout keeps working unchanged (S4). */
export const MAIN_PHOTO_FIELD = "mainPhoto";

/** One gallery photo as the «Galería» section renders it, with the two moves it can still make. */
export interface GalleryPhotoView {
  readonly id: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  /** The zero-based index among the stored gallery photos, which is what a move sends. */
  readonly position: number;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}

/** Everything the media part of a draft renders for one invitation. */
export interface MediaSectionView {
  readonly id: string;
  /** False while the invitation is archived, like the content form's read-only state (A3). */
  readonly editable: boolean;
  /** Whether the pinned package grants `GALLERY`; only then does the draft offer the section (S3). */
  readonly galleryAvailable: boolean;
  /** The stored main photo as an absolute URL, or null when there is none or it is not one to show. */
  readonly mainPhotoUrl: string | null;
  /** The gallery photos in the API's order, each with its moves. */
  readonly photos: readonly GalleryPhotoView[];
  /** How many photos the gallery may hold, and whether this one already holds them all (S4). */
  readonly photoLimit: number;
  readonly limitReached: boolean;
  /** The longest alt text the API stores, so no field offers one it would refuse (S4). */
  readonly altMaxLength: number;
}

/** The stored main photo of a draft, when it is an absolute `http`/`https` URL a page can render. */
export function mainPhotoUrl(content: Record<string, unknown>): string | null {
  const value = Object.hasOwn(content, MAIN_PHOTO_FIELD) ? content[MAIN_PHOTO_FIELD] : undefined;

  return isAbsoluteMediaUrl(value) ? value : null;
}

/**
 * The media section of one invitation (S2, S3, S4). `assets` is the owner's media read; without it the gallery is
 * shown empty rather than guessed, and a photo the API did not answer is never invented. Only the photos the read
 * calls `gallery` render in the section, in the order the API already returned them.
 */
export function mediaSectionView(
  invitation: OwnedInvitation,
  assets: readonly MediaAsset[] | undefined,
): MediaSectionView {
  const photos = (assets ?? [])
    .filter((asset) => asset.kind === "gallery")
    .map((asset, index, gallery) => ({
      id: asset.id,
      url: asset.url,
      width: asset.width,
      height: asset.height,
      alt: asset.alt ?? "",
      position: asset.position ?? index,
      canMoveUp: index > 0,
      canMoveDown: index < gallery.length - 1,
    }));

  return {
    id: invitation.id,
    editable: invitation.status !== "ARCHIVED",
    galleryAvailable: invitation.availableFeatures.includes(GALLERY_FEATURE_KEY),
    mainPhotoUrl: mainPhotoUrl(invitation.content),
    photos,
    photoLimit: MAX_GALLERY_PHOTOS,
    limitReached: photos.length >= MAX_GALLERY_PHOTOS,
    altMaxLength: MEDIA_ALT_MAX_LENGTH,
  };
}

/** Both clients one media action needs: the media routes, and the content path the editor already saves through. */
export interface MediaActionsApi extends MediaClient {
  get(invitationId: string): Promise<InvitationResult<OwnedInvitation>>;
  replaceContent(
    invitationId: string,
    content: Record<string, unknown>,
  ): Promise<InvitationResult<OwnedInvitation>>;
}

/**
 * The Spanish error code each refusal travels as (M8 S4). The page's copy module turns the code back into one
 * sentence, so no API message and no English text ever reaches the creator.
 */
const FAILURE_CODES = {
  "not-found": "media-not-found",
  "not-editable": "not-editable",
  "gallery-unavailable": "gallery-unavailable",
  "limit-reached": "media-limit-reached",
  "invalid-upload": "media-invalid-upload",
  "invalid-update": "media-invalid-update",
  "payload-too-large": "media-too-large",
  "unsupported-media-type": "media-unsupported-type",
  "storage-unavailable": "media-storage-unavailable",
} as const;

/** Where one media refusal comes back to: an ended session to sign-in, everything else to the draft's error code. */
function mediaFailureTarget(path: string, failure: MediaFailure): string {
  return failure === "signed-out"
    ? CUSTOMER_SIGN_IN_PATH
    : invitationErrorTarget(path, FAILURE_CODES[failure]);
}

/** The invitation id of one submitted media form, or undefined when it is missing or is not a UUID. */
function invitationIdOf(form: FormData): string | undefined {
  const id = form.get("id");

  return typeof id === "string" && isInvitationId(id) ? id : undefined;
}

/** The asset id of one submitted media form, or undefined when it is missing or is not a UUID. */
function assetIdOf(form: FormData): string | undefined {
  const assetId = form.get("assetId");

  return typeof assetId === "string" && isMediaId(assetId) ? assetId : undefined;
}

/** The text one submitted field carries, or undefined when it is absent or not text. */
function textOf(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/** The normalized alt text of one submitted form: the text trimmed, blank meaning "none" (S4). */
function altOf(form: FormData): string | null {
  const text = textOf(form, "alt")?.trim() ?? "";

  return text === "" ? null : text;
}

/** One submitted file, when it is a file the browser actually sent and not an empty one (S4). */
function uploadedFile(form: FormData): File | undefined {
  const file = form.get("file");

  return file instanceof File && file.size > 0 ? file : undefined;
}

/**
 * Reads the bytes of one submitted photo, refusing the two cases the API would refuse anyway: a submission without a
 * file, and a file over 10 MB, which is refused before it is read so an oversized upload costs no memory. `undefined`
 * is the refusal, with the error code the creator sees.
 */
async function readUpload(
  form: FormData,
): Promise<{ bytes: Uint8Array } | { error: "media-invalid-upload" | "media-too-large" }> {
  const file = uploadedFile(form);

  if (file === undefined) {
    return { error: "media-invalid-upload" };
  }
  if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
    return { error: "media-too-large" };
  }

  return { bytes: new Uint8Array(await file.arrayBuffer()) };
}

/**
 * One upload of the main photo (S2, S4): `POST /invitations/:id/media` with `kind: main-photo`, and then the URL the
 * API answered is written into the template's own photo field through the content path the editor already saves with
 * (`PUT /invitations/:id/content`), so every layout keeps working unchanged. A failed content save keeps the stored
 * asset but reports its own refusal; nothing is invented and no earlier content key is dropped.
 */
export async function uploadMainPhoto(api: MediaActionsApi, form: FormData): Promise<string> {
  const id = invitationIdOf(form);

  if (id === undefined) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const upload = await readUpload(form);

  if ("error" in upload) {
    return invitationErrorTarget(path, upload.error);
  }

  const uploaded = await api.upload(id, { bytes: upload.bytes, kind: "main-photo", alt: null });

  if (!uploaded.ok) {
    return mediaFailureTarget(path, uploaded.failure);
  }

  const read = await api.get(id);

  if (!read.ok) {
    return invitationFailureTarget(path, read.failure);
  }

  const written = await api.replaceContent(id, {
    ...read.value.content,
    [MAIN_PHOTO_FIELD]: uploaded.value.url,
  });

  return written.ok
    ? invitationNoticeTarget(path, "photo-uploaded")
    : invitationFailureTarget(path, written.failure);
}

/**
 * One gallery photo (S3, S4): `POST /invitations/:id/media` with `kind: gallery` and the alt text the creator typed.
 * The API refuses the upload when the package does not grant `GALLERY` or the twelve-photo limit is reached, and the
 * page's own sentence names each of those refusals. An alt text over the API's bound is refused here, before a byte is
 * sent, so the creator learns it from the form instead of from a refused upload.
 */
export async function uploadGalleryPhoto(api: MediaActionsApi, form: FormData): Promise<string> {
  const id = invitationIdOf(form);

  if (id === undefined) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const alt = altOf(form);

  if (alt !== null && [...alt].length > MEDIA_ALT_MAX_LENGTH) {
    return invitationErrorTarget(path, "media-invalid-alt");
  }

  const upload = await readUpload(form);

  if ("error" in upload) {
    return invitationErrorTarget(path, upload.error);
  }

  const uploaded = await api.upload(id, { bytes: upload.bytes, kind: "gallery", alt });

  return uploaded.ok
    ? invitationNoticeTarget(path, "gallery-uploaded")
    : mediaFailureTarget(path, uploaded.failure);
}

/**
 * The alt text of one gallery photo (S4): `PATCH /invitations/:id/media/:assetId` with `alt`, which the API normalizes
 * (blank clears it). The bound is checked here too, so a paste over 120 characters never reaches the API.
 */
export async function saveGalleryAlt(api: MediaActionsApi, form: FormData): Promise<string> {
  const id = invitationIdOf(form);

  if (id === undefined) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const assetId = assetIdOf(form);

  if (assetId === undefined) {
    return invitationErrorTarget(path, "media-not-found");
  }

  const alt = altOf(form);

  if (alt !== null && [...alt].length > MEDIA_ALT_MAX_LENGTH) {
    return invitationErrorTarget(path, "media-invalid-alt");
  }

  const updated = await api.update(id, assetId, { alt });

  return updated.ok
    ? invitationNoticeTarget(path, "media-saved")
    : mediaFailureTarget(path, updated.failure);
}

/**
 * Moves one gallery photo one place up or down (S4): the API's `position` is the zero-based index the photo moves to,
 * so the move is computed from the owner's own read and never from the browser. The first photo cannot move up and the
 * last cannot move down; that request changes nothing and comes back to the section without a notice.
 */
export async function moveGalleryPhoto(api: MediaActionsApi, form: FormData): Promise<string> {
  const id = invitationIdOf(form);

  if (id === undefined) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const assetId = assetIdOf(form);
  const direction = textOf(form, "direction");

  if (assetId === undefined || (direction !== "up" && direction !== "down")) {
    return invitationErrorTarget(path, "media-not-found");
  }

  const read = await api.list(id);

  if (!read.ok) {
    return mediaFailureTarget(path, read.failure);
  }

  const gallery = read.value.filter((asset) => asset.kind === "gallery");
  const index = gallery.findIndex((asset) => asset.id === assetId);
  const target = direction === "up" ? index - 1 : index + 1;

  if (index === -1 || target < 0 || target >= gallery.length) {
    return path;
  }

  const moved = await api.update(id, assetId, { position: target });

  return moved.ok
    ? invitationNoticeTarget(path, "media-saved")
    : mediaFailureTarget(path, moved.failure);
}

/** Removes one gallery photo (S4): the row is marked deleted first, and the API's companion command cleans the object. */
export async function removeGalleryPhoto(api: MediaActionsApi, form: FormData): Promise<string> {
  const id = invitationIdOf(form);

  if (id === undefined) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const assetId = assetIdOf(form);

  if (assetId === undefined) {
    return invitationErrorTarget(path, "media-not-found");
  }

  const removed = await api.remove(id, assetId);

  return removed.ok
    ? invitationNoticeTarget(path, "media-removed")
    : mediaFailureTarget(path, removed.failure);
}
