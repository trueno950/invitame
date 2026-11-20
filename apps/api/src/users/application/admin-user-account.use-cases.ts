import type { SignInCodeResender } from "../../auth/sign-in-code/sign-in-code-resender";
import type {
  AdminAccountDisabled,
  AdminAccountReactivated,
  AdminSignInCodeRequest,
  AdminUserAccountRepository,
  AdminUserActionAudit,
} from "./admin-user-account.repository";

// The three account support use cases (M9 T9; S4, S6, L9). Each one names the audit row's action and passes the actor
// from the session, the closed reason, and the optional note to the port, which performs the change and the audit row
// in one transaction. The resend is the one action with two steps: it records the request first, then asks the auth
// module for a code, so the audit describes a request — never a delivery.

/** One administrator's account action: which account, who asked, and why (S6). */
export interface AdminUserActionCommand {
  userId: string;
  /** The signed-in administrator's own id, never a client-supplied actor (S6). */
  adminUserId: string;
  reason: AdminUserActionAudit["reason"];
  /** The optional note, as the administrator sent it; the audit domain trims it and enforces its bound. */
  note: string | null;
}

/** The answer of a sign-in-code request: it was asked for, never that it arrived (S4). */
export const SIGN_IN_CODE_REQUESTED = { outcome: "requested" } as const;

export type SignInCodeRequestOutcome = typeof SIGN_IN_CODE_REQUESTED;

function auditOf(command: AdminUserActionCommand): AdminUserActionAudit {
  return { adminUserId: command.adminUserId, reason: command.reason, note: command.note };
}

/**
 * An administrator blocks an account's access (S4, L8). The port performs ACTIVE → DISABLED, deletes the account's
 * sessions, and writes the audit row in one transaction, so the account never loses access without a record of who
 * took it away. The account's invitations stay published.
 */
export class DisableAdminUserAccountUseCase {
  constructor(private readonly accounts: AdminUserAccountRepository) {}

  execute(command: AdminUserActionCommand): Promise<AdminAccountDisabled | null> {
    return this.accounts.disableForAdmin(command.userId, auditOf(command));
  }
}

/**
 * An administrator restores a disabled account's access (L9). The port performs DISABLED → ACTIVE and writes the
 * audit row in one transaction; the customer signs in again with a new code, because disabling revoked their sessions.
 */
export class ReactivateAdminUserAccountUseCase {
  constructor(private readonly accounts: AdminUserAccountRepository) {}

  execute(command: AdminUserActionCommand): Promise<AdminAccountReactivated | null> {
    return this.accounts.reactivateForAdmin(command.userId, auditOf(command));
  }
}

/**
 * An administrator asks for a new sign-in code for an account (S4, S6). The port records the request in its own
 * transaction first — the audit row is the record of the request and survives whatever delivery does — and only then
 * does this use case hand the stored address to the auth module's narrow port, which triggers Better Auth's own
 * sign-in-code endpoint. Nothing here re-implements the per-email quota, the code's hashing, its expiry, its attempt
 * cap, or the sender's refusals: those stay the auth module's, unchanged, so a request that the quota drops is still
 * silent exactly as it is for a customer's own request.
 */
export class ResendSignInCodeUseCase {
  constructor(
    private readonly accounts: AdminUserAccountRepository,
    private readonly codes: SignInCodeResender,
  ) {}

  async execute(command: AdminUserActionCommand): Promise<SignInCodeRequestOutcome | null> {
    const request: AdminSignInCodeRequest | null = await this.accounts.requestSignInCodeForAdmin(
      command.userId,
      auditOf(command),
    );

    if (request === null) {
      return null;
    }

    await this.codes.requestSignInCode(request.email);

    return SIGN_IN_CODE_REQUESTED;
  }
}
