/**
 * The album of the guests' photos (F8; S2.8, L11.4, L11.5). The API owns the gate, the bytes, the limits, and the
 * moderation: this module holds only what the guest page says about the album and how the shared features block reads
 * it. The photos arrive as the API answered them — the published ones, newest first, at most 60 — so nothing here sorts,
 * filters, or invents a photo.
 *
 * Two rules decide every text: the count is the published count the API answered, and the alt text of a photo names the
 * uploader only because that is the one fact the read carries. A photo whose uploader left no name is announced as one
 * of the album's photos instead of by a file name or a URL.
 */

/** The most photos one public read answers, mirrored from the API's own bound (L11.4). */
export const GUEST_ALBUM_MAX_PHOTOS = 60;

/** The widest uploader name a guest may type, mirrored from the API's own column (L11.1). */
export const GUEST_ALBUM_UPLOADER_NAME_MAX_LENGTH = 60;

export const GUEST_ALBUM_SECTION_TITLE = "Nuestras fotos";

export const GUEST_ALBUM_SECTION_HINT = "Comparte las fotos que tomes durante la fiesta.";

/** The one action of the card: a plain multipart form that works with no client script (L11.5). */
export const GUEST_ALBUM_UPLOAD_LABEL = "Subir mis fotos";

export const GUEST_ALBUM_FILE_LABEL = "Tu foto";

/** The formats and the size the API accepts, stated once so the field and its hint agree with the refusals. */
export const GUEST_ALBUM_ACCEPT = "image/jpeg,image/png,image/webp";

export const GUEST_ALBUM_FILE_HINT = "JPG, PNG o WebP, dentro del tamaño que admite la invitación.";

export const GUEST_ALBUM_UPLOADER_LABEL = "Tu nombre (opcional)";

export const GUEST_ALBUM_UPLOADER_HINT = "Así sabrán quién subió la foto.";

export const GUEST_ALBUM_UPLOADER_PLACEHOLDER = "Nombre";

/** What a granted album with nothing published says, so the card invites its first photo instead of an empty grid. */
export const GUEST_ALBUM_EMPTY_NOTE = "Todavía no hay fotos publicadas. ¡Sube la primera!";

/** The note of an album the invitation's expiry closed (S2, L11.5): the photos stay and the form goes. */
export const GUEST_ALBUM_CLOSED_NOTE = "El álbum de fotos se cerró cuando terminó la invitación.";

/** The description of a photo whose uploader left no name. */
export const GUEST_ALBUM_PHOTO_ALT_FALLBACK = "Foto del álbum de invitados";

/** One published photo as the public read answers it: the served URL and the optional name its uploader typed. */
export interface GuestAlbumPhotoValue {
  readonly url: string;
  /** The name the guest typed, already trimmed by the API, or null when they left it empty. */
  readonly uploaderName: string | null;
}

/**
 * The album of one invitation as a guest page reads it (L11.4): the published photos newest first — at most 60 — and how
 * many published photos the invitation holds in total. Pending and hidden photos are never here, so the page cannot
 * leak one even by accident.
 */
export interface GuestAlbumValue {
  readonly photos: readonly GuestAlbumPhotoValue[];
  readonly count: number;
}

/**
 * The count line under the grid (L11.5): the published photos the invitation holds, in the singular when it is one. It
 * counts the album, never the page: a guest reading the newest 60 of a larger album still reads the real total.
 */
export function guestAlbumCount(count: number): string {
  return count === 1 ? "1 foto publicada" : `${count} fotos publicadas`;
}

/**
 * The alt text of one published photo (L11.5): the uploader's own words when they left a name, and one description of
 * the album otherwise. Both are plain text, so a name that looks like markup is announced as the characters the guest
 * typed.
 */
export function guestAlbumPhotoAlt(uploaderName: string | null): string {
  const name = uploaderName?.trim() ?? "";

  return name === "" ? GUEST_ALBUM_PHOTO_ALT_FALLBACK : `Foto que subió ${name}`;
}
