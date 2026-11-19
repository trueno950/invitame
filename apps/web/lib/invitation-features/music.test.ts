import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isMusicProvider,
  MUSIC_COVER_ALT,
  MUSIC_COVER_HOSTS,
  MUSIC_COVER_URL_MAX_LENGTH,
  MUSIC_PROVIDER_LABELS,
  MUSIC_PROVIDERS,
  MUSIC_TITLE_MAX_LENGTH,
  musicButtonLabel,
  musicCoverUrlOf,
  musicServiceOf,
  musicTitleOf,
  PLAYLIST_URL_MAX_LENGTH,
  withMusicMetadata,
} from "./music.ts";

// The music feature of a guest invitation (F6; S7). The API owns the host allow-list and stores only a link it
// accepted; the web owns the Spanish name of each service and refuses a value this deployment does not know, so a
// provider outside the allow-list never selects a label or a code path.

describe("the music services the web knows (S7)", () => {
  it("names exactly the allow-listed services of the contract", () => {
    assert.deepEqual(MUSIC_PROVIDERS, [
      "spotify",
      "apple_music",
      "youtube",
      "deezer",
      "soundcloud",
    ]);
    // Every provider the contract names has a Spanish name to show, and nothing else does.
    assert.deepEqual(Object.keys(MUSIC_PROVIDER_LABELS).sort(), [...MUSIC_PROVIDERS].sort());
    assert.deepEqual(MUSIC_PROVIDER_LABELS, {
      spotify: "Spotify",
      apple_music: "Apple Music",
      youtube: "YouTube",
      deezer: "Deezer",
      soundcloud: "SoundCloud",
    });
  });

  it("names the service in the button of the playlist section", () => {
    assert.equal(musicButtonLabel("spotify"), "Abrir en Spotify");
    assert.equal(musicButtonLabel("apple_music"), "Abrir en Apple Music");
    assert.equal(musicButtonLabel("youtube"), "Abrir en YouTube");
    assert.equal(musicButtonLabel("deezer"), "Abrir en Deezer");
    assert.equal(musicButtonLabel("soundcloud"), "Abrir en SoundCloud");
  });

  it("accepts only an exact service key", () => {
    for (const provider of MUSIC_PROVIDERS) {
      assert.equal(isMusicProvider(provider), true, provider);
    }
    for (const value of ["Spotify", "apple-music", "itunes", "", null, undefined, 7, ["spotify"]]) {
      assert.equal(isMusicProvider(value), false, String(value));
    }
  });

  it("accepts a stored link only as an https URL of a bounded length", () => {
    const url = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";

    assert.equal(musicServiceOf({ url, provider: "spotify" })?.provider, "spotify");
    for (const broken of [
      { url, provider: "apple-music" },
      { url: "http://open.spotify.com/playlist/abc", provider: "spotify" },
      {
        url: `https://open.spotify.com/${"a".repeat(PLAYLIST_URL_MAX_LENGTH)}`,
        provider: "spotify",
      },
      { url: 7, provider: "spotify" },
      { url, provider: 7 },
      { provider: "spotify" },
      "spotify",
      null,
    ]) {
      assert.equal(musicServiceOf(broken), undefined, JSON.stringify(broken));
    }
  });

  // The playlist card's metadata (S2): the API stores what the provider answered, and this deployment renders it
  // only when it is a bounded title and a cover on an allow-listed image host over `https`.
  const COVER = "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07";
  const LINK = { url: "https://open.spotify.com/playlist/abc", provider: "spotify" } as const;

  it("accepts a bounded, trimmed title and refuses anything else", () => {
    assert.equal(musicTitleOf("  La boda  "), "La boda");
    assert.equal(
      musicTitleOf("a".repeat(MUSIC_TITLE_MAX_LENGTH)),
      "a".repeat(MUSIC_TITLE_MAX_LENGTH),
    );

    for (const value of [
      "",
      "   ",
      "a".repeat(MUSIC_TITLE_MAX_LENGTH + 1),
      "<script>alert(1)</script>".repeat(20),
      7,
      null,
      undefined,
      ["La boda"],
    ]) {
      assert.equal(musicTitleOf(value), undefined, String(value));
    }
  });

  it("accepts a cover only over https on an allow-listed image host", () => {
    assert.equal(musicCoverUrlOf(COVER), COVER);
    assert.equal(
      musicCoverUrlOf("https://image-cdn-ak.spotifycdn.com/image/abc"),
      "https://image-cdn-ak.spotifycdn.com/image/abc",
    );
    assert.equal(
      musicCoverUrlOf("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"),
      "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
    assert.deepEqual(MUSIC_COVER_HOSTS, ["i.scdn.co", "i.ytimg.com"]);

    for (const value of [
      "http://i.scdn.co/image/abc",
      "https://evil.test/cover.jpg",
      "https://i.scdn.co.evil.test/cover.jpg",
      "https://user:secret@i.scdn.co/image/abc",
      "https://i.scdn.co:8443/image/abc",
      "javascript:alert(1)",
      `https://i.scdn.co/${"a".repeat(MUSIC_COVER_URL_MAX_LENGTH)}`,
      7,
      null,
    ]) {
      assert.equal(musicCoverUrlOf(value), undefined, String(value));
    }
  });

  it("attaches the metadata a link may carry, and nothing when the metadata is unusable", () => {
    assert.deepEqual(withMusicMetadata(LINK, "La boda", COVER), {
      ...LINK,
      title: "La boda",
      coverUrl: COVER,
    });
    // Only one of the two is enough: the card shows a cover with the generic alt, or a title with no cover.
    assert.deepEqual(withMusicMetadata(LINK, null, COVER), { ...LINK, coverUrl: COVER });
    assert.deepEqual(withMusicMetadata(LINK, "La boda", null), { ...LINK, title: "La boda" });
    assert.deepEqual(withMusicMetadata(LINK, "", "https://evil.test/x.jpg"), LINK);
    assert.equal(MUSIC_COVER_ALT, "Portada de la playlist");
  });

  it("reads the metadata of a public body with the same rules", () => {
    assert.deepEqual(musicServiceOf({ ...LINK, title: "  La boda ", coverUrl: COVER }), {
      ...LINK,
      title: "La boda",
      coverUrl: COVER,
    });
    // A value the deployment refuses is dropped and the link stays: losing the cover never loses the button.
    assert.deepEqual(
      musicServiceOf({ ...LINK, title: "a".repeat(201), coverUrl: "http://x.test/y" }),
      LINK,
    );
  });
});
