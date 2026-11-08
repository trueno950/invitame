import { PrismaClient } from "@prisma/client";

import {
  DISABLE_USER_EVENT,
  DisableUserUseCase,
  InvalidEmailError,
} from "./application/disable-user.use-case";
import { PrismaUserAccessRepository } from "./infrastructure/prisma-user-access.repository";

/**
 * Server-side command: `pnpm --filter @invitame/api user:disable -- <email>`. Sets the user to
 * DISABLED and deletes all of their sessions in one transaction. Prisma reads `DATABASE_URL` as the
 * Prisma scripts do. Output is one JSON line with the user id at most, never the email address.
 * Exit codes: 0 disabled (or already disabled), 1 no such user or failure, 2 usage error.
 */
async function main(args: readonly string[]): Promise<number> {
  const emails = args[0] === "--" ? args.slice(1) : args;
  if (emails.length !== 1 || emails[0] === undefined) {
    console.error("Usage: pnpm --filter @invitame/api user:disable -- <email>");
    return 2;
  }

  const prisma = new PrismaClient();
  const useCase = new DisableUserUseCase(new PrismaUserAccessRepository(prisma), (event) =>
    console.info(JSON.stringify(event)),
  );

  try {
    return (await useCase.execute(emails[0])) ? 0 : 1;
  } catch (error) {
    if (error instanceof InvalidEmailError) {
      console.error(error.message);
      return 2;
    }
    // The class name only: a message may carry SQL or the address.
    console.error(
      JSON.stringify({ event: DISABLE_USER_EVENT.FAILED, error: (error as Error)?.name }),
    );
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
