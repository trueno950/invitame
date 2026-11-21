import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  CATALOG_PUBLIC_READER,
  type CatalogPublicContract,
} from "../catalog/application/public/catalog-public-reader";
import { CatalogModule } from "../catalog/catalog.module";
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
import { PrismaMediaRepository } from "./infrastructure/prisma-media.repository";
import { SharpImageProcessor } from "./infrastructure/sharp-image-processor";
import { InvitationsMediaController } from "./presentation/invitations-media.controller";
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
  imports: [CatalogModule, SettingsModule],
  controllers: [InvitationsMediaController, MediaController],
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
      provide: ServeMediaUseCase,
      inject: [MEDIA_REPOSITORY, MEDIA_STORAGE],
      useFactory: (invitations: MediaRepository, storage: MediaStorage) =>
        new ServeMediaUseCase(invitations, storage),
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
      inject: [MEDIA_REPOSITORY, MEDIA_STORAGE, MEDIA_LOG],
      useFactory: (invitations: MediaRepository, storage: MediaStorage, log: MediaLog) =>
        new CleanupMediaUseCase(invitations, storage, log),
    },
  ],
  exports: [INVITATION_GALLERY_READER, INVITATION_MEDIA_COUNT_READER],
})
export class MediaModule {}
