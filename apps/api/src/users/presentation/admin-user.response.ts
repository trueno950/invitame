import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

import { InvalidAdminActionError } from "../../admin/admin-action-recorder";
import type {
  AdminAccountDisabled,
  AdminAccountReactivated,
} from "../application/admin-user-account.repository";
import type { SignInCodeRequestOutcome } from "../application/admin-user-account.use-cases";
import {
  AccountAlreadyActiveError,
  AccountAlreadyDisabledError,
  AdminAccountProtectedError,
  UserCannotSignInByCodeError,
} from "../domain/account-support.errors";

// The stable REST shapes of the three account support routes (M9 T9; S4, S6, L9). Each answer states only what the
// action did: the new status, the sessions one disable revoked, and — for the code — that it was requested. A response
// never carries an address, a session token, or any other account field, and the resend's answer never says a code was
// delivered, because delivery is the sender's own background task.

/** `POST /admin/users/:userId/disable` (S4): the new status and the sessions revoked in the same transaction. */
export interface AdminAccountDisabledResponse {
  status: "DISABLED";
  revokedSessions: number;
}

/** `POST /admin/users/:userId/reactivate` (L9): the new status. */
export interface AdminAccountReactivatedResponse {
  status: "ACTIVE";
}

/** `POST /admin/users/:userId/sign-in-code` (S4): the request was made, never that it arrived. */
export interface AdminSignInCodeRequestedResponse {
  outcome: "requested";
}

export function toAdminAccountDisabledResponse(
  disabled: AdminAccountDisabled,
): AdminAccountDisabledResponse {
  return { status: disabled.status, revokedSessions: disabled.revokedSessions };
}

export function toAdminAccountReactivatedResponse(
  reactivated: AdminAccountReactivated,
): AdminAccountReactivatedResponse {
  return { status: reactivated.status };
}

export function toAdminSignInCodeRequestedResponse(
  outcome: SignInCodeRequestOutcome,
): AdminSignInCodeRequestedResponse {
  return { outcome: outcome.outcome };
}

/**
 * The one 404 of these routes: an id no account has. The support view is global, so there is no owner to hide a row
 * from, and the code is the account code the design names (S4).
 */
function orAdminUserNotFound<T, R>(answer: T | null, map: (value: T) => R): R {
  if (answer === null) {
    throw new NotFoundException({ code: "USER_NOT_FOUND" });
  }
  return map(answer);
}

/** The 200 of a disable: the new status and the revoked session count, or 404 `USER_NOT_FOUND`. */
export function orAdminAccountDisabled(
  disabled: AdminAccountDisabled | null,
): AdminAccountDisabledResponse {
  return orAdminUserNotFound(disabled, toAdminAccountDisabledResponse);
}

/** The 200 of a reactivate: the new status, or 404 `USER_NOT_FOUND`. */
export function orAdminAccountReactivated(
  reactivated: AdminAccountReactivated | null,
): AdminAccountReactivatedResponse {
  return orAdminUserNotFound(reactivated, toAdminAccountReactivatedResponse);
}

/** The 202 of a sign-in-code request, or 404 `USER_NOT_FOUND`. */
export function orAdminSignInCodeRequested(
  outcome: SignInCodeRequestOutcome | null,
): AdminSignInCodeRequestedResponse {
  return orAdminUserNotFound(outcome, toAdminSignInCodeRequestedResponse);
}

/**
 * The refusals of the three account actions, each with its own code (S4, S6, L9): an administrator account is
 * protected from both transitions and from a code, an account already in the target status is a conflict, and an
 * account that may not sign in by code is its own conflict. A note the audit domain refuses is a malformed request,
 * which the body DTO already refuses; this mapping keeps a direct caller's refusal a 400 instead of a 500. Any other
 * error is rethrown unchanged.
 */
export function mapAdminUserActionError(error: unknown): never {
  if (error instanceof AdminAccountProtectedError) {
    throw new ConflictException({ code: "ADMIN_ACCOUNT_PROTECTED" });
  }
  if (error instanceof AccountAlreadyDisabledError) {
    throw new ConflictException({ code: "ACCOUNT_ALREADY_DISABLED" });
  }
  if (error instanceof AccountAlreadyActiveError) {
    throw new ConflictException({ code: "ACCOUNT_ALREADY_ACTIVE" });
  }
  if (error instanceof UserCannotSignInByCodeError) {
    throw new ConflictException({ code: "USER_CANNOT_SIGN_IN_BY_CODE" });
  }
  if (error instanceof InvalidAdminActionError) {
    throw new BadRequestException({ code: "INVALID_ADMIN_ACTION" });
  }
  throw error;
}
