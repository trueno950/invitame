import { requireLocalDatabaseUrl } from "./database";

// Harness-only script of the browser end-to-end tests (M2 T9b part B; S38, L52):
// `node -r @swc-node/register test/create-e2e-administrator.ts <email>` with an explicit, local
// DATABASE_URL. It creates a pending administrator through the same composition as `admin:create`
// (the use case, the Prisma repository, and Better Auth's own hasher) and prints
// `{"password":"..."}` on stdout for the calling test only. `admin:create` itself is not used: it
// refuses a non-interactive terminal by design. Nothing in `src` imports this file, and it is not
// part of the build.

async function main(args: readonly string[]): Promise<number> {
  const [email] = args;
  if (args.length !== 1 || email === undefined) {
    console.error("Usage: create-e2e-administrator.ts <email>");
    return 2;
  }

  // Checked before Prisma loads: importing `@prisma/client` fills a missing DATABASE_URL from an env
  // file, which would point this script at a developer's database.
  const url = requireLocalDatabaseUrl();
  const { PrismaClient } = await import("@prisma/client");
  const { hashPassword } = await import("better-auth/crypto");
  const { CreateAdministratorUseCase } = await import(
    "../src/users/application/create-administrator.use-case"
  );
  const { PrismaAdministratorAccountRepository } = await import(
    "../src/users/infrastructure/prisma-administrator-account.repository"
  );

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const useCase = new CreateAdministratorUseCase({
    accounts: new PrismaAdministratorAccountRepository(prisma),
    hashPassword,
    log: () => {},
  });

  try {
    const { outcome, initialPassword } = await useCase.execute(email);
    if (initialPassword === undefined) {
      console.error(`No password issued: ${outcome.outcome}.`);
      return 1;
    }
    process.stdout.write(`${JSON.stringify({ password: initialPassword })}\n`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // The class name only: a message may carry the URL or SQL.
    console.error(error instanceof Error ? error.name : "unknown");
    process.exitCode = 1;
  },
);
