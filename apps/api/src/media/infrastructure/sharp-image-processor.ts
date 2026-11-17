import sharp, { type Metadata } from "sharp";
import {
  type ImageMetadata,
  type ImageProcessor,
  MediaProcessingError,
  type ProcessedImage,
} from "../application/image-processing";
import { type ImageFormat, MAX_INPUT_PIXELS, MAX_OUTPUT_DIMENSION } from "../domain/media-asset";

// The sharp adapter of the image-processing port (M8 S4). Metadata is read from the header only, with a pixel cap
// so a decompression bomb is refused by the library; the output is WebP at exactly the target the domain computed,
// with the EXIF orientation applied first and every metadata block stripped (sharp writes none unless asked, so
// EXIF, GPS, XMP, and the ICC profile never reach the stored file). A library failure becomes `MediaProcessingError`,
// which carries no library message.

/** The WebP quality of a stored image: visually lossless for a photo at 2000 px and far below the upload limit. */
const WEBP_QUALITY = 82;
/** Encoder effort: the middle of sharp's 0-6 range, so one upload costs a bounded amount of CPU. */
const WEBP_EFFORT = 4;

const ACCEPTED_FORMATS: ReadonlySet<string> = new Set<ImageFormat>(["jpeg", "png", "webp"]);

export class SharpImageProcessor implements ImageProcessor {
  async metadata(bytes: Uint8Array): Promise<ImageMetadata> {
    let metadata: Metadata;

    try {
      metadata = await sharp(bytes, {
        limitInputPixels: MAX_INPUT_PIXELS,
        failOn: "error",
      }).metadata();
    } catch {
      throw new MediaProcessingError("metadata");
    }

    const format = metadata.format;
    if (
      format === undefined ||
      !ACCEPTED_FORMATS.has(format) ||
      metadata.width === undefined ||
      metadata.height === undefined ||
      metadata.width < 1 ||
      metadata.height < 1
    ) {
      throw new MediaProcessingError("metadata");
    }

    const orientation = typeof metadata.orientation === "number" ? metadata.orientation : null;
    // EXIF orientations 5-8 rotate the stored pixels by a quarter turn: the visible sides are swapped.
    const rotated = orientation !== null && orientation >= 5;

    return {
      format: format as ImageFormat,
      width: rotated ? metadata.height : metadata.width,
      height: rotated ? metadata.width : metadata.height,
      orientation,
    };
  }

  async toWebp(
    bytes: Uint8Array,
    target: { width: number; height: number },
  ): Promise<ProcessedImage> {
    const width = Math.max(1, Math.min(target.width, MAX_OUTPUT_DIMENSION));
    const height = Math.max(1, Math.min(target.height, MAX_OUTPUT_DIMENSION));

    try {
      const output = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
        // Applying the orientation first makes the stored pixels match what the owner saw.
        .rotate()
        .resize(width, height, { fit: "fill" })
        .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
        .toBuffer();

      return { bytes: output, width, height };
    } catch {
      throw new MediaProcessingError("encode");
    }
  }
}
