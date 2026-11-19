import type { MusicMetadataProvider } from "../application/music-metadata";
import {
  isMusicCoverUrl,
  type MusicProvider,
  normalizePlaylistTitle,
  type PlaylistMetadata,
} from "../domain/invitation-features";

// The public oEmbed adapter of the music metadata port (S2): Spotify and YouTube publish an oEmbed document for a
// playlist or a video without a key, so the API can learn the title and the cover of a link an owner pasted. The
// adapter is deliberately strict, because it reads a third party's answer and stores part of it:
//
// - one request, three seconds, no retry: a lookup is a courtesy of the save, never a dependency;
// - no redirect is followed, so an answer from another host is an answer from nowhere;
// - the body is bounded, and so is what the adapter keeps: the title trimmed to 200 characters and a cover that is
//   `https` on an allow-listed image host (`i.scdn.co`, `image-cdn-*.spotifycdn.com`, `i.ytimg.com`);
// - the provider's HTML, player, author, and every other field of the answer are dropped, and nothing is logged:
//   the request URL carries the owner's playlist link and the answer carries the provider's title.
//
// Apple Music, Deezer, and SoundCloud publish no keyless oEmbed document, so the adapter answers "no metadata" for
// them and the invitation keeps today's link-only card.

/** A lookup that takes longer than this is abandoned; the save continues without metadata (S2). */
export const MUSIC_METADATA_TIMEOUT_MS = 3_000;

/** The largest oEmbed body this adapter reads; a real answer is about one kilobyte (S2, S3). */
export const MUSIC_METADATA_MAX_BODY_BYTES = 16 * 1024;

/** Identifies the API to the providers; both answer without it, but an anonymous client is a bad neighbor. */
export const MUSIC_METADATA_USER_AGENT = "invitame-api/0.1.0";

const HTTP_OK = 200;

/** The keyless oEmbed endpoint of each service this adapter can ask, and of no other service (S2). */
const OEMBED_ENDPOINTS: Partial<Record<MusicProvider, string>> = {
  spotify: "https://open.spotify.com/oembed",
  youtube: "https://www.youtube.com/oembed",
};

export interface OEmbedMusicMetadataProviderOptions {
  /** Injected only so a test never reaches the network; the platform `fetch` is the default. */
  fetch?: typeof fetch;
  /** Overridable so a test observes the timeout without waiting for it. */
  timeoutMs?: number;
  maxBodyBytes?: number;
}

/** Releases a response body the adapter does not read, or a reader it gave up on. */
async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is already settled; nothing to release.
  }
}

/**
 * Reads at most `maxBytes` of a response body: the declared length is refused before a byte is read, and a body
 * that grows past the bound is cancelled. `null` means "too large to be an oEmbed answer".
 */
async function readBoundedBody(response: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discardBody(response);
    return null;
  }

  const body = response.body;
  if (body === null) {
    return null;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The metadata an oEmbed answer names, or null when it names none (S2). Only `title` and `thumbnail_url` are read;
 * a cover that is not `https` on an allow-listed image host is dropped instead of refusing the whole answer, so a
 * provider that starts serving covers elsewhere still keeps its title.
 */
function playlistMetadataOf(answer: unknown): PlaylistMetadata | null {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) {
    return null;
  }

  const fields = answer as Record<string, unknown>;
  const title = normalizePlaylistTitle(fields.title);
  const coverUrl = isMusicCoverUrl(fields.thumbnail_url) ? fields.thumbnail_url : null;

  return title === null && coverUrl === null ? null : { title, coverUrl };
}

/** The public oEmbed adapter (S2): one bounded request per supported playlist link, never a retry. */
export class OEmbedMusicMetadataProvider implements MusicMetadataProvider {
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #maxBodyBytes: number;

  constructor(options: OEmbedMusicMetadataProviderOptions = {}) {
    this.#fetch = options.fetch ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? MUSIC_METADATA_TIMEOUT_MS;
    this.#maxBodyBytes = options.maxBodyBytes ?? MUSIC_METADATA_MAX_BODY_BYTES;
  }

  async lookup(playlistUrl: string, provider: MusicProvider): Promise<PlaylistMetadata | null> {
    const endpoint = OEMBED_ENDPOINTS[provider];

    if (endpoint === undefined) {
      return null;
    }

    const target = new URL(endpoint);
    target.searchParams.set("url", playlistUrl);
    if (provider === "youtube") {
      target.searchParams.set("format", "json");
    }

    let text: string | null;

    try {
      const response = await this.#fetch(target.href, {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": MUSIC_METADATA_USER_AGENT },
        // A redirect would leave the allow-listed host, so an answer that is not the endpoint's own 200 is nothing.
        redirect: "manual",
        signal: AbortSignal.timeout(this.#timeoutMs),
      });

      if (response.status !== HTTP_OK) {
        await discardBody(response);
        return null;
      }

      text = await readBoundedBody(response, this.#maxBodyBytes);
    } catch {
      // A timeout, a network failure, or an unreadable body: no metadata, and no log line, because the request URL
      // carries the owner's playlist and a fetch error's message can carry it too.
      return null;
    }

    if (text === null) {
      return null;
    }

    try {
      return playlistMetadataOf(JSON.parse(text));
    } catch {
      // The provider answered something that is not JSON: nothing to store.
      return null;
    }
  }
}
