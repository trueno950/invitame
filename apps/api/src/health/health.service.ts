import { Injectable } from "@nestjs/common";

// biome-ignore lint/style/useImportType: Nest reads this runtime class from emitted constructor metadata.
import { PrismaService } from "../database/prisma.service";
import { DATABASE_STATUS, HEALTH_STATUS, type HealthResponse } from "./health.contract";

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    await this.prisma.$queryRaw`SELECT 1`;

    return {
      status: HEALTH_STATUS.HEALTHY,
      database: DATABASE_STATUS.AVAILABLE,
      checkedAt: new Date().toISOString(),
    };
  }
}
