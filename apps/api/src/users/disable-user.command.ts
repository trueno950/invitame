import { PrismaClient } from "@prisma/client";

import { closeCommandStore, commandFailureEvent } from "./application/command-failure";
import {
  DISABLE_USER_EVENT,
  DisableUserUseCase,
  InvalidEmailError,
} from "./application/disable-user.use-case";
import type { UserAccessRepository } from "./application/user-access.repository";
import { PrismaUserAccessRepository } from "./infrastructure/prisma-user-access.repository";
import type { CommandTerminal } from "./reset-second-factor.command";

const USAGE = "Usage: pnpm --filter @invitame/api user:disable -- <email>";
const USER_DISABLE_CLOSE_FAILED = "user_disable_close_failed";

export interface DisableUserStore {
  users: UserAccessRepository;
  close: () => Promise<void>;
}

/**
 * Server-side command: `pnpm --filter @invitame/api user:disable -- <email>`. Sets the user to
 * DISABLED and deletes all of their sessions in one transaction. Prisma reads `DATABASE_URL` as the
 * Prisma scripts do. Output is one JSON line with the user id at most, never the email address.
 * Exit codes: 0 disabled (or already disabled), 1 no such user or failure, 2 usage error.
 */
export async function runDisableUser(
  args: readonly string[],
  terminal: CommandTerminal,
  openStore: () => DisableUserStore,
): Promise<number> {
  const emails = args[0] === "--" ? args.slice(1) : args;
  if (emails.length !== 1 || emails[0] === undefined) {
    terminal.err(USAGE);
    return 2;
  }

  const store = openStore();
  const useCase = new DisableUserUseCase(store.users, (event) =>
    terminal.out(JSON.stringify(event)),
  );

  try {
    return (await useCase.execute(emails[0])) ? 0 : 1;
  } catch (error) {
    if (error instanceof InvalidEmailError) {
      terminal.err(error.message);
      return 2;
    }
    // The class name and the Prisma code only: a message may carry SQL or the address.
    terminal.err(JSON.stringify(commandFailureEvent(DISABLE_USER_EVENT.FAILED, error)));
    return 1;
  } finally {
    // The user is already disabled: a failing disconnect changes no exit code.
    await closeCommandStore(() => store.close(), USER_DISABLE_CLOSE_FAILED, terminal.err);
  }
}

if (require.main === module) {
  void runDisableUser(
    process.argv.slice(2),
    {
      isTerminal: process.stdout.isTTY === true,
      out: (line) => process.stdout.write(`${line}\n`),
      err: (line) => process.stderr.write(`${line}\n`),
    },
    () => {
      const prisma = new PrismaClient();
      return { users: new PrismaUserAccessRepository(prisma), close: () => prisma.$disconnect() };
    },
  ).then((code) => {
    process.exitCode = code;
  });
}
