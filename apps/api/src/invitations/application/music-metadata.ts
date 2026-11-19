import type { MusicProvider, PlaylistMetadata } from "../domain/invitation-features";

// The music metadata port (S2): one provider-neutral question about a stored playlist link, so the invitation use
// case never names Spotify, YouTube, or an HTTP client (AGENTS.md, S3). The adapter decides which providers it can
// ask, how, and for how long; the use case only decides when a lookup is worth one request. A provider that cannot
// answer is not an error: it answers null, and the invitation keeps today's link-only behavior.

/**
 * What the API may ask a music provider about one playlist link (S2). An implementation answers the title and the
 * cover the provider publishes, each null when the provider named nothing usable, and `null` when it has nothing to
 * say about this link at all (an unsupported service, a provider that is down, a timeout). It never rejects: a
 * lookup is a courtesy the save must survive.
 */
export interface MusicMetadataProvider {
  lookup(playlistUrl: string, provider: MusicProvider): Promise<PlaylistMetadata | null>;
}

export const MUSIC_METADATA_PROVIDER = Symbol("MusicMetadataProvider");

/**
 * The provider of a deployment that never looks anything up (S2): `MUSIC_METADATA_LOOKUP=off` and the test
 * environment use it, so a suite or a CI run never reaches the network and a save stores the link with no metadata.
 */
export const NO_MUSIC_METADATA: MusicMetadataProvider = { lookup: async () => null };
