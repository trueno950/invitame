import { Module, type Provider } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import {
  OWN_PROFILE_REPOSITORY,
  type OwnProfileRepository,
} from "./application/own-profile.repository";
import { GetOwnProfileUseCase, UpdateOwnProfileUseCase } from "./application/own-profile.use-cases";
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
 * Users: the signed-in user's own profile at `GET /me` and `PATCH /me`. The `user:disable` command
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
  ],
})
export class UsersModule {}
