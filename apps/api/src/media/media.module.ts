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
  INVITATION_GALLERY_READER,
  type InvitationGalleryReader,
} from "../invitations/application/invitation-gallery";
import { IMAGE_PROCESSOR } from "./application/image-processing";
import { MEDIA_REPOSITORY, type MediaRepository } from "./application/media.repository";
import {
  CleanupMediaUseCase,
  DeleteMediaUseCase,
  ListOwnMediaUseCase,
  type MediaLog,
  ReadPublicGalleryUseCase,
  ServeMediaUseCase,
  UpdateMediaUseCase,
  UploadMediaUseCase,
} from "./application/media.use-cases";
import { MEDIA_CATALOG, type MediaCatalog } from "./application/media-catalog";
import { MEDIA_STORAGE, type MediaStorage } from "./application/media-storage";
import { type AssetUrl, mediaUrl } from "./application/media-url";
import { createMediaStorage } from "./infrastructure/create-media-storage";
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
 */
@Module({
  imports: [CatalogModule],
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
      ],
      useFactory: (
        invitations: MediaRepository,
        catalog: MediaCatalog,
        storage: MediaStorage,
        processor: SharpImageProcessor,
        log: MediaLog,
        config: ConfigService<RuntimeEnvironment, true>,
      ) =>
        new UploadMediaUseCase(invitations, catalog, storage, processor, {
          assetUrl: assetUrlFrom(config),
          log,
        }),
    },
    {
      provide: ListOwnMediaUseCase,
      inject: [MEDIA_REPOSITORY, ConfigService],
      useFactory: (invitations: MediaRepository, config: ConfigService<RuntimeEnvironment, true>) =>
        new ListOwnMediaUseCase(invitations, { assetUrl: assetUrlFrom(config) }),
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
      provide: CleanupMediaUseCase,
      inject: [MEDIA_REPOSITORY, MEDIA_STORAGE, MEDIA_LOG],
      useFactory: (invitations: MediaRepository, storage: MediaStorage, log: MediaLog) =>
        new CleanupMediaUseCase(invitations, storage, log),
    },
  ],
  exports: [INVITATION_GALLERY_READER],
})
export class MediaModule {}
