import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { RuntimeEnvironment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { EmailDeliveryService } from "../email/application/email-delivery.service";
import { EmailModule } from "../email/email.module";
import {
  AcceptCollaborationUseCase,
  InviteCollaboratorUseCase,
  ListInvitationCollaboratorsUseCase,
  RevokeCollaboratorUseCase,
  UpdateCollaboratorPermissionsUseCase,
} from "./application/collaborator.use-cases";
import {
  INVITATION_COLLABORATOR_REPOSITORY,
  type InvitationCollaboratorRepository,
} from "./application/collaborator.repository";
import {
  COLLABORATOR_ACCEPTANCE_LINK,
  type CollaboratorAcceptanceLink,
  collaboratorAcceptanceUrl,
} from "./application/collaborator-invitation-message";
import {
  INVITATION_ACCESS_RESOLVER,
  StoredInvitationAccessResolver,
} from "./application/invitation-access";
import { PrismaInvitationCollaboratorRepository } from "./infrastructure/prisma-invitation-collaborator.repository";
import {
  CollaborationsController,
  InvitationsCollaboratorsController,
} from "./presentation/collaborators.controller";
import { InvitationAccessGuard } from "./presentation/invitation-access.guard";

/**
 * The co-hosts (F12; S2.12, L17). This module owns the collaborator table's persistence, the invite/accept/list/update/
 * revoke use cases, the owner's screen, and the one authorization resolver every other invitation route consults.
 *
 * It imports nothing from the invitations, media, or payments modules, so the resolver can be consumed by all three
 * without a cycle: its adapter reads the invitation's owner and its pinned package's feature keys itself, which is the
 * same cross-module rule the media adapter already follows (a module's own persistence, never another module's
 * repository). It imports `EmailModule` for the one existing delivery port, and nothing else: no new provider, no new
 * transport, no new configuration key. The emailed link names the web origin, which is the first trusted origin the
 * validated configuration states — the same list CORS and Better Auth already trust.
 *
 * `InvitationAccessGuard` and `INVITATION_ACCESS_RESOLVER` are exported, because the invitation, media, and payment
 * controllers declare the guard on their own routes; a module that does not import this one keeps answering exactly as
 * before, which is what the matrix test verifies route by route.
 */
@Module({
  imports: [EmailModule],
  controllers: [InvitationsCollaboratorsController, CollaborationsController],
  providers: [
    {
      provide: INVITATION_COLLABORATOR_REPOSITORY,
      useFactory: (prisma: PrismaService): InvitationCollaboratorRepository =>
        new PrismaInvitationCollaboratorRepository(prisma),
      inject: [PrismaService],
    },
    {
      // One resolver for every invitation route (L17.4): owner, collaborator with permissions, or nothing, read from the
      // database on every request so a revoke ends the access on the next one.
      provide: INVITATION_ACCESS_RESOLVER,
      useFactory: (collaborators: InvitationCollaboratorRepository) =>
        new StoredInvitationAccessResolver(collaborators),
      inject: [INVITATION_COLLABORATOR_REPOSITORY],
    },
    {
      // The absolute link the email carries. Without a trusted origin the deployment cannot build one, and the module
      // refuses to start instead of sending a relative link nobody can open.
      provide: COLLABORATOR_ACCEPTANCE_LINK,
      useFactory: (config: ConfigService<RuntimeEnvironment, true>): CollaboratorAcceptanceLink => {
        const [webOrigin] = config.get("TRUSTED_ORIGINS", { infer: true });
        if (webOrigin === undefined) {
          throw new Error("TRUSTED_ORIGINS must name the web origin the co-host emails link to.");
        }

        return (token: string) => collaboratorAcceptanceUrl(webOrigin, token);
      },
      inject: [ConfigService],
    },
    {
      // The existing delivery service: the same retries, the same privacy-safe failure logs, and the same adapters every
      // other message of this API already uses (L17.3). No new provider is added.
      provide: InviteCollaboratorUseCase,
      useFactory: (
        collaborators: InvitationCollaboratorRepository,
        delivery: EmailDeliveryService,
        acceptanceLink: CollaboratorAcceptanceLink,
      ) => new InviteCollaboratorUseCase(collaborators, delivery, acceptanceLink),
      inject: [
        INVITATION_COLLABORATOR_REPOSITORY,
        EmailDeliveryService,
        COLLABORATOR_ACCEPTANCE_LINK,
      ],
    },
    {
      provide: AcceptCollaborationUseCase,
      useFactory: (collaborators: InvitationCollaboratorRepository) =>
        new AcceptCollaborationUseCase(collaborators),
      inject: [INVITATION_COLLABORATOR_REPOSITORY],
    },
    {
      provide: ListInvitationCollaboratorsUseCase,
      useFactory: (collaborators: InvitationCollaboratorRepository) =>
        new ListInvitationCollaboratorsUseCase(collaborators),
      inject: [INVITATION_COLLABORATOR_REPOSITORY],
    },
    {
      provide: UpdateCollaboratorPermissionsUseCase,
      useFactory: (collaborators: InvitationCollaboratorRepository) =>
        new UpdateCollaboratorPermissionsUseCase(collaborators),
      inject: [INVITATION_COLLABORATOR_REPOSITORY],
    },
    {
      provide: RevokeCollaboratorUseCase,
      useFactory: (collaborators: InvitationCollaboratorRepository) =>
        new RevokeCollaboratorUseCase(collaborators),
      inject: [INVITATION_COLLABORATOR_REPOSITORY],
    },
    InvitationAccessGuard,
  ],
  exports: [InvitationAccessGuard, INVITATION_ACCESS_RESOLVER, INVITATION_COLLABORATOR_REPOSITORY],
})
export class CollaboratorsModule {}
