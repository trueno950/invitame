import { Module, type Provider } from "@nestjs/common";

import {
  CATALOG_PUBLIC_READER,
  type CatalogPublicReader,
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
  ListOwnInvitationsUseCase,
  UpdateInvitationContentUseCase,
} from "./application/invitation.use-cases";
import { INVITATION_CATALOG, type InvitationCatalog } from "./application/invitation-catalog";
import { CatalogInvitationReader } from "./infrastructure/catalog-invitation-reader";
import { PrismaInvitationRepository } from "./infrastructure/prisma-invitation.repository";
import { InvitationsController } from "./presentation/invitations.controller";

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
 * file names no randomness of its own.
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
  useCase(CreateInvitationDraftUseCase),
  useCase(GetOwnInvitationUseCase),
  useCase(UpdateInvitationContentUseCase),
];

/**
 * Invitations: creating, listing, reading, editing, and archiving a customer's own drafts (M4 T3 and T4), at
 * `/invitations`. This module binds the Prisma adapter to `INVITATION_REPOSITORY` and the catalog's exported
 * `CATALOG_PUBLIC_READER` to `INVITATION_CATALOG` through `CatalogInvitationReader`, so the invitations module
 * never imports a catalog repository or queries a catalog table. The controller authenticates through the global
 * guard and reads the owner only from the session (S9); ownership itself is enforced by the repository queries
 * (A4).
 */
@Module({
  imports: [CatalogModule],
  controllers: [InvitationsController],
  providers: [
    ...INVITATION_USE_CASES,
    {
      provide: INVITATION_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaInvitationRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: INVITATION_CATALOG,
      useFactory: (catalog: CatalogPublicReader) => new CatalogInvitationReader(catalog),
      inject: [CATALOG_PUBLIC_READER],
    },
  ],
})
export class InvitationsModule {}
