import { Module, type Provider } from "@nestjs/common";

import {
  CATALOG_PUBLIC_READER,
  type CatalogPublicContract,
} from "../catalog/application/public/catalog-public-reader";
import { CatalogModule } from "../catalog/catalog.module";
import { PrismaService } from "../database/prisma.service";
import { MediaModule } from "../media/media.module";
import { PaymentsModule } from "../payments/payments.module";
import { GUEST_REPOSITORY, type GuestRepository } from "./application/guest.repository";
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
  GetRsvpResponsesUseCase,
  SubmitPublicRsvpUseCase,
  UpdateRsvpSettingsUseCase,
} from "./application/invitation-rsvp.use-cases";
import { RSVP_REPOSITORY, type RsvpRepository } from "./application/rsvp.repository";
import { RSVP_RATE_LIMITER, type RsvpRateLimiter } from "./application/rsvp-rate-limiter";
import { CatalogInvitationReader } from "./infrastructure/catalog-invitation-reader";
import { PrismaGuestRepository } from "./infrastructure/prisma-guest.repository";
import { PrismaInvitationRepository } from "./infrastructure/prisma-invitation.repository";
import { PrismaRsvpRepository } from "./infrastructure/prisma-rsvp.repository";
import { PrismaRsvpRateLimiter } from "./infrastructure/prisma-rsvp-rate-limiter";
import { InvitationsController } from "./presentation/invitations.controller";
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
  useCase(UpdateInvitationContentUseCase),
  useCase(UpdateInvitationFeaturesUseCase),
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
 * guest list behind the same ports.
 */
@Module({
  imports: [CatalogModule, MediaModule, PaymentsModule],
  controllers: [InvitationsController, PublicInvitationsController],
  providers: [
    ...INVITATION_USE_CASES,
    {
      provide: INVITATION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInvitationRepository(prisma),
      inject: [PrismaService],
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
