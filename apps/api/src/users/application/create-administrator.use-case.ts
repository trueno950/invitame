import type {
  AdministratorAccountRepository,
  IssueInitialPasswordResult,
  IssueRefusalReason,
} from "./administrator-account.repository";
import { generateInitialPassword } from "./initial-password";

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
  constructor() {
    super("Provide the email address of the administrator to create.");
    this.name = "InvalidAdministratorEmailError";
  }
}

export interface CreateAdministratorDependencies {
  accounts: AdministratorAccountRepository;
  /** Better Auth's own password hasher, so its password sign-in verifies the result. */
  hashPassword: (password: string) => Promise<string>;
  log: CreateAdministratorLog;
  generatePassword?: () => string;
  now?: () => Date;
}

export interface CreateAdministratorResult {
  outcome: IssueInitialPasswordResult;
  /** Present only when a password was issued; the caller shows it once and never stores it. */
  initialPassword?: string;
}

/**
 * Creates an administrator, or issues a new initial password to one who has not enrolled an
 * authenticator app (ADR 0004 decision 3, S20). The password works for 24 hours from its issue unless
 * an app is enrolled first. Enrolled administrators are refused: their recovery is a separate
 * procedure (T10). A customer address is refused, never promoted.
 */
export class CreateAdministratorUseCase {
  private readonly generatePassword: () => string;
  private readonly now: () => Date;

  constructor(private readonly dependencies: CreateAdministratorDependencies) {
    this.generatePassword = dependencies.generatePassword ?? generateInitialPassword;
    this.now = dependencies.now ?? (() => new Date());
  }

  async execute(rawEmail: string): Promise<CreateAdministratorResult> {
    // Better Auth stores addresses lowercased and looks them up that way.
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
      throw new InvalidAdministratorEmailError();
    }

    const password = this.generatePassword();
    const outcome = await this.dependencies.accounts.issueInitialPassword({
      email,
      passwordHash: await this.dependencies.hashPassword(password),
      issuedAt: this.now(),
    });

    switch (outcome.outcome) {
      case "created":
        this.dependencies.log({
          event: CREATE_ADMINISTRATOR_EVENT.CREATED,
          userId: outcome.userId,
        });
        return { outcome, initialPassword: password };
      case "reissued":
        this.dependencies.log({
          event: CREATE_ADMINISTRATOR_EVENT.REISSUED,
          userId: outcome.userId,
          revokedSessions: outcome.revokedSessions,
        });
        return { outcome, initialPassword: password };
      case "refused":
        this.dependencies.log({
          event: CREATE_ADMINISTRATOR_EVENT.REFUSED,
          userId: outcome.userId,
          reason: outcome.reason,
        });
        return { outcome };
    }
  }
}
