import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  CATALOG_PUBLIC_READER,
  type CatalogPublicContract,
} from "../catalog/application/public/catalog-public-reader";
import { CatalogModule } from "../catalog/catalog.module";
import { CollaboratorsModule } from "../collaborators/collaborators.module";
import type { RuntimeEnvironment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import {
  OPERATIONAL_SETTINGS_READER,
  type OperationalSettingsReader,
} from "../settings/application/operational-settings";
import { SettingsModule } from "../settings/settings.module";
import {
  INVITATION_GALLERY_READER,
  type InvitationGalleryReader,
} from "../invitations/application/invitation-gallery";
import { INVITATION_MEDIA_COUNT_READER } from "../invitations/application/invitation-media-counts";
import { INVITATION_GUEST_ALBUM_READER } from "../invitations/application/invitation-guest-album";
import { InvitationPasswordModule } from "../invitations/invitation-password.module";
import {
  GetGuestAlbumUseCase,
  ReadPublicGuestAlbumUseCase,
  ReviewGuestPhotoUseCase,
  UploadGuestPhotoUseCase,
} from "./application/guest-album.use-cases";
import {
  GUEST_ALBUM_REPOSITORY,
  type GuestAlbumRepository,
} from "./application/guest-album.repository";
import {
  GUEST_ALBUM_RATE_LIMITER,
  type GuestAlbumRateLimiter,
} from "./application/guest-album-rate-limiter";
import { IMAGE_PROCESSOR } from "./application/image-processing";
import { MEDIA_REPOSITORY, type MediaRepository } from "./application/media.repository";
import {
  CleanupMediaUseCase,
  DeleteMediaUseCase,
  ListOwnMediaUseCase,
  type MediaLog,
  ReadOwnMediaLimitsUseCase,
  ReadPublicGalleryUseCase,
  ServeMediaUseCase,
  UpdateMediaUseCase,
  UploadMediaUseCase,
} from "./application/media.use-cases";
import { MEDIA_CATALOG, type MediaCatalog } from "./application/media-catalog";
import { MEDIA_STORAGE, type MediaStorage } from "./application/media-storage";
import { type AssetUrl, mediaUrl } from "./application/media-url";
import { createMediaStorage } from "./infrastructure/create-media-storage";
import { PrismaInvitationMediaCountReader } from "./infrastructure/prisma-invitation-media-count-reader";
import { PrismaGuestAlbumRateLimiter } from "./infrastructure/prisma-guest-album-rate-limiter";
import { PrismaGuestAlbumRepository } from "./infrastructure/prisma-guest-album.repository";
import { PrismaMediaRepository } from "./infrastructure/prisma-media.repository";
import { SharpImageProcessor } from "./infrastructure/sharp-image-processor";
import { InvitationsGuestAlbumController } from "./presentation/invitations-guest-album.controller";
import { InvitationsMediaController } from "./presentation/invitations-media.controller";
import { PublicGuestAlbumController } from "./presentation/public-guest-album.controller";
import { MediaController } from "./presentation/media.controller";

/** The log sink of media events: one structured line per event, never a key, an id, an owner, or image data. */
const MEDIA_LOG = Symbol("MediaLog");

/**
 * Binds the media adapter to the validated public origin, so every URL is `<origin>/media/<assetId>` and never a
 * provider URL (S4).
 */
function assetUrlFrom(config: ConfigService<RuntimeEnvironment, true>): AssetUrl {
  const publicBaseUrl = config.get("MEDIA", { infer: true }).publicBaseUrl;

  return (assetId: string) => mediaUrl(publicBaseUrl, assetId);
}

/**
 * Invitation media (M8 S1, S4): the storage port and its two adapters, the image-processing port and its sharp
 * adapter, the `MediaAsset` persistence port and its Prisma adapter, the creator routes, the one public serving route,
 * and the gallery the public invitation read renders. The module imports only the catalog's public contract — through
 * `MediaCatalog` — so it never queries a catalog table, and it imports no invitations repository: its own persistence
 * adapter scopes every statement by the invitation's owner, which is the ownership rule the API already uses (A4).
 * The media module implements the invitations module's `InvitationGalleryReader` port, so the public projection never
 * imports a media repository.
 *
 * M9 T13 adds the operational settings: the module imports `SettingsModule` and injects its one public read contract,
 * `OPERATIONAL_SETTINGS_READER`, so the upload reads the size cap and the two photo caps at the moment it checks them
 * (S5, S8) and never queries the settings table itself. A lowered cap refuses the next upload and leaves every stored
 * photo exactly where it is.
 */
@Module({
  // `CollaboratorsModule` provides the guard the owner routes declare and the one resolver it consults (F12; L17.4).
  // `InvitationPasswordModule` provides the gate the guests' album upload declares (F13; L18.2): the public album route
  // lives in this module, and the decision must be the invitations module's, so both import one module that owns it and
  // neither imports the other.
  imports: [CatalogModule, CollaboratorsModule, InvitationPasswordModule, SettingsModule],
  controllers: [
    InvitationsMediaController,
    MediaController,
    PublicGuestAlbumController,
    InvitationsGuestAlbumController,
  ],
  providers: [
    {
      provide: MEDIA_LOG,
      useFactory: (): MediaLog => {
        const logger = new Logger("Media");

        return (event) => logger.log(event);
      },
    },
    {
      provide: MEDIA_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<RuntimeEnvironment, true>): MediaStorage =>
        createMediaStorage(config.get("MEDIA", { infer: true })),
    },
    { provide: IMAGE_PROCESSOR, useClass: SharpImageProcessor },
    {
      provide: MEDIA_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): MediaRepository => new PrismaMediaRepository(prisma),
    },
    {
      provide: MEDIA_CATALOG,
      inject: [CATALOG_PUBLIC_READER],
      useFactory: (catalog: CatalogPublicContract): MediaCatalog => ({
        findPackageEntitlements: (packageId: string) => catalog.findPackageEntitlements(packageId),
      }),
    },
    {
      provide: UploadMediaUseCase,
      inject: [
        MEDIA_REPOSITORY,
        MEDIA_CATALOG,
        MEDIA_STORAGE,
        IMAGE_PROCESSOR,
        MEDIA_LOG,
        ConfigService,
        OPERATIONAL_SETTINGS_READER,
      ],
      useFactory: (
        invitations: MediaRepository,
        catalog: MediaCatalog,
        storage: MediaStorage,
        processor: SharpImageProcessor,
        log: MediaLog,
        config: ConfigService<RuntimeEnvironment, true>,
        settings: OperationalSettingsReader,
      ) =>
        new UploadMediaUseCase(invitations, catalog, storage, processor, {
          assetUrl: assetUrlFrom(config),
          log,
          settings,
        }),
    },
    {
      provide: ListOwnMediaUseCase,
      inject: [MEDIA_REPOSITORY, ConfigService],
      useFactory: (invitations: MediaRepository, config: ConfigService<RuntimeEnvironment, true>) =>
        new ListOwnMediaUseCase(invitations, { assetUrl: assetUrlFrom(config) }),
    },
    {
      // The upload bound the owner's page reads before it sends a photo (S5 «Tamaño de foto»): the same settings row
      // the upload itself checks, read on every call, so a panel save reaches the web without a redeploy.
      provide: ReadOwnMediaLimitsUseCase,
      inject: [MEDIA_REPOSITORY, OPERATIONAL_SETTINGS_READER],
      useFactory: (invitations: MediaRepository, settings: OperationalSettingsReader) =>
        new ReadOwnMediaLimitsUseCase(invitations, settings),
    },
    {
      provide: UpdateMediaUseCase,
      inject: [MEDIA_REPOSITORY, ConfigService],
      useFactory: (invitations: MediaRepository, config: ConfigService<RuntimeEnvironment, true>) =>
        new UpdateMediaUseCase(invitations, { assetUrl: assetUrlFrom(config) }),
    },
    {
      provide: DeleteMediaUseCase,
      inject: [MEDIA_REPOSITORY, MEDIA_STORAGE, MEDIA_LOG],
      useFactory: (invitations: MediaRepository, storage: MediaStorage, log: MediaLog) =>
        new DeleteMediaUseCase(invitations, storage, { log }),
    },
    {
      // One adapter serves the album's persistence port, the public read the projection consumes, and the cleanup's
      // retired-photo scan (F8; L11.1, L11.4, L11.6).
      provide: PrismaGuestAlbumRepository,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaGuestAlbumRepository(prisma),
    },
    { provide: GUEST_ALBUM_REPOSITORY, useExisting: PrismaGuestAlbumRepository },
    {
      provide: GUEST_ALBUM_RATE_LIMITER,
      // The same `RateLimit` table Better Auth and the other public forms use; only the prefix and the window are the
      // album's (F8; L11.3).
      useFactory: (prisma: PrismaService) => new PrismaGuestAlbumRateLimiter(prisma),
      inject: [PrismaService],
    },
    {
      provide: UploadGuestPhotoUseCase,
      inject: [
        GUEST_ALBUM_REPOSITORY,
        MEDIA_CATALOG,
        MEDIA_STORAGE,
        IMAGE_PROCESSOR,
        GUEST_ALBUM_RATE_LIMITER,
        MEDIA_LOG,
        ConfigService,
        OPERATIONAL_SETTINGS_READER,
      ],
      useFactory: (
        invitations: GuestAlbumRepository,
        catalog: MediaCatalog,
        storage: MediaStorage,
        processor: SharpImageProcessor,
        rateLimiter: GuestAlbumRateLimiter,
        log: MediaLog,
        config: ConfigService<RuntimeEnvironment, true>,
        settings: OperationalSettingsReader,
      ) =>
        new UploadGuestPhotoUseCase(invitations, catalog, storage, processor, rateLimiter, {
          assetUrl: assetUrlFrom(config),
          log,
          settings,
        }),
    },
    {
      provide: GetGuestAlbumUseCase,
      inject: [GUEST_ALBUM_REPOSITORY, ConfigService],
      useFactory: (
        invitations: GuestAlbumRepository,
        config: ConfigService<RuntimeEnvironment, true>,
      ) => new GetGuestAlbumUseCase(invitations, { assetUrl: assetUrlFrom(config) }),
    },
    {
      provide: ReviewGuestPhotoUseCase,
      inject: [GUEST_ALBUM_REPOSITORY, ConfigService],
      useFactory: (
        invitations: GuestAlbumRepository,
        config: ConfigService<RuntimeEnvironment, true>,
      ) => new ReviewGuestPhotoUseCase(invitations, { assetUrl: assetUrlFrom(config) }),
    },
    {
      provide: INVITATION_GUEST_ALBUM_READER,
      inject: [GUEST_ALBUM_REPOSITORY, ConfigService],
      useFactory: (
        invitations: GuestAlbumRepository,
        config: ConfigService<RuntimeEnvironment, true>,
      ) => new ReadPublicGuestAlbumUseCase(invitations, { assetUrl: assetUrlFrom(config) }),
    },
    {
      provide: ServeMediaUseCase,
      inject: [MEDIA_REPOSITORY, MEDIA_STORAGE, GUEST_ALBUM_REPOSITORY],
      useFactory: (
        invitations: MediaRepository,
        storage: MediaStorage,
        guestAlbum: GuestAlbumRepository,
      ) => new ServeMediaUseCase(invitations, storage, guestAlbum),
    },
    {
      provide: INVITATION_GALLERY_READER,
      inject: [MEDIA_REPOSITORY, ConfigService],
      useFactory: (
        invitations: MediaRepository,
        config: ConfigService<RuntimeEnvironment, true>,
      ): InvitationGalleryReader =>
        new ReadPublicGalleryUseCase(invitations, { assetUrl: assetUrlFrom(config) }),
    },
    {
      // The media facet of the administrator's invitation status view (M9 T2; S1): counts only, so the status view
      // reads no storage key, URL, alt text, or binary.
      provide: INVITATION_MEDIA_COUNT_READER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaInvitationMediaCountReader(prisma),
    },
    {
      provide: CleanupMediaUseCase,
      inject: [MEDIA_REPOSITORY, MEDIA_STORAGE, MEDIA_LOG, GUEST_ALBUM_REPOSITORY],
      useFactory: (
        invitations: MediaRepository,
        storage: MediaStorage,
        log: MediaLog,
        guestAlbum: GuestAlbumRepository,
      ) => new CleanupMediaUseCase(invitations, storage, log, { guestAlbum }),
    },
  ],
  exports: [
    INVITATION_GALLERY_READER,
    INVITATION_GUEST_ALBUM_READER,
    INVITATION_MEDIA_COUNT_READER,
  ],
})
export class MediaModule {}
