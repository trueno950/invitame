import type { PrismaClient } from "@prisma/client";

import type {
  AdministratorAccountRepository,
  IssueInitialPassword,
  IssueInitialPasswordResult,
} from "../application/administrator-account.repository";

/**
 * Better Auth's credential account: password sign-in looks it up by `providerId: "credential"` and
 * `accountId` equal to the user id (1.7.16 `api/routes/sign-in.mjs`, `signInEmail`). The auth module
 * reads the enrollment window from its `createdAt` (`auth/administrator-enrollment.ts`).
 */
const CREDENTIAL_PROVIDER_ID = "credential";

export class PrismaAdministratorAccountRepository implements AdministratorAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  issueInitialPassword({
    email,
    passwordHash,
    issuedAt,
  }: IssueInitialPassword): Promise<IssueInitialPasswordResult> {
    return this.prisma.$transaction(async (transaction) => {
      const credential = (userId: string) => ({
        userId,
        providerId: CREDENTIAL_PROVIDER_ID,
        accountId: userId,
        password: passwordHash,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      });

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
        await transaction.account.create({ data: credential(created.id) });
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
        const current = await transaction.user.findUnique({
          where: { id: existing.id },
          select: { status: true },
        });
        const reason = current?.status === "ACTIVE" ? "enrolled" : "disabled";
        return { outcome: "refused", userId: existing.id, reason };
      }

      // A new credential account restarts the window; an unconfirmed enrollment secret, which may
      // have been seen with the old password, is dropped with it.
      await transaction.account.deleteMany({
        where: { userId: existing.id, providerId: CREDENTIAL_PROVIDER_ID },
      });
      await transaction.account.create({ data: credential(existing.id) });
      await transaction.twoFactor.deleteMany({ where: { userId: existing.id } });
      const { count: revokedSessions } = await transaction.session.deleteMany({
        where: { userId: existing.id },
      });

      return { outcome: "reissued", userId: existing.id, revokedSessions };
    });
  }
}
