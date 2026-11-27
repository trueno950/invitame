import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GUEST_ALBUM_OWNER_COPY } from "./copy.ts";
import {
  GUEST_ALBUM_OWNER_PATHS,
  GUEST_ALBUM_TAB_PARAM,
  type GuestAlbumModerationView,
  guestAlbumModerationView,
  hideGuestPhoto,
  publishGuestPhoto,
  receivedAtLabel,
  showGuestPhoto,
} from "./guest-album.ts";
import type { GuestAlbumRead, GuestPhotoItem } from "../server/invitations-api.ts";

// The owner's album screen (F8; L11.6): the three tabs with their counts, one card per photo with the name its uploader
// typed, the publish, hide, and show-again writes, and the note that states the retention of hidden photos. These tests
// drive the module through its public surface: the view the page renders and the redirect each submitted form answers.

const ID = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const PENDING_ID = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
const PUBLISHED_ID = "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b";
const HIDDEN_ID = "3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c";
const ORIGIN = "http://localhost:3001";
const NOW = new Date("2026-12-01T12:00:00.000Z");

const READ: GuestAlbumRead = {
  photos: [
    {
      id: PENDING_ID,
      url: `${ORIGIN}/media/${PENDING_ID}`,
      uploaderName: "Tía Rosa",
      status: "PENDING",
      createdAt: "2026-12-01T10:00:00.000Z",
      reviewedAt: null,
    },
    {
      id: HIDDEN_ID,
      url: `${ORIGIN}/media/${HIDDEN_ID}`,
      uploaderName: null,
      status: "HIDDEN",
      createdAt: "2026-11-28T09:00:00.000Z",
      reviewedAt: "2026-11-30T18:00:00.000Z",
    },
    {
      id: PUBLISHED_ID,
      url: `${ORIGIN}/media/${PUBLISHED_ID}`,
      uploaderName: "Jorge",
      status: "PUBLISHED",
      createdAt: "2026-11-29T09:00:00.000Z",
      reviewedAt: "2026-11-29T12:00:00.000Z",
    },
  ],
  pendingCount: 1,
  publishedCount: 1,
  hiddenCount: 1,
};

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();

  for (const [name, value] of Object.entries(values)) {
    form.set(name, value);
  }
  return form;
}

function rowsOf(view: GuestAlbumModerationView) {
  return view.rows.map((row) => ({
    id: row.id,
    uploaderName: row.uploaderName,
    alt: row.alt,
    receivedAt: row.receivedAt,
  }));
}

describe("the moderation view of one invitation's album (F8; L11.6)", () => {
  it("opens the photos waiting for review, each tab stating its own count", () => {
    const view = guestAlbumModerationView(READ, {}, NOW);

    assert.equal(view.tab, "por-revisar");
    assert.equal(view.reviewTab, "Por revisar · 1");
    assert.equal(view.publishedTab, "Publicadas · 1");
    assert.equal(view.hiddenTab, "Ocultas · 1");
    assert.deepEqual(rowsOf(view), [
      {
        id: PENDING_ID,
        uploaderName: "Tía Rosa",
        alt: "Foto que subió Tía Rosa",
        receivedAt: "hace 2 horas",
      },
    ]);
    // The one action of a pending photo publishes it.
    assert.deepEqual(view.action, { kind: "publish", label: "Publicar" });
  });

  it("opens the published tab with the hide action and the hidden tab with the show-again action", () => {
    const published = guestAlbumModerationView(
      READ,
      { [GUEST_ALBUM_TAB_PARAM]: "publicadas" },
      NOW,
    );
    const hidden = guestAlbumModerationView(READ, { [GUEST_ALBUM_TAB_PARAM]: "ocultas" }, NOW);

    assert.equal(published.tab, "publicadas");
    assert.deepEqual(published.action, { kind: "hide", label: "Ocultar" });
    assert.deepEqual(
      published.rows.map((row) => row.id),
      [PUBLISHED_ID],
    );
    assert.equal(hidden.tab, "ocultas");
    assert.deepEqual(hidden.action, { kind: "show", label: "Volver a mostrar" });
    assert.deepEqual(
      hidden.rows.map((row) => row.id),
      [HIDDEN_ID],
    );
  });

  it("names a photo whose uploader left no name, and describes it for a reader that cannot see it", () => {
    const view = guestAlbumModerationView(READ, { [GUEST_ALBUM_TAB_PARAM]: "ocultas" }, NOW);

    assert.deepEqual(rowsOf(view), [
      {
        id: HIDDEN_ID,
        uploaderName: "Anónimo",
        alt: "Foto del álbum de invitados",
        receivedAt: "hace 3 días",
      },
    ]);
  });

  it("falls back to the photos waiting for review, which is what the owner comes to do", () => {
    assert.equal(
      guestAlbumModerationView(READ, { [GUEST_ALBUM_TAB_PARAM]: "todas" }, NOW).tab,
      "por-revisar",
    );
  });

  it("states the retention of hidden and never published photos in words on every tab", () => {
    for (const tab of ["por-revisar", "publicadas", "ocultas"]) {
      const view = guestAlbumModerationView(READ, { [GUEST_ALBUM_TAB_PARAM]: tab }, NOW);

      assert.equal(view.retentionNote, GUEST_ALBUM_OWNER_COPY.retentionNote);
      assert.match(view.retentionNote, /30 días/);
    }
  });

  it("gives each empty tab its own note instead of an empty grid", () => {
    const empty: GuestAlbumRead = {
      photos: [],
      pendingCount: 0,
      publishedCount: 0,
      hiddenCount: 0,
    };

    assert.equal(
      guestAlbumModerationView(empty, {}, NOW).emptyNote,
      GUEST_ALBUM_OWNER_COPY.emptyReview,
    );
    assert.equal(
      guestAlbumModerationView(empty, { [GUEST_ALBUM_TAB_PARAM]: "publicadas" }, NOW).emptyNote,
      GUEST_ALBUM_OWNER_COPY.emptyPublished,
    );
    assert.equal(
      guestAlbumModerationView(empty, { [GUEST_ALBUM_TAB_PARAM]: "ocultas" }, NOW).emptyNote,
      GUEST_ALBUM_OWNER_COPY.emptyHidden,
    );
  });
});

describe("the relative date of one uploaded photo (F8; L11.6)", () => {
  it("answers minutes, hours, yesterday, and days", () => {
    assert.equal(
      receivedAtLabel("2026-12-01T11:58:00.000Z", NOW),
      GUEST_ALBUM_OWNER_COPY.receivedNow,
    );
    assert.equal(
      receivedAtLabel("2026-12-01T11:00:00.000Z", NOW),
      GUEST_ALBUM_OWNER_COPY.receivedHours(1),
    );
    assert.equal(
      receivedAtLabel("2026-11-30T09:00:00.000Z", NOW),
      GUEST_ALBUM_OWNER_COPY.receivedYesterday,
    );
    assert.equal(
      receivedAtLabel("2026-11-26T09:00:00.000Z", NOW),
      GUEST_ALBUM_OWNER_COPY.receivedDays(5),
    );
  });

  it("never answers a negative or an unreadable date", () => {
    assert.equal(
      receivedAtLabel("2026-12-02T09:00:00.000Z", NOW),
      GUEST_ALBUM_OWNER_COPY.receivedNow,
    );
    assert.equal(receivedAtLabel("not-a-date", NOW), GUEST_ALBUM_OWNER_COPY.receivedNow);
  });
});

describe("the moderation writes of the album (F8; L11.6)", () => {
  it("publishes a pending photo and comes back to the published tab", async () => {
    const sent: unknown[] = [];
    const target = await publishGuestPhoto(
      {
        reviewGuestPhoto: async (id, photoId, status) => {
          sent.push({ id, photoId, status });
          return { ok: true, value: { ...(READ.photos[0] as GuestPhotoItem) } };
        },
      },
      formOf({ id: ID, photoId: PENDING_ID }),
    );

    assert.equal(target, `${GUEST_ALBUM_OWNER_PATHS.page(ID)}?${GUEST_ALBUM_TAB_PARAM}=publicadas`);
    assert.deepEqual(sent, [{ id: ID, photoId: PENDING_ID, status: "PUBLISHED" }]);
  });

  it("hides a published photo and comes back to the hidden tab", async () => {
    const sent: unknown[] = [];
    const target = await hideGuestPhoto(
      {
        reviewGuestPhoto: async (id, photoId, status) => {
          sent.push({ id, photoId, status });
          return { ok: true, value: { ...(READ.photos[2] as GuestPhotoItem) } };
        },
      },
      formOf({ id: ID, photoId: PUBLISHED_ID }),
    );

    assert.equal(target, `${GUEST_ALBUM_OWNER_PATHS.page(ID)}?${GUEST_ALBUM_TAB_PARAM}=ocultas`);
    assert.deepEqual(sent, [{ id: ID, photoId: PUBLISHED_ID, status: "HIDDEN" }]);
  });

  it("shows a hidden photo again and comes back to the published tab", async () => {
    const sent: unknown[] = [];
    const target = await showGuestPhoto(
      {
        reviewGuestPhoto: async (id, photoId, status) => {
          sent.push({ id, photoId, status });
          return { ok: true, value: { ...(READ.photos[1] as GuestPhotoItem) } };
        },
      },
      formOf({ id: ID, photoId: HIDDEN_ID }),
    );

    assert.equal(target, `${GUEST_ALBUM_OWNER_PATHS.page(ID)}?${GUEST_ALBUM_TAB_PARAM}=publicadas`);
    assert.deepEqual(sent, [{ id: ID, photoId: HIDDEN_ID, status: "PUBLISHED" }]);
  });

  it("answers the page's own error for a missing invitation, a malformed photo id, and a refusal", async () => {
    let called = false;
    const api = {
      reviewGuestPhoto: async () => {
        called = true;
        return { ok: true as const, value: READ.photos[0] as GuestPhotoItem };
      },
    };

    assert.equal(
      await publishGuestPhoto(api, formOf({ id: "not-an-id", photoId: PENDING_ID })),
      "/cuenta/invitaciones?error=not-found",
    );
    assert.equal(
      await publishGuestPhoto(api, formOf({ id: ID, photoId: "not-an-id" })),
      `${GUEST_ALBUM_OWNER_PATHS.page(ID)}?error=guest-photo-not-found`,
    );
    assert.equal(called, false);

    assert.equal(
      await hideGuestPhoto(
        {
          reviewGuestPhoto: async () => ({
            ok: false as const,
            failure: "guest-photo-not-found" as const,
          }),
        },
        formOf({ id: ID, photoId: PUBLISHED_ID }),
      ),
      `${GUEST_ALBUM_OWNER_PATHS.page(ID)}?error=guest-photo-not-found`,
    );
  });
});
