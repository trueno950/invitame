import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "node:path";

import { validateEnvironment } from "./config/environment";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";

const environmentFilePath = join(__dirname, "..", ".env");

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: environmentFilePath,
      validate: validateEnvironment,
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
