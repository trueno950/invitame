/**
 * The music feature of a guest invitation (F6; S7). The API owns the host allow-list: it stores only an `https`
 * link on one of the services below and answers the service key it recognized. The web owns the Spanish name of
 * each service and refuses a value this deployment does not know, so an unknown provider never selects a label
 * and a stored link is never shown under the wrong service name.
 *
 * The block shows one external link and a cover, and nothing else: no embedded player and no third-party script, so
 * the guest page keeps its own cookies, its own performance, and its own contrast. The cover is a plain `<img>` the
 * browser loads lazily, never an embed the provider controls.
 */

import { guestFormats } from "../i18n/guest-texts.ts";
import type { Locale } from "../i18n/locale.ts";

/** The music services the contract allow-lists, as the API names them (S7). */
export const MUSIC_PROVIDERS = [
  "spotify",
  "apple_music",
  "youtube",
  "deezer",
  "soundcloud",
] as const;

export type MusicProvider = (typeof MUSIC_PROVIDERS)[number];

/** The longest playlist link the API stores, so a body longer than this is not this contract (S7). */
export const PLAYLIST_URL_MAX_LENGTH = 500;

/** The longest playlist title the API stores, mirroring the column and the domain bound (S2). */
export const MUSIC_TITLE_MAX_LENGTH = 200;

/** The longest cover URL the API stores, mirroring the column (S2). */
export const MUSIC_COVER_URL_MAX_LENGTH = 500;

/**
 * The image hosts a cover may come from (S2), mirrored from the API's own allow-list: Spotify's `i.scdn.co` and its
 * `image-cdn-<label>.spotifycdn.com` CDN, and YouTube's `i.ytimg.com`. A cover anywhere else is not rendered, so the
 * guest page never loads an image from a host this deployment did not allow.
 */
export const MUSIC_COVER_HOSTS = ["i.scdn.co", "i.ytimg.com"] as const;

const SPOTIFY_IMAGE_CDN_HOST = /^image-cdn-[a-z0-9-]+\.spotifycdn\.com$/;
const MUSIC_COVER_HOST_SET: ReadonlySet<string> = new Set(MUSIC_COVER_HOSTS);

/** The alt text of a cover when the provider named no title: the card still describes the image (S2). */
export const MUSIC_COVER_ALT = "Portada de la playlist";

/** The Spanish name of each service, which is what the guest reads on the button. */
export const MUSIC_PROVIDER_LABELS: Readonly<Record<MusicProvider, string>> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube: "YouTube",
  deezer: "Deezer",
  soundcloud: "SoundCloud",
};

/** Whether a value is one exact, allow-listed service key. */
export function isMusicProvider(value: unknown): value is MusicProvider {
  return typeof value === "string" && (MUSIC_PROVIDERS as readonly string[]).includes(value);
}

/** The playlist link of one invitation, as the public read returns it. */
export interface MusicLink {
  /** An `https` URL the API accepted and stored. */
  readonly url: string;
  /** The service that URL names. */
  readonly provider: MusicProvider;
  /** The title the provider answered when the link was saved, when the API stored one (S2). */
  readonly title?: string;
  /** The cover the provider answered, on an allow-listed image host and over `https` (S2). */
  readonly coverUrl?: string;
}

/** The heading of the playlist section, which names the celebration as a shared playlist. */
export const MUSIC_SECTION_TITLE = "Escucha nuestra playlist";

/**
 * The button of the playlist section: «Abrir en Spotify», «Abrir en YouTube», ... (S7). The service name is the
 * product's own, so only the verb follows the locale the page renders (F14; L19.2).
 */
export function musicButtonLabel(provider: MusicProvider, locale: Locale = "es"): string {
  return guestFormats(locale).musicButton(MUSIC_PROVIDER_LABELS[provider]);
}

/**
 * A stored playlist title, or `undefined` when there is none this page renders: the value is a non-blank string of at
 * most 200 characters, trimmed. A body that sends anything else simply has no title (S2).
 */
export function musicTitleOf(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed === "" || [...trimmed].length > MUSIC_TITLE_MAX_LENGTH ? undefined : trimmed;
}

/**
 * A stored cover URL, or `undefined` when this deployment does not render it (S2): `https`, no port and no userinfo,
 * and one of the allow-listed image hosts. The check mirrors the API's, so a body that names another host draws no
 * image even if the API stored it.
 */
export function musicCoverUrlOf(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MUSIC_COVER_URL_MAX_LENGTH) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== "https:" || parsed.port !== "") {
    return undefined;
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return undefined;
  }

  return MUSIC_COVER_HOST_SET.has(parsed.hostname) || SPOTIFY_IMAGE_CDN_HOST.test(parsed.hostname)
    ? value
    : undefined;
}

/**
 * The playlist link of a public body, or `undefined` when the value is not one this deployment shows. The link must
 * be `https` and no longer than the column the API stores; the provider must be one of the allow-listed keys. A title
 * or a cover this deployment does not accept is dropped instead of refusing the link, because losing the cover is
 * better than losing the button that opens the playlist (S2).
 */
export function musicServiceOf(value: unknown): MusicLink | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const link = value as Record<string, unknown>;
  const url = link.url;
  const provider = link.provider;

  if (
    typeof url !== "string" ||
    !url.startsWith("https://") ||
    url.length > PLAYLIST_URL_MAX_LENGTH ||
    !isMusicProvider(provider)
  ) {
    return undefined;
  }

  return withMusicMetadata({ url, provider }, link.title, link.coverUrl);
}

/**
 * The same link with the metadata this deployment accepts attached (S2): the title and the cover are each optional,
 * bounded, and dropped when they say nothing. The owner preview builds its link from the stored fields, so it uses
 * the same rules a guest page applies to the public body.
 */
export function withMusicMetadata(link: MusicLink, title: unknown, coverUrl: unknown): MusicLink {
  const acceptedTitle = musicTitleOf(title);
  const acceptedCover = musicCoverUrlOf(coverUrl);

  return {
    ...link,
    ...(acceptedTitle === undefined ? {} : { title: acceptedTitle }),
    ...(acceptedCover === undefined ? {} : { coverUrl: acceptedCover }),
  };
}
