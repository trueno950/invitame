import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GUEST_ALBUM_CLOSED_NOTE,
  GUEST_ALBUM_MAX_PHOTOS,
  GUEST_ALBUM_SECTION_TITLE,
  GUEST_ALBUM_UPLOADER_NAME_MAX_LENGTH,
  GUEST_ALBUM_UPLOAD_LABEL,
  guestAlbumCount,
  guestAlbumPhotoAlt,
} from "./guest-album.ts";

// The guest album's own copy (F8; S2.8, L11.5): the title and the upload action of the artboard, the count line a guest
// reads under the grid, and the alt text of every published photo. These are the texts the shared features block draws,
// so a change here is a change a guest sees.

describe("the guest album's title and upload action (F8; L11.5)", () => {
  it("names the album and its one action with the artboard's words", () => {
    assert.equal(GUEST_ALBUM_SECTION_TITLE, "Nuestras fotos");
    assert.equal(GUEST_ALBUM_UPLOAD_LABEL, "Subir mis fotos");
  });

  it("mirrors the API's own bounds, so the page never offers what the API refuses", () => {
    assert.equal(GUEST_ALBUM_MAX_PHOTOS, 60);
    assert.equal(GUEST_ALBUM_UPLOADER_NAME_MAX_LENGTH, 60);
  });
});

describe("the count line under the grid (F8; L11.5)", () => {
  it("counts one photo in the singular and every other count in the plural", () => {
    assert.equal(guestAlbumCount(1), "1 foto publicada");
    assert.equal(guestAlbumCount(2), "2 fotos publicadas");
    assert.equal(guestAlbumCount(48), "48 fotos publicadas");
    assert.equal(guestAlbumCount(0), "0 fotos publicadas");
  });
});

describe("the alt text of one published photo (F8; L11.5)", () => {
  it("names the uploader when the guest typed a name", () => {
    assert.equal(guestAlbumPhotoAlt("Tía Rosa"), "Foto que subió Tía Rosa");
  });

  it("announces a photo whose uploader left no name as one of the album's photos", () => {
    assert.equal(guestAlbumPhotoAlt(null), "Foto del álbum de invitados");
    assert.equal(guestAlbumPhotoAlt("   "), "Foto del álbum de invitados");
  });

  it("keeps what the guest typed as text: no tag survives as markup", () => {
    assert.equal(guestAlbumPhotoAlt("<b>Rosa</b>"), "Foto que subió <b>Rosa</b>");
  });
});

describe("the note of an album the expiry closed (F8; L11.5)", () => {
  it("says the album closed when the invitation ended", () => {
    assert.equal(
      GUEST_ALBUM_CLOSED_NOTE,
      "El álbum de fotos se cerró cuando terminó la invitación.",
    );
  });
});
