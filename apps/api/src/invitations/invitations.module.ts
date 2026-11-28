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
import { CollaboratorsModule } from "../collaborators/collaborators.module";
import { PrismaService } from "../database/prisma.service";
import { MediaModule } from "../media/media.module";
import {
  OPERATIONAL_SETTINGS_READER,
  type OperationalSettingsReader,
} from "../settings/application/operational-settings";
import { SettingsModule } from "../settings/settings.module";
import { PaymentsModule } from "../payments/payments.module";
import { REMINDER_SENDER, type ReminderSender } from "../reminders/application/reminder-sender";
import { RemindersModule } from "../reminders/reminders.module";
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
  ADMIN_ANALYTICS_REPOSITORY,
  type AdminAnalyticsRepository,
  INVITATION_FUNNEL_PAYMENT_READER,
  type InvitationFunnelPaymentReader,
} from "./application/admin-analytics";
import {
  GetAdminFunnelAnalyticsUseCase,
  GetAdminViewsAnalyticsUseCase,
} from "./application/admin-analytics.use-cases";
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
  type InvitationViewRepository,
  INVITATION_VIEW_REPOSITORY,
  RecordInvitationViewUseCase,
} from "./application/invitation-views";
import { INVITATION_VIEW_RETENTION_REPOSITORY } from "./application/invitation-view-retention";
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
import {
  GetGuestbookEntriesUseCase,
  SetGuestbookEntryHiddenUseCase,
  SubmitPublicGuestbookEntryUseCase,
} from "./application/invitation-guestbook.use-cases";
import { MUSIC_METADATA_PROVIDER, type MusicMetadataProvider } from "./application/music-metadata";
import {
  CheckInvitationSlugAvailabilityUseCase,
  RenameInvitationSlugUseCase,
} from "./application/invitation-slug.use-cases";
import {
  ClearInvitationPasswordUseCase,
  SetInvitationPasswordUseCase,
} from "./application/invitation-password.use-cases";
import { UnlockInvitationUseCase } from "./application/invitation-unlock.use-cases";
import {
  INVITATION_UNLOCK_RATE_LIMITER,
  type InvitationUnlockRateLimiter,
} from "./application/invitation-unlock-rate-limiter";
import {
  INVITATION_ACCESS_TOKENS,
  type InvitationAccessTokens,
} from "./application/invitation-access-token";
import { INVITATION_LOCK_READER, type InvitationLockReader } from "./application/invitation-lock";
import { PrismaInvitationUnlockRateLimiter } from "./infrastructure/prisma-invitation-unlock-rate-limiter";
import { InvitationPasswordModule } from "./invitation-password.module";
import {
  SLUG_AVAILABILITY_RATE_LIMITER,
  type SlugAvailabilityRateLimiter,
} from "./application/slug-availability-rate-limiter";
import { PLACE_SEARCH, type PlaceSearch } from "./application/place-search";
import { InMemoryPlaceSearchCache } from "./application/place-search-cache";
import {
  PLACE_SEARCH_RATE_LIMITER,
  type PlaceSearchRateLimiter,
} from "./application/place-search-rate-limiter";
import {
  INVITATION_GUEST_ALBUM_READER,
  type InvitationGuestAlbumReader,
} from "./application/invitation-guest-album";
import {
  GUESTBOOK_REPOSITORY,
  type GuestbookRepository,
  INVITATION_GUESTBOOK_READER,
  type InvitationGuestbookReader,
} from "./application/guestbook.repository";
import {
  GUESTBOOK_RATE_LIMITER,
  type GuestbookRateLimiter,
} from "./application/guestbook-rate-limiter";
import { RSVP_REPOSITORY, type RsvpRepository } from "./application/rsvp.repository";
import { RSVP_RATE_LIMITER, type RsvpRateLimiter } from "./application/rsvp-rate-limiter";
import { CatalogInvitationReader } from "./infrastructure/catalog-invitation-reader";
import { createMusicMetadataProvider } from "./infrastructure/create-music-metadata-provider";
import { createPlaceSearch } from "./infrastructure/create-place-search";
import { PrismaAdminInvitationRepository } from "./infrastructure/prisma-admin-invitation.repository";
import { PrismaAdminAnalyticsRepository } from "./infrastructure/prisma-admin-analytics.repository";
import { PrismaInvitationViewRepository } from "./infrastructure/prisma-invitation-view.repository";
import { PrismaGuestRepository } from "./infrastructure/prisma-guest.repository";
import { PrismaInvitationRepository } from "./infrastructure/prisma-invitation.repository";
import { PrismaPlaceSearchRateLimiter } from "./infrastructure/prisma-place-search-rate-limiter";
import { PrismaRsvpRepository } from "./infrastructure/prisma-rsvp.repository";
import { PrismaRsvpRateLimiter } from "./infrastructure/prisma-rsvp-rate-limiter";
import { PrismaGuestbookRepository } from "./infrastructure/prisma-guestbook.repository";
import { PrismaGuestbookRateLimiter } from "./infrastructure/prisma-guestbook-rate-limiter";
import { PrismaSlugAvailabilityRateLimiter } from "./infrastructure/prisma-slug-availability-rate-limiter";
import { InvitationsController } from "./presentation/invitations.controller";
import { AdminAnalyticsController } from "./presentation/admin-analytics.controller";
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
    // The detail also reads the owner's account status (T9; S4), through the sibling port the users module implements,
    // and its own analytics facet (M9 T11; S2): the retained views of the last ninety days and the RSVP totals, through
    // this module's own repository, never the owner read.
    provide: GetAdminInvitationUseCase,
    useFactory: (
      invitations: AdminInvitationRepository,
      payments: InvitationPaymentReader,
      media: InvitationMediaCountReader,
      owners: InvitationOwnerEmailReader,
      ownerStatuses: InvitationOwnerStatusReader,
      analytics: AdminAnalyticsRepository,
    ) =>
      new GetAdminInvitationUseCase(invitations, payments, media, owners, ownerStatuses, analytics),
    inject: [
      ADMIN_INVITATION_REPOSITORY,
      INVITATION_PAYMENT_READER,
      INVITATION_MEDIA_COUNT_READER,
      INVITATION_OWNER_EMAIL_READER,
      INVITATION_OWNER_STATUS_READER,
      ADMIN_ANALYTICS_REPOSITORY,
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
 * The administrator's analytics (M9 T11; S2, S3, S7): the views read and the funnel read over the same repository, and
 * the payment steps of the funnel through the port the payments module implements. Both use cases resolve their own
 * window from the request, so nothing here depends on the clock.
 */
export const ADMIN_ANALYTICS_USE_CASES: Provider[] = [
  {
    provide: GetAdminViewsAnalyticsUseCase,
    // The window a request that names neither bound reads is the settings row's default (M9 T13; S5, S8); the
    // ninety-day maximum stays fixed in the domain.
    useFactory: (analytics: AdminAnalyticsRepository, settings: OperationalSettingsReader) =>
      new GetAdminViewsAnalyticsUseCase(analytics, undefined, settings),
    inject: [ADMIN_ANALYTICS_REPOSITORY, OPERATIONAL_SETTINGS_READER],
  },
  {
    provide: GetAdminFunnelAnalyticsUseCase,
    useFactory: (
      analytics: AdminAnalyticsRepository,
      payments: InvitationFunnelPaymentReader,
      settings: OperationalSettingsReader,
    ) => new GetAdminFunnelAnalyticsUseCase(analytics, payments, undefined, settings),
    inject: [
      ADMIN_ANALYTICS_REPOSITORY,
      INVITATION_FUNNEL_PAYMENT_READER,
      OPERATIONAL_SETTINGS_READER,
    ],
  },
];

/**
 * The invitation use cases, bound to whichever ports the module provides. The create use case draws its slug
 * from the domain generator over `Math.random` (its third, optional constructor argument), so the composition
 * file names no randomness of its own; the publish use case writes the current instant and asks the payment
 * gate (S6).
 */
export const INVITATION_USE_CASES: Provider[] = [
  // The list answers each card's content and its pinned version's renderer (T2; S2.6), so it asks the catalog too.
  useCase(ListOwnInvitationsUseCase),
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
  {
    provide: CreateInvitationDraftUseCase,
    // The draft's default party limit is the settings row's (M9 T13; S5, S8), read when the draft is created.
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      settings: OperationalSettingsReader,
      reminders: ReminderSender,
    ) => new CreateInvitationDraftUseCase(invitations, catalog, undefined, settings, reminders),
    inject: [
      INVITATION_REPOSITORY,
      INVITATION_CATALOG,
      OPERATIONAL_SETTINGS_READER,
      REMINDER_SENDER,
    ],
  },
  {
    provide: GetOwnInvitationUseCase,
    // The owner's read states whether this deployment can deliver a reminder (F6; S6, L9.5): a capability, never a
    // secret, and never a message.
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      reminders: ReminderSender,
    ) => new GetOwnInvitationUseCase(invitations, catalog, reminders),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, REMINDER_SENDER],
  },
  // The place use cases (S1, S2): the search asks the geocoder port under the owner's own limit and cache, and both
  // writes validate the field against the pinned schema before storing the point.
  {
    provide: SearchPlacesUseCase,
    // How many suggestions reach the owner is the settings row's (M9 T13; S5, S8), read on every search.
    useFactory: (
      invitations: InvitationRepository,
      places: PlaceSearch,
      rateLimiter: PlaceSearchRateLimiter,
      cache: InMemoryPlaceSearchCache,
      settings: OperationalSettingsReader,
    ) => new SearchPlacesUseCase(invitations, places, rateLimiter, cache, settings),
    inject: [
      INVITATION_REPOSITORY,
      PLACE_SEARCH,
      PLACE_SEARCH_RATE_LIMITER,
      InMemoryPlaceSearchCache,
      OPERATIONAL_SETTINGS_READER,
    ],
  },
  useCase(UpdateInvitationPlaceUseCase),
  useCase(ClearInvitationPlaceUseCase),
  // The custom address (F11; S2.11, L15.3): the check answers one of four words under the owner's own limit, and the
  // rename stores the previous address as an alias so an already shared link keeps working.
  {
    provide: CheckInvitationSlugAvailabilityUseCase,
    useFactory: (invitations: InvitationRepository, rateLimiter: SlugAvailabilityRateLimiter) =>
      new CheckInvitationSlugAvailabilityUseCase(invitations, rateLimiter),
    inject: [INVITATION_REPOSITORY, SLUG_AVAILABILITY_RATE_LIMITER],
  },
  {
    provide: RenameInvitationSlugUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      reminders: ReminderSender,
      rateLimiter: SlugAvailabilityRateLimiter,
    ) => new RenameInvitationSlugUseCase(invitations, catalog, reminders, rateLimiter),
    inject: [
      INVITATION_REPOSITORY,
      INVITATION_CATALOG,
      REMINDER_SENDER,
      SLUG_AVAILABILITY_RATE_LIMITER,
    ],
  },
  {
    provide: UpdateInvitationContentUseCase,
    // A content save answers the same owned read, so it states the same reminder capability (F6; S6).
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      reminders: ReminderSender,
    ) => new UpdateInvitationContentUseCase(invitations, catalog, reminders),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, REMINDER_SENDER],
  },
  {
    provide: UpdateInvitationFeaturesUseCase,
    // The feature save asks the music metadata port once when the playlist link changes (S2).
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      music: MusicMetadataProvider,
      reminders: ReminderSender,
    ) => new UpdateInvitationFeaturesUseCase(invitations, catalog, music, reminders),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, MUSIC_METADATA_PROVIDER, REMINDER_SENDER],
  },
  // The owner's two access-code writes (F13; S2.13, L18.1): the set is gated by the pinned package's
  // PASSWORD_PROTECTION key, the removal is not, and both raise the stored version so every older token stops working.
  {
    provide: SetInvitationPasswordUseCase,
    useFactory: (invitations: InvitationRepository, catalog: InvitationCatalog) =>
      new SetInvitationPasswordUseCase(invitations, catalog),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG],
  },
  {
    provide: ClearInvitationPasswordUseCase,
    useFactory: (invitations: InvitationRepository) =>
      new ClearInvitationPasswordUseCase(invitations),
    inject: [INVITATION_REPOSITORY],
  },
  {
    // The guest's exchange of the shared code for an access token (F13; L18.2, L18.3): the same lock read and token
    // service the guard consults, and the attempt limit on the shared RateLimit table.
    provide: UnlockInvitationUseCase,
    useFactory: (
      locks: InvitationLockReader,
      tokens: InvitationAccessTokens,
      rateLimiter: InvitationUnlockRateLimiter,
    ) => new UnlockInvitationUseCase(locks, tokens, rateLimiter),
    inject: [INVITATION_LOCK_READER, INVITATION_ACCESS_TOKENS, INVITATION_UNLOCK_RATE_LIMITER],
  },
  {
    provide: GetPublicInvitationUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      guestAlbum: InvitationGuestAlbumReader,
      gallery: InvitationGalleryReader | undefined,
      guestbook: InvitationGuestbookReader | undefined,
    ) =>
      new GetPublicInvitationUseCase(
        invitations,
        catalog,
        guestAlbum,
        gallery,
        undefined,
        guestbook,
      ),
    // The media module implements the album port (F8; L11.4, L26) and it is REQUIRED: a deployment that forgot it would
    // show every guest an empty album, so the module fails at startup instead. The gallery (M8 S4) and the guestbook
    // (F7; L10.4) stay optional, so a test module that composes the invitations read alone still projects a published
    // invitation.
    inject: [
      INVITATION_REPOSITORY,
      INVITATION_CATALOG,
      INVITATION_GUEST_ALBUM_READER,
      { token: INVITATION_GALLERY_READER, optional: true },
      { token: INVITATION_GUESTBOOK_READER, optional: true },
    ],
  },
  {
    // Counting one served opening (M9 T11; S2, S7): one statement, started by the public read and never awaited by it.
    provide: RecordInvitationViewUseCase,
    useFactory: (views: InvitationViewRepository) => new RecordInvitationViewUseCase(views),
    inject: [INVITATION_VIEW_REPOSITORY],
  },
  {
    provide: PublishInvitationUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      payments: InvitationPaymentGate,
      reminders: ReminderSender,
    ) => new PublishInvitationUseCase(invitations, catalog, payments, undefined, reminders),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, INVITATION_PAYMENT_GATE, REMINDER_SENDER],
  },
  {
    provide: UpdateRsvpSettingsUseCase,
    // The platform-wide maximum party size is the settings row's (M9 T13; S5, S8): a save above it is refused, and a
    // stored limit above a lowered maximum keeps its value.
    useFactory: (
      invitations: InvitationRepository,
      rsvp: RsvpRepository,
      settings: OperationalSettingsReader,
    ) => new UpdateRsvpSettingsUseCase(invitations, rsvp, settings),
    inject: [INVITATION_REPOSITORY, RSVP_REPOSITORY, OPERATIONAL_SETTINGS_READER],
  },
  {
    provide: GetRsvpResponsesUseCase,
    useFactory: (invitations: InvitationRepository, rsvp: RsvpRepository) =>
      new GetRsvpResponsesUseCase(invitations, rsvp),
    inject: [INVITATION_REPOSITORY, RSVP_REPOSITORY],
  },
  {
    provide: SubmitPublicRsvpUseCase,
    // The widest party at submit is the invitation's own limit capped by the settings row's maximum (M9 T13; S5, S8).
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      rsvp: RsvpRepository,
      rateLimiter: RsvpRateLimiter,
      settings: OperationalSettingsReader,
    ) => new SubmitPublicRsvpUseCase(invitations, catalog, rsvp, rateLimiter, undefined, settings),
    inject: [
      INVITATION_REPOSITORY,
      INVITATION_CATALOG,
      RSVP_REPOSITORY,
      RSVP_RATE_LIMITER,
      OPERATIONAL_SETTINGS_READER,
    ],
  },
  // The guestbook (F7; S2.7, L10): the guest's signature, and the owner's read and one moderation write.
  {
    provide: SubmitPublicGuestbookEntryUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      guestbook: GuestbookRepository,
      rateLimiter: GuestbookRateLimiter,
    ) => new SubmitPublicGuestbookEntryUseCase(invitations, catalog, guestbook, rateLimiter),
    inject: [
      INVITATION_REPOSITORY,
      INVITATION_CATALOG,
      GUESTBOOK_REPOSITORY,
      GUESTBOOK_RATE_LIMITER,
    ],
  },
  {
    provide: GetGuestbookEntriesUseCase,
    useFactory: (invitations: InvitationRepository, guestbook: GuestbookRepository) =>
      new GetGuestbookEntriesUseCase(invitations, guestbook),
    inject: [INVITATION_REPOSITORY, GUESTBOOK_REPOSITORY],
  },
  {
    provide: SetGuestbookEntryHiddenUseCase,
    useFactory: (invitations: InvitationRepository, guestbook: GuestbookRepository) =>
      new SetGuestbookEntryHiddenUseCase(invitations, guestbook),
    inject: [INVITATION_REPOSITORY, GUESTBOOK_REPOSITORY],
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
    useFactory: (guests: GuestRepository, publicInvitations: GetPublicInvitationUseCase) =>
      new GetPublicGuestUseCase(guests, publicInvitations),
    inject: [GUEST_REPOSITORY, GetPublicInvitationUseCase],
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
 * F6 (S2.6, S6, L9) adds the WhatsApp reminder capability, and the owned reads state it: this module imports
 * `RemindersModule` for its `REMINDER_SENDER` port — never its adapter — and the use cases read only
 * `isConfigured()`, so the editor's «Aún no está activo» is a capability and never a secret.
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
  imports: [
    AdminModule,
    CatalogModule,
    // The one authorization resolver every invitation route consults, and the guard its controllers declare (F12;
    // L17.4). The module exports both, so this one never reaches the collaborator table's repository directly.
    CollaboratorsModule,
    // The gate of a password-protected invitation (F13; L18.2): the one lock read, the token service, and the guard the
    // public controllers declare. It imports nothing from this module, so the two directions cannot cycle.
    InvitationPasswordModule,
    MediaModule,
    PaymentsModule,
    RemindersModule,
    SettingsModule,
    UsersModule,
  ],
  controllers: [
    InvitationsController,
    PublicInvitationsController,
    AdminInvitationsController,
    AdminAnalyticsController,
  ],
  providers: [
    ...INVITATION_USE_CASES,
    ...ADMIN_INVITATION_USE_CASES,
    ...ADMIN_ANALYTICS_USE_CASES,
    {
      // The analytics reads of this module: the views table, the invitation funnel steps, and one invitation's
      // retained views with its RSVP totals (M9 T11; S2).
      provide: ADMIN_ANALYTICS_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaAdminAnalyticsRepository(prisma),
      inject: [PrismaService],
    },
    {
      // One adapter for the views table: the counted upsert the public reads run and the two bounded statements of the
      // retention command (M9 T11; S2, S3, S7).
      provide: PrismaInvitationViewRepository,
      useFactory: (prisma: PrismaService) => new PrismaInvitationViewRepository(prisma),
      inject: [PrismaService],
    },
    { provide: INVITATION_VIEW_REPOSITORY, useExisting: PrismaInvitationViewRepository },
    { provide: INVITATION_VIEW_RETENTION_REPOSITORY, useExisting: PrismaInvitationViewRepository },
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
      provide: SLUG_AVAILABILITY_RATE_LIMITER,
      // The same `RateLimit` table again; only the key prefix and the window are the address check's (F11; L15.3).
      useFactory: (prisma: PrismaService) => new PrismaSlugAvailabilityRateLimiter(prisma),
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
      // One adapter serves the guestbook's write/read port and the public read the projection consumes (F7; L10.4).
      provide: PrismaGuestbookRepository,
      useFactory: (prisma: PrismaService) => new PrismaGuestbookRepository(prisma),
      inject: [PrismaService],
    },
    { provide: GUESTBOOK_REPOSITORY, useExisting: PrismaGuestbookRepository },
    { provide: INVITATION_GUESTBOOK_READER, useExisting: PrismaGuestbookRepository },
    {
      provide: GUESTBOOK_RATE_LIMITER,
      // The same `RateLimit` table Better Auth and the RSVP form use; only the key prefix and the window are the
      // guestbook's (F7; L10.3).
      useFactory: (prisma: PrismaService) => new PrismaGuestbookRateLimiter(prisma),
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
    {
      provide: INVITATION_UNLOCK_RATE_LIMITER,
      // The same `RateLimit` table Better Auth and every other public form use; only the key prefix and the window are the
      // unlock route's (F13; L18.3, L33: a hard verification ceiling and two soft failure budgets).
      useFactory: (prisma: PrismaService) => new PrismaInvitationUnlockRateLimiter(prisma),
      inject: [PrismaService],
    },
  ],
})
export class InvitationsModule {}
