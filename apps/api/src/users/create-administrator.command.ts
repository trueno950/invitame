import { PrismaClient } from "@prisma/client";
// Better Auth's own hasher, the default of its password sign-in (1.7.16 `crypto/password.mjs`,
// `hashPassword`; selected in `context/create-context.mjs`), so sign-in verifies what we store.
import { hashPassword } from "better-auth/crypto";
import type { AdministratorAccountRepository } from "./application/administrator-account.repository";
import { closeCommandStore, commandFailureEvent } from "./application/command-failure";
import {
  CreateAdministratorUseCase,
  InvalidAdministratorEmailError,
} from "./application/create-administrator.use-case";
import { INITIAL_PASSWORD_NOTICE } from "./application/initial-password";
import { PrismaAdministratorAccountRepository } from "./infrastructure/prisma-administrator-account.repository";
import type { CommandTerminal } from "./reset-second-factor.command";

const USAGE = "Usage: pnpm --filter @invitame/api admin:create -- <email>";
const ADMINISTRATOR_CREATE_CLOSE_FAILED = "administrator_create_close_failed";

export interface CreateAdministratorStore {
  accounts: AdministratorAccountRepository;
  close: () => Promise<void>;
}

/**
 * Server-side command: `pnpm --filter @invitame/api admin:create -- <email>` (ADR 0004 decision 3,
 * S20). Creates an ACTIVE ADMIN with a credential account, or issues a new initial password to an
 * ADMIN who has not enrolled an authenticator app (and revokes their sessions), in one transaction.
 * Refuses an enrolled or DISABLED administrator and any customer address.
 *
 * The initial password is printed once, on its own stdout line, and is never logged or written to
 * disk: the command refuses to run when stdout is not a terminal, so it cannot land in a redirected
 * file. The JSON-line events carry the user id at most. Prisma reads `DATABASE_URL` as the Prisma
 * scripts do. Exit codes: 0 password issued, 1 refused or failure, 2 usage error or stdout not a
 * terminal.
 */
export async function runCreateAdministrator(
  args: readonly string[],
  terminal: CommandTerminal,
  openStore: () => CreateAdministratorStore,
  hash: (password: string) => Promise<string> = hashPassword,
): Promise<number> {
  const emails = args[0] === "--" ? args.slice(1) : args;
  if (emails.length !== 1 || emails[0] === undefined) {
    terminal.err(USAGE);
    return 2;
  }
  if (!terminal.isTerminal) {
    terminal.err(
      "admin:create shows the initial password once and only on an interactive terminal.",
    );
    return 2;
  }

  const store = openStore();
  const useCase = new CreateAdministratorUseCase({
    accounts: store.accounts,
    hashPassword: hash,
    log: (event) => terminal.out(JSON.stringify(event)),
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
    // The class name and the Prisma code only: a message may carry SQL or the address.
    terminal.err(JSON.stringify(commandFailureEvent("administrator_create_failed", error)));
    return 1;
  } finally {
    // The password is already printed: a failing disconnect changes no exit code.
    await closeCommandStore(() => store.close(), ADMINISTRATOR_CREATE_CLOSE_FAILED, terminal.err);
  }
}

// Runs as a script (`require.main === module`) or when loaded with `node -e "require(...)"`, where
// `require.main` is undefined (`create-administrator.command.db-spec.ts`); a spec that imports
// `runCreateAdministrator` has its own `require.main`, so importing never runs the command.
if (require.main === module || require.main === undefined) {
  void runCreateAdministrator(
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
