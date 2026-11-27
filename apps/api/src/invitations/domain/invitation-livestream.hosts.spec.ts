import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { publicLivestream, youtubeVideoIdOf } from "./invitation-livestream";

// The provider allow-list of the livestream (S2.9, L12.3): the guest page may only frame a YouTube video id, and then
// only the eleven characters YouTube uses. Every look-alike host, every other path, and every other scheme answers no
// id, so the card offers its open link instead of an embed.

const ID = "dQw4w9WgXcQ";

describe("the livestream provider allow-list (L12.3)", () => {
  it("resolves the three documented YouTube shapes, with extra query parameters", () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}&t=42&list=PL123`,
      `https://www.youtube.com/watch?v=${ID}&feature=share`,
      `https://www.youtube.com/live/${ID}`,
      `https://m.youtube.com/live/${ID}?si=abc`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?t=30`,
    ]) {
      assert.equal(youtubeVideoIdOf(url), ID, url);
      assert.deepEqual(publicLivestream({ version: 1, url }), { url, videoId: ID, note: null });
    }
  });

  // L12.3 lists only `youtu.be/` for the short form: a `www.` or `m.` prefix stays an open link, never an embed.
  it("answers no id for a look-alike host, another path, or another scheme", () => {
    for (const url of [
      `https://www.youtu.be/${ID}`,
      `https://m.youtu.be/${ID}`,
      `https://www.youtube.com.evil.test/watch?v=${ID}`,
      `https://evil.test/youtube.com/watch?v=${ID}`,
      `https://youtu.be.evil.test/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/watch`,
      `https://www.youtube.com/watch?v=${ID.slice(0, 10)}`,
      `https://www.youtube.com/watch?v=${ID}x`,
      `https://www.youtube.com/live/${ID}x`,
      `http://www.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com:8443/watch?v=${ID}`,
      `https://user@www.youtube.com/watch?v=${ID}`,
      `javascript:alert('https://youtu.be/${ID}')`,
      `data:text/html,<iframe src=https://youtu.be/${ID}>`,
    ]) {
      assert.equal(youtubeVideoIdOf(url), null, url);
      assert.equal(publicLivestream({ version: 1, url }).videoId, null, url);
    }
  });

  it("keeps the link of another https provider with no id", () => {
    assert.deepEqual(publicLivestream({ version: 1, url: "https://us02web.zoom.us/j/123456789" }), {
      url: "https://us02web.zoom.us/j/123456789",
      videoId: null,
      note: null,
    });
  });
});
