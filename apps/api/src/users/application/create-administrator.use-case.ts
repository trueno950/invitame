import type {
  AdministratorAccountRepository,
  IssueInitialPasswordResult,
  IssueRefusalReason,
} from "./administrator-account.repository";
import { generateInitialPassword, type InitialPasswordDependencies } from "./initial-password";

export const CREATE_ADMINISTRATOR_EVENT = {
  CREATED: "administrator_created",
  REISSUED: "administrator_password_reissued",
  REFUSED: "administrator_create_refused",
} as const;

/** Operational events carry the user id at most: never the address, the password, or its hash. */
export type CreateAdministratorEvent =
  | { event: typeof CREATE_ADMINISTRATOR_EVENT.CREATED; userId: string }
  | { event: typeof CREATE_ADMINISTRATOR_EVENT.REISSUED; userId: string; revokedSessions: number }
  | {
      event: typeof CREATE_ADMINISTRATOR_EVENT.REFUSED;
      userId: string;
      reason: IssueRefusalReason;
    };

export type CreateAdministratorLog = (event: CreateAdministratorEvent) => void;

export class InvalidAdministratorEmailError extends Error {
  constructor(message = "Provide the email address of the administrator to create.") {
    super(message);
    this.name = "InvalidAdministratorEmailError";
  }
}

/** Better Auth stores addresses lowercased and looks them up that way. */
export function normalizeAdministratorEmail(rawEmail: string, invalidMessage?: string): string {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new InvalidAdministratorEmailError(invalidMessage);
  }
  return email;
}

export interface CreateAdministratorDependencies extends InitialPasswordDependencies {
  accounts: AdministratorAccountRepository;
  log: CreateAdministratorLog;
}

export interface CreateAdministratorResult {
  outcome: IssueInitialPasswordResult;
  /** Present only when a password was issued; the caller shows it once and never stores it. */
  initialPassword?: string;
}

/**
 * Creates an administrator, or issues a new initial password to one who has not enrolled an
 * authenticator app (ADR 0004 decision 3, S20). The password works for 24 hours from its issue unless
 * an app is enrolled first. Enrolled administrators are refused: their recovery is
 * `ResetSecondFactorUseCase` (T10a). A customer address is refused, never promoted.
 */
export class CreateAdministratorUseCase {
  private readonly generatePassword: () => string;
  private readonly now: () => Date;

  constructor(private readonly dependencies: CreateAdministratorDependencies) {
    this.generatePassword = dependencies.generatePassword ?? generateInitialPassword;
    this.now = dependencies.now ?? (() => new Date());
  }

  async execute(rawEmail: string): Promise<CreateAdministratorResult> {
    const email = normalizeAdministratorEmail(rawEmail);
    const password = this.generatePassword();
    const stored = await this.dependencies.accounts.issueInitialPassword({
      email,
      passwordHash: await this.dependencies.hashPassword(password),
      issuedAt: this.now(),
    });

    switch (stored.outcome) {
      case "created":
        this.dependencies.log({
          event: CREATE_ADMINISTRATOR_EVENT.CREATED,
          userId: stored.userId,
        });
        return { outcome: stored, initialPassword: password };
      case "reissued":
        this.dependencies.log({
          event: CREATE_ADMINISTRATOR_EVENT.REISSUED,
          userId: stored.userId,
          revokedSessions: stored.revokedSessions,
        });
        return { outcome: stored, initialPassword: password };
      case "refused":
        this.dependencies.log({
          event: CREATE_ADMINISTRATOR_EVENT.REFUSED,
          userId: stored.userId,
          reason: stored.reason,
        });
        return { outcome: stored };
    }
  }
}
