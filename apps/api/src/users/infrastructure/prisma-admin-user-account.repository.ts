import type { PrismaClient } from "@prisma/client";

import type { AdminActionRecorder } from "../../admin/admin-action-recorder";
import { ADMIN_ACTION } from "../../admin/admin-action-recorder";
import type {
  AdminAccountDisabled,
  AdminAccountReactivated,
  AdminSignInCodeRequest,
  AdminUserAccountRepository,
  AdminUserActionAudit,
} from "../application/admin-user-account.repository";
import {
  disableTransition,
  mayRequestSignInCode,
  reactivateTransition,
  refuseProtectedAdministrator,
  SUPPORT_ACCOUNT_STATUS,
  type SupportAccountState,
  type SupportAccountStatus,
} from "../domain/account-support";
import {
  AccountAlreadyActiveError,
  AccountAlreadyDisabledError,
  UserCannotSignInByCodeError,
} from "../domain/account-support.errors";

// The account support port on PostgreSQL (M9 T9; S4, S6, L8, L9). Three rules shape this adapter:
//
// 1. Every action is one interactive transaction. The account is read first, so an administrator account is refused
//    before any statement changes it; the status change is a guarded `updateMany` whose conditions are the whole
//    transition — the target status and the customer role, so an account promoted between the read and the update is
//    never disabled or reactivated — and a zero count is re-read into the refusal it names, never an unexpected
//    failure; and the `AdminAction` row is written through the injected recorder with this same transaction client, so
//    the change and its record commit together or not at all (L9 «Misma transacción»).
// 2. Disabling deletes every session in that same transaction, exactly like `disableAndRevokeSessions` does for the
//    `user:disable` command, so the account loses access at once. The account's invitations are never touched: L8
//    decided they stay published.
// 3. The store is the only writer of the three audit rows; the recorder validates each entry and the migration's
//    CHECK constraints and append-only trigger stay behind it.

/** The columns these statements read; never the address's neighbours, a name, or a session token. */
const ACCOUNT_COLUMNS = { id: true, email: true, role: true, status: true } as const;

/** The one shape every id column has; the route refuses anything else before this adapter runs. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StoredAccount {
  id: string;
  email: string;
  role: string;
  status: string;
}

/** The stored row as the domain reads it: the two closed sets, never the address. */
function stateOf(account: StoredAccount) {
  return {
    role: account.role === "ADMIN" ? ("ADMIN" as const) : ("CUSTOMER" as const),
    status: account.status as SupportAccountStatus,
  };
}

export class PrismaAdminUserAccountRepository implements AdminUserAccountRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly actions: AdminActionRecorder,
  ) {}

  /**
   * The refusal of a guarded transition that matched no row (M9 T10; R1-001, R4-001). The update's conditions are the
   * whole transition, so a zero count means another transaction moved the row after this call's read, and the re-read
   * names what it is now: an account promoted in that window is an administrator's, refused as one; a DISABLED row has
   * nothing to disable and an ACTIVE one has nothing to reactivate. Every branch answers a typed conflict the route
   * maps to its 409 codes, so no observation here can reach an unexpected 500.
   */
  private static refusedTransition(account: SupportAccountState): never {
    refuseProtectedAdministrator(account);
    if (account.status === SUPPORT_ACCOUNT_STATUS.DISABLED) {
      throw new AccountAlreadyDisabledError();
    }
    throw new AccountAlreadyActiveError();
  }

  async disableForAdmin(
    userId: string,
    audit: AdminUserActionAudit,
  ): Promise<AdminAccountDisabled | null> {
    // The route refuses a parameter that is not a UUID; this guard is for a direct caller, and it costs no
    // transaction. "No such row" is the same null the route maps to its 404.
    if (!UUID.test(userId)) {
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.findUnique({ where: { id: userId }, select: ACCOUNT_COLUMNS });
      if (account === null) {
        return null;
      }

      // An administrator account is refused before the statement runs, so nothing of it changes and nothing is
      // audited (S4, S6).
      refuseProtectedAdministrator(stateOf(account));

      const { count: disabledByThisCall } = await tx.user.updateMany({
        // The customer role is part of the guard: a promotion committed after the read must not be undone here
        // (M9 T10; R1-001).
        where: { id: userId, status: "ACTIVE", role: "CUSTOMER" },
        data: { status: disableTransition(stateOf(account).status) },
      });

      if (disabledByThisCall !== 1) {
        // Nothing changed, so nothing is revoked or audited either: re-read the row to name the refusal.
        const stored = await tx.user.findUnique({ where: { id: userId }, select: ACCOUNT_COLUMNS });
        if (stored === null) {
          return null;
        }
        return PrismaAdminUserAccountRepository.refusedTransition(stateOf(stored));
      }

      const { count: revokedSessions } = await tx.session.deleteMany({ where: { userId } });

      // The audit row is written with this transaction, never one of its own: the account never loses its access
      // without the record of who took it away, and the recorder's refusal rolls the whole change back.
      await this.actions.record(tx, {
        adminUserId: audit.adminUserId,
        action: ADMIN_ACTION.ACCOUNT_DISABLED,
        reason: audit.reason,
        note: audit.note,
        targetUserId: userId,
      });

      return { status: "DISABLED", revokedSessions };
    });
  }

  async reactivateForAdmin(
    userId: string,
    audit: AdminUserActionAudit,
  ): Promise<AdminAccountReactivated | null> {
    if (!UUID.test(userId)) {
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.findUnique({ where: { id: userId }, select: ACCOUNT_COLUMNS });
      if (account === null) {
        return null;
      }

      refuseProtectedAdministrator(stateOf(account));

      const { count: activatedByThisCall } = await tx.user.updateMany({
        // The same role guard as the disable (M9 T10; R1-001).
        where: { id: userId, status: "DISABLED", role: "CUSTOMER" },
        data: { status: reactivateTransition(stateOf(account).status) },
      });

      if (activatedByThisCall !== 1) {
        const stored = await tx.user.findUnique({ where: { id: userId }, select: ACCOUNT_COLUMNS });
        if (stored === null) {
          return null;
        }
        return PrismaAdminUserAccountRepository.refusedTransition(stateOf(stored));
      }

      await this.actions.record(tx, {
        adminUserId: audit.adminUserId,
        action: ADMIN_ACTION.ACCOUNT_REACTIVATED,
        reason: audit.reason,
        note: audit.note,
        targetUserId: userId,
      });

      return { status: "ACTIVE" };
    });
  }

  async requestSignInCodeForAdmin(
    userId: string,
    audit: AdminUserActionAudit,
  ): Promise<AdminSignInCodeRequest | null> {
    if (!UUID.test(userId)) {
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.user.findUnique({ where: { id: userId }, select: ACCOUNT_COLUMNS });
      if (account === null) {
        return null;
      }

      // A disabled account and an administrator's are refused with the route's one 409, before the audit row: a
      // request nobody may make is not recorded as one.
      if (!mayRequestSignInCode(stateOf(account))) {
        throw new UserCannotSignInByCodeError();
      }

      // The audit row records the request and is written before it is made: delivery is the sender's own background
      // task, and its outcome — including an over-quota request that is dropped silently — is never reported by this
      // action.
      await this.actions.record(tx, {
        adminUserId: audit.adminUserId,
        action: ADMIN_ACTION.SIGN_IN_CODE_RESENT,
        reason: audit.reason,
        note: audit.note,
        targetUserId: userId,
      });

      return { email: account.email };
    });
  }
}
