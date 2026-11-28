import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  createInvitationAccessTokens,
  INVITATION_ACCESS_TOKENS,
} from "./application/invitation-access-token";
import { INVITATION_LOCK_READER, InvitationPasswordGate } from "./application/invitation-lock";
import type { RuntimeEnvironment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { PrismaInvitationLockRepository } from "./infrastructure/prisma-invitation-lock.repository";
import { InvitationLockGuard } from "./presentation/invitation-lock.guard";

/**
 * The gate of the password-protected invitation (F13; S2.13, L18.2): the one lock read, the one token service keyed with
 * `INVITATION_ACCESS_SECRET`, the gate that decides, and the guard the public controllers declare.
 *
 * It is its own module because two modules own public invitation routes — `invitations` serves the page, the RSVP, the
 * guestbook, and the unlock, and `media` serves the guests' album upload — and both must consult the same decision. This
 * module imports nothing from them, so neither direction can cycle: the invitations module and the media module import
 * *this* module and share one guard, one gate, and one secret.
 *
 * The token service is built once at startup from the validated environment, so no route reads the secret itself; a
 * deployment that forgot `INVITATION_ACCESS_SECRET` in production fails while the configuration is validated, before any
 * request is served.
 */
@Module({
  providers: [
    {
      provide: INVITATION_ACCESS_TOKENS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<RuntimeEnvironment, true>) =>
        createInvitationAccessTokens(config.get("INVITATION_ACCESS_SECRET", { infer: true })),
    },
    {
      provide: INVITATION_LOCK_READER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaInvitationLockRepository(prisma),
    },
    {
      provide: InvitationPasswordGate,
      inject: [INVITATION_LOCK_READER, INVITATION_ACCESS_TOKENS],
      useFactory: (
        locks: PrismaInvitationLockRepository,
        tokens: ReturnType<typeof createInvitationAccessTokens>,
      ) => new InvitationPasswordGate(locks, tokens),
    },
    InvitationLockGuard,
  ],
  exports: [
    InvitationLockGuard,
    InvitationPasswordGate,
    INVITATION_ACCESS_TOKENS,
    INVITATION_LOCK_READER,
  ],
})
export class InvitationPasswordModule {}
