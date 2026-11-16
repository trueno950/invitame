/**
 * The music feature of a guest invitation (F6; S7). The API owns the host allow-list: it stores only an `https`
 * link on one of the services below and answers the service key it recognized. The web owns the Spanish name of
 * each service and refuses a value this deployment does not know, so an unknown provider never selects a label
 * and a stored link is never shown under the wrong service name.
 *
 * The block shows one external link and nothing else: no embedded player and no third-party script, so the guest
 * page keeps its own cookies, its own performance, and its own contrast.
 */

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
}

/** The heading of the playlist section, which names the celebration as a shared playlist. */
export const MUSIC_SECTION_TITLE = "Escucha nuestra playlist";

/** The button of the playlist section: «Abrir en Spotify», «Abrir en YouTube», ... (S7). */
export function musicButtonLabel(provider: MusicProvider): string {
  return `Abrir en ${MUSIC_PROVIDER_LABELS[provider]}`;
}

/**
 * The stored link of a public body, or `undefined` when the value is not one this deployment shows. The link must
 * be `https` and no longer than the column the API stores; the provider must be one of the allow-listed keys.
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

  return { url, provider };
}
