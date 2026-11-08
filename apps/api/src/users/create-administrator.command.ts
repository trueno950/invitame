import { PrismaClient } from "@prisma/client";
// Better Auth's own hasher, the default of its password sign-in (1.7.16 `crypto/password.mjs`,
// `hashPassword`; selected in `context/create-context.mjs`), so sign-in verifies what we store.
import { hashPassword } from "better-auth/crypto";

import {
  CreateAdministratorUseCase,
  InvalidAdministratorEmailError,
} from "./application/create-administrator.use-case";
import { INITIAL_PASSWORD_NOTICE } from "./application/initial-password";
import { PrismaAdministratorAccountRepository } from "./infrastructure/prisma-administrator-account.repository";

const USAGE = "Usage: pnpm --filter @invitame/api admin:create -- <email>";

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
async function main(args: readonly string[]): Promise<number> {
  const emails = args[0] === "--" ? args.slice(1) : args;
  if (emails.length !== 1 || emails[0] === undefined) {
    console.error(USAGE);
    return 2;
  }
  if (!process.stdout.isTTY) {
    console.error(
      "admin:create shows the initial password once and only on an interactive terminal.",
    );
    return 2;
  }

  const prisma = new PrismaClient();
  const useCase = new CreateAdministratorUseCase({
    accounts: new PrismaAdministratorAccountRepository(prisma),
    hashPassword,
    log: (event) => console.info(JSON.stringify(event)),
  });

  try {
    const { initialPassword } = await useCase.execute(emails[0]);
    if (initialPassword === undefined) {
      return 1;
    }
    process.stdout.write(`${INITIAL_PASSWORD_NOTICE}\n${initialPassword}\n`);
    return 0;
  } catch (error) {
    if (error instanceof InvalidAdministratorEmailError) {
      console.error(error.message);
      return 2;
    }
    // The class name only: a message may carry SQL or the address.
    console.error(
      JSON.stringify({ event: "administrator_create_failed", error: (error as Error)?.name }),
    );
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
