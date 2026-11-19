import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MusicProvider } from "../domain/invitation-features";
import {
  MUSIC_METADATA_MAX_BODY_BYTES,
  MUSIC_METADATA_TIMEOUT_MS,
  OEmbedMusicMetadataProvider,
} from "./oembed-music-metadata-provider";

// The public oEmbed adapter of the music metadata port (S2). Every test injects its own `fetch`, so the suite never
// reaches the network: what is proven here is the request the adapter builds (host, parameters, no redirect
// following), the bounds it enforces (timeout, body size, title width), and the validation of the cover the
// provider's answer names (https, allow-listed image host). A failed lookup is always `null`, never a throw: the
// feature save fails open.

const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";
const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const COVER = "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07";
const YOUTUBE_COVER = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg";

/** One recorded request, so a test can assert the exact endpoint and parameters the adapter asked. */
interface Recorded {
  url: string;
  init: RequestInit | undefined;
}

/** A `fetch` that answers one canned response and records the request it received. */
function respondingWith(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): { fetch: typeof fetch; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const response = new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });

  return {
    requests,
    fetch: async (input, requestInit) => {
      requests.push({ url: String(input), init: requestInit });
      return response;
    },
  };
}

/** The oEmbed body Spotify answers for a playlist, reduced to the fields this API reads. */
const SPOTIFY_BODY = JSON.stringify({
  html: '<iframe src="https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M"></iframe>',
  provider_name: "Spotify",
  type: "rich",
  version: "1.0",
  title: "Today’s Top Hits",
  thumbnail_url: COVER,
  thumbnail_width: 300,
  thumbnail_height: 300,
});

/** The oEmbed body YouTube answers for a video, reduced to the fields this API reads. */
const YOUTUBE_BODY = JSON.stringify({
  type: "video",
  version: "1.0",
  provider_name: "YouTube",
  title: "Rick Astley - Never Gonna Give You Up",
  thumbnail_url: YOUTUBE_COVER,
  thumbnail_width: 480,
  thumbnail_height: 360,
});

describe("the oEmbed music metadata adapter (S2)", () => {
  it("reads the title and the cover Spotify answers, and drops everything else", async () => {
    const { fetch, requests } = respondingWith(SPOTIFY_BODY);
    const adapter = new OEmbedMusicMetadataProvider({ fetch });

    assert.deepEqual(await adapter.lookup(PLAYLIST, "spotify"), {
      title: "Today’s Top Hits",
      coverUrl: COVER,
    });

    assert.equal(requests.length, 1);
    const requested = new URL(requests[0]?.url ?? "");
    assert.equal(requested.origin, "https://open.spotify.com");
    assert.equal(requested.pathname, "/oembed");
    // The playlist link travels as one parameter, so a link with its own query cannot rewrite the request.
    assert.equal(requested.searchParams.get("url"), PLAYLIST);
    assert.equal(requests[0]?.init?.method, "GET");
    // A redirect would leave the allow-listed host, so the adapter never follows one.
    assert.equal(requests[0]?.init?.redirect, "manual");
    assert.ok(requests[0]?.init?.signal instanceof AbortSignal);
  });

  it("asks YouTube with its own endpoint and the JSON format", async () => {
    const { fetch, requests } = respondingWith(YOUTUBE_BODY);
    const adapter = new OEmbedMusicMetadataProvider({ fetch });

    assert.deepEqual(await adapter.lookup(VIDEO, "youtube"), {
      title: "Rick Astley - Never Gonna Give You Up",
      coverUrl: YOUTUBE_COVER,
    });

    const requested = new URL(requests[0]?.url ?? "");
    assert.equal(requested.origin, "https://www.youtube.com");
    assert.equal(requested.pathname, "/oembed");
    assert.equal(requested.searchParams.get("url"), VIDEO);
    assert.equal(requested.searchParams.get("format"), "json");
  });

  it("answers no metadata, and asks nobody, for a service without a public oEmbed document", async () => {
    const { fetch, requests } = respondingWith(SPOTIFY_BODY);
    const adapter = new OEmbedMusicMetadataProvider({ fetch });

    for (const provider of ["apple_music", "deezer", "soundcloud"] as MusicProvider[]) {
      assert.equal(await adapter.lookup(PLAYLIST, provider), null, provider);
    }
    assert.equal(requests.length, 0);
  });

  it("answers no metadata when the provider does not answer 200", async () => {
    for (const status of [302, 404, 429, 500]) {
      const { fetch } = respondingWith(SPOTIFY_BODY, { status });
      const adapter = new OEmbedMusicMetadataProvider({ fetch });

      assert.equal(await adapter.lookup(PLAYLIST, "spotify"), null, String(status));
    }
  });

  it("answers no metadata when the body is not the JSON object it expects", async () => {
    for (const body of [
      "<html>not json</html>",
      "",
      "null",
      "[]",
      '"Today’s Top Hits"',
      JSON.stringify({ title: 42, thumbnail_url: null }),
      JSON.stringify({ title: "   ", thumbnail_url: null }),
      JSON.stringify({ title: "Sólo un título sin portada", thumbnail_url: "nonsense" }),
      JSON.stringify({ title: 42, thumbnail_url: COVER }),
    ]) {
      const { fetch } = respondingWith(body);
      const adapter = new OEmbedMusicMetadataProvider({ fetch });

      // A body whose only usable field is one of the two keeps that field; every other one stores nothing at all.
      const kept: Record<string, { title: string | null; coverUrl: string | null }> = {
        [JSON.stringify({ title: "Sólo un título sin portada", thumbnail_url: "nonsense" })]: {
          title: "Sólo un título sin portada",
          coverUrl: null,
        },
        [JSON.stringify({ title: 42, thumbnail_url: COVER })]: { title: null, coverUrl: COVER },
      };
      assert.deepEqual(await adapter.lookup(PLAYLIST, "spotify"), kept[body] ?? null, body);
    }
  });

  it("keeps the title but refuses a cover that is not https on an allow-listed image host", async () => {
    for (const thumbnail_url of [
      "https://evil.test/cover.jpg",
      "https://i.scdn.co.evil.test/cover.jpg",
      "http://i.scdn.co/image/abc",
      "https://i.scdn.co:8443/image/abc",
      "https://user:secret@i.scdn.co/image/abc",
      "javascript:alert(1)",
      { href: COVER },
    ]) {
      const { fetch } = respondingWith(JSON.stringify({ title: "La boda", thumbnail_url }));
      const adapter = new OEmbedMusicMetadataProvider({ fetch });

      assert.deepEqual(
        await adapter.lookup(PLAYLIST, "spotify"),
        { title: "La boda", coverUrl: null },
        JSON.stringify(thumbnail_url),
      );
    }
  });

  it("accepts the covers Spotify's image CDN answers as well as i.scdn.co", async () => {
    for (const thumbnail_url of [
      "https://image-cdn-ak.spotifycdn.com/image/abc",
      "https://image-cdn-fa.spotifycdn.com/image/abc",
    ]) {
      const { fetch } = respondingWith(JSON.stringify({ title: "La boda", thumbnail_url }));
      const adapter = new OEmbedMusicMetadataProvider({ fetch });

      assert.deepEqual(await adapter.lookup(PLAYLIST, "spotify"), {
        title: "La boda",
        coverUrl: thumbnail_url,
      });
    }
  });

  it("trims the title to 200 characters, the width the column stores", async () => {
    const long = `  ${"a".repeat(250)}  `;
    const { fetch } = respondingWith(JSON.stringify({ title: long, thumbnail_url: COVER }));
    const adapter = new OEmbedMusicMetadataProvider({ fetch });

    assert.deepEqual(await adapter.lookup(PLAYLIST, "spotify"), {
      title: "a".repeat(200),
      coverUrl: COVER,
    });
  });

  it("refuses a body larger than the cap before reading it, and one that grows past it while reading", async () => {
    const oversize = JSON.stringify({ title: "a".repeat(MUSIC_METADATA_MAX_BODY_BYTES) });

    for (const adapter of [
      // The declared length refuses the answer before it is read.
      new OEmbedMusicMetadataProvider({ fetch: respondingWith(oversize).fetch }),
      // The same body passes a heap-sized cap only when the reader stops at its own bound.
      new OEmbedMusicMetadataProvider({
        fetch: respondingWith(oversize).fetch,
        maxBodyBytes: 32,
      }),
    ]) {
      assert.equal(await adapter.lookup(PLAYLIST, "spotify"), null);
    }
  });

  it("abandons a lookup that does not answer before the timeout, and the save continues", async () => {
    let aborted = false;
    const hangingFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(init.signal?.reason ?? new Error("aborted"));
        });
      });
    const adapter = new OEmbedMusicMetadataProvider({ fetch: hangingFetch, timeoutMs: 10 });
    const started = Date.now();

    assert.equal(await adapter.lookup(PLAYLIST, "spotify"), null);
    assert.equal(aborted, true);
    // The injected bound is what stopped it: the call did not wait for anything else.
    assert.ok(Date.now() - started < 1_000);
  });

  it("answers no metadata when the request itself fails", async () => {
    const failingFetch: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const adapter = new OEmbedMusicMetadataProvider({ fetch: failingFetch });

    assert.equal(await adapter.lookup(PLAYLIST, "spotify"), null);
  });

  it("bounds the request at three seconds and the body at 16 KiB by default", () => {
    assert.equal(MUSIC_METADATA_TIMEOUT_MS, 3_000);
    assert.equal(MUSIC_METADATA_MAX_BODY_BYTES, 16 * 1024);
  });
});
