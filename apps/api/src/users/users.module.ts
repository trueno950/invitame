import { Module, type Provider } from "@nestjs/common";
import { AuthService } from "@thallesp/nestjs-better-auth";

import { ADMIN_ACTION_RECORDER, type AdminActionRecorder } from "../admin/admin-action-recorder";
import { AdminModule } from "../admin/admin.module";
import {
  BetterAuthSignInCodeResender,
  SIGN_IN_CODE_RESENDER,
  type SignInCodeResender,
} from "../auth/sign-in-code/sign-in-code-resender";
import { PrismaService } from "../database/prisma.service";
import { INVITATION_OWNER_EMAIL_READER } from "../invitations/application/invitation-owner-email";
import { INVITATION_OWNER_STATUS_READER } from "../invitations/application/invitation-owner-status";
import {
  ADMIN_USER_ACCOUNT_REPOSITORY,
  type AdminUserAccountRepository,
} from "./application/admin-user-account.repository";
import {
  DisableAdminUserAccountUseCase,
  ReactivateAdminUserAccountUseCase,
  ResendSignInCodeUseCase,
} from "./application/admin-user-account.use-cases";
import {
  OWN_PROFILE_REPOSITORY,
  type OwnProfileRepository,
} from "./application/own-profile.repository";
import { GetOwnProfileUseCase, UpdateOwnProfileUseCase } from "./application/own-profile.use-cases";
import { PrismaAdminUserAccountRepository } from "./infrastructure/prisma-admin-user-account.repository";
import { PrismaInvitationOwnerEmailReader } from "./infrastructure/prisma-invitation-owner-email-reader";
import { PrismaInvitationOwnerStatusReader } from "./infrastructure/prisma-invitation-owner-status-reader";
import { PrismaOwnProfileRepository } from "./infrastructure/prisma-own-profile.repository";
import { AdminUsersController } from "./presentation/admin-users.controller";
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
 * The three account support use cases (M9 T9; S4, S6, L9). Each one asks the port, which performs the change and writes
 * the `admin` module's audit row in one transaction; the resend then asks the auth module's narrow port for a code.
 */
export const ADMIN_USER_ACCOUNT_USE_CASES: Provider[] = [
  {
    provide: DisableAdminUserAccountUseCase,
    useFactory: (accounts: AdminUserAccountRepository) =>
      new DisableAdminUserAccountUseCase(accounts),
    inject: [ADMIN_USER_ACCOUNT_REPOSITORY],
  },
  {
    provide: ReactivateAdminUserAccountUseCase,
    useFactory: (accounts: AdminUserAccountRepository) =>
      new ReactivateAdminUserAccountUseCase(accounts),
    inject: [ADMIN_USER_ACCOUNT_REPOSITORY],
  },
  {
    // The resend records the request first, with its own transaction, and only then triggers Better Auth's own
    // sign-in-code endpoint, so the per-email quota and the sender's refusals apply unchanged (S4, L8).
    provide: ResendSignInCodeUseCase,
    useFactory: (accounts: AdminUserAccountRepository, codes: SignInCodeResender) =>
      new ResendSignInCodeUseCase(accounts, codes),
    inject: [ADMIN_USER_ACCOUNT_REPOSITORY, SIGN_IN_CODE_RESENDER],
  },
];

/**
 * Users: the signed-in user's own profile at `GET /me` and `PATCH /me`, the administrator's three account support
 * actions (M9 T9; S4, S6, L8, L9), and the two owner facets the administrator's invitation status view asks (M9 T2,
 * T9; S1, S4). The owner ports answer one stored field each per owner id and nothing else about a user, so the status
 * view can never render a display name, a role, or a session. The `user:disable` command wires its own Prisma client
 * and is not part of the HTTP application; its `UserAccessRepository` is unchanged by T9, which is why the CLI keeps
 * working exactly as before.
 */
@Module({
  // `AdminModule` owns the audit table: this module injects its recorder and never writes `AdminAction` itself (T9).
  imports: [AdminModule],
  controllers: [OwnProfileController, AdminUsersController],
  providers: [
    ...OWN_PROFILE_USE_CASES,
    ...ADMIN_USER_ACCOUNT_USE_CASES,
    {
      provide: OWN_PROFILE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaOwnProfileRepository(prisma),
      inject: [PrismaService],
    },
    {
      // The three support actions, on the shared Prisma client; the adapter also asks the `admin` module's recorder,
      // injected here so no other module reaches the audit table (T9; S6, L9).
      provide: ADMIN_USER_ACCOUNT_REPOSITORY,
      useFactory: (prisma: PrismaService, actions: AdminActionRecorder) =>
        new PrismaAdminUserAccountRepository(prisma, actions),
      inject: [PrismaService, ADMIN_ACTION_RECORDER],
    },
    {
      // `AuthModule` is global (`@thallesp/nestjs-better-auth`), so the resender gets the running Better Auth instance.
      provide: SIGN_IN_CODE_RESENDER,
      useFactory: (auth: AuthService) => new BetterAuthSignInCodeResender(auth),
      inject: [AuthService],
    },
    {
      provide: INVITATION_OWNER_EMAIL_READER,
      useFactory: (prisma: PrismaService) => new PrismaInvitationOwnerEmailReader(prisma),
      inject: [PrismaService],
    },
    {
      provide: INVITATION_OWNER_STATUS_READER,
      useFactory: (prisma: PrismaService) => new PrismaInvitationOwnerStatusReader(prisma),
      inject: [PrismaService],
    },
  ],
  // The status view is the invitations module's; this module only implements the ports it declares.
  exports: [INVITATION_OWNER_EMAIL_READER, INVITATION_OWNER_STATUS_READER],
})
export class UsersModule {}
