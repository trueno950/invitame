import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";
import { MediaProcessingError } from "../application/image-processing";
import { MAX_OUTPUT_DIMENSION } from "../domain/media-asset";
import { SharpImageProcessor } from "./sharp-image-processor";

// The processing adapter (M8 S4): every fixture is built here with sharp, so no personal photo is ever committed.
// The output is WebP, its longest side is at most 2000 px, the aspect ratio is kept, and EXIF/GPS metadata is
// stripped, so a guest's download carries no location or camera information.

const processor = new SharpImageProcessor();

type WithMetadataOptions = Parameters<ReturnType<typeof sharp>["withMetadata"]>[0];

/** Camera EXIF with a location, as a phone writes it; sharp accepts the GPS block though its type does not name it. */
const CAMERA_EXIF = {
  IFD0: { Copyright: "invitame-test-fixture" },
  GPS: {
    GPSLatitudeRef: "N",
    GPSLatitude: "19/1 25/1 9400/100",
    GPSLongitudeRef: "W",
    GPSLongitude: "99/1 7/1 1200/100",
  },
} as unknown as NonNullable<WithMetadataOptions>["exif"];

/** A JPEG with camera metadata, including a location, as a phone camera would write it. */
async function jpegWithLocation(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#a33" } })
    .jpeg()
    .withMetadata({
      // sharp's typed `exif` object declares IFD0; the writer also accepts the GPS block, which is what a phone
      // camera writes and what the adapter must strip.
      exif: CAMERA_EXIF,
    })
    .toBuffer();
}

describe("sharp image processing (S4)", () => {
  it("re-encodes a JPEG to WebP at most 2000 px on its longest side", async () => {
    const source = await jpegWithLocation(3000, 2000);

    const metadata = await processor.metadata(source);
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 3000);
    assert.equal(metadata.height, 2000);

    const processed = await processor.toWebp(source, { width: 2000, height: 1333 });
    const output = await sharp(processed.bytes).metadata();

    assert.equal(output.format, "webp");
    assert.equal(output.width, 2000);
    assert.equal(output.height, 1333);
    assert.ok(Math.max(output.width ?? 0, output.height ?? 0) <= MAX_OUTPUT_DIMENSION);
  });

  it("strips EXIF and GPS metadata from the stored image", async () => {
    const source = await jpegWithLocation(800, 600);
    const sourceMetadata = await sharp(source).metadata();
    assert.ok(sourceMetadata.exif, "the fixture carries EXIF");

    const processed = await processor.toWebp(source, { width: 800, height: 600 });
    const output = await sharp(processed.bytes).metadata();

    assert.equal(output.exif, undefined);
    assert.equal(output.orientation, undefined);
    assert.equal(processed.bytes.includes(Buffer.from("Exif")), false);
    assert.equal(processed.bytes.includes(Buffer.from("GPS")), false);
    assert.equal(processed.bytes.includes(Buffer.from("invitame-test-fixture")), false);
  });

  it("accepts PNG and WebP input and never enlarges a small image", async () => {
    const png = await sharp({ create: { width: 40, height: 30, channels: 4, background: "#3a3" } })
      .png()
      .toBuffer();
    const webp = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#33a" } })
      .webp()
      .toBuffer();

    for (const [label, source, format] of [
      ["png", png, "png"],
      ["webp", webp, "webp"],
    ] as const) {
      const metadata = await processor.metadata(source);
      assert.equal(metadata.format, format, label);
      const processed = await processor.toWebp(source, { width: 40, height: 30 });
      const output = await sharp(processed.bytes).metadata();
      assert.equal(output.format, "webp", label);
      assert.equal(output.width, 40, label);
      assert.equal(output.height, 30, label);
    }
  });

  it("applies the EXIF orientation before scaling, so a rotated photo keeps its visible proportions", async () => {
    const source = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: "#333" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const metadata = await processor.metadata(source);

    // The stored pixels are 3000x1000, but orientation 6 shows them as 1000x3000: the visible sides are swapped.
    assert.equal(metadata.orientation, 6);
    assert.deepEqual(
      { width: metadata.width, height: metadata.height },
      { width: 1000, height: 3000 },
    );

    const processed = await processor.toWebp(source, { width: 667, height: 2000 });
    const output = await sharp(processed.bytes).metadata();
    assert.equal(output.width, 667);
    assert.equal(output.height, 2000);
  });

  it("refuses bytes that are not a readable image, without echoing the provider's message", async () => {
    const garbage = Buffer.from("this is not an image at all");

    await assert.rejects(processor.metadata(garbage), MediaProcessingError);
    await assert.rejects(
      processor.toWebp(garbage, { width: 10, height: 10 }),
      (error: unknown) => error instanceof MediaProcessingError && !error.message.includes("sharp"),
    );
  });
});
