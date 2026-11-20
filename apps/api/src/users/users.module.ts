import { Module, type Provider } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { INVITATION_OWNER_EMAIL_READER } from "../invitations/application/invitation-owner-email";
import {
  OWN_PROFILE_REPOSITORY,
  type OwnProfileRepository,
} from "./application/own-profile.repository";
import { GetOwnProfileUseCase, UpdateOwnProfileUseCase } from "./application/own-profile.use-cases";
import { PrismaInvitationOwnerEmailReader } from "./infrastructure/prisma-invitation-owner-email-reader";
import { PrismaOwnProfileRepository } from "./infrastructure/prisma-own-profile.repository";
import { OwnProfileController } from "./presentation/own-profile.controller";

/** The own-profile use cases, bound to whichever `OWN_PROFILE_REPOSITORY` the module provides. */
export const OWN_PROFILE_USE_CASES: Provider[] = [
  {
    provide: GetOwnProfileUseCase,
    useFactory: (profiles: OwnProfileRepository) => new GetOwnProfileUseCase(profiles),
    inject: [OWN_PROFILE_REPOSITORY],
  },
  {
    provide: UpdateOwnProfileUseCase,
    useFactory: (profiles: OwnProfileRepository) => new UpdateOwnProfileUseCase(profiles),
    inject: [OWN_PROFILE_REPOSITORY],
  },
];

/**
 * Users: the signed-in user's own profile at `GET /me` and `PATCH /me`, and the owner-email port the administrator's
 * invitation status view asks (M9 T2; S1, L3). The port answers one stored email per owner id and nothing else about
 * a user, so the status view can never render a display name, a role, or an account state. The `user:disable` command
 * wires its own Prisma client and is not part of the HTTP application.
 */
@Module({
  controllers: [OwnProfileController],
  providers: [
    ...OWN_PROFILE_USE_CASES,
    {
      provide: OWN_PROFILE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaOwnProfileRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: INVITATION_OWNER_EMAIL_READER,
      useFactory: (prisma: PrismaService) => new PrismaInvitationOwnerEmailReader(prisma),
      inject: [PrismaService],
    },
  ],
  // The status view is the invitations module's; this module only implements the port it declares.
  exports: [INVITATION_OWNER_EMAIL_READER],
})
export class UsersModule {}
