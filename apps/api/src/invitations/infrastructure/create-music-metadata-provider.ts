import type { MusicEnvironment } from "../../config/environment";
import { MUSIC_METADATA_LOOKUP } from "../../config/environment";
import { type MusicMetadataProvider, NO_MUSIC_METADATA } from "../application/music-metadata";
import { OEmbedMusicMetadataProvider } from "./oembed-music-metadata-provider";

/**
 * Selects the music metadata adapter for the validated lookup setting (S2). `off` binds the never-answering
 * provider, so the test environment and a deployment that opts out make no request at all; the configuration has
 * already refused any other value.
 */
export function createMusicMetadataProvider(settings: MusicEnvironment): MusicMetadataProvider {
  switch (settings.lookup) {
    case MUSIC_METADATA_LOOKUP.ON:
      return new OEmbedMusicMetadataProvider();
    case MUSIC_METADATA_LOOKUP.OFF:
      return NO_MUSIC_METADATA;
  }
}
