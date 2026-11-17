import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InvitationResult, OwnedInvitation } from "../server/invitations-api.ts";
import type { MediaAsset, MediaClient, MediaFailure } from "../server/media-api.ts";
import { MAX_MEDIA_UPLOAD_BYTES } from "../server/media-api.ts";
import {
  type MediaActionsApi,
  mediaSectionView,
  moveGalleryPhoto,
  removeGalleryPhoto,
  saveGalleryAlt,
  uploadGalleryPhoto,
  uploadMainPhoto,
} from "./invitation-media.ts";

// The creator's media actions (M8 S2, S4): the main photo of the editor, the «Galería» section, and the redirect each
// submitted form answers. The API owns the bytes, the limits, and the ownership; these functions only read the form,
// enforce the bound the API also enforces, and fold every outcome into the page's own Spanish notice or error code.

const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const ASSET_ID = "9b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e19";
const SECOND_ID = "8b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e18";
const AT = "2026-11-20T12:00:00.000Z";
const DETAIL = `/cuenta/invitaciones/${ID}`;

const INVITATION: OwnedInvitation = {
  id: ID,
  templateVersionId: "4b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e14",
  packageId: "5b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e15",
  slug: "invitacion-k7m2qx",
  status: "DRAFT",
  publishedAt: null,
  archivedAt: null,
  createdAt: AT,
  updatedAt: AT,
  content: { celebrantName: "Ana", mainPhoto: "https://cdn.example.com/ana.jpg" },
  missingRequiredFields: [],
  timeZone: "America/Mexico_City",
  featureSettings: { whatsappPhone: null, playlistUrl: null },
  availableFeatures: ["COUNTDOWN", "GALLERY", "CALENDAR"],
};

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: ASSET_ID,
    kind: "gallery",
    url: `http://localhost:3001/media/${ASSET_ID}`,
    width: 1200,
    height: 800,
    alt: null,
    position: 0,
    createdAt: AT,
    ...overrides,
  };
}

const MAIN = asset({
  id: SECOND_ID,
  kind: "main-photo",
  url: `http://localhost:3001/media/${SECOND_ID}`,
  position: null,
});

/** A fake of both clients one media action needs, recording every call it receives. */
function fakeApi(overrides: Partial<MediaActionsApi> = {}): MediaActionsApi & {
  calls: string[];
} {
  const calls: string[] = [];
  const media: MediaClient = {
    async list() {
      calls.push("list");
      return {
        ok: true,
        value: [MAIN, asset({ id: ASSET_ID, position: 0 }), asset({ id: SECOND_ID, position: 1 })],
      };
    },
    async upload(_id, upload) {
      calls.push(`upload:${upload.kind}:${upload.alt ?? ""}:${upload.bytes.length}`);
      return { ok: true, value: { ...asset({ kind: upload.kind }), alt: upload.alt } };
    },
    async update(_id, assetId, patch) {
      calls.push(`update:${assetId}:${JSON.stringify(patch)}`);
      return { ok: true, value: asset({ alt: patch.alt ?? null }) };
    },
    async remove(_id, assetId) {
      calls.push(`remove:${assetId}`);
      return { ok: true, value: { status: "deleted" } };
    },
  };
  const invitations = {
    async get(): Promise<InvitationResult<OwnedInvitation>> {
      calls.push("get");
      return { ok: true, value: INVITATION };
    },
    async replaceContent(_id: string, content: Record<string, unknown>) {
      calls.push(`replace:${JSON.stringify(content)}`);
      return { ok: true, value: { ...INVITATION, content } };
    },
  };

  return Object.assign(media, invitations, overrides, { calls });
}

function fileForm(entries: Record<string, string>, file?: File): FormData {
  const form = new FormData();

  for (const [name, value] of Object.entries(entries)) {
    form.set(name, value);
  }
  if (file !== undefined) {
    form.set("file", file);
  }
  return form;
}

/** A small JPEG-like file of exactly `size` bytes; the API, not the web, reads the bytes' format. */
function photo(size = 6): File {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff].slice(0, size));

  return new File([bytes], "vacaciones.jpg", { type: "image/jpeg" });
}

describe("the media section of a draft", () => {
  it("offers the gallery only when the package grants it, with its photos in order", () => {
    const view = mediaSectionView(INVITATION, [
      MAIN,
      asset({ id: ASSET_ID, position: 0 }),
      asset({ id: SECOND_ID, position: 1 }),
    ]);

    assert.equal(view.galleryAvailable, true);
    assert.equal(view.editable, true);
    assert.equal(view.mainPhotoUrl, "https://cdn.example.com/ana.jpg");
    assert.deepEqual(
      view.photos.map((photo) => [photo.id, photo.position, photo.canMoveUp, photo.canMoveDown]),
      [
        [ASSET_ID, 0, false, true],
        [SECOND_ID, 1, true, false],
      ],
    );
    assert.equal(view.limitReached, false);
  });

  it("says the gallery is unavailable when the package does not grant it", () => {
    const view = mediaSectionView({ ...INVITATION, availableFeatures: ["COUNTDOWN"] }, undefined);

    assert.equal(view.galleryAvailable, false);
    assert.deepEqual(view.photos, []);
  });

  it("marks the limit of twelve photos", () => {
    const photos = Array.from({ length: 12 }, (_unused, index) =>
      asset({
        id: `9b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e${String(index).padStart(2, "0")}`,
        position: index,
      }),
    );
    const view = mediaSectionView(INVITATION, photos);

    assert.equal(view.limitReached, true);
    assert.equal(view.photoLimit, 12);
    assert.equal(mediaSectionView(INVITATION, photos.slice(0, 11)).limitReached, false);
  });

  it("shows no thumbnail for a stored photo link that is not an absolute http(s) URL", () => {
    for (const value of ["/i/ana.jpg", "javascript:alert(1)", "", "not a url"]) {
      assert.equal(
        mediaSectionView({ ...INVITATION, content: { mainPhoto: value } }, undefined).mainPhotoUrl,
        null,
        value,
      );
    }
  });

  it("keeps an archived invitation read-only", () => {
    assert.equal(
      mediaSectionView({ ...INVITATION, status: "ARCHIVED" }, undefined).editable,
      false,
    );
  });
});

describe("the main photo upload", () => {
  it("saves the new URL into the template's photo field and redirects with its notice", async () => {
    const api = fakeApi();

    const target = await uploadMainPhoto(api, fileForm({ id: ID }, photo()));

    assert.equal(target, `${DETAIL}?notice=photo-uploaded`);
    assert.deepEqual(api.calls, [
      `upload:main-photo::6`,
      "get",
      `replace:${JSON.stringify({ celebrantName: "Ana", mainPhoto: asset().url })}`,
    ]);
  });

  it("refuses a photo over 10 MB before reading or sending it", async () => {
    const api = fakeApi();
    const huge = new File([new Uint8Array(MAX_MEDIA_UPLOAD_BYTES + 1)], "grande.jpg", {
      type: "image/jpeg",
    });

    const target = await uploadMainPhoto(api, fileForm({ id: ID }, huge));

    assert.equal(target, `${DETAIL}?error=media-too-large`);
    assert.deepEqual(api.calls, []);
  });

  it("refuses a submission with no file and never reaches the API", async () => {
    const api = fakeApi();

    assert.equal(
      await uploadMainPhoto(api, fileForm({ id: ID })),
      `${DETAIL}?error=media-invalid-upload`,
    );
    assert.equal(
      await uploadMainPhoto(
        api,
        fileForm({ id: ID }, new File([], "vacio.jpg", { type: "image/jpeg" })),
      ),
      `${DETAIL}?error=media-invalid-upload`,
    );
    assert.deepEqual(api.calls, []);
  });

  it("maps a refused upload to its Spanish error code", async () => {
    const failures: Array<[MediaFailure, string]> = [
      ["not-found", "media-not-found"],
      ["not-editable", "not-editable"],
      ["invalid-upload", "media-invalid-upload"],
      ["payload-too-large", "media-too-large"],
      ["unsupported-media-type", "media-unsupported-type"],
      ["storage-unavailable", "media-storage-unavailable"],
      ["limit-reached", "media-limit-reached"],
      ["signed-out", "/ingresar"],
    ];

    for (const [failure, expected] of failures) {
      const api = fakeApi({
        async upload() {
          return { ok: false, failure };
        },
      });
      const target = await uploadMainPhoto(api, fileForm({ id: ID }, photo()));
      assert.equal(
        target,
        expected === "/ingresar" ? "/ingresar" : `${DETAIL}?error=${expected}`,
        failure,
      );
    }
  });

  it("keeps the asset but reports a refused content save", async () => {
    const api = fakeApi({
      async replaceContent() {
        return { ok: false, failure: "content-invalid" } as InvitationResult<OwnedInvitation>;
      },
    });

    assert.equal(
      await uploadMainPhoto(api, fileForm({ id: ID }, photo())),
      `${DETAIL}?error=content-invalid`,
    );
  });

  it("sends nothing for an id that is not a UUID", async () => {
    const api = fakeApi();

    assert.equal(
      await uploadMainPhoto(api, fileForm({ id: "../../etc" }, photo())),
      "/cuenta/invitaciones?error=not-found",
    );
    assert.deepEqual(api.calls, []);
  });
});

describe("the gallery actions", () => {
  it("uploads one gallery photo with its alt text", async () => {
    const api = fakeApi();

    const target = await uploadGalleryPhoto(
      api,
      fileForm({ id: ID, alt: "  Los novios  " }, photo(3)),
    );

    assert.equal(target, `${DETAIL}?notice=gallery-uploaded`);
    assert.deepEqual(api.calls, ["upload:gallery:Los novios:3"]);
  });

  it("uploads a gallery photo with no alt text when the field is blank", async () => {
    const api = fakeApi();

    await uploadGalleryPhoto(api, fileForm({ id: ID, alt: "   " }, photo()));

    assert.deepEqual(api.calls, ["upload:gallery::6"]);
  });

  it("refuses alt text over 120 characters before sending anything", async () => {
    const api = fakeApi();
    const long = "a".repeat(121);

    assert.equal(
      await uploadGalleryPhoto(api, fileForm({ id: ID, alt: long }, photo())),
      `${DETAIL}?error=media-invalid-alt`,
    );
    assert.deepEqual(api.calls, []);
  });

  it("maps a refused gallery upload", async () => {
    const api = fakeApi({
      async upload() {
        return { ok: false, failure: "gallery-unavailable" };
      },
    });

    assert.equal(
      await uploadGalleryPhoto(api, fileForm({ id: ID }, photo())),
      `${DETAIL}?error=gallery-unavailable`,
    );
  });

  it("replaces the alt text of one photo", async () => {
    const api = fakeApi();

    assert.equal(
      await saveGalleryAlt(api, fileForm({ id: ID, assetId: ASSET_ID, alt: " La mesa  " })),
      `${DETAIL}?notice=media-saved`,
    );
    assert.equal(
      await saveGalleryAlt(api, fileForm({ id: ID, assetId: ASSET_ID, alt: "" })),
      `${DETAIL}?notice=media-saved`,
    );
    assert.deepEqual(api.calls, [
      `update:${ASSET_ID}:{"alt":"La mesa"}`,
      `update:${ASSET_ID}:{"alt":null}`,
    ]);
  });

  it("refuses alt text over 120 characters when it is edited", async () => {
    const api = fakeApi();

    assert.equal(
      await saveGalleryAlt(api, fileForm({ id: ID, assetId: ASSET_ID, alt: "b".repeat(121) })),
      `${DETAIL}?error=media-invalid-alt`,
    );
    assert.deepEqual(api.calls, []);
  });

  it("sends nothing for an asset id that is not a UUID", async () => {
    const api = fakeApi();

    assert.equal(
      await saveGalleryAlt(api, fileForm({ id: ID, assetId: "x", alt: "Hola" })),
      `${DETAIL}?error=media-not-found`,
    );
    assert.deepEqual(api.calls, []);
  });

  it("moves a photo up and down by its index among the gallery", async () => {
    const api = fakeApi();

    assert.equal(
      await moveGalleryPhoto(api, fileForm({ id: ID, assetId: SECOND_ID, direction: "up" })),
      `${DETAIL}?notice=media-saved`,
    );
    assert.equal(
      await moveGalleryPhoto(api, fileForm({ id: ID, assetId: ASSET_ID, direction: "down" })),
      `${DETAIL}?notice=media-saved`,
    );
    assert.deepEqual(api.calls, [
      "list",
      `update:${SECOND_ID}:{"position":0}`,
      "list",
      `update:${ASSET_ID}:{"position":1}`,
    ]);
  });

  it("changes nothing when a photo cannot move further", async () => {
    const api = fakeApi();

    assert.equal(
      await moveGalleryPhoto(api, fileForm({ id: ID, assetId: ASSET_ID, direction: "up" })),
      DETAIL,
    );
    assert.equal(
      await moveGalleryPhoto(api, fileForm({ id: ID, assetId: SECOND_ID, direction: "down" })),
      DETAIL,
    );
    assert.deepEqual(api.calls, ["list", "list"]);
  });

  it("removes one photo", async () => {
    const api = fakeApi();

    assert.equal(
      await removeGalleryPhoto(api, fileForm({ id: ID, assetId: ASSET_ID })),
      `${DETAIL}?notice=media-removed`,
    );
    assert.deepEqual(api.calls, [`remove:${ASSET_ID}`]);
  });

  it("maps a refused removal", async () => {
    const api = fakeApi({
      async remove() {
        return { ok: false, failure: "not-found" };
      },
    });

    assert.equal(
      await removeGalleryPhoto(api, fileForm({ id: ID, assetId: ASSET_ID })),
      `${DETAIL}?error=media-not-found`,
    );
  });

  it("maps a signed-out gallery action to the sign-in page", async () => {
    const api = fakeApi({
      async list() {
        return { ok: false, failure: "signed-out" };
      },
    });

    assert.equal(
      await moveGalleryPhoto(api, fileForm({ id: ID, assetId: ASSET_ID, direction: "up" })),
      "/ingresar",
    );
  });
});
