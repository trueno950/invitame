/** What the creation command asks the store to do for one normalized email address. */
export interface IssueInitialPassword {
  email: string;
  /** The password hash from Better Auth's own hasher; the plain password never reaches the store. */
  passwordHash: string;
  /** Start of the 24-hour enrollment window: the credential account's `createdAt` (S20). */
  issuedAt: Date;
}

/** Why the store refused: a customer is never promoted, and an enrolled or DISABLED one is left alone. */
export type IssueRefusalReason = "customer" | "enrolled" | "disabled";

export type IssueInitialPasswordResult =
  | { outcome: "created"; userId: string }
  | { outcome: "reissued"; userId: string; revokedSessions: number }
  | { outcome: "refused"; userId: string; reason: IssueRefusalReason };

/** Persistence port for administrator accounts; the adapter owns the transaction. */
export interface AdministratorAccountRepository {
  /**
   * In one transaction:
   * - no user with this email: creates an ACTIVE ADMIN and their credential account;
   * - an ACTIVE ADMIN who has not enrolled an authenticator app: replaces the credential account
   *   (new hash, new `createdAt`), drops an unconfirmed enrollment, and deletes all their sessions;
   * - anyone else: changes nothing and reports why.
   */
  issueInitialPassword(input: IssueInitialPassword): Promise<IssueInitialPasswordResult>;
}
