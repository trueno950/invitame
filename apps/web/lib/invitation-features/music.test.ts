import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isMusicProvider,
  MUSIC_PROVIDER_LABELS,
  MUSIC_PROVIDERS,
  musicButtonLabel,
  musicServiceOf,
  PLAYLIST_URL_MAX_LENGTH,
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
});
