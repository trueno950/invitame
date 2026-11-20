import { Body, Controller, HttpCode, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";

import { AdminOnly } from "../../auth/access-control/access-control";
import { SessionUserId } from "../../auth/access-control/session-user-id";
import {
  DisableAdminUserAccountUseCase,
  ReactivateAdminUserAccountUseCase,
  ResendSignInCodeUseCase,
} from "../application/admin-user-account.use-cases";
// The global ValidationPipe reads this class from emitted metadata, so it is a value import.
// biome-ignore lint/style/useImportType: the pipe needs the class at runtime.
import { AdminUserActionDto } from "./dto/admin-user-actions.dto";
import {
  type AdminAccountDisabledResponse,
  type AdminAccountReactivatedResponse,
  type AdminSignInCodeRequestedResponse,
  mapAdminUserActionError,
  orAdminAccountDisabled,
  orAdminAccountReactivated,
  orAdminSignInCodeRequested,
} from "./admin-user.response";

const USER_ID = new ParseUUIDPipe();

/**
 * The administrator's three account support actions (M9 T9; S4, S6, L8, L9). `@AdminOnly()` on the class: the global
 * guard answers 401 without an active session and 403 to a user whose stored role is not `ADMIN`, before any input is
 * validated, and an id that is not a UUID answers 400 before a port is called.
 *
 * - `POST /admin/users/:userId/disable`: 200 `{ status: "DISABLED", revokedSessions }`, or 404 `USER_NOT_FOUND`, 409
 *   `ACCOUNT_ALREADY_DISABLED`, 409 `ADMIN_ACCOUNT_PROTECTED`. The status change, the session revocation, and the
 *   `ACCOUNT_DISABLED` audit row are one transaction, and the account's invitations stay published (L8).
 * - `POST /admin/users/:userId/reactivate`: 200 `{ status: "ACTIVE" }`, or 404 `USER_NOT_FOUND`, 409
 *   `ACCOUNT_ALREADY_ACTIVE`, 409 `ADMIN_ACCOUNT_PROTECTED`, with the `ACCOUNT_REACTIVATED` audit row in the same
 *   transaction (L9).
 * - `POST /admin/users/:userId/sign-in-code`: 202 `{ outcome: "requested" }`, or 404 `USER_NOT_FOUND`, 409
 *   `USER_CANNOT_SIGN_IN_BY_CODE`. The `SIGN_IN_CODE_RESENT` audit row records the request before Better Auth's own
 *   sign-in-code endpoint is asked for a code, so the per-email quota, the hashing, the expiry, the attempt cap, and the
 *   sender's refusals all apply unchanged, and a rate-limited request is dropped exactly as silently as a customer's.
 *
 * Every body is `{ reason, note? }`: the closed reason set and the note rule are the audit's own, and the actor is
 * `@SessionUserId()`, never a body field. The routes are global — a support action addresses any account — so no owner
 * scope applies here, and the API is what decides whether an action may run; a page that hides a button is no guard.
 */
@AdminOnly()
@Controller("admin/users")
export class AdminUsersController {
  constructor(
    @Inject(DisableAdminUserAccountUseCase)
    private readonly disableAccount: DisableAdminUserAccountUseCase,
    @Inject(ReactivateAdminUserAccountUseCase)
    private readonly reactivateAccount: ReactivateAdminUserAccountUseCase,
    @Inject(ResendSignInCodeUseCase)
    private readonly resendSignInCode: ResendSignInCodeUseCase,
  ) {}

  @Post(":userId/disable")
  @HttpCode(200)
  async disable(
    @Param("userId", USER_ID) userId: string,
    @Body() body: AdminUserActionDto,
    @SessionUserId() adminUserId: string,
  ): Promise<AdminAccountDisabledResponse> {
    try {
      return orAdminAccountDisabled(
        await this.disableAccount.execute({
          userId,
          adminUserId,
          reason: body.reason,
          note: body.note ?? null,
        }),
      );
    } catch (error) {
      return mapAdminUserActionError(error);
    }
  }

  @Post(":userId/reactivate")
  @HttpCode(200)
  async reactivate(
    @Param("userId", USER_ID) userId: string,
    @Body() body: AdminUserActionDto,
    @SessionUserId() adminUserId: string,
  ): Promise<AdminAccountReactivatedResponse> {
    try {
      return orAdminAccountReactivated(
        await this.reactivateAccount.execute({
          userId,
          adminUserId,
          reason: body.reason,
          note: body.note ?? null,
        }),
      );
    } catch (error) {
      return mapAdminUserActionError(error);
    }
  }

  @Post(":userId/sign-in-code")
  @HttpCode(202)
  async requestSignInCode(
    @Param("userId", USER_ID) userId: string,
    @Body() body: AdminUserActionDto,
    @SessionUserId() adminUserId: string,
  ): Promise<AdminSignInCodeRequestedResponse> {
    try {
      return orAdminSignInCodeRequested(
        await this.resendSignInCode.execute({
          userId,
          adminUserId,
          reason: body.reason,
          note: body.note ?? null,
        }),
      );
    } catch (error) {
      return mapAdminUserActionError(error);
    }
  }
}
