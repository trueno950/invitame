import type {
  AdministratorRecoveryRepository,
  ResetRefusalReason,
  ResetSecondFactorResult,
} from "./administrator-account.repository";
import {
  type CreateAdministratorDependencies,
  normalizeAdministratorEmail,
} from "./create-administrator.use-case";
import { generateInitialPassword } from "./initial-password";

export const RESET_SECOND_FACTOR_EVENT = {
  RESET: "administrator_second_factor_reset",
  REFUSED: "administrator_second_factor_reset_refused",
  FAILED: "administrator_second_factor_reset_failed",
} as const;

/**
 * One event per run, carrying the user id at most: never the address, the password, its hash, the
 * TOTP secret, or backup codes. A failure carries the error class only.
 */
export type ResetSecondFactorEvent =
  | { event: typeof RESET_SECOND_FACTOR_EVENT.RESET; userId: string }
  | {
      event: typeof RESET_SECOND_FACTOR_EVENT.REFUSED;
      userId?: string;
      reason: ResetRefusalReason;
    }
  | { event: typeof RESET_SECOND_FACTOR_EVENT.FAILED; error: string };

export type ResetSecondFactorDependencies = Omit<
  CreateAdministratorDependencies,
  "accounts" | "log"
> & {
  accounts: AdministratorRecoveryRepository;
  log: (event: ResetSecondFactorEvent) => void;
};

export interface ResetSecondFactorResultWithPassword {
  outcome: ResetSecondFactorResult;
  /** Present only after a reset; the caller shows it once and never stores it. */
  initialPassword?: string;
}

/**
 * Recovers a locked administrator (M2 T10a, S44): for an ACTIVE ADMIN, enrolled or not, revokes
 * every session, deletes the second factor and its backup codes, and issues a new initial password
 * with a new 24-hour enrollment window (S20), as an `admin:create` reissue does. Unknown addresses,
 * customers, and DISABLED administrators are refused unchanged.
 */
export class ResetSecondFactorUseCase {
  private readonly generatePassword: () => string;
  private readonly now: () => Date;

  constructor(private readonly dependencies: ResetSecondFactorDependencies) {
    this.generatePassword = dependencies.generatePassword ?? generateInitialPassword;
    this.now = dependencies.now ?? (() => new Date());
  }

  async execute(rawEmail: string): Promise<ResetSecondFactorResultWithPassword> {
    const email = normalizeAdministratorEmail(
      rawEmail,
      "Provide the email address of the administrator to recover.",
    );
    const { accounts, hashPassword, log } = this.dependencies;

    const password = this.generatePassword();
    let outcome: ResetSecondFactorResult;
    try {
      outcome = await accounts.resetSecondFactor({
        email,
        passwordHash: await hashPassword(password),
        issuedAt: this.now(),
      });
    } catch (error) {
      // The class name only: a message may carry SQL or the address.
      log({
        event: RESET_SECOND_FACTOR_EVENT.FAILED,
        error: error instanceof Error ? error.name : "unknown",
      });
      throw error;
    }

    if (outcome.outcome === "reset") {
      log({ event: RESET_SECOND_FACTOR_EVENT.RESET, userId: outcome.userId });
      return { outcome, initialPassword: password };
    }
    log({
      event: RESET_SECOND_FACTOR_EVENT.REFUSED,
      ...("userId" in outcome ? { userId: outcome.userId } : {}),
      reason: outcome.reason,
    });
    return { outcome };
  }
}
