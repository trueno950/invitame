import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";

import { DATABASE_STATUS, HEALTH_STATUS, type HealthResponse } from "./health.contract";
// biome-ignore lint/style/useImportType: Nest reads this runtime class from emitted constructor metadata.
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // Public by design: orchestration probes call it without a session.
  @AllowAnonymous()
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
