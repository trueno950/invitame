import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LIVESTREAM_NOTE_MAX_LENGTH,
  LIVESTREAM_URL_MAX_LENGTH,
  type LivestreamPayload,
  LIVESTREAM_EMBED_ORIGIN,
  LIVESTREAM_FALLBACK_LABEL,
  LIVESTREAM_IFRAME_TITLE,
  LIVESTREAM_OPEN_LABEL,
  LIVESTREAM_SECTION_TITLE,
  isLivestreamUrl,
  livestreamEmbedUrl,
  livestreamHasContent,
  parseLivestream,
  parseLivestreamPayload,
  youtubeVideoIdOf,
} from "./livestream.ts";

// The livestream of a guest invitation (F9; S2.9, L12.3, L12.5): the strict reader of the public answer, the only embed
// origin this deployment renders, and the copy of the card. The API resolves the video id; this module never builds an
// embed address from an untrusted path, only from the id it re-checks.

const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const ZOOM = "https://us02web.zoom.us/j/123456789";

const GUEST = { url: WATCH, videoId: "dQw4w9WgXcQ", note: "Inicia a las 17:00 h" } as const;
const PAYLOAD: LivestreamPayload = { version: 1, url: WATCH, note: "Inicia a las 17:00 h" };

describe("the livestream of a guest invitation (F9; L12.3)", () => {
  it("reads the link, the resolved video id, and the note", () => {
    assert.deepEqual(parseLivestream(GUEST), GUEST);
    assert.deepEqual(parseLivestream({ url: ZOOM, videoId: null, note: null }), {
      url: ZOOM,
      videoId: null,
      note: null,
    });
    // A body written before F9 and a package without the key both read as no livestream (L20).
    assert.equal(parseLivestream(null), null);
    assert.equal(parseLivestream(undefined), null);
  });

  it("refuses a body this deployment did not write", () => {
    assert.equal(parseLivestream({ ...GUEST, extra: true }), undefined);
    assert.equal(parseLivestream({ url: WATCH, note: null }), undefined);
    assert.equal(parseLivestream({ url: WATCH, videoId: null, note: null }), undefined);
    assert.equal(
      parseLivestream({ url: "http://youtu.be/dQw4w9WgXcQ", videoId: null, note: null }),
      undefined,
    );
    assert.equal(parseLivestream({ url: WATCH, videoId: "short", note: null }), undefined);
    assert.equal(parseLivestream({ url: WATCH, videoId: null, note: 7 }), undefined);
    assert.equal(
      parseLivestream({
        url: WATCH,
        videoId: null,
        note: "n".repeat(LIVESTREAM_NOTE_MAX_LENGTH + 1),
      }),
      undefined,
    );
    assert.equal(parseLivestream("https://youtu.be/dQw4w9WgXcQ"), undefined);
  });

  it("reads the owner payload as the editor round-trips it", () => {
    assert.deepEqual(parseLivestreamPayload(PAYLOAD), PAYLOAD);
    assert.deepEqual(parseLivestreamPayload({ version: 1, url: WATCH }), {
      version: 1,
      url: WATCH,
    });
    assert.equal(parseLivestreamPayload(null), null);
    // An older API answers no field at all, which reads as no livestream; another shape refuses the body.
    assert.equal(parseLivestreamPayload(undefined), null);
    assert.equal(parseLivestreamPayload({ version: 2, url: WATCH }), undefined);
    assert.equal(parseLivestreamPayload({ version: 1, url: "http://x.test" }), undefined);
    assert.equal(parseLivestreamPayload({ version: 1, url: WATCH, extra: true }), undefined);
  });

  it("builds the embed address only from a strict video id, on the one origin it renders", () => {
    assert.equal(livestreamEmbedUrl("dQw4w9WgXcQ"), `${LIVESTREAM_EMBED_ORIGIN}/embed/dQw4w9WgXcQ`);
    assert.equal(livestreamEmbedUrl(null), null);
    for (const refused of [
      "",
      "short",
      "dQw4w9WgXcQextra",
      "dQw4w9WgXc!",
      "../../evil",
      "dQw4w9WgXc/",
    ]) {
      assert.equal(livestreamEmbedUrl(refused), null, refused);
    }
  });

  it("resolves the same three YouTube shapes the API embeds, and nothing else", () => {
    assert.equal(youtubeVideoIdOf(WATCH), "dQw4w9WgXcQ");
    assert.equal(youtubeVideoIdOf("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(youtubeVideoIdOf("https://youtube.com/live/AbCdEf12345"), "AbCdEf12345");
    assert.equal(youtubeVideoIdOf(ZOOM), null);
    assert.equal(youtubeVideoIdOf("https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ"), null);
  });

  it("accepts only a storable https link, bounded at 500 characters", () => {
    assert.equal(isLivestreamUrl(WATCH), true);
    assert.equal(isLivestreamUrl(ZOOM), true);
    assert.equal(isLivestreamUrl("http://youtu.be/dQw4w9WgXcQ"), false);
    assert.equal(isLivestreamUrl("youtu.be/dQw4w9WgXcQ"), false);
    assert.equal(isLivestreamUrl("https://youtu.be/dQw4 w9WgXcQ"), false);
    assert.equal(
      isLivestreamUrl(`https://youtu.be/${"a".repeat(LIVESTREAM_URL_MAX_LENGTH)}`),
      false,
    );
  });

  it("tells a stored livestream apart from none, and carries the card's copy", () => {
    assert.equal(livestreamHasContent(GUEST), true);
    assert.equal(livestreamHasContent({ url: ZOOM, videoId: null, note: null }), true);
    assert.equal(livestreamHasContent(null), false);
    assert.equal(livestreamHasContent(undefined), false);

    assert.equal(LIVESTREAM_SECTION_TITLE, "Míralo en vivo");
    assert.equal(LIVESTREAM_OPEN_LABEL, "Abrir la transmisión");
    assert.equal(LIVESTREAM_FALLBACK_LABEL, "Si no carga, ábrela aquí");
    assert.equal(LIVESTREAM_IFRAME_TITLE, "Transmisión en vivo");
  });
});
