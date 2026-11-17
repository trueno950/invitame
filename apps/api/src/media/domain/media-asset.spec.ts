import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import {
  detectImageFormat,
  isMediaKind,
  isStorageKey,
  MAX_ALT_LENGTH,
  MAX_GALLERY_PHOTOS,
  MAX_INPUT_DIMENSION,
  MAX_STORED_ASSETS,
  MAX_UPLOAD_BYTES,
  outputDimensions,
  storageKeyFor,
  validateImageDimensions,
  validateMediaUpload,
} from "./media-asset";

// The upload rules of M8 (S4). Magic bytes decide the format, never the filename or the client's MIME; the size
// and the dimensions are checked before anything is decoded; alt text is optional and bounded; and the storage
// key is built only from validated ids.

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);
const PDF = Uint8Array.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x00, 0x00,
]);

function withPadding(magic: Uint8Array, size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(magic);
  return bytes;
}

describe("media upload validation (S4)", () => {
  it("accepts JPEG, PNG, and WebP detected by magic bytes", () => {
    for (const [label, bytes, format] of [
      ["jpeg", JPEG, "jpeg"],
      ["png", PNG, "png"],
      ["webp", WEBP, "webp"],
    ] as const) {
      assert.equal(detectImageFormat(bytes), format, label);
      const result = validateMediaUpload({ bytes, kind: "gallery", alt: null });
      assert.equal(result.ok, true, label);
      assert.deepEqual(result.ok && result.value, { format, kind: "gallery", alt: null }, label);
    }
  });

  it("refuses bytes that only claim to be an image, whatever the filename or MIME said", () => {
    // The web client can send any filename and `Content-Type: image/jpeg`; neither is an input here.
    const result = validateMediaUpload({ bytes: PDF, kind: "main-photo", alt: null });

    assert.equal(result.ok, false);
    assert.deepEqual(result.ok === false && result.issues, [
      "file must be a JPEG, PNG, or WebP image",
    ]);
    assert.equal(detectImageFormat(PDF), null);
    assert.equal(detectImageFormat(new Uint8Array([0xff, 0xd8])), null, "a truncated signature");
  });

  it("refuses an empty upload and one byte over 10 MB, and accepts exactly 10 MB", () => {
    assert.equal(
      validateMediaUpload({ bytes: new Uint8Array(), kind: "gallery", alt: null }).ok,
      false,
    );
    assert.equal(
      validateMediaUpload({
        bytes: withPadding(JPEG, MAX_UPLOAD_BYTES + 1),
        kind: "gallery",
        alt: null,
      }).ok,
      false,
    );
    const atLimit = validateMediaUpload({
      bytes: withPadding(PNG, MAX_UPLOAD_BYTES),
      kind: "gallery",
      alt: null,
    });
    assert.equal(atLimit.ok, true);
  });

  it("refuses an unknown kind and a non-string kind", () => {
    for (const kind of ["video", "MAIN-PHOTO", 42, null, undefined]) {
      const result = validateMediaUpload({ bytes: JPEG, kind, alt: null });
      assert.equal(result.ok, false, String(kind));
      assert.deepEqual(result.ok === false && result.issues, [
        "kind must be main-photo or gallery",
      ]);
    }
    assert.equal(isMediaKind("main-photo"), true);
    assert.equal(isMediaKind("gallery"), true);
    assert.equal(isMediaKind("GALLERY"), false);
  });

  it("bounds the alt text at 120 characters and stores a blank one as null", () => {
    const exact = "á".repeat(MAX_ALT_LENGTH);
    const accepted = validateMediaUpload({ bytes: JPEG, kind: "gallery", alt: exact });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.ok && accepted.value.alt, exact);

    const overlong = validateMediaUpload({
      bytes: JPEG,
      kind: "gallery",
      alt: "x".repeat(MAX_ALT_LENGTH + 1),
    });
    assert.equal(overlong.ok, false);
    assert.deepEqual(overlong.ok === false && overlong.issues, [
      "alt must be at most 120 characters",
    ]);

    for (const alt of [null, undefined, "   ", ""]) {
      const blank = validateMediaUpload({ bytes: JPEG, kind: "main-photo", alt });
      assert.equal(blank.ok && blank.value.alt, null);
    }
    const trimmed = validateMediaUpload({ bytes: JPEG, kind: "gallery", alt: "  Entrada  " });
    assert.equal(trimmed.ok && trimmed.value.alt, "Entrada");

    const wrongType = validateMediaUpload({ bytes: JPEG, kind: "gallery", alt: 42 });
    assert.equal(wrongType.ok, false);
    assert.deepEqual(wrongType.ok === false && wrongType.issues, [
      "alt must be at most 120 characters",
    ]);
  });

  it("refuses dimensions above 8000 px per side before anything is decoded", () => {
    assert.deepEqual(validateImageDimensions({ width: 8000, height: 8000 }), []);
    assert.deepEqual(validateImageDimensions({ width: 1, height: 1 }), []);
    assert.deepEqual(validateImageDimensions({ width: 8001, height: 100 }), [
      "image dimensions must not exceed 8000 px per side",
    ]);
    assert.deepEqual(validateImageDimensions({ width: 100, height: 8001 }), [
      "image dimensions must not exceed 8000 px per side",
    ]);
    assert.deepEqual(validateImageDimensions({ width: 100_000, height: 100 }), [
      "image dimensions must not exceed 8000 px per side",
    ]);
    assert.deepEqual(validateImageDimensions({ width: 0, height: 10 }), [
      "image dimensions must be positive",
    ]);
    // A side that is not a whole number of pixels names no image this API can store.
    assert.deepEqual(validateImageDimensions({ width: 1.5, height: 10 }), [
      "image dimensions must be positive",
    ]);
    assert.deepEqual(validateImageDimensions({ width: 10, height: Number.NaN }), [
      "image dimensions must be positive",
    ]);
    assert.equal(MAX_INPUT_DIMENSION, 8000);
  });

  it("scales the longest side to 2000 px and keeps the aspect ratio", () => {
    assert.deepEqual(outputDimensions(4000, 3000), { width: 2000, height: 1500 });
    assert.deepEqual(outputDimensions(3000, 4000), { width: 1500, height: 2000 });
    assert.deepEqual(outputDimensions(2000, 1000), { width: 2000, height: 1000 });
    assert.deepEqual(outputDimensions(1, 5000), { width: 1, height: 2000 });
    assert.deepEqual(outputDimensions(8000, 8000), { width: 2000, height: 2000 });
    assert.deepEqual(outputDimensions(3, 2), { width: 3, height: 2 });
    // One pixel past the target and one side of a single pixel: the scale never answers a 0 px side.
    assert.deepEqual(outputDimensions(2001, 2001), { width: 2000, height: 2000 });
    assert.deepEqual(outputDimensions(4001, 1), { width: 2000, height: 1 });
    assert.deepEqual(outputDimensions(1, 4001), { width: 1, height: 2000 });
  });

  it("builds the storage key from validated ids only", () => {
    const invitationId = randomUUID();
    const assetId = randomUUID();
    const key = storageKeyFor(invitationId, assetId);

    assert.equal(key, `invitations/${invitationId}/${assetId}.webp`);
    assert.equal(isStorageKey(key), true);
    for (const refused of [
      "invitations/../../etc/passwd",
      `invitations/${invitationId}/../../x.webp`,
      `invitations/${invitationId}/${assetId}.jpg`,
      `invitations/${invitationId.toUpperCase()}/${assetId}.webp`,
      `other/${invitationId}/${assetId}.webp`,
    ]) {
      assert.equal(isStorageKey(refused), false, refused);
    }
    assert.throws(() => storageKeyFor("../escape", assetId), RangeError);
    assert.throws(() => storageKeyFor(invitationId, "not-a-uuid"), RangeError);
  });

  it("keeps the documented limits as the single source of truth", () => {
    assert.equal(MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
    assert.equal(MAX_GALLERY_PHOTOS, 12);
    assert.equal(MAX_STORED_ASSETS, 40);
    assert.equal(MAX_ALT_LENGTH, 120);
  });
});
