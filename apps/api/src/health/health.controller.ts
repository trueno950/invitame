import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { Public } from "../auth/access-control/access-control";
import { DATABASE_STATUS, HEALTH_STATUS, type HealthResponse } from "./health.contract";
// biome-ignore lint/style/useImportType: Nest reads this runtime class from emitted constructor metadata.
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // Public by design: orchestration probes call it without a session, and the guard never reads one.
  @Public()
  @Get()
  async getHealth(): Promise<HealthResponse> {
    try {
      return await this.healthService.check();
    } catch {
      throw new ServiceUnavailableException({
        status: HEALTH_STATUS.UNHEALTHY,
        database: DATABASE_STATUS.UNAVAILABLE,
        checkedAt: new Date().toISOString(),
      } satisfies HealthResponse);
    }
  }
}
