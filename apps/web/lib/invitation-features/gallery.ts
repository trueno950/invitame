/**
 * The gallery of a guest invitation (M8 S3, S4). The API answers the photos in the creator's own order, each with the
 * absolute URL of the image, the dimensions a layout reserves so the page does not jump while it loads, and the alt
 * text the creator wrote. This module holds what the shared features block says about them: the section's title and
 * hint, and the one description a photo without alt text is given, because an image whose meaning is not written is
 * still better announced than read as its file name.
 */

/** What one gallery photo offers the block; the API's own shape, kept here so the block needs no client module. */
export interface GalleryPhoto {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string | null;
}

export const GALLERY_SECTION_TITLE = "Galería";

export const GALLERY_SECTION_HINT = "Algunos momentos de esta celebración.";

/** The description of a photo the creator left without alt text. */
export const GALLERY_FALLBACK_ALT = "Foto de la galería";

/**
 * The alt text of one photo: the creator's own words trimmed, or the fallback description when they wrote none. A
 * photo with nothing to say is announced as one of the gallery's photos instead of by a URL or a file name.
 */
export function galleryPhotoAlt(alt: string | null): string {
  const text = alt?.trim() ?? "";

  return text === "" ? GALLERY_FALLBACK_ALT : text;
}
