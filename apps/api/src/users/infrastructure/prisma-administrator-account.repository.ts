import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  AdministratorAccountRepository,
  AdministratorRecoveryRepository,
  IssueInitialPassword,
  IssueInitialPasswordResult,
  ResetSecondFactorResult,
} from "../application/administrator-account.repository";

/**
 * Better Auth's credential account: password sign-in looks it up by `providerId: "credential"` and
 * `accountId` equal to the user id (1.7.16 `api/routes/sign-in.mjs`, `signInEmail`). The auth module
 * reads the enrollment window from its `createdAt` (`auth/administrator-enrollment.ts`).
 */
const CREDENTIAL_PROVIDER_ID = "credential";

function credentialAccount(userId: string, { passwordHash, issuedAt }: IssueInitialPassword) {
  return {
    userId,
    providerId: CREDENTIAL_PROVIDER_ID,
    accountId: userId,
    password: passwordHash,
    createdAt: issuedAt,
    updatedAt: issuedAt,
  };
}

/**
 * The shared reissue step, run inside the caller's transaction after its conditional user update:
 * a new credential account restarts the window; the second factor (an unconfirmed enrollment secret
 * that may have been seen with the old password, or a confirmed one with its backup codes) and every
 * session are deleted. Returns the number of revoked sessions.
 */
async function replaceCredentialAndRevoke(
  transaction: Prisma.TransactionClient,
  userId: string,
  input: IssueInitialPassword,
): Promise<number> {
  await transaction.account.deleteMany({
    where: { userId, providerId: CREDENTIAL_PROVIDER_ID },
  });
  await transaction.account.create({ data: credentialAccount(userId, input) });
  await transaction.twoFactor.deleteMany({ where: { userId } });
  const { count } = await transaction.session.deleteMany({ where: { userId } });
  return count;
}

export class PrismaAdministratorAccountRepository
  implements AdministratorAccountRepository, AdministratorRecoveryRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  issueInitialPassword(input: IssueInitialPassword): Promise<IssueInitialPasswordResult> {
    const { email, issuedAt } = input;
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      });

      if (!existing) {
        // Better Auth's `name` is stored as `displayName`; it creates users with an empty name.
        const created = await transaction.user.create({
          data: { email, displayName: "", role: "ADMIN", status: "ACTIVE" },
          select: { id: true },
        });
        await transaction.account.create({ data: credentialAccount(created.id, input) });
        return { outcome: "created", userId: created.id };
      }

      if (existing.role !== "ADMIN") {
        return { outcome: "refused", userId: existing.id, reason: "customer" };
      }

      // Conditional update: it locks the row until commit, so an enrollment or a disable that
      // commits first makes this match nothing and the reissue is refused.
      const { count: eligible } = await transaction.user.updateMany({
        where: { id: existing.id, role: "ADMIN", status: "ACTIVE", twoFactorEnabled: false },
        data: { updatedAt: issuedAt },
      });
      if (eligible === 0) {
        // The status alone tells the reason: this row was read as an ADMIN in this transaction and
        // no code path changes a role, so an ACTIVE row that did not match has enrolled. Any other
        // status, or a row deleted meanwhile, is reported as disabled.
        const current = await transaction.user.findUnique({
          where: { id: existing.id },
          select: { status: true },
        });
        const reason = current?.status === "ACTIVE" ? "enrolled" : "disabled";
        return { outcome: "refused", userId: existing.id, reason };
      }

      const revokedSessions = await replaceCredentialAndRevoke(transaction, existing.id, input);
      return { outcome: "reissued", userId: existing.id, revokedSessions };
    });
  }

  resetSecondFactor(input: IssueInitialPassword): Promise<ResetSecondFactorResult> {
    const { email, issuedAt } = input;
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      });
      if (!existing) {
        return { outcome: "refused", reason: "unknown" };
      }
      if (existing.role !== "ADMIN") {
        return { outcome: "refused", userId: existing.id, reason: "customer" };
      }

      // Conditional update, enrolled or not: it locks the row until commit, so a disable that
      // commits first makes this match nothing and the recovery is refused. A first confirmation
      // that commits its flag after this one finds its pending session gone and a newer credential,
      // so the session-create hook reverts it (S39, S40).
      const { count: eligible } = await transaction.user.updateMany({
        where: { id: existing.id, role: "ADMIN", status: "ACTIVE" },
        data: { twoFactorEnabled: false, updatedAt: issuedAt },
      });
      // Zero matches means the row is no longer an ACTIVE ADMIN. Roles never change, so that is a
      // DISABLED administrator; a row deleted meanwhile carries the same label, which leaves the
      // refusal and its unchanged rows exactly as for a disable.
      if (eligible === 0) {
        return { outcome: "refused", userId: existing.id, reason: "disabled" };
      }

      const revokedSessions = await replaceCredentialAndRevoke(transaction, existing.id, input);
      return { outcome: "reset", userId: existing.id, revokedSessions };
    });
  }
}
