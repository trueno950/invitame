import { Module, type Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ADMIN_ACTION_RECORDER, type AdminActionRecorder } from "../admin/admin-action-recorder";
import { AdminModule } from "../admin/admin.module";
import {
  CATALOG_PUBLIC_READER,
  type CatalogPublicContract,
} from "../catalog/application/public/catalog-public-reader";
import { CatalogModule } from "../catalog/catalog.module";
import type { RuntimeEnvironment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { MediaModule } from "../media/media.module";
import { PaymentsModule } from "../payments/payments.module";
import { UsersModule } from "../users/users.module";
import { GUEST_REPOSITORY, type GuestRepository } from "./application/guest.repository";
import {
  ADMIN_INVITATION_REPOSITORY,
  type AdminInvitationRepository,
} from "./application/admin-invitation.repository";
import {
  GetAdminInvitationUseCase,
  ListAdminInvitationsUseCase,
  UnpublishAdminInvitationUseCase,
} from "./application/admin-invitation.use-cases";
import {
  INVITATION_MEDIA_COUNT_READER,
  type InvitationMediaCountReader,
} from "./application/invitation-media-counts";
import {
  INVITATION_OWNER_EMAIL_READER,
  type InvitationOwnerEmailReader,
} from "./application/invitation-owner-email";
import {
  INVITATION_OWNER_STATUS_READER,
  type InvitationOwnerStatusReader,
} from "./application/invitation-owner-status";
import {
  INVITATION_PAYMENT_READER,
  type InvitationPaymentReader,
} from "./application/invitation-payment-summary";
import {
  INVITATION_REPOSITORY,
  type InvitationRepository,
} from "./application/invitation.repository";
import {
  ArchiveInvitationUseCase,
  CreateInvitationDraftUseCase,
  GetOwnInvitationUseCase,
  GetPublicInvitationUseCase,
  ListOwnInvitationsUseCase,
  PublishInvitationUseCase,
  UnpublishInvitationUseCase,
  UpdateInvitationContentUseCase,
  UpdateInvitationFeaturesUseCase,
} from "./application/invitation.use-cases";
import { INVITATION_CATALOG, type InvitationCatalog } from "./application/invitation-catalog";
import {
  INVITATION_GALLERY_READER,
  type InvitationGalleryReader,
} from "./application/invitation-gallery";
import {
  CheckInGuestUseCase,
  CreateGuestUseCase,
  DeleteGuestUseCase,
  GetAttendanceExportUseCase,
  GetPublicGuestUseCase,
  ListGuestsUseCase,
  RotateGuestTokenUseCase,
  SubmitGuestRsvpUseCase,
  UpdateGuestUseCase,
} from "./application/invitation-guest.use-cases";
import {
  INVITATION_PAYMENT_GATE,
  type InvitationPaymentGate,
} from "./application/invitation-payment-gate";
import {
  ClearInvitationPlaceUseCase,
  SearchPlacesUseCase,
  UpdateInvitationPlaceUseCase,
} from "./application/invitation-place.use-cases";
import {
  GetRsvpResponsesUseCase,
  SubmitPublicRsvpUseCase,
  UpdateRsvpSettingsUseCase,
} from "./application/invitation-rsvp.use-cases";
import { MUSIC_METADATA_PROVIDER, type MusicMetadataProvider } from "./application/music-metadata";
import { PLACE_SEARCH, type PlaceSearch } from "./application/place-search";
import { InMemoryPlaceSearchCache } from "./application/place-search-cache";
import {
  PLACE_SEARCH_RATE_LIMITER,
  type PlaceSearchRateLimiter,
} from "./application/place-search-rate-limiter";
import { RSVP_REPOSITORY, type RsvpRepository } from "./application/rsvp.repository";
import { RSVP_RATE_LIMITER, type RsvpRateLimiter } from "./application/rsvp-rate-limiter";
import { CatalogInvitationReader } from "./infrastructure/catalog-invitation-reader";
import { createMusicMetadataProvider } from "./infrastructure/create-music-metadata-provider";
import { createPlaceSearch } from "./infrastructure/create-place-search";
import { PrismaAdminInvitationRepository } from "./infrastructure/prisma-admin-invitation.repository";
import { PrismaGuestRepository } from "./infrastructure/prisma-guest.repository";
import { PrismaInvitationRepository } from "./infrastructure/prisma-invitation.repository";
import { PrismaPlaceSearchRateLimiter } from "./infrastructure/prisma-place-search-rate-limiter";
import { PrismaRsvpRepository } from "./infrastructure/prisma-rsvp.repository";
import { PrismaRsvpRateLimiter } from "./infrastructure/prisma-rsvp-rate-limiter";
import { InvitationsController } from "./presentation/invitations.controller";
import { AdminInvitationsController } from "./presentation/admin-invitations.controller";
import { PublicInvitationsController } from "./presentation/public-invitations.controller";

/** A use case that needs both the invitation port and the catalog contract. */
function useCase(
  provide: new (invitations: InvitationRepository, catalog: InvitationCatalog) => unknown,
): Provider {
  return {
    provide,
    useFactory: (invitations: InvitationRepository, catalog: InvitationCatalog) =>
      new provide(invitations, catalog),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG],
  };
}

/**
 * The administrator's status view (M9 T2; S1): one global read port and its two use cases. Each use case reads its own
 * facets through the ports the payments, media, and users modules implement, so a page asks three narrow reads and
 * never another module's table.
 */
export const ADMIN_INVITATION_USE_CASES: Provider[] = [
  {
    provide: ListAdminInvitationsUseCase,
    useFactory: (
      invitations: AdminInvitationRepository,
      payments: InvitationPaymentReader,
      media: InvitationMediaCountReader,
      owners: InvitationOwnerEmailReader,
    ) => new ListAdminInvitationsUseCase(invitations, payments, media, owners),
    inject: [
      ADMIN_INVITATION_REPOSITORY,
      INVITATION_PAYMENT_READER,
      INVITATION_MEDIA_COUNT_READER,
      INVITATION_OWNER_EMAIL_READER,
    ],
  },
  {
    // The detail also reads the owner's account status (T9; S4), through the sibling port the users module implements.
    provide: GetAdminInvitationUseCase,
    useFactory: (
      invitations: AdminInvitationRepository,
      payments: InvitationPaymentReader,
      media: InvitationMediaCountReader,
      owners: InvitationOwnerEmailReader,
      ownerStatuses: InvitationOwnerStatusReader,
    ) => new GetAdminInvitationUseCase(invitations, payments, media, owners, ownerStatuses),
    inject: [
      ADMIN_INVITATION_REPOSITORY,
      INVITATION_PAYMENT_READER,
      INVITATION_MEDIA_COUNT_READER,
      INVITATION_OWNER_EMAIL_READER,
      INVITATION_OWNER_STATUS_READER,
    ],
  },
  {
    // The administrator's one write (T8; S4, S6): the port performs the transition and the audit row in one
    // transaction, and the detail use case then answers the same shape the read route serves.
    provide: UnpublishAdminInvitationUseCase,
    useFactory: (invitations: AdminInvitationRepository, detail: GetAdminInvitationUseCase) =>
      new UnpublishAdminInvitationUseCase(invitations, detail),
    inject: [ADMIN_INVITATION_REPOSITORY, GetAdminInvitationUseCase],
  },
];

/**
 * The invitation use cases, bound to whichever ports the module provides. The create use case draws its slug
 * from the domain generator over `Math.random` (its third, optional constructor argument), so the composition
 * file names no randomness of its own; the publish use case writes the current instant and asks the payment
 * gate (S6).
 */
export const INVITATION_USE_CASES: Provider[] = [
  {
    provide: ListOwnInvitationsUseCase,
    useFactory: (invitations: InvitationRepository) => new ListOwnInvitationsUseCase(invitations),
    inject: [INVITATION_REPOSITORY],
  },
  {
    provide: ArchiveInvitationUseCase,
    useFactory: (invitations: InvitationRepository) => new ArchiveInvitationUseCase(invitations),
    inject: [INVITATION_REPOSITORY],
  },
  {
    provide: UnpublishInvitationUseCase,
    useFactory: (invitations: InvitationRepository) => new UnpublishInvitationUseCase(invitations),
    inject: [INVITATION_REPOSITORY],
  },
  useCase(CreateInvitationDraftUseCase),
  useCase(GetOwnInvitationUseCase),
  // The place use cases (S1, S2): the search asks the geocoder port under the owner's own limit and cache, and both
  // writes validate the field against the pinned schema before storing the point.
  {
    provide: SearchPlacesUseCase,
    useFactory: (
      invitations: InvitationRepository,
      places: PlaceSearch,
      rateLimiter: PlaceSearchRateLimiter,
      cache: InMemoryPlaceSearchCache,
    ) => new SearchPlacesUseCase(invitations, places, rateLimiter, cache),
    inject: [
      INVITATION_REPOSITORY,
      PLACE_SEARCH,
      PLACE_SEARCH_RATE_LIMITER,
      InMemoryPlaceSearchCache,
    ],
  },
  useCase(UpdateInvitationPlaceUseCase),
  useCase(ClearInvitationPlaceUseCase),
  useCase(UpdateInvitationContentUseCase),
  {
    provide: UpdateInvitationFeaturesUseCase,
    // The feature save asks the music metadata port once when the playlist link changes (S2).
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      music: MusicMetadataProvider,
    ) => new UpdateInvitationFeaturesUseCase(invitations, catalog, music),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, MUSIC_METADATA_PROVIDER],
  },
  {
    provide: GetPublicInvitationUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      gallery: InvitationGalleryReader | undefined,
    ) => new GetPublicInvitationUseCase(invitations, catalog, gallery),
    // The media module implements the gallery port (M8 S4), so the public projection never queries media tables.
    // Optional, so a test module that composes the invitations read alone still projects a published invitation.
    inject: [
      INVITATION_REPOSITORY,
      INVITATION_CATALOG,
      { token: INVITATION_GALLERY_READER, optional: true },
    ],
  },
  {
    provide: PublishInvitationUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      payments: InvitationPaymentGate,
    ) => new PublishInvitationUseCase(invitations, catalog, payments),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, INVITATION_PAYMENT_GATE],
  },
  {
    provide: UpdateRsvpSettingsUseCase,
    useFactory: (invitations: InvitationRepository, rsvp: RsvpRepository) =>
      new UpdateRsvpSettingsUseCase(invitations, rsvp),
    inject: [INVITATION_REPOSITORY, RSVP_REPOSITORY],
  },
  {
    provide: GetRsvpResponsesUseCase,
    useFactory: (invitations: InvitationRepository, rsvp: RsvpRepository) =>
      new GetRsvpResponsesUseCase(invitations, rsvp),
    inject: [INVITATION_REPOSITORY, RSVP_REPOSITORY],
  },
  {
    provide: SubmitPublicRsvpUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      rsvp: RsvpRepository,
      rateLimiter: RsvpRateLimiter,
    ) => new SubmitPublicRsvpUseCase(invitations, catalog, rsvp, rateLimiter),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, RSVP_REPOSITORY, RSVP_RATE_LIMITER],
  },
  // The guest list (M6 G2): every use case needs the invitation port, the catalog gate, and the guest port.
  {
    provide: ListGuestsUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      guests: GuestRepository,
    ) => new ListGuestsUseCase(invitations, catalog, guests),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, GUEST_REPOSITORY],
  },
  {
    provide: CreateGuestUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      guests: GuestRepository,
    ) => new CreateGuestUseCase(invitations, catalog, guests),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, GUEST_REPOSITORY],
  },
  {
    provide: UpdateGuestUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      guests: GuestRepository,
    ) => new UpdateGuestUseCase(invitations, catalog, guests),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, GUEST_REPOSITORY],
  },
  {
    provide: DeleteGuestUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      guests: GuestRepository,
    ) => new DeleteGuestUseCase(invitations, catalog, guests),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, GUEST_REPOSITORY],
  },
  {
    provide: RotateGuestTokenUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      guests: GuestRepository,
    ) => new RotateGuestTokenUseCase(invitations, catalog, guests),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, GUEST_REPOSITORY],
  },
  {
    provide: GetPublicGuestUseCase,
    useFactory: (
      invitations: InvitationRepository,
      guests: GuestRepository,
      publicInvitations: GetPublicInvitationUseCase,
    ) => new GetPublicGuestUseCase(invitations, guests, publicInvitations),
    inject: [INVITATION_REPOSITORY, GUEST_REPOSITORY, GetPublicInvitationUseCase],
  },
  {
    provide: SubmitGuestRsvpUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      guests: GuestRepository,
      rateLimiter: RsvpRateLimiter,
    ) => new SubmitGuestRsvpUseCase(invitations, catalog, guests, rateLimiter),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, GUEST_REPOSITORY, RSVP_RATE_LIMITER],
  },
  {
    provide: CheckInGuestUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      guests: GuestRepository,
    ) => new CheckInGuestUseCase(invitations, catalog, guests),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, GUEST_REPOSITORY],
  },
  {
    provide: GetAttendanceExportUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      guests: GuestRepository,
      rsvp: RsvpRepository,
    ) => new GetAttendanceExportUseCase(invitations, catalog, guests, rsvp),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, GUEST_REPOSITORY, RSVP_REPOSITORY],
  },
];

/**
 * Invitations: creating, listing, reading, editing, archiving, publishing, and unpublishing a customer's own
 * invitations, the ownerless public read of a published slug, and the open RSVP of a published invitation
 * (M4 T3, T4, M5 T3, T4, M6 G1). The owner routes live at `/invitations` behind the global guard; the public read
 * and the public submission live under `/public/invitations/...` and carry `@Public()`, so the guard never reads a
 * session for a guest. This module binds the Prisma adapter to `INVITATION_REPOSITORY`, the catalog's exported
 * `CATALOG_PUBLIC_READER` to `INVITATION_CATALOG` through `CatalogInvitationReader`, the RSVP data adapter to
 * `RSVP_REPOSITORY`, and the RSVP rate limiter — the authentication flow's own `RateLimit` table — to
 * `RSVP_RATE_LIMITER`, so the invitations module never imports a catalog repository or queries a catalog table. The
 * owner routes read the owner only from the session (S9); ownership itself is enforced by the repository queries
 * (A4). Milestone 7 moves the payment gate out of this module: `PaymentsModule` binds `INVITATION_PAYMENT_GATE`
 * (S3, S4), and this module imports it, so the publish use case keeps asking the same port. Milestone 6 G2 adds the
 * guest list behind the same ports. The music metadata port is bound here to the adapter `MUSIC_METADATA_LOOKUP`
 * selects (S2), so the feature save calls one provider-neutral lookup and never names Spotify or YouTube. The place
 * search port is bound the same way through `PLACE_SEARCH_PROVIDER` (S2), and its rate limit counts on the shared
 * `RateLimit` table, so an owner cannot exhaust the free public geocoder.
 *
 * Milestone 9 adds the administrator's status view (T2; S1): `ADMIN_INVITATION_REPOSITORY` is the one global
 * invitation read, bound separately from the owner-scoped `INVITATION_REPOSITORY` exactly like the payments module's
 * refund port, so no owner use case can reach it. Its facets — the newest payment, the photo counts, and the owner's
 * email — arrive through three narrow ports this module declares and the payments, media, and users modules
 * implement, which is why this module imports `UsersModule` and neither queries nor joins another module's tables.
 *
 * Milestone 9 T8 adds the administrator's unpublish to the same port: the module imports `AdminModule` and injects its
 * `ADMIN_ACTION_RECORDER`, so the transition and its audit row share one transaction (S6, L9) and this module never
 * writes `AdminAction` itself. T9 adds the owner's account status to the detail through
 * `INVITATION_OWNER_STATUS_READER`, a sibling of the owner-email port that the users module implements, so the support
 * card can offer the account actions without this module reading a user table.
 */
@Module({
  imports: [AdminModule, CatalogModule, MediaModule, PaymentsModule, UsersModule],
  controllers: [InvitationsController, PublicInvitationsController, AdminInvitationsController],
  providers: [
    ...INVITATION_USE_CASES,
    ...ADMIN_INVITATION_USE_CASES,
    {
      // The administrator's one global invitation read and its one write, on the same client; the write also asks the
      // `admin` module's recorder, injected here so no other module reaches the audit table (T8; S6).
      provide: ADMIN_INVITATION_REPOSITORY,
      useFactory: (prisma: PrismaService, actions: AdminActionRecorder) =>
        new PrismaAdminInvitationRepository(prisma, actions),
      inject: [PrismaService, ADMIN_ACTION_RECORDER],
    },
    {
      provide: INVITATION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInvitationRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: PLACE_SEARCH,
      // `PLACE_SEARCH_PROVIDER` decides whether an address field may ask a geocoder at all, and which instance (S2).
      useFactory: (config: ConfigService<RuntimeEnvironment, true>): PlaceSearch =>
        createPlaceSearch(config.get("PLACE_SEARCH", { infer: true })),
      inject: [ConfigService],
    },
    {
      // One cache per process: bounded and expiring, so a typing session's repetitions cost the instance nothing.
      provide: InMemoryPlaceSearchCache,
      useFactory: () => new InMemoryPlaceSearchCache(),
      inject: [],
    },
    {
      provide: PLACE_SEARCH_RATE_LIMITER,
      // The same `RateLimit` table Better Auth and the RSVP form use; only the key prefix and the window are place's.
      useFactory: (prisma: PrismaService) => new PrismaPlaceSearchRateLimiter(prisma),
      inject: [PrismaService],
    },
    {
      provide: MUSIC_METADATA_PROVIDER,
      // `MUSIC_METADATA_LOOKUP` decides whether a save may call a provider's oEmbed endpoint at all (S2).
      useFactory: (config: ConfigService<RuntimeEnvironment, true>): MusicMetadataProvider =>
        createMusicMetadataProvider(config.get("MUSIC", { infer: true })),
      inject: [ConfigService],
    },
    {
      provide: INVITATION_CATALOG,
      // The token carries one object: the catalog's public reader also implements the rendering facet (M5 T3).
      useFactory: (catalog: CatalogPublicContract) => new CatalogInvitationReader(catalog),
      inject: [CATALOG_PUBLIC_READER],
    },
    {
      provide: RSVP_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaRsvpRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: RSVP_RATE_LIMITER,
      // The same `RateLimit` table Better Auth uses; only the key prefix and the window are RSVP's.
      useFactory: (prisma: PrismaService) => new PrismaRsvpRateLimiter(prisma),
      inject: [PrismaService],
    },
    {
      provide: GUEST_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaGuestRepository(prisma),
      inject: [PrismaService],
    },
  ],
})
export class InvitationsModule {}
