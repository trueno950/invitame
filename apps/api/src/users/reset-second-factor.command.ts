import { PrismaClient } from "@prisma/client";
// Better Auth's own hasher, as `admin:create` uses it, so password sign-in verifies what we store.
import { hashPassword } from "better-auth/crypto";

import type { AdministratorRecoveryRepository } from "./application/administrator-account.repository";
import { closeCommandStore } from "./application/command-failure";
import { InvalidAdministratorEmailError } from "./application/create-administrator.use-case";
import { INITIAL_PASSWORD_NOTICE } from "./application/initial-password";
import {
  RESET_SECOND_FACTOR_EVENT,
  ResetSecondFactorUseCase,
} from "./application/reset-second-factor.use-case";
import { PrismaAdministratorAccountRepository } from "./infrastructure/prisma-administrator-account.repository";

const USAGE = "Usage: pnpm --filter @invitame/api admin:reset-second-factor -- <email>";
const RESET_SECOND_FACTOR_CLOSE_FAILED = "administrator_second_factor_reset_close_failed";

export interface CommandTerminal {
  isTerminal: boolean;
  /** One stdout line. */
  out: (line: string) => void;
  /** One stderr line. */
  err: (line: string) => void;
}

export interface RecoveryStore {
  accounts: AdministratorRecoveryRepository;
  close: () => Promise<void>;
}

/**
 * Server-side command: `pnpm --filter @invitame/api admin:reset-second-factor -- <email>` (M2 T10a,
 * S44; ADR 0004 decisions 3 and 6). Recovers a locked ACTIVE ADMIN, enrolled or not, in one
 * transaction: clears the second factor and its backup codes, revokes every session, and issues a new
 * initial password with a new 24-hour enrollment window (S20). Refuses an unknown address, a
 * customer, and a DISABLED administrator, changing nothing.
 *
 * The safeguards of `admin:create`: the password is printed once, only to an interactive terminal,
 * and never logged; the JSON-line event carries the user id at most, and a failure its error class
 * only. Prisma reads `DATABASE_URL`. Exit codes: 0 reset, 1 refused or failure, 2 usage error or
 * stdout not a terminal.
 */
export async function runResetSecondFactor(
  args: readonly string[],
  terminal: CommandTerminal,
  openStore: () => RecoveryStore,
  hash: (password: string) => Promise<string> = hashPassword,
): Promise<number> {
  const emails = args[0] === "--" ? args.slice(1) : args;
  if (emails.length !== 1 || emails[0] === undefined) {
    terminal.err(USAGE);
    return 2;
  }
  if (!terminal.isTerminal) {
    terminal.err(
      "admin:reset-second-factor shows the initial password once and only on an interactive terminal.",
    );
    return 2;
  }

  const store = openStore();
  const useCase = new ResetSecondFactorUseCase({
    accounts: store.accounts,
    hashPassword: hash,
    log: (event) =>
      (event.event === RESET_SECOND_FACTOR_EVENT.FAILED ? terminal.err : terminal.out)(
        JSON.stringify(event),
      ),
  });

  try {
    const { initialPassword } = await useCase.execute(emails[0]);
    if (initialPassword === undefined) {
      return 1;
    }
    terminal.out(`${INITIAL_PASSWORD_NOTICE}\n${initialPassword}`);
    return 0;
  } catch (error) {
    if (error instanceof InvalidAdministratorEmailError) {
      terminal.err(error.message);
      return 2;
    }
    // The use case already logged the error class.
    return 1;
  } finally {
    // After a committed reset the password is already printed: a failing close changes no exit code.
    await closeCommandStore(() => store.close(), RESET_SECOND_FACTOR_CLOSE_FAILED, terminal.err);
  }
}

if (require.main === module) {
  void runResetSecondFactor(
    process.argv.slice(2),
    {
      isTerminal: process.stdout.isTTY === true,
      out: (line) => process.stdout.write(`${line}\n`),
      err: (line) => process.stderr.write(`${line}\n`),
    },
    () => {
      const prisma = new PrismaClient();
      return {
        accounts: new PrismaAdministratorAccountRepository(prisma),
        close: () => prisma.$disconnect(),
      };
    },
  ).then((code) => {
    process.exitCode = code;
  });
}
