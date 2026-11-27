import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GUEST_ALBUM_NOTICE_COPY } from "../customer/copy.ts";
import type { GuestAlbumValue } from "../invitation-features/guest-album.ts";
import {
  GUEST_ALBUM_NOTICE_PARAM,
  type GuestAlbumNoticeCode,
  guestAlbumNotice,
  guestAlbumResultTarget,
  parseGuestAlbumForm,
  publicGuestAlbumBlock,
  submitPublicGuestAlbumForm,
} from "./guest-album.ts";

// The guest's album on `/i/[slug]` (F8; S2.8, L11.5): the block the page draws, the multipart form it submits to a server
// action, and the Spanish notice the guest reads back. These tests drive the module through its public surface: the view
// the page renders, the submission the API receives, and the redirect the action answers.

const SLUG = "invitacion-k7m2qx";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

const ALBUM: GuestAlbumValue = {
  photos: [
    {
      url: "http://localhost:3001/media/9b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e19",
      uploaderName: "Rosa",
    },
    { url: "http://localhost:3001/media/8b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e18", uploaderName: null },
  ],
  count: 12,
};

const action = async (): Promise<void> => {};

/** One submitted form: a slug, an optional name, and the file the guest chose. */
function formOf(
  values: {
    slug?: string;
    uploaderName?: string;
    bytes?: Uint8Array | null;
    guestToken?: string;
  } = {},
): FormData {
  const form = new FormData();

  if (values.slug !== undefined) {
    form.set("slug", values.slug);
  }
  if (values.uploaderName !== undefined) {
    form.set("uploaderName", values.uploaderName);
  }
  if (values.guestToken !== undefined) {
    form.set("guestToken", values.guestToken);
  }
  if (values.bytes !== null) {
    form.set(
      "file",
      new Blob([(values.bytes ?? new Uint8Array([1, 2, 3])) as BlobPart]),
      "foto.jpg",
    );
  }
  return form;
}

describe("the album block of one guest page (F8; L11.5)", () => {
  it("hands the block the photos and the count the API answered, and the action its form posts to", () => {
    const block = publicGuestAlbumBlock(ALBUM, SLUG, action, false);

    assert.deepEqual(block, {
      slug: SLUG,
      photos: ALBUM.photos,
      count: 12,
      closed: false,
      action,
    });
  });

  it("draws no album for a package that does not grant it", () => {
    assert.equal(publicGuestAlbumBlock(null, SLUG, action), undefined);
  });

  it("draws no album for a slug that cannot name an invitation", () => {
    assert.equal(publicGuestAlbumBlock(ALBUM, "Invitacion", action), undefined);
    assert.equal(publicGuestAlbumBlock(ALBUM, "", action), undefined);
  });

  it("keeps the album and closes its form when the invitation expired", () => {
    assert.equal(publicGuestAlbumBlock(ALBUM, SLUG, action, true)?.closed, true);
  });

  it("carries a guest's own token only on their personal page, so the upload comes back there", () => {
    assert.equal(publicGuestAlbumBlock(ALBUM, SLUG, action, false, TOKEN)?.guestToken, TOKEN);
    // A value that cannot be a minted token is dropped, so it never becomes a path segment of the way back.
    assert.equal(
      publicGuestAlbumBlock(ALBUM, SLUG, action, false, "not-a-token")?.guestToken,
      undefined,
    );
  });
});

describe("the album form one guest submits (F8; L11.5)", () => {
  it("reads the slug, the file's bytes, and the optional name the guest typed", async () => {
    const parsed = await parseGuestAlbumForm(formOf({ slug: SLUG, uploaderName: "  Rosa  " }));

    assert.equal(parsed.ok, true);
    assert.equal(parsed.slug, SLUG);
    assert.deepEqual(parsed.ok ? { uploaderName: parsed.value.uploaderName } : {}, {
      uploaderName: "Rosa",
    });
    assert.deepEqual(parsed.ok ? [...parsed.value.bytes] : [], [1, 2, 3]);
  });

  it("sends no name when the guest leaves the field empty", async () => {
    const parsed = await parseGuestAlbumForm(formOf({ slug: SLUG, uploaderName: "   " }));

    assert.equal(parsed.ok, true);
    assert.equal(parsed.ok ? parsed.value.uploaderName : "unread", null);
  });

  it("refuses a form without a file, and a name past the API's own bound", async () => {
    const noFile = await parseGuestAlbumForm(formOf({ slug: SLUG, bytes: null }));
    const emptyFile = await parseGuestAlbumForm(formOf({ slug: SLUG, bytes: new Uint8Array([]) }));
    const longName = await parseGuestAlbumForm(
      formOf({ slug: SLUG, uploaderName: "x".repeat(61) }),
    );

    assert.equal(noFile.ok, false);
    assert.equal(emptyFile.ok, false);
    assert.equal(longName.ok, false);
    // A refusal that still names the invitation comes back to that invitation with its own notice.
    assert.equal(noFile.slug, SLUG);
  });

  it("refuses a form that names no invitation, so the page has nowhere to come back to", async () => {
    const missing = await parseGuestAlbumForm(formOf({}));
    const malformed = await parseGuestAlbumForm(formOf({ slug: "../cuenta" }));

    assert.deepEqual(missing, { ok: false, slug: undefined });
    assert.deepEqual(malformed, { ok: false, slug: undefined });
  });
});

describe("the notice of an upload (F8; L11.5)", () => {
  it("sends the guest back to the invitation with one code of the page's own closed set", () => {
    assert.equal(
      guestAlbumResultTarget(SLUG, "uploaded"),
      `/i/${SLUG}?${GUEST_ALBUM_NOTICE_PARAM}=uploaded`,
    );
  });

  it("reads the code the query carries and nothing else", () => {
    assert.deepEqual(guestAlbumNotice({ [GUEST_ALBUM_NOTICE_PARAM]: "uploaded" }), {
      code: "uploaded",
      message: "Gracias, tu foto aparecerá cuando la aprueben.",
    });
    assert.equal(guestAlbumNotice({ [GUEST_ALBUM_NOTICE_PARAM]: "TODOS" }), undefined);
    assert.equal(guestAlbumNotice({}), undefined);
    assert.equal(
      guestAlbumNotice({ [GUEST_ALBUM_NOTICE_PARAM]: ["uploaded", "closed"] }),
      undefined,
    );
  });

  it("states every refusal the API documents in its own Spanish sentence", () => {
    const codes: GuestAlbumNoticeCode[] = [
      "uploaded",
      "invalid",
      "closed",
      "full",
      "limited",
      "unavailable",
    ];

    for (const code of codes) {
      assert.equal(
        guestAlbumNotice({ [GUEST_ALBUM_NOTICE_PARAM]: code })?.message,
        GUEST_ALBUM_NOTICE_COPY[code],
      );
    }
  });
});

describe("the upload one guest's form sends (F8; L11.5)", () => {
  it("forwards the file and the name with the address the web read, and comes back with the thanks", async () => {
    const sent: unknown[] = [];
    const target = await submitPublicGuestAlbumForm(
      {
        uploadGuestPhoto: async (slug, upload, options) => {
          sent.push({ slug, ...upload, ...(options ?? {}) });
          return { ok: true };
        },
      },
      formOf({ slug: SLUG, uploaderName: "Rosa" }),
      { clientAddress: "203.0.113.11" },
    );

    assert.equal(target, guestAlbumResultTarget(SLUG, "uploaded"));
    assert.deepEqual(
      sent.map((value) => ({
        ...(value as object),
        bytes: [...(value as { bytes: Uint8Array }).bytes],
      })),
      [
        {
          slug: SLUG,
          bytes: [1, 2, 3],
          uploaderName: "Rosa",
          clientAddress: "203.0.113.11",
        },
      ],
    );
  });

  it("maps each refusal to its own notice instead of showing an API answer", async () => {
    const refusals = [
      ["closed", "closed"],
      ["full", "full"],
      ["rate-limited", "limited"],
      ["invalid", "invalid"],
      ["not-found", "unavailable"],
    ] as const;

    for (const [failure, code] of refusals) {
      const target = await submitPublicGuestAlbumForm(
        { uploadGuestPhoto: async () => ({ ok: false, failure }) },
        formOf({ slug: SLUG }),
        { clientAddress: undefined },
      );

      assert.equal(target, guestAlbumResultTarget(SLUG, code), failure);
    }
  });

  it("answers the page's own notice for a form it refuses, without asking the API", async () => {
    let called = false;
    const api = {
      uploadGuestPhoto: async () => {
        called = true;
        return { ok: true as const };
      },
    };

    assert.equal(
      await submitPublicGuestAlbumForm(api, formOf({ slug: SLUG, bytes: null }), {
        clientAddress: undefined,
      }),
      guestAlbumResultTarget(SLUG, "invalid"),
    );
    assert.equal(
      await submitPublicGuestAlbumForm(api, formOf({}), { clientAddress: undefined }),
      "/",
    );
    assert.equal(called, false);
  });

  it("comes back to the guest's own page when their form carried their token", async () => {
    const target = await submitPublicGuestAlbumForm(
      { uploadGuestPhoto: async () => ({ ok: true }) },
      formOf({ slug: SLUG, guestToken: TOKEN } as { slug: string }),
      { clientAddress: undefined },
    );

    assert.equal(target, `/i/${SLUG}/g/${TOKEN}?${GUEST_ALBUM_NOTICE_PARAM}=uploaded`);
  });

  it("turns a failed request into the page's outage notice, so an API error never breaks the invitation", async () => {
    const target = await submitPublicGuestAlbumForm(
      {
        uploadGuestPhoto: async () => {
          throw new Error("unavailable");
        },
      },
      formOf({ slug: SLUG }),
      { clientAddress: "203.0.113.11" },
    );

    assert.equal(target, guestAlbumResultTarget(SLUG, "unavailable"));
  });
});
