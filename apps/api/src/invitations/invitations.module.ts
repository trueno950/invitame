import { Module, type Provider } from "@nestjs/common";

import {
  CATALOG_PUBLIC_READER,
  type CatalogPublicContract,
} from "../catalog/application/public/catalog-public-reader";
import { CatalogModule } from "../catalog/catalog.module";
import { PrismaService } from "../database/prisma.service";
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
  INVITATION_PAYMENT_GATE,
  type InvitationPaymentGate,
} from "./application/invitation-payment-gate";
import { CatalogInvitationReader } from "./infrastructure/catalog-invitation-reader";
import { NoPaymentRequiredGate } from "./infrastructure/no-payment-required";
import { PrismaInvitationRepository } from "./infrastructure/prisma-invitation.repository";
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
  useCase(GetPublicInvitationUseCase),
  {
    provide: PublishInvitationUseCase,
    useFactory: (
      invitations: InvitationRepository,
      catalog: InvitationCatalog,
      payments: InvitationPaymentGate,
    ) => new PublishInvitationUseCase(invitations, catalog, payments),
    inject: [INVITATION_REPOSITORY, INVITATION_CATALOG, INVITATION_PAYMENT_GATE],
  },
];

/**
 * Invitations: creating, listing, reading, editing, archiving, publishing, and unpublishing a customer's own
 * invitations, and the ownerless public read of a published slug (M4 T3, T4, M5 T3, T4). The owner routes live
 * at `/invitations` behind the global guard; the public read is `/public/invitations/:slug` and carries
 * `@Public()`, so the guard never reads a session for a guest. This module binds the Prisma adapter to
 * `INVITATION_REPOSITORY`, the catalog's exported `CATALOG_PUBLIC_READER` to `INVITATION_CATALOG` through
 * `CatalogInvitationReader`, and the always-free payment gate to `INVITATION_PAYMENT_GATE`, so the invitations
 * module never imports a catalog repository or queries a catalog table. The owner routes read the owner only from
 * the session (S9); ownership itself is enforced by the repository queries (A4). Milestone 7 replaces only the
 * payment provider (S6).
 */
@Module({
  imports: [CatalogModule],
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
      provide: INVITATION_PAYMENT_GATE,
      useFactory: () => new NoPaymentRequiredGate(),
    },
  ],
})
export class InvitationsModule {}
