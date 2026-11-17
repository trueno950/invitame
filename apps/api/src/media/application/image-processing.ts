import type { ImageFormat } from "../domain/media-asset";

// The image-processing port (M8 S4). `metadata` reads only the header, and the use case refuses an image over
// 8000 px a side from it before anything is decoded; `toWebp` re-encodes the accepted image at the dimensions the
// domain computed, with its metadata stripped so no EXIF or GPS location reaches a guest. The sharp adapter lives
// in infrastructure; the application never imports the image library.

/** What the header of an uploaded image declares, with the visible (orientation-applied) dimensions. */
export interface ImageMetadata {
  format: ImageFormat;
  /** The width a viewer sees: an EXIF-rotated photo answers its rotated sides. */
  width: number;
  /** The height a viewer sees. */
  height: number;
  /** The EXIF orientation tag, or null when the image carries none. */
  orientation: number | null;
}

/** One re-encoded image: the WebP bytes and the dimensions they were written at. */
export interface ProcessedImage {
  bytes: Buffer;
  width: number;
  height: number;
}

/** The image-processing port (S4). Both operations are async and may fail for bytes that are not an image. */
export interface ImageProcessor {
  /** Reads the format and dimensions from the header, without decoding the pixel data. */
  metadata(bytes: Uint8Array): Promise<ImageMetadata>;

  /** Re-encodes the image as WebP at exactly `target`, applying its orientation and stripping metadata. */
  toWebp(bytes: Uint8Array, target: { width: number; height: number }): Promise<ProcessedImage>;
}

export const IMAGE_PROCESSOR = Symbol("ImageProcessor");

/**
 * The only error the processor throws. It never carries the library's message, which can echo a provider or a
 * buffer detail, and it is answered as a refused upload rather than as an operational failure.
 */
export class MediaProcessingError extends Error {
  constructor(readonly operation: "metadata" | "encode") {
    super(`Media processing ${operation} failed.`);
    this.name = "MediaProcessingError";
  }
}
