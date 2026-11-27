import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GUEST_PHOTO_MAX_STORED,
  GUEST_PHOTO_PUBLIC_MAX,
  GUEST_PHOTO_RETENTION_MS,
  GUEST_PHOTO_UPLOADER_NAME_CONTROL_ISSUE,
  GUEST_PHOTO_UPLOADER_NAME_LENGTH_ISSUE,
  GUEST_PHOTO_UPLOADER_NAME_MAX_LENGTH,
  GUEST_PHOTO_UPLOADER_NAME_TYPE_ISSUE,
  guestPhotoRetentionCutoff,
  isGuestPhotoReviewState,
  validateGuestPhotoUpload,
} from "./guest-photo";
import { MEDIA_FORMAT_ISSUE, MEDIA_SIZE_ISSUE, mediaSizeIssue } from "./media-asset";

// The album of a guest's photos (F8; S2.8, L11.1, L11.3): the two caps, the uploader name a guest may type, and the
// bytes the API accepts. Every rule is pure, so it is proved here instead of through a database or a provider.

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
]);
const GIF = Buffer.from("GIF89a");

const MAX_BYTES = 10 * 1024 * 1024;

describe("the album's caps (F8; L11.3, L11.4)", () => {
  it("stores at most 300 photos per invitation, pending ones included, and reads at most 60 published ones", () => {
    assert.equal(GUEST_PHOTO_MAX_STORED, 300);
    assert.equal(GUEST_PHOTO_PUBLIC_MAX, 60);
  });

  it("retires a photo 30 days after it entered its current state (L11.6)", () => {
    const now = new Date("2026-12-10T12:00:00.000Z");
    assert.equal(GUEST_PHOTO_RETENTION_MS, 30 * 24 * 60 * 60 * 1000);
    assert.equal(guestPhotoRetentionCutoff(now).toISOString(), "2026-11-10T12:00:00.000Z");
  });

  it("accepts only the two states an owner may set, never PENDING again", () => {
    assert.equal(isGuestPhotoReviewState("PUBLISHED"), true);
    assert.equal(isGuestPhotoReviewState("HIDDEN"), true);
    assert.equal(isGuestPhotoReviewState("PENDING"), false);
    assert.equal(isGuestPhotoReviewState("published"), false);
    assert.equal(isGuestPhotoReviewState(null), false);
  });
});

describe("the uploader name a guest may type (F8; L11.1, L11.3)", () => {
  it("is optional: a missing, null, or blank name stores no name at all", () => {
    for (const value of [undefined, null, "", "   "]) {
      const validation = validateGuestPhotoUpload({
        bytes: JPEG,
        uploaderName: value,
        maxBytes: MAX_BYTES,
      });
      assert.equal(validation.ok, true);
      assert.equal(validation.ok && validation.value.uploaderName, null);
    }
  });

  it("is trimmed and bounded at 60 characters", () => {
    const stored = validateGuestPhotoUpload({
      bytes: JPEG,
      uploaderName: "  Tía Rosa  ",
      maxBytes: MAX_BYTES,
    });
    assert.equal(stored.ok && stored.value.uploaderName, "Tía Rosa");

    const exact = "á".repeat(GUEST_PHOTO_UPLOADER_NAME_MAX_LENGTH);
    assert.equal(
      validateGuestPhotoUpload({ bytes: JPEG, uploaderName: exact, maxBytes: MAX_BYTES }).ok,
      true,
    );

    const wide = validateGuestPhotoUpload({
      bytes: JPEG,
      uploaderName: "á".repeat(GUEST_PHOTO_UPLOADER_NAME_MAX_LENGTH + 1),
      maxBytes: MAX_BYTES,
    });
    assert.deepEqual(wide, { ok: false, issues: [GUEST_PHOTO_UPLOADER_NAME_LENGTH_ISSUE] });
  });

  it("refuses a value that is not text, and a text carrying a control character", () => {
    assert.deepEqual(
      validateGuestPhotoUpload({ bytes: JPEG, uploaderName: 42, maxBytes: MAX_BYTES }),
      { ok: false, issues: [GUEST_PHOTO_UPLOADER_NAME_TYPE_ISSUE] },
    );
    assert.deepEqual(
      validateGuestPhotoUpload({
        bytes: JPEG,
        uploaderName: "Rosa\u0000López",
        maxBytes: MAX_BYTES,
      }),
      { ok: false, issues: [GUEST_PHOTO_UPLOADER_NAME_CONTROL_ISSUE] },
    );
    assert.deepEqual(
      validateGuestPhotoUpload({
        bytes: JPEG,
        uploaderName: "Rosa\nLópez",
        maxBytes: MAX_BYTES,
      }),
      { ok: false, issues: [GUEST_PHOTO_UPLOADER_NAME_CONTROL_ISSUE] },
    );
  });

  it("keeps the name as plain text, accents, emoji, and spaces included", () => {
    const validation = validateGuestPhotoUpload({
      bytes: JPEG,
      uploaderName: "  Sofía 🎉 de la Cruz  ",
      maxBytes: MAX_BYTES,
    });
    assert.equal(validation.ok && validation.value.uploaderName, "Sofía 🎉 de la Cruz");
  });
});

describe("the bytes a guest may upload (F8; L11.3)", () => {
  it("accepts a JPEG, a PNG, and a WebP by their own signature", () => {
    for (const [bytes, format] of [
      [JPEG, "jpeg"],
      [PNG, "png"],
      [WEBP, "webp"],
    ] as const) {
      const validation = validateGuestPhotoUpload({
        bytes,
        uploaderName: null,
        maxBytes: MAX_BYTES,
      });
      assert.equal(validation.ok, true);
      assert.equal(validation.ok && validation.value.format, format);
    }
  });

  it("refuses any other format, an empty file, and a file over the configured size", () => {
    assert.deepEqual(
      validateGuestPhotoUpload({ bytes: GIF, uploaderName: null, maxBytes: MAX_BYTES }),
      {
        ok: false,
        issues: [MEDIA_FORMAT_ISSUE],
      },
    );
    // An empty payload is refused by both rules, exactly like the owner's own upload route refuses it.
    assert.deepEqual(
      validateGuestPhotoUpload({ bytes: Buffer.alloc(0), uploaderName: null, maxBytes: MAX_BYTES }),
      { ok: false, issues: [MEDIA_SIZE_ISSUE, MEDIA_FORMAT_ISSUE] },
    );
    const big = Buffer.concat([JPEG, Buffer.alloc(64)]);
    assert.deepEqual(validateGuestPhotoUpload({ bytes: big, uploaderName: null, maxBytes: 32 }), {
      ok: false,
      issues: [mediaSizeIssue(32)],
    });
  });

  it("reports every issue of one refused upload at once", () => {
    assert.deepEqual(
      validateGuestPhotoUpload({
        bytes: GIF,
        uploaderName: 42,
        maxBytes: MAX_BYTES,
      }),
      {
        ok: false,
        issues: [GUEST_PHOTO_UPLOADER_NAME_TYPE_ISSUE, MEDIA_FORMAT_ISSUE],
      },
    );
  });
});
