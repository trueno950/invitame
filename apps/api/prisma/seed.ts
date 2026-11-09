import { PrismaClient } from "@prisma/client";

import { seedCatalog } from "./catalog-seed";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await seedCatalog(prisma);

  console.info("Database seed completed.");
}

void main()
  .catch((error: unknown) => {
    console.error("Database seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
